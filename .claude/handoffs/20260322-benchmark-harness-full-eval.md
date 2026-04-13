# Handoff: Benchmark Harness Full Evaluation Run

**Date:** 2026-03-22
**Branch:** `feat/benchmark-harness`
**Working directory:** `/home/jim/workspace/github.com/jim80net/memex-claude`
**PR:** https://github.com/jim80net/memex-claude/pull/39

## Objective

Run the full 79-task SWE-Bench-CL evaluation comparing cold (no memory) vs memex-daily (16 base tasks + daily maintenance) arms, score with SWE-bench Verified test suites, commit results, update the PR with correctness data and comparative analysis.

The pilot (n=5) showed 60% (memex) vs 40% (cold) resolution — we're scaling to the full 79 eval tasks for statistical significance.

## Completed

- Benchmark harness fully built and operational (`eval/` directory)
- SWE-Bench-CL adapter replacing SWE-ContextBench (dataset publicly available)
- Docker image builds and runs (`memex-eval:latest`)
- All 8 repos cloned to `eval/data/swe-bench-cl/workdir/`
- Dataset split: 194 base tasks, 79 eval tasks (70/30 per-sequence split)
- Pilot results (n=5): cold 2/5 (40%), memex-daily 3/5 (60%) — SWE-bench verified
- PR #39 created with 3 analysis comments (correctness, academic benchmarks, competitive analysis)
- Comparative analysis posted: no other popular memory system has coding-task benchmarks

### Key commits on `feat/benchmark-harness`:
- `7e89dc8` — SWE-bench correctness results for pilot
- `08bb2ad` — memex-daily pilot results (16 base + 5 eval)
- `63796fa` — RUN_ID timestamp skew fix
- `631535f` — PILOT_BASE parameter for limiting Phase 1
- `331ea46` — Track eval/results/ in git
- `e4a85ea` — Mount ~/.claude.json for OAuth auth
- `bedd668` — Remove --cwd flag, add --dangerously-skip-permissions
- `d121134` — SWE-Bench-CL adapter (replaces SWE-ContextBench)

## Remaining

- [x] **Cold arm full run complete** — 79/79 tasks, all exit 0, avg 291s/task. Results at `/tmp/memex-eval/20260322T160124/`. 76 non-empty patches, 3 empty.

- [x] **Cold arm SWE-bench scoring complete** — 36/79 resolved (45.6%). Report at `cold-none.cold-full.json` and committed to `eval/results/swe-bench-cl/cold-none/20260322T160124/swebench-report.json`.

- [x] **First memex-daily attempt failed** — All 79 eval tasks rate-limited ("You've hit your limit"). Run at `/tmp/memex-eval/20260322T222739/` — base task outputs usable, eval task outputs all empty.

- [x] **Makefile updated** — Added separate `populate`/`run` targets for multi-day runs. `RUN_ID` can be passed in to resume.

- [ ] **Phase 1 (populate) running** — Background task `bupee02ep`. 194 base tasks with daily maintenance. Check progress: `ls /tmp/memex-eval/<RUN_ID>/raw/task-*.meta.json | wc -l`. Find RUN_ID: `ls /tmp/memex-eval/ | grep -v test | sort | tail -1`

- [ ] **Phase 2 (run) — after quota resets** — Run once Phase 1 completes and quota resets:
  ```bash
  cd eval && make run BENCH=swe-bench-cl ARM=memex MAINT=daily RUN_ID=<phase1-run-id>
  ```

- [ ] **SWE-bench scoring on memex results** — Same pattern as cold arm scoring

- [ ] **Commit results and update PR #39**

- [ ] **Run SWE-bench scoring on cold results** — Once cold run finishes:
  ```bash
  # Generate proper JSONL from eval task patches only
  python3 -c "
  import json, os, glob
  raw = '/tmp/memex-eval/20260322T160124/raw'
  eval_data = 'eval/data/swe-bench-cl/eval_tasks.jsonl'
  eval_ids = set()
  with open(eval_data) as f:
      for line in f:
          eval_ids.add(json.loads(line)['instance_id'])
  preds = []
  for mf in sorted(glob.glob(os.path.join(raw, 'task-*.meta.json'))):
      meta = json.load(open(mf))
      tid = meta['task_id']
      if tid not in eval_ids: continue
      patch = open(os.path.join(raw, f'task-{tid}.patch')).read()
      preds.append({'instance_id': tid, 'model_name_or_path': 'cold-none', 'model_patch': patch})
  with open('/tmp/memex-eval/cold-full-predictions.jsonl', 'w') as f:
      for p in preds: f.write(json.dumps(p) + '\n')
  print(f'{len(preds)} predictions')
  "

  # Run SWE-bench evaluation
  python3 -m swebench.harness.run_evaluation \
      --dataset_name princeton-nlp/SWE-bench_Verified \
      --split test \
      --predictions_path /tmp/memex-eval/cold-full-predictions.jsonl \
      --run_id cold-full \
      --max_workers 4 \
      --timeout 300
  ```

- [ ] **Run SWE-bench scoring on memex results** (same pattern, different paths)

- [ ] **Commit results and update PR** — Copy results to `eval/results/`, commit, push, add PR comment with full correctness table

- [ ] **Update score.sh adapter** — The current `score.sh` has wrong SWE-bench API args. Fix to use `--dataset_name princeton-nlp/SWE-bench_Verified --run_id <id>` instead of the old `--swe_bench_tasks` flag. Also fix predictions.jsonl generation in `run.sh` to output single-line JSONL (not pretty-printed).

## Current State

```
Branch: feat/benchmark-harness
PR: https://github.com/jim80net/memex-claude/pull/39 (open)
Docker image: memex-eval:latest (built, verified)
Background task: bx0qpbuoc — cold arm full 79-task run in progress
Run dir: /tmp/memex-eval/20260322T160124/
```

## Key Decisions

- **SWE-ContextBench → SWE-Bench-CL**: SWE-ContextBench has no public dataset. SWE-Bench-CL (273 tasks, 8 repos) is publicly available at github.com/thomasjoshi/agents-never-forget.
- **70/30 split**: First 70% of each chronological sequence = base tasks (Phase 1), last 30% = eval tasks (Phase 2).
- **PILOT_BASE=16 for pilot**: First 16 base tasks are all astropy, matching the 5 astropy eval tasks.
- **Results checked into git**: For PR reviewability. `.gitignore` updated to track `eval/results/`.
- **OAuth, not API key**: User has Claude Max subscription. Container needs both `~/.claude/` and `~/.claude.json` mounted.

## Gotchas

- **DOCKER_BUILDKIT=0** required — BuildKit driver is broken in this WSL2 environment
- **`--cwd` flag doesn't exist** in `claude --print` — use shell `cd` instead
- **`--bare` flag disables OAuth** — do NOT use with Max subscription
- **Container must run as `--user $(id -u):$(id -g)`** to match host bind-mount ownership
- **Makefile uses `/bin/sh`** — no bash brace expansion
- **Checkpoint files write to `/eval/raw/`** — `/eval/` itself is root-owned in container
- **`RUN_ID` uses `:=`** (simple expansion) — `?=` caused timestamp skew across recipe lines
- **scikit-learn clone** needs `--config transfer.fsckobjects=false`
- **predictions.jsonl** must be single-line JSONL, not pretty-printed JSON — the `run.sh` currently generates multi-line; score step generates proper JSONL separately
- **SWE-bench API changed** — uses `--dataset_name` + `--run_id`, not `--swe_bench_tasks` + `--log_dir`

## To Resume

1. Read this file: `cat .claude/handoffs/20260322-benchmark-harness-full-eval.md`
2. Check branch: `git checkout feat/benchmark-harness`
3. Check cold run status: `ls /tmp/memex-eval/20260322T160124/raw/task-*.meta.json 2>/dev/null | wc -l` (should be 79 when done)
4. If cold run complete, proceed with scoring and memex-daily full run per the "Remaining" section above
5. If cold run crashed, check Docker: `docker ps` and logs in `/tmp/memex-eval/20260322T160124/raw/`

To continue, start a new session and say:

  /takeover .claude/handoffs/20260322-benchmark-harness-full-eval.md
