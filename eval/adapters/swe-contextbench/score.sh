#!/usr/bin/env bash
# score.sh — Run SWE-bench evaluation and produce metrics.json (host-side)
# Usage: score.sh <results-dir>
set -euo pipefail

RESULTS_DIR="${1:?Usage: score.sh <results-dir>}"
PREDICTIONS="$RESULTS_DIR/raw/predictions.jsonl"
DATA_DIR="$(cd "$(dirname "$0")/../../data/swe-contextbench" && pwd)"
EVAL_LOG="$RESULTS_DIR/eval-logs"

if [ ! -f "$PREDICTIONS" ]; then
    echo "ERROR: predictions.jsonl not found at $PREDICTIONS"
    exit 1
fi

echo "[score] Running SWE-bench evaluation..."
mkdir -p "$EVAL_LOG"

python3 -m swebench.harness.run_evaluation \
    --predictions_path "$PREDICTIONS" \
    --swe_bench_tasks "$DATA_DIR/related_tasks.jsonl" \
    --log_dir "$EVAL_LOG" \
    --timeout 300 \
    2>&1 | tee "$RESULTS_DIR/eval.log"

echo "[score] Generating metrics.json..."

python3 -c "
import json, sys, os, glob

results_dir = '$RESULTS_DIR'
raw_dir = os.path.join(results_dir, 'raw')

per_task = []
total_tokens = 0
total_cost = 0.0
resolved_count = 0

eval_results = {}
for f in glob.glob(os.path.join('$EVAL_LOG', '*.json')):
    with open(f) as fh:
        data = json.load(fh)
        if isinstance(data, dict):
            eval_results.update(data)

for meta_file in sorted(glob.glob(os.path.join(raw_dir, 'task-*.meta.json'))):
    with open(meta_file) as fh:
        meta = json.load(fh)
    task_id = meta['task_id']
    resolved = eval_results.get(task_id, {}).get('resolved', False)
    if resolved:
        resolved_count += 1
    per_task.append({
        'task_id': task_id,
        'resolved': resolved,
        'exit_code': meta.get('exit_code', -1),
        'duration_s': meta.get('duration_s', 0),
    })

total_tasks = len(per_task)
metrics = {
    'benchmark': 'swe-contextbench',
    'arm': os.environ.get('ARM', 'unknown'),
    'maintenance': os.environ.get('MAINT', 'unknown'),
    'timestamp': '',
    'pilot': int(os.environ.get('PILOT', '0')) > 0,
    'summary': {
        'total_tasks': total_tasks,
        'resolved': resolved_count,
        'resolution_rate': resolved_count / total_tasks if total_tasks > 0 else 0,
    },
    'per_task': per_task,
}

with open(os.path.join(results_dir, 'metrics.json'), 'w') as fh:
    json.dump(metrics, fh, indent=2)

print(f'[score] {resolved_count}/{total_tasks} resolved ({metrics[\"summary\"][\"resolution_rate\"]:.1%})')
"

echo "[score] Done. Results at $RESULTS_DIR/metrics.json"
