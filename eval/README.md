# memex-claude Benchmark Harness

Validates memex-claude's effectiveness by comparing Claude Code performance
across memory configurations using [SWE-Bench-CL](https://github.com/thomasjoshi/agents-never-forget)
(273 tasks across 8 chronological sequences from SWE-Bench Verified).

## Quick Start

```bash
# 1. Install prerequisites
# - Docker
# - Python 3 with pip (for SWE-bench scoring)
# - jq, curl

# 2. Build the memex binary
cd .. && bun run build.ts && cd eval

# 3. Download and prepare the dataset (host-side)
# Downloads SWE-Bench-CL-Curriculum.json, splits into base/eval tasks (70/30 default)
make setup BENCH=swe-bench-cl

# 4. Build the Docker image
make build

# 5. Run a pilot evaluation (20 tasks)
make eval BENCH=swe-bench-cl ARM=memex MAINT=daily PILOT=20

# 6. Score the results
make score BENCH=swe-bench-cl ARM=memex MAINT=daily RUN_ID=<timestamp>

# 7. Compare two runs
make compare A="results/swe-bench-cl/memex-daily/<ts>" B="results/swe-bench-cl/cold-none/<ts>"
```

## Dataset

SWE-Bench-CL organizes 273 tasks into 8 chronological sequences (one per repo: Django, SymPy, Sphinx, Matplotlib, scikit-learn, Astropy, xarray, pytest). Each sequence's tasks are ordered by creation date. The adapter splits each sequence:

- **Base tasks** (first 70%): run during Phase 1 to populate memory
- **Eval tasks** (last 30%): run during Phase 2 to measure performance

The split percentage is configurable via `BASE_SPLIT` (default: 70):

```bash
make setup BENCH=swe-bench-cl BASE_SPLIT=80
```

## Experimental Arms

| Arm | Native Memory | Memex | Maintenance |
|-----|--------------|-------|-------------|
| cold | Off | Off | None |
| native | On | Off | None |
| memex + none | Off | On | None |
| memex + per-session | Off | On | After every task |
| memex + daily | Off | On | Every 4-5 tasks |
| both + none | On | On | None |
| both + daily | On | On | Every 4-5 tasks |

## Configuration

Edit `eval.env` to change defaults (model, timeouts, batch size).

## Resuming Failed Runs

```bash
make eval BENCH=swe-bench-cl ARM=memex MAINT=daily RESUME=true RUN_ID=<previous-run-id>
```

## Memory Evolution Analysis

Each run produces a git repo in `results/<bench>/<arm>/<run-id>/snapshots/`:

```bash
cd results/swe-bench-cl/memex-daily/<run-id>/snapshots
git log --stat --oneline                         # overview
git diff turn-5..turn-10 -- claude-home/         # changes between turns
git log -p -S "some keyword" -- "*.md"           # when a memory appeared
```

## Design Spec

See [docs/superpowers/specs/2026-03-22-benchmark-harness-design.md](../docs/superpowers/specs/2026-03-22-benchmark-harness-design.md).
