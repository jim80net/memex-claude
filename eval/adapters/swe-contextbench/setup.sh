#!/usr/bin/env bash
# setup.sh — Download SWE-ContextBench dataset and clone repos (host-side)
# Run from eval/ directory
set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")/../../data" && pwd)"
mkdir -p "$DATA_DIR/swe-contextbench"

echo "[setup] Checking for SWE-ContextBench dataset..."

# Check if dataset already downloaded
if [ -f "$DATA_DIR/swe-contextbench/base_tasks.jsonl" ] && \
   [ -f "$DATA_DIR/swe-contextbench/related_tasks.jsonl" ]; then
    echo "[setup] Dataset already present."
else
    echo "[setup] Dataset not found at $DATA_DIR/swe-contextbench/"
    echo ""
    echo "SWE-ContextBench dataset must be obtained manually."
    echo "Options:"
    echo "  1. Download from the paper authors (arxiv 2602.08316)"
    echo "  2. Place base_tasks.jsonl and related_tasks.jsonl in $DATA_DIR/swe-contextbench/"
    echo "  3. Generate from SWE-bench Lite (see docs/superpowers/specs/2026-03-22-benchmark-harness-design.md)"
    echo ""
    echo "Expected files:"
    echo "  $DATA_DIR/swe-contextbench/base_tasks.jsonl"
    echo "  $DATA_DIR/swe-contextbench/related_tasks.jsonl"
    echo ""
    echo "Each JSONL file should have one JSON object per line with at minimum:"
    echo '  {"instance_id": "repo__owner-12345", "repo": "owner/repo", "base_commit": "abc123", "problem_statement": "..."}'
    exit 1
fi

# Install SWE-bench evaluation harness if not present
if ! python3 -c "import swebench" 2>/dev/null; then
    echo "[setup] Installing SWE-bench evaluation harness..."
    pip install swebench 2>/dev/null || pip install --user swebench
fi

echo "[setup] Counting tasks..."
BASE_COUNT=$(wc -l < "$DATA_DIR/swe-contextbench/base_tasks.jsonl")
RELATED_COUNT=$(wc -l < "$DATA_DIR/swe-contextbench/related_tasks.jsonl")
echo "[setup] Found $BASE_COUNT base tasks, $RELATED_COUNT related tasks."

echo "[setup] Extracting unique repos..."
REPOS=$(jq -r '.repo' "$DATA_DIR/swe-contextbench/base_tasks.jsonl" \
    "$DATA_DIR/swe-contextbench/related_tasks.jsonl" | sort -u)

WORKDIR="$DATA_DIR/swe-contextbench/workdir"
mkdir -p "$WORKDIR"

echo "[setup] Cloning repos to $WORKDIR..."
for repo in $REPOS; do
    REPO_DIR="$WORKDIR/$(echo "$repo" | tr '/' '_')"
    if [ -d "$REPO_DIR" ]; then
        echo "[setup] $repo already cloned."
    else
        echo "[setup] Cloning $repo..."
        git clone "https://github.com/$repo.git" "$REPO_DIR"
    fi
done

echo "[setup] Setup complete."
echo "Repos: $(echo "$REPOS" | tr '\n' ' ')"
echo "Workdir: $WORKDIR"
