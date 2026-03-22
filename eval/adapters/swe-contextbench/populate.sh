#!/usr/bin/env bash
# populate.sh — Phase 1: Run base tasks to accumulate memory
# Env vars: ARM, MAINT, PILOT, RESUME, MODEL, TASK_TIMEOUT, MAINT_TIMEOUT, DAILY_BATCH_SIZE
set -euo pipefail

DATA_DIR="/eval/data/swe-contextbench"
CHECKPOINT="/eval/checkpoint.txt"
TASK_FILE="$DATA_DIR/base_tasks.jsonl"
BATCH_SIZE="${DAILY_BATCH_SIZE:-4}"
TURN=0

# Cold arm skips population entirely
if [ "$ARM" = "cold" ]; then
    echo "[populate] ARM=cold — skipping Phase 1."
    exit 0
fi

TOTAL=$(wc -l < "$TASK_FILE")
echo "[populate] Phase 1: $TOTAL base tasks, ARM=$ARM, MAINT=$MAINT"

# Resume support
START_LINE=1
if [ "$RESUME" = "true" ] && [ -f "$CHECKPOINT" ]; then
    START_LINE=$(cat "$CHECKPOINT")
    echo "[populate] Resuming from task $START_LINE"
fi

# Compute batch count offset for resume (so daily maintenance triggers correctly)
if [ "$START_LINE" -gt 1 ]; then
    BATCH_COUNT=$(( (START_LINE - 1) % BATCH_SIZE ))
else
    BATCH_COUNT=0
fi

while IFS= read -r line; do
    TURN=$((TURN + 1))

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

    echo "[populate] Task $TURN/$TOTAL: $TASK_ID"
    /eval/scripts/invoke-task.sh "$TASK_ID" "$REPO" "$COMMIT" "$ISSUE_FILE" || true

    # Snapshot
    /eval/scripts/snapshot.sh "$TURN" "base: $TASK_ID"

    # Write checkpoint
    echo "$((TURN + 1))" > "$CHECKPOINT"

    # Maintenance check
    BATCH_COUNT=$((BATCH_COUNT + 1))
    case "$MAINT" in
        per-session)
            echo "[populate] Maintenance after task $TURN"
            /eval/scripts/maintenance.sh
            /eval/scripts/snapshot.sh "${TURN}-maint" "maintenance after $TASK_ID"
            ;;
        daily)
            if [ "$BATCH_COUNT" -ge "$BATCH_SIZE" ]; then
                echo "[populate] Daily maintenance after batch (task $TURN)"
                /eval/scripts/maintenance.sh
                /eval/scripts/snapshot.sh "${TURN}-maint" "daily maintenance"
                BATCH_COUNT=0
            fi
            ;;
        none)
            ;;
    esac

    rm -f "$ISSUE_FILE"
done < "$TASK_FILE"

echo "[populate] Phase 1 complete. $TURN tasks processed."
