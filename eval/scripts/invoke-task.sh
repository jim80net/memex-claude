#!/usr/bin/env bash
# invoke-task.sh — Run one SWE-bench task via Claude Code
# Usage: invoke-task.sh <task-id> <repo-name> <commit> <issue-text-file>
set -euo pipefail

TASK_ID="${1:?Usage: invoke-task.sh <task-id> <repo> <commit> <issue-file>}"
REPO="${2:?}"
COMMIT="${3:?}"
ISSUE_FILE="${4:?}"
TASK_TIMEOUT="${TASK_TIMEOUT:-900}"
MODEL="${MODEL:-claude-sonnet-4-20250514}"

WORKDIR="/eval/workdir/$REPO"
RAW_DIR="/eval/raw"

# Checkout the correct commit
cd "$WORKDIR"
git checkout "$COMMIT" --force 2>/dev/null
git clean -fd 2>/dev/null

# Run Claude with the issue description
START_TIME=$(date +%s)
EXIT_CODE=0
cat "$ISSUE_FILE" | timeout "$TASK_TIMEOUT" claude --print \
    --model "$MODEL" \
    --cwd "$WORKDIR" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    2>"$RAW_DIR/task-${TASK_ID}.stderr" \
    >"$RAW_DIR/task-${TASK_ID}.stdout" || EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Extract patch
git diff > "$RAW_DIR/task-${TASK_ID}.patch"

# Write per-task metadata
jq -n \
    --arg task_id "$TASK_ID" \
    --argjson exit_code "$EXIT_CODE" \
    --argjson duration "$DURATION" \
    '{task_id: $task_id, exit_code: $exit_code, duration_s: $duration}' \
    > "$RAW_DIR/task-${TASK_ID}.meta.json"

# Full reset for next task
git checkout . 2>/dev/null
git clean -fd 2>/dev/null
