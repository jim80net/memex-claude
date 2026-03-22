#!/usr/bin/env bash
# run.sh — Phase 2: Run related tasks and capture patches
# Env vars: ARM, PILOT, RESUME, MODEL, TASK_TIMEOUT
set -euo pipefail

DATA_DIR="/eval/data/swe-contextbench"
CHECKPOINT="/eval/checkpoint-phase2.txt"
TASK_FILE="$DATA_DIR/related_tasks.jsonl"
PILOT="${PILOT:-0}"

TOTAL=$(wc -l < "$TASK_FILE")
if [ "$PILOT" -gt 0 ] && [ "$PILOT" -lt "$TOTAL" ]; then
    TOTAL="$PILOT"
    echo "[run] Pilot mode: running $PILOT of $(wc -l < "$TASK_FILE") related tasks"
fi

echo "[run] Phase 2: $TOTAL related tasks, ARM=$ARM"

# Resume support
START_LINE=1
if [ "$RESUME" = "true" ] && [ -f "$CHECKPOINT" ]; then
    START_LINE=$(cat "$CHECKPOINT")
    echo "[run] Resuming from task $START_LINE"
fi

TURN=0
while IFS= read -r line; do
    TURN=$((TURN + 1))

    # Pilot limit
    if [ "$PILOT" -gt 0 ] && [ "$TURN" -gt "$PILOT" ]; then
        break
    fi

    # Skip already-completed tasks on resume
    if [ "$TURN" -lt "$START_LINE" ]; then
        continue
    fi

    # Extract task fields
    TASK_ID=$(echo "$line" | jq -r '.instance_id')
    REPO=$(echo "$line" | jq -r '.repo' | tr '/' '_')
    COMMIT=$(echo "$line" | jq -r '.base_commit')
    ISSUE_FILE="/tmp/issue-${TASK_ID}.txt"
    echo "$line" | jq -r '.problem_statement' > "$ISSUE_FILE"

    echo "[run] Task $TURN/$TOTAL: $TASK_ID"
    /eval/scripts/invoke-task.sh "$TASK_ID" "$REPO" "$COMMIT" "$ISSUE_FILE" || true

    # Snapshot
    /eval/scripts/snapshot.sh "eval-${TURN}" "related: $TASK_ID"

    # Write checkpoint
    echo "$((TURN + 1))" > "$CHECKPOINT"

    rm -f "$ISSUE_FILE"
done < "$TASK_FILE"

echo "[run] Phase 2 complete. $TURN tasks evaluated."

# Generate predictions.jsonl for SWE-bench scoring
echo "[run] Generating predictions.jsonl..."
PREDICTIONS="/eval/raw/predictions.jsonl"
> "$PREDICTIONS"
for meta in /eval/raw/task-*.meta.json; do
    TASK_ID=$(jq -r '.task_id' "$meta")
    PATCH_FILE="/eval/raw/task-${TASK_ID}.patch"
    if [ -f "$PATCH_FILE" ] && [ -s "$PATCH_FILE" ]; then
        PATCH=$(cat "$PATCH_FILE" | jq -Rs .)
        jq -n --arg id "$TASK_ID" --arg model "$MODEL" --argjson patch "$PATCH" \
            '{instance_id: $id, model_name_or_path: $model, model_patch: $patch}' \
            >> "$PREDICTIONS"
    fi
done
echo "[run] predictions.jsonl written with $(wc -l < "$PREDICTIONS") entries."
