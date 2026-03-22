#!/usr/bin/env bash
# maintenance.sh — Run sleep + deep-sleep per-repo
# Usage: maintenance.sh
set -euo pipefail

MAINT_TIMEOUT="${MAINT_TIMEOUT:-600}"
MODEL="${MODEL:-claude-sonnet-4-20250514}"

for repo in /eval/workdir/*/; do
    [ -d "$repo" ] || continue
    repo_name=$(basename "$repo")
    echo "[maintenance] Running /sleep on $repo_name"
    cd "$repo" && echo "/sleep" | timeout "$MAINT_TIMEOUT" claude --print \
        --model "$MODEL" --dangerously-skip-permissions 2>/dev/null || true

    echo "[maintenance] Running /deep-sleep on $repo_name"
    cd "$repo" && echo "/deep-sleep" | timeout "$MAINT_TIMEOUT" claude --print \
        --model "$MODEL" --dangerously-skip-permissions 2>/dev/null || true
done
