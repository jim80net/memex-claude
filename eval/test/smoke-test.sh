#!/usr/bin/env bash
# smoke-test.sh — Verify the full pipeline works with mock data
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$EVAL_DIR"

echo "=== Smoke Test ==="

# Test 1: Makefile validation
echo "[test] Validation accepts valid combos..."
make validate ARM=cold MAINT=none
make validate ARM=memex MAINT=daily
echo "[test] Validation rejects invalid combos..."
if make validate ARM=cold MAINT=daily 2>/dev/null; then
    echo "FAIL: should have rejected cold+daily"
    exit 1
fi
echo "[test] Validation: PASS"

# Test 2: Config files are valid JSON
echo "[test] Verifying config files..."
for f in configs/*.json; do
    jq empty "$f" || { echo "FAIL: $f is not valid JSON"; exit 1; }
done
echo "[test] Config files: PASS"

# Test 3: Scripts are syntactically valid
echo "[test] Verifying script syntax..."
for f in scripts/*.sh adapters/*/*.sh; do
    bash -n "$f" || { echo "FAIL: $f has syntax errors"; exit 1; }
done
echo "[test] Script syntax: PASS"

echo ""
echo "=== All smoke tests passed ==="
