#!/usr/bin/env bash
# snapshot.sh — Git-commit memory state after a turn
# Usage: snapshot.sh <turn-number> <summary>
set -euo pipefail

TURN="${1:?Usage: snapshot.sh <turn> <summary>}"
SUMMARY="${2:-no summary}"
SNAP_DIR="/eval/snapshots"

# Copy only the directories that change (not static config files)
mkdir -p "$SNAP_DIR/claude-home"
for dir in cache projects skills rules; do
    if [ -d "/home/eval/.claude/$dir" ]; then
        rm -rf "$SNAP_DIR/claude-home/$dir"
        cp -a "/home/eval/.claude/$dir" "$SNAP_DIR/claude-home/$dir"
    fi
done

# Capture per-repo project .claude/ directories
mkdir -p "$SNAP_DIR/project-claude"
for repo_claude in /eval/workdir/*/.claude; do
    [ -d "$repo_claude" ] || continue
    repo_name=$(basename "$(dirname "$repo_claude")")
    rm -rf "$SNAP_DIR/project-claude/$repo_name"
    cp -a "$repo_claude" "$SNAP_DIR/project-claude/$repo_name"
done

# Also copy checkpoint files if they exist
for ckpt in /eval/checkpoint.txt /eval/checkpoint-phase2.txt; do
    [ -f "$ckpt" ] && cp "$ckpt" "$SNAP_DIR/"
done

cd "$SNAP_DIR"
git add -A
git commit -m "turn-${TURN}: ${SUMMARY}" --allow-empty
git tag -f "turn-${TURN}"
