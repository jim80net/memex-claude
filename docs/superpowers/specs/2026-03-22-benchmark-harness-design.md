# Benchmark Harness Design: Validating memex-claude

**Date**: 2026-03-22
**Status**: Draft (rev 2 — post spec review)

## Goal

Build a benchmarking harness that validates memex-claude's effectiveness by comparing Claude Code performance with and without memex, with and without maintenance cycles (sleep/deep-sleep). The harness must:

1. Provide reproducible A/B comparisons across memory configurations
2. Run in ephemeral Docker containers with zero contamination of the host environment
3. Track memory evolution over time via git-snapshotted state
4. Support CI execution
5. Guard against regressions when memex-claude changes

## Benchmarks

### SWE-ContextBench (Primary)

- **Paper**: [arxiv.org/abs/2602.08316](https://arxiv.org/abs/2602.08316)
- **What it tests**: Whether agents can reuse experience from prior related tasks when solving new issues in the same repository
- **Dataset**: 300 base tasks (from SWE-bench Lite) + 99 related tasks derived from real GitHub issue/PR dependency relationships
- **Why chosen**: Directly measures the value proposition of memex — that surfacing the right prior context at the right time improves task success. Already includes oracle-guided and autonomous retrieval settings.
- **Evaluation settings mapping**: SWE-ContextBench defines five settings. Our arms map as follows:
  - Cold arm = "No-Experience" setting
  - Memex arms = "Free Experience Reuse" (memex autonomously retrieves relevant context)
  - A future oracle variant could use "Oracle Experience Reuse" to establish an upper bound

### Dataset Availability Risk

SWE-ContextBench was published February 2026 (arxiv 2602.08316) but may not have a public dataset release yet. **This must be confirmed before implementation begins.**

Mitigation options if the dataset is unavailable:
1. **Contact paper authors** for early access
2. **Reconstruct from SWE-bench Lite metadata** — the paper describes six GitHub relationship patterns (dependency, reference, etc.) that can be programmatically extracted from issue/PR metadata
3. **Build a smaller custom dataset** using the same methodology on a subset of SWE-bench Lite repos
4. **Fall back to SWE-Bench-CL** (273 tasks, 8 chronological sequences, publicly available) which tests a similar memory-accumulation hypothesis

### CodeRAG-Bench (Follow-on, memex-core repo)

- **Paper**: [code-rag-bench.github.io](https://code-rag-bench.github.io/)
- **What it tests**: Whether retrieval-augmented generation improves code generation. Tests retrieval quality directly.
- **Why deferred**: Tests `SkillIndex.query()` retrieval quality without Claude sessions. This is a memex-core concern and will live in that repo as a retrieval benchmark.

## Experimental Design

### Axis 1: Memory System (7 arms)

| Arm | Claude Native Memory | Memex | Maintenance |
|-----|---------------------|-------|-------------|
| Cold | Disabled | Disabled | None |
| Native | Enabled | Disabled | None |
| Memex-None | Disabled | Enabled | None |
| Memex-PerSession | Disabled | Enabled | Sleep + deep-sleep after every task |
| Memex-Daily | Disabled | Enabled | Sleep + deep-sleep every 4-5 tasks |
| Both-None | Enabled | Enabled | None |
| Both-Daily | Enabled | Enabled | Sleep + deep-sleep every 4-5 tasks |

### Axis 2: Maintenance Cycle

| Variant | Description |
|---------|-------------|
| None | Memories accumulate with no curation |
| Per-session | Sleep + deep-sleep after every task |
| Daily | Sleep + deep-sleep after every 4-5 tasks (simulated daily cadence) |

### Key Comparisons

| Comparison | Question Answered |
|------------|-------------------|
| Memex-None vs Cold | Does raw memory accumulation help? |
| Memex-Daily vs Memex-None | Does curation at designed cadence help? |
| Memex-PerSession vs Memex-Daily | Is aggressive curation better or worse? (Over-pruning risk) |
| Memex-Daily vs Native | The real-world headline: selective retrieval vs load-everything |
| Both-Daily vs Memex-Daily | Does native memory add value on top of memex? |
| Native vs Cold | Baseline: how good is Claude's built-in memory? |

### Task Sequence (Daily variant example)

```
Base task 1 -> [stop hook]         |
Base task 2 -> [stop hook]         | simulated "day 1"
Base task 3 -> [stop hook]         |
Base task 4 -> [stop hook]         |
  v sleep + deep-sleep             <- maintenance window
  v snapshot: "post-day-1"
Base task 5 -> [stop hook]         |
Base task 6 -> [stop hook]         | simulated "day 2"
Base task 7 -> [stop hook]         |
Base task 8 -> [stop hook]         |
  v sleep + deep-sleep
  v snapshot: "post-day-2"
  ...
Related tasks (with accumulated + curated memory)
```

## Architecture

### Approach: Makefile + Ephemeral Containers

No persistent infrastructure. Each evaluation run creates a fresh Docker container, runs tasks, extracts results, and destroys the container.

### Two-Phase Execution Model

Each arm's evaluation proceeds in two distinct phases:

**Phase 1 — Population** (`populate.sh`): Execute the 300 base tasks to build memory state.
- **Cold arm**: Skips this phase entirely — no memory to accumulate.
- **Native arm**: Runs base tasks with Claude's native memory enabled so it can accumulate naturally. Memex disabled.
- **Memex arms**: Runs base tasks with memex hooks active (Stop hook extracts learnings). Maintenance cycles run at configured intervals. Native memory disabled.
- **Both arms**: Runs base tasks with both systems active.

**Phase 2 — Evaluation** (`run.sh`): Execute the 99 related tasks with accumulated memory state. All arms run this phase. This is where resolution rate is measured.

Maintenance windows (for Daily variant) occur during Phase 1 only, at every 4-5 task boundary. The memory state entering Phase 2 reflects the full accumulation + curation from Phase 1.

### Claude Code Invocation Protocol

**Installation**: The Docker image includes Claude Code CLI installed via `npm install -g @anthropic-ai/claude-code`. The memex-claude binary is copied from the host build output.

**Authentication**: The `ANTHROPIC_API_KEY` environment variable is passed into the container at runtime via `docker run -e ANTHROPIC_API_KEY`. Never baked into the image.

**Hook registration**: The memex hooks JSON (`hooks/hooks.json`) is installed to the container's Claude Code settings directory at build time. The memex binary path in the hook config points to the container-local path.

**Invocation per task**: Each SWE-bench task is invoked as:

```bash
# Phase 1 (population) and Phase 2 (evaluation)
cd /eval/workdir/<repo>
echo "<issue description>" | timeout 900 claude --print \
  --model claude-sonnet-4-20250514 \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  2>/eval/raw/task-${TASK_ID}.stderr \
  >/eval/raw/task-${TASK_ID}.stdout

# Extract patch
git diff > /eval/raw/task-${TASK_ID}.patch
git checkout .  # reset for next task
```

**Maintenance invocation** (sleep + deep-sleep):

```bash
echo "/sleep" | timeout 600 claude --print --cwd /eval/workdir/<repo>
echo "/deep-sleep" | timeout 600 claude --print --cwd /eval/workdir/<repo>
```

### Controlling Claude Native Memory

Claude Code's native memory is controlled via `~/.claude/settings.json`:

```json
// native-memory-disabled (Cold, Memex-* arms)
{ "memory": { "enabled": false } }

// native-memory-enabled (Native, Both-* arms)
{ "memory": { "enabled": true } }
```

This file is generated by the adapter alongside the memex config. Both files are placed in the container's synthetic `$HOME` before execution begins.

### Eval Config Files

Each arm uses a pair of config files:

**`configs/memex-<arm>.json`** (memex config at `~/.claude/memex.json`):

```json
// cold.json / native.json — memex disabled
{ "enabled": false }

// memex.json / both.json — memex enabled
{
  "enabled": true,
  "sync": { "enabled": false },
  "sleepSchedule": { "enabled": false },
  "hooks": {
    "UserPromptSubmit": { "enabled": true, "topK": 3, "threshold": 0.5, "maxInjectedChars": 8000 },
    "PreToolUse": { "enabled": false },
    "Stop": { "enabled": true, "extractLearnings": true, "behavioralRules": true },
    "PreCompact": { "enabled": false }
  }
}
```

**`configs/settings-<arm>.json`** (Claude settings at `~/.claude/settings.json`):

```json
// cold.json / memex-*.json — native memory disabled
{ "memory": { "enabled": false } }

// native.json / both-*.json — native memory enabled
{ "memory": { "enabled": true } }
```

### CWD Consistency

All tasks within a given repository must use a stable working directory path inside the container (e.g., `/eval/workdir/django` for all django tasks). This ensures `encodeProjectPath(cwd)` produces the same encoded path, so project memories accumulate in a single directory rather than being siloed across different CWDs.

The adapter's `setup.sh` clones each repository once to `/eval/workdir/<repo-name>` and checks out the appropriate commit per task using `git checkout <commit>` rather than cloning to separate directories.

### Dockerfile Outline

```dockerfile
FROM node:20-bookworm

# System deps for SWE-bench repos (Python, build tools)
RUN apt-get update && apt-get install -y python3 python3-pip python3-venv git curl

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Non-root eval user
RUN useradd -m -s /bin/bash eval
USER eval
WORKDIR /home/eval

# Memex binary (copied from host build)
COPY --chown=eval:eval dist/memex /usr/local/bin/memex

# Hook registration
COPY --chown=eval:eval hooks/hooks.json /home/eval/.claude/hooks/memex-claude/hooks.json

# Eval scripts
COPY --chown=eval:eval eval/scripts/ /eval/scripts/
COPY --chown=eval:eval eval/adapters/ /eval/adapters/

# Snapshot git repo init
RUN mkdir -p /eval/snapshots && cd /eval/snapshots && git init && \
    git config user.email "eval@memex" && git config user.name "memex-eval"
```

Network policy: The container runs with `--network=eval-net` where `eval-net` is a Docker network with outbound access restricted to the Claude API host (`api.anthropic.com`). This is enforced in the Makefile's `docker run` command.

### Scoring Strategy (avoiding Docker-in-Docker)

SWE-bench's test harness normally runs Docker containers to test patches. To avoid Docker-in-Docker complexity, scoring is a **separate host-side step**:

1. `run.sh` produces patches in `/eval/raw/task-${TASK_ID}.patch`
2. Patches are copied out to `results/<arm>/<timestamp>/raw/`
3. `score.sh` runs **on the host** (or in a separate container with Docker socket access) using the standard SWE-bench evaluation harness:
   ```bash
   python -m swebench.harness.run_evaluation \
     --predictions_path results/<arm>/<ts>/predictions.jsonl \
     --swe_bench_tasks data/swe-contextbench/tasks.jsonl \
     --log_dir results/<arm>/<ts>/eval-logs/
   ```

This keeps the eval container simple (no Docker socket) and reuses SWE-bench's mature evaluation infrastructure.

### Directory Layout

```
eval/
  Makefile
  Dockerfile
  configs/
    cold.json                      # memex disabled, native disabled
    native.json                    # memex disabled, native enabled
    memex.json                     # memex enabled, native disabled
    both.json                      # memex enabled, native enabled
  adapters/
    swe-contextbench/
      setup.sh                     # download dataset, prepare SWE-bench harness
      populate.sh                  # seed ~/.claude/ for MEMEX-enabled arms
      run.sh                       # iterate tasks, invoke Claude, snapshot
      score.sh                     # compute metrics from raw outputs
  scripts/
    snapshot.sh                    # git-commit memory state after each turn
    maintenance.sh                 # run sleep + deep-sleep cycle
    compare.sh                     # diff metrics across runs
  data/                            # benchmark datasets (git-ignored)
  results/                         # output artifacts (git-ignored)
    <benchmark>/
      <arm>/<timestamp>/
        snapshots/                 # git repo of memory evolution
        metrics.json               # scored results
        raw/                       # raw Claude outputs per task
```

### Data Segregation Model

```
Host machine (temp, per-run)              Docker container
-------------------------------           -----------------
/tmp/memex-eval/<run-id>/
  claude-home/                   -> bind-mount rw -> /home/eval/.claude/
    memex.json
    skills/
    rules/
    projects/<encoded>/memory/
    cache/
      memex-cache.json                    <- embedding cache
      memex-telemetry.json
      sessions/
  project-claude/                -> bind-mount rw -> <workdir>/.claude/
    skills/
    rules/
  snapshots/                              <- git repo, checkpoint after each turn
    .git/
  results/                                <- final metrics

data/ (host)                     -> bind-mount ro -> /eval/data/
```

### Isolation Guarantees

1. **No write path to real host `$HOME`**: Container bind mounts point to `/tmp/memex-eval/<run-id>/`, never `~/.claude/`
2. **No network leakage**: Sync is disabled in all eval configs. Container network is restricted to Claude API access only.
3. **No cross-run contamination**: Each `make` target creates a fresh container. No state carries between arms.
4. **Deterministic seeding**: The adapter's `populate.sh` produces identical initial state for each run of the same arm.
5. **Snapshots survive container destruction**: They live on the host in the temp dir, copied to `results/` after the run.

### Snapshotting Protocol

A wrapper script intercepts each turn boundary and commits memory state:

```bash
# eval/scripts/snapshot.sh (runs inside container after each turn)
TURN=$1
SUMMARY=$2
SNAP_DIR="/eval/snapshots"

cp -a /home/eval/.claude/ "$SNAP_DIR/claude-home/"
cp -a /eval/workdir/.claude/ "$SNAP_DIR/project-claude/"

cd "$SNAP_DIR"
git add -A
git commit -m "turn-${TURN}: ${SUMMARY}" --allow-empty
git tag "turn-${TURN}"
```

### Observable Artifacts Per Turn (via git diff)

| File | What It Reveals |
|------|-----------------|
| `cache/memex-cache.json` | Embedding vectors added/evicted |
| `cache/memex-telemetry.json` | Match counts, queryHits, boost changes |
| `cache/sessions/<id>.json` | Rule disclosure state (full vs one-liner) |
| `projects/<encoded>/memory/*.md` | Memories created/updated by Stop hook |
| `project-claude/skills/` | Skills created during the run |
| `project-claude/rules/` | Rules created during the run |

### Analysis Commands

```bash
# Which turns added the most memory?
git log --stat --oneline

# What changed between turn 5 and turn 10?
git diff turn-5..turn-10 -- claude-home/projects/*/memory/

# When did a specific memory first appear?
git log --all -p -S "auth pattern" -- "*.md"

# Embedding cache growth over time
git log --format="%h %s" | while read hash msg; do
  size=$(git show "$hash:claude-home/cache/memex-cache.json" | wc -c)
  echo "$msg: ${size} bytes"
done
```

### Makefile Interface

```makefile
# Individual arms
make eval BENCH=swe-contextbench ARM=cold MAINT=none
make eval BENCH=swe-contextbench ARM=native MAINT=none
make eval BENCH=swe-contextbench ARM=memex MAINT=none
make eval BENCH=swe-contextbench ARM=memex MAINT=per-session
make eval BENCH=swe-contextbench ARM=memex MAINT=daily
make eval BENCH=swe-contextbench ARM=both MAINT=none
make eval BENCH=swe-contextbench ARM=both MAINT=daily

# Run all 7 arms
make eval-all BENCH=swe-contextbench

# Pilot run (20-task subset)
make eval BENCH=swe-contextbench ARM=memex MAINT=daily PILOT=20

# Compare any two runs
make compare A="memex/daily/<ts>" B="native/none/<ts>"
```

The Makefile validates `(ARM, MAINT)` combinations and rejects invalid ones:

```makefile
# Valid combinations
VALID_cold       := none
VALID_native     := none
VALID_memex      := none per-session daily
VALID_both       := none daily

validate:
	@if ! echo "$(VALID_$(ARM))" | grep -qw "$(MAINT)"; then \
		echo "ERROR: Invalid combination ARM=$(ARM) MAINT=$(MAINT)"; \
		echo "Valid MAINT values for ARM=$(ARM): $(VALID_$(ARM))"; \
		exit 1; \
	fi
```

### SWE-ContextBench Adapter

| Step | What Happens |
|------|-------------|
| `setup.sh` | Downloads SWE-ContextBench dataset (300 base + 99 related tasks). Clones target repos to `/eval/workdir/<repo-name>`. Installs SWE-bench evaluation harness on host. |
| `populate.sh` | **Phase 1 — Population.** Cold arm: skips entirely. Native arm: runs 300 base tasks with native memory enabled, memex disabled. Memex arms: runs 300 base tasks with memex hooks active, native memory disabled; runs maintenance cycles at configured intervals (per-session or every 4-5 tasks). Both arms: runs with both active. Snapshots after each task and each maintenance window. |
| `run.sh` | **Phase 2 — Evaluation.** Runs the 99 related tasks against the memory state accumulated in Phase 1. All arms execute this phase. Captures generated patches. Snapshots after each task. |
| `score.sh` | Runs on host (not in eval container). Feeds patches to SWE-bench evaluation harness. Produces `metrics.json`. |

### Metrics Schema

`metrics.json` produced by `score.sh`:

```json
{
  "benchmark": "swe-contextbench",
  "arm": "memex",
  "maintenance": "daily",
  "timestamp": "2026-03-22T10:00:00Z",
  "pilot": false,
  "summary": {
    "total_tasks": 99,
    "resolved": 42,
    "resolution_rate": 0.4242,
    "total_tokens": 1250000,
    "total_cost_usd": 85.50,
    "total_duration_s": 14400,
    "memory_entries_final": 47,
    "skills_created": 3,
    "rules_created": 8,
    "maintenance_cycles": 6
  },
  "per_task": [
    {
      "task_id": "django__django-12345",
      "resolved": true,
      "tokens": 12500,
      "cost_usd": 0.85,
      "duration_s": 180,
      "memex_context_injected": ["memory:auth-pattern", "rule:django-conventions"],
      "memex_context_chars": 2400
    }
  ]
}
```

### Runtime and Parallelism Estimates

| Arm | Claude Invocations | Estimated Time (sequential) |
|-----|-------------------|----------------------------|
| Cold | 99 | ~8 hours |
| Native | 300 + 99 = 399 | ~33 hours |
| Memex-None | 300 + 99 = 399 | ~33 hours |
| Memex-PerSession | 300 + 300 maint + 99 = 699 | ~58 hours |
| Memex-Daily | 300 + ~75 maint + 99 = ~474 | ~40 hours |
| Both-None | 300 + 99 = 399 | ~33 hours |
| Both-Daily | 300 + ~75 maint + 99 = ~474 | ~40 hours |
| **Total** | **~2,643** | **~245 hours** |

Assumes ~5 min average per task invocation. Pilot set (20 related tasks, proportional base tasks): ~15% of full cost and time.

**Parallelism**: Arms are fully independent and can run in parallel containers. With 7 concurrent containers, wall-clock time drops to ~58 hours (bounded by the slowest arm). In CI, the Makefile's `eval-all` target can launch arms in parallel via `make -j7`.

### Cost Mitigation

- **Pilot set**: Run all 7 arms on a 20-task subset first to validate the harness and get early signal
- **Progressive expansion**: If per-session vs daily shows no signal on the pilot, collapse them for the full run
- **Retrieval logging**: For memex arms, log retrieved context per task before running Claude. If retrieval quality doesn't change across maintenance variants, generation quality won't either.

## Metrics

### Primary

- **Resolution rate**: Percentage of related tasks where the generated patch passes the test suite
- **Resolution rate delta**: Difference between arms (memex vs native, daily vs none, etc.)

### Secondary

- **Retrieval relevance**: For memex arms, what percentage of surfaced memories/skills/rules were relevant to the task (manual annotation on pilot set)
- **Memory growth curve**: Number and size of memories/skills/rules over the task sequence
- **Telemetry correlation**: Do high-match-count entries correlate with correctly resolved tasks?
- **Maintenance impact**: What did sleep/deep-sleep promote, demote, or create? Did those changes improve subsequent task performance?
- **Cost efficiency**: Token usage and API cost per arm

## Future Work

- **CodeRAG-Bench** in memex-core repo for retrieval-only validation of `SkillIndex.query()`
- **SWE-Bench-CL** for continual learning / forward-backward transfer measurement
- **SWE-QA** for code comprehension with/without architectural memory
- **AGENTbench** for direct validation of context file (AGENTS.md/CLAUDE.md) effectiveness
- Additional benchmarks can be added by implementing the adapter interface (setup/populate/run/score)
