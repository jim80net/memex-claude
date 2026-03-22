# memex-claude Benchmark Harness

Validates memex-claude's effectiveness by comparing Claude Code performance
across memory configurations using SWE-ContextBench.

## Quick Start

```bash
# 1. Install prerequisites
# - Docker
# - Python 3 with pip (for SWE-bench scoring)
# - jq

# 2. Build the memex binary
cd .. && bun run build.ts && cd eval

# 3. Download and prepare the dataset (host-side)
make setup BENCH=swe-contextbench

# 4. Build the Docker image
make build

# 5. Run a pilot evaluation (20 tasks)
make eval BENCH=swe-contextbench ARM=memex MAINT=daily PILOT=20

# 6. Score the results
make score BENCH=swe-contextbench ARM=memex MAINT=daily RUN_ID=<timestamp>

# 7. Compare two runs
make compare A="results/swe-contextbench/memex-daily/<ts>" B="results/swe-contextbench/cold-none/<ts>"
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
make eval BENCH=swe-contextbench ARM=memex MAINT=daily RESUME=true RUN_ID=<previous-run-id>
```

## Memory Evolution Analysis

Each run produces a git repo in `results/<bench>/<arm>/<run-id>/snapshots/`:

```bash
cd results/swe-contextbench/memex-daily/<run-id>/snapshots
git log --stat --oneline                         # overview
git diff turn-5..turn-10 -- claude-home/         # changes between turns
git log -p -S "some keyword" -- "*.md"           # when a memory appeared
```

## Design Spec

See [docs/superpowers/specs/2026-03-22-benchmark-harness-design.md](../docs/superpowers/specs/2026-03-22-benchmark-harness-design.md).
