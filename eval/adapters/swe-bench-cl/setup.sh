#!/usr/bin/env bash
# setup.sh — Download SWE-Bench-CL dataset, split into base/eval tasks, clone repos (host-side)
# Run from eval/ directory
#
# SWE-Bench-CL organizes 273 tasks into 8 chronological sequences (one per repo).
# Each sequence's tasks are ordered by sequence_position. We split each sequence:
#   - First BASE_SPLIT% of tasks → base_tasks.jsonl  (Phase 1: memory population)
#   - Remaining tasks             → eval_tasks.jsonl  (Phase 2: evaluation)
#
# Env vars:
#   BASE_SPLIT  — percentage of each sequence used as base tasks (default: 70)
set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")/../../data" && pwd)"
BENCH_DIR="$DATA_DIR/swe-bench-cl"
BASE_SPLIT="${BASE_SPLIT:-70}"
CURRICULUM_URL="https://raw.githubusercontent.com/thomasjoshi/agents-never-forget/main/data/SWE-Bench-CL-Curriculum.json"

mkdir -p "$BENCH_DIR"

echo "[setup] SWE-Bench-CL adapter (base split: ${BASE_SPLIT}%)"

# --- Step 1: Download curriculum JSON if not present ---
CURRICULUM="$BENCH_DIR/SWE-Bench-CL-Curriculum.json"
if [ -f "$CURRICULUM" ]; then
    echo "[setup] Curriculum JSON already present."
else
    echo "[setup] Downloading SWE-Bench-CL-Curriculum.json..."
    curl -fSL -o "$CURRICULUM" "$CURRICULUM_URL"
    echo "[setup] Downloaded."
fi

# --- Step 2: Split into base and eval JSONL ---
if [ -f "$BENCH_DIR/base_tasks.jsonl" ] && [ -f "$BENCH_DIR/eval_tasks.jsonl" ]; then
    echo "[setup] base_tasks.jsonl and eval_tasks.jsonl already present."
else
    EVAL_SPLIT=$((100 - BASE_SPLIT))
    echo "[setup] Splitting sequences into base/eval tasks (${BASE_SPLIT}/${EVAL_SPLIT} split)..."

    python3 -c "
import json, sys, math

with open('$CURRICULUM') as f:
    data = json.load(f)

base_split = int('$BASE_SPLIT')
base_tasks = []
eval_tasks = []

for seq in data['sequences']:
    repo = seq['repo']
    # Tasks are already ordered by sequence_position
    tasks = sorted(seq['tasks'], key=lambda t: t['continual_learning']['sequence_position'])
    n = len(tasks)
    split_idx = math.ceil(n * base_split / 100)

    for i, task in enumerate(tasks):
        # Flatten nested structure into the JSONL format invoke-task.sh expects
        flat = {
            'instance_id': task['metadata']['instance_id'],
            'repo': task['metadata']['repo'],
            'base_commit': task['metadata']['base_commit'],
            'problem_statement': task['task']['problem_statement'],
            'hints_text': task['task'].get('hints_text', ''),
            'patch': task['evaluation'].get('patch', ''),
            'test_patch': task['evaluation'].get('test_patch', ''),
            'FAIL_TO_PASS': task['evaluation'].get('FAIL_TO_PASS', []),
            'PASS_TO_PASS': task['evaluation'].get('PASS_TO_PASS', []),
            'sequence_id': seq['id'],
            'sequence_position': task['continual_learning']['sequence_position'],
            'difficulty': task['metadata'].get('difficulty', ''),
            'difficulty_score': task['continual_learning'].get('difficulty_score', 0),
        }
        if i < split_idx:
            base_tasks.append(flat)
        else:
            eval_tasks.append(flat)

# Write base tasks sorted by (sequence_id, sequence_position) — chronological within each repo
base_tasks.sort(key=lambda t: (t['sequence_id'], t['sequence_position']))
eval_tasks.sort(key=lambda t: (t['sequence_id'], t['sequence_position']))

with open('$BENCH_DIR/base_tasks.jsonl', 'w') as f:
    for t in base_tasks:
        f.write(json.dumps(t) + '\n')

with open('$BENCH_DIR/eval_tasks.jsonl', 'w') as f:
    for t in eval_tasks:
        f.write(json.dumps(t) + '\n')

print(f'[setup] Split complete: {len(base_tasks)} base tasks, {len(eval_tasks)} eval tasks')
for seq in data['sequences']:
    tasks = sorted(seq['tasks'], key=lambda t: t['continual_learning']['sequence_position'])
    n = len(tasks)
    si = math.ceil(n * base_split / 100)
    print(f'  {seq[\"repo\"]}: {si} base / {n - si} eval (of {n} total)')
"
fi

# --- Step 3: Install SWE-bench evaluation harness if not present ---
if ! python3 -c "import swebench" 2>/dev/null; then
    echo "[setup] Installing SWE-bench evaluation harness..."
    pip install swebench 2>/dev/null || pip install --user swebench
fi

# --- Step 4: Count tasks ---
echo "[setup] Counting tasks..."
BASE_COUNT=$(wc -l < "$BENCH_DIR/base_tasks.jsonl")
EVAL_COUNT=$(wc -l < "$BENCH_DIR/eval_tasks.jsonl")
echo "[setup] Found $BASE_COUNT base tasks, $EVAL_COUNT eval tasks."

# --- Step 5: Clone repos ---
echo "[setup] Extracting unique repos..."
REPOS=$(jq -r '.repo' "$BENCH_DIR/base_tasks.jsonl" \
    "$BENCH_DIR/eval_tasks.jsonl" | sort -u)

WORKDIR="$BENCH_DIR/workdir"
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
