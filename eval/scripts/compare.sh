#!/usr/bin/env bash
# compare.sh — Diff metrics across two runs
# Usage: compare.sh <path-a> <path-b>
set -euo pipefail

A="${1:?Usage: compare.sh <path-a> <path-b>}"
B="${2:?}"

METRICS_A="$A/metrics.json"
METRICS_B="$B/metrics.json"

if [ ! -f "$METRICS_A" ] || [ ! -f "$METRICS_B" ]; then
    echo "ERROR: metrics.json not found in one or both paths."
    echo "  A: $METRICS_A ($([ -f "$METRICS_A" ] && echo "exists" || echo "MISSING"))"
    echo "  B: $METRICS_B ($([ -f "$METRICS_B" ] && echo "exists" || echo "MISSING"))"
    exit 1
fi

echo "=== Comparison ==="
echo ""
echo "Run A: $A"
echo "Run B: $B"
echo ""

# Extract summary fields
for field in resolution_rate total_tasks resolved total_tokens total_cost_usd memory_entries_final; do
    val_a=$(jq -r ".summary.$field // \"N/A\"" "$METRICS_A")
    val_b=$(jq -r ".summary.$field // \"N/A\"" "$METRICS_B")
    printf "%-25s  A=%-12s  B=%-12s\n" "$field" "$val_a" "$val_b"
done

echo ""
echo "Per-task diff:"
# Show tasks where resolution differs
TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT
jq -r '.per_task[] | "\(.task_id) \(.resolved)"' "$METRICS_A" | sort > "$TMPDIR/a.txt"
jq -r '.per_task[] | "\(.task_id) \(.resolved)"' "$METRICS_B" | sort > "$TMPDIR/b.txt"
diff --side-by-side "$TMPDIR/a.txt" "$TMPDIR/b.txt" || true
