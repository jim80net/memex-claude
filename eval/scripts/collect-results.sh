#!/usr/bin/env bash
# collect-results.sh — Copy artifacts from temp dir to results/
# Usage: collect-results.sh <bench> <arm> <maint> <run-id>
set -euo pipefail

BENCH="${1:?}"
ARM="${2:?}"
MAINT="${3:?}"
RUN_ID="${4:?}"

SRC="/tmp/memex-eval/$RUN_ID"
DEST="results/$BENCH/$ARM-$MAINT/$RUN_ID"

mkdir -p "$DEST"
cp -a "$SRC/snapshots" "$DEST/"
cp -a "$SRC/raw" "$DEST/"

echo "[collect] Results saved to $DEST"
