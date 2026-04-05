# Benchmark Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Makefile-driven benchmark harness that runs SWE-ContextBench in ephemeral Docker containers to compare Claude Code performance across 7 memory configuration arms, with git-snapshotted memory evolution tracking.

**Architecture:** Ephemeral Docker containers driven by a Makefile. Each arm gets a fresh container with a synthetic `$HOME`. Shared scripts (snapshot, maintenance, compare) are reused across adapters. Scoring runs on the host via SWE-bench's evaluation harness. All state is captured in `results/` with git-repo snapshots for memory evolution analysis.

**Tech Stack:** Bash (scripts), Make (orchestration), Docker (isolation), Python (SWE-bench scoring), jq (metrics aggregation)

**Spec:** `docs/superpowers/specs/2026-03-22-benchmark-harness-design.md`

---

## File Structure

```
eval/
  Makefile                                 # Orchestration: build, eval, compare, validate
  eval.env                                 # Configurable parameters (MODEL, timeouts, etc.)
  Dockerfile                               # Eval container image
  .dockerignore                            # Exclude results/, data/ from build context
  configs/
    memex-cold.json                        # memex config: disabled
    memex-native.json                      # memex config: disabled
    memex-memex.json                       # memex config: enabled + hooks
    memex-both.json                        # memex config: enabled + hooks
    settings-cold.json                     # Claude settings: native memory disabled
    settings-native.json                   # Claude settings: native memory enabled
    settings-memex.json                    # Claude settings: native memory disabled
    settings-both.json                     # Claude settings: native memory enabled
  scripts/
    snapshot.sh                            # Git-commit memory state + tag
    maintenance.sh                         # Run sleep + deep-sleep per-repo
    compare.sh                             # Diff metrics across two runs
    invoke-task.sh                         # Run one SWE-bench task via Claude
    collect-results.sh                     # Copy artifacts from container to results/
  adapters/
    swe-contextbench/
      setup.sh                             # Download dataset + clone repos (host-side)
      populate.sh                          # Phase 1: run base tasks, build memory
      run.sh                               # Phase 2: run related tasks, capture patches
      score.sh                             # Host-side: run SWE-bench evaluation
  data/                                    # Downloaded datasets (git-ignored)
  results/                                 # Output artifacts (git-ignored)
```

Additionally in the project root:
- `.gitignore` — add `eval/data/` and `eval/results/`

**Important build context note:** The Dockerfile lives at `eval/Dockerfile` but the Docker build context must be the **project root** (not `eval/`), because the Dockerfile needs to COPY `dist/linux-x64/memex`, `hooks/hooks.json`, `eval/scripts/`, and `eval/adapters/`. The Makefile build target uses: `cd .. && docker build -t $(IMAGE_NAME) -f eval/Dockerfile .`

---

## Task 1: Project scaffold and configuration files

**Files:**
- Create: `eval/Makefile`
- Create: `eval/eval.env`
- Create: `eval/.dockerignore`
- Create: `eval/configs/memex-cold.json`
- Create: `eval/configs/memex-native.json`
- Create: `eval/configs/memex-memex.json`
- Create: `eval/configs/memex-both.json`
- Create: `eval/configs/settings-cold.json`
- Create: `eval/configs/settings-native.json`
- Create: `eval/configs/settings-memex.json`
- Create: `eval/configs/settings-both.json`
- Modify: `.gitignore`

- [ ] **Step 1: Create eval.env with configurable parameters**

```bash
# eval/eval.env
MODEL=claude-sonnet-4-20250514
TASK_TIMEOUT=900
MAINT_TIMEOUT=600
DAILY_BATCH_SIZE=4
PILOT=0
IMAGE_NAME=memex-eval
```

- [ ] **Step 2: Create the 8 config files**

`eval/configs/memex-cold.json`:
```json
{ "enabled": false }
```

`eval/configs/memex-native.json`:
```json
{ "enabled": false }
```

`eval/configs/memex-memex.json`:
```json
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

`eval/configs/memex-both.json`: same as `memex-memex.json`

`eval/configs/settings-cold.json`:
```json
{ "memory": { "enabled": false } }
```

`eval/configs/settings-native.json`:
```json
{ "memory": { "enabled": true } }
```

`eval/configs/settings-memex.json`:
```json
{ "memory": { "enabled": false } }
```

`eval/configs/settings-both.json`:
```json
{ "memory": { "enabled": true } }
```

- [ ] **Step 3: Create .dockerignore**

```
data/
results/
```

- [ ] **Step 4: Create the Makefile skeleton with validation**

```makefile
# eval/Makefile
include eval.env
export

BENCH ?= swe-contextbench
ARM ?= cold
MAINT ?= none
PILOT ?= 0
RESUME ?= false
RUN_ID ?= $(shell date +%Y%m%dT%H%M%S)

# Valid (ARM, MAINT) combinations
VALID_cold   := none
VALID_native := none
VALID_memex  := none per-session daily
VALID_both   := none daily

.PHONY: validate build setup eval eval-all score compare clean network

validate:
	@if [ -z "$(VALID_$(ARM))" ]; then \
		echo "ERROR: Unknown ARM=$(ARM). Valid: cold native memex both"; exit 1; \
	fi
	@if ! echo "$(VALID_$(ARM))" | grep -qw "$(MAINT)"; then \
		echo "ERROR: Invalid MAINT=$(MAINT) for ARM=$(ARM). Valid: $(VALID_$(ARM))"; exit 1; \
	fi

build:
	cd .. && docker build -t $(IMAGE_NAME) -f eval/Dockerfile .

network:
	docker network inspect eval-net >/dev/null 2>&1 || \
		docker network create --driver bridge eval-net

setup:
	adapters/$(BENCH)/setup.sh

eval: validate build network
	@echo "=== Eval: BENCH=$(BENCH) ARM=$(ARM) MAINT=$(MAINT) PILOT=$(PILOT) RUN_ID=$(RUN_ID) ==="
	@# Create temp dirs on host
	mkdir -p /tmp/memex-eval/$(RUN_ID)/{claude-home,snapshots,raw}
	@# Initialize snapshot git repo
	cd /tmp/memex-eval/$(RUN_ID)/snapshots && git init && \
		git config user.email "eval@memex" && git config user.name "memex-eval"
	@# Seed config files
	cp configs/memex-$(ARM).json /tmp/memex-eval/$(RUN_ID)/claude-home/memex.json
	cp configs/settings-$(ARM).json /tmp/memex-eval/$(RUN_ID)/claude-home/settings.json
	@# Create required subdirs
	mkdir -p /tmp/memex-eval/$(RUN_ID)/claude-home/{skills,rules,cache/sessions,projects}
	@# Run population phase (Phase 1)
	docker run --rm \
		--network=eval-net \
		-e ANTHROPIC_API_KEY \
		-e ARM=$(ARM) -e MAINT=$(MAINT) -e PILOT=$(PILOT) -e RESUME=$(RESUME) \
		-e MODEL=$(MODEL) -e TASK_TIMEOUT=$(TASK_TIMEOUT) \
		-e MAINT_TIMEOUT=$(MAINT_TIMEOUT) -e DAILY_BATCH_SIZE=$(DAILY_BATCH_SIZE) \
		-v /tmp/memex-eval/$(RUN_ID)/claude-home:/home/eval/.claude \
		-v /tmp/memex-eval/$(RUN_ID)/snapshots:/eval/snapshots \
		-v /tmp/memex-eval/$(RUN_ID)/raw:/eval/raw \
		-v $(CURDIR)/data:/eval/data:ro \
		-v $(CURDIR)/data/swe-contextbench/workdir:/eval/workdir \
		$(IMAGE_NAME) /eval/adapters/$(BENCH)/populate.sh
	@# Run evaluation phase (Phase 2)
	docker run --rm \
		--network=eval-net \
		-e ANTHROPIC_API_KEY \
		-e ARM=$(ARM) -e MAINT=$(MAINT) -e PILOT=$(PILOT) -e RESUME=$(RESUME) \
		-e MODEL=$(MODEL) -e TASK_TIMEOUT=$(TASK_TIMEOUT) \
		-v /tmp/memex-eval/$(RUN_ID)/claude-home:/home/eval/.claude \
		-v /tmp/memex-eval/$(RUN_ID)/snapshots:/eval/snapshots \
		-v /tmp/memex-eval/$(RUN_ID)/raw:/eval/raw \
		-v $(CURDIR)/data:/eval/data:ro \
		-v $(CURDIR)/data/swe-contextbench/workdir:/eval/workdir \
		$(IMAGE_NAME) /eval/adapters/$(BENCH)/run.sh
	@# Collect results
	scripts/collect-results.sh $(BENCH) $(ARM) $(MAINT) $(RUN_ID)

score:
	ARM=$(ARM) MAINT=$(MAINT) adapters/$(BENCH)/score.sh results/$(BENCH)/$(ARM)-$(MAINT)/$(RUN_ID)

compare:
	scripts/compare.sh "$(A)" "$(B)"

eval-all: build network
	$(MAKE) eval ARM=cold    MAINT=none        & \
	$(MAKE) eval ARM=native  MAINT=none        & \
	$(MAKE) eval ARM=memex   MAINT=none        & \
	$(MAKE) eval ARM=memex   MAINT=per-session & \
	$(MAKE) eval ARM=memex   MAINT=daily       & \
	$(MAKE) eval ARM=both    MAINT=none        & \
	$(MAKE) eval ARM=both    MAINT=daily       & \
	wait

clean:
	rm -rf /tmp/memex-eval/*
```

- [ ] **Step 5: Update .gitignore**

Append to project root `.gitignore`:
```
eval/data/
eval/results/
```

- [ ] **Step 6: Verify Makefile validation works**

Run from `eval/`:
```bash
cd eval && make validate ARM=cold MAINT=none
```
Expected: exits 0 (success)

```bash
cd eval && make validate ARM=cold MAINT=daily
```
Expected: `ERROR: Invalid MAINT=daily for ARM=cold. Valid: none`

- [ ] **Step 7: Commit**

```bash
git add eval/Makefile eval/eval.env eval/.dockerignore eval/configs/ .gitignore
git commit -m "feat(eval): scaffold benchmark harness with configs and Makefile"
```

---

## Task 2: Dockerfile

**Files:**
- Create: `eval/Dockerfile`

- [ ] **Step 1: Write the Dockerfile**

Note: build context is project root (not `eval/`), so paths are relative to project root.

```dockerfile
FROM node:20-bookworm

# System deps for SWE-bench repos (Python, build tools)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 python3-pip python3-venv git curl jq \
    && rm -rf /var/lib/apt/lists/*

# Claude Code CLI
RUN npm install -g @anthropic-ai/claude-code

# Memex binary + ONNX runtime libraries
COPY dist/linux-x64/memex /usr/local/bin/memex
COPY dist/linux-x64/libonnxruntime*.so* /usr/local/lib/
RUN chmod 755 /usr/local/bin/memex && ldconfig

# Non-root eval user
RUN useradd -m -s /bin/bash eval

# Install hooks registration for Claude Code
# This makes Claude Code discover and invoke memex hooks.
# The hooks.json references the binary via command path.
COPY hooks/hooks.json /tmp/hooks-source.json
RUN mkdir -p /home/eval/.claude/hooks/memex-claude && \
    sed 's|${CLAUDE_PLUGIN_ROOT}/bin/memex|/usr/local/bin/memex|g' \
        /tmp/hooks-source.json > /home/eval/.claude/hooks/memex-claude/hooks.json && \
    rm /tmp/hooks-source.json

# Prepare dirs owned by eval
RUN mkdir -p /home/eval/.claude/cache /eval/scripts /eval/adapters /eval/snapshots /eval/raw /eval/workdir \
    && chown -R eval:eval /home/eval/.claude /eval

# Eval scripts and adapters (paths relative to project root build context)
COPY --chown=eval:eval eval/scripts/ /eval/scripts/
COPY --chown=eval:eval eval/adapters/ /eval/adapters/
RUN chmod +x /eval/scripts/*.sh /eval/adapters/*/*.sh

USER eval
WORKDIR /home/eval

# Snapshot git repo init
RUN cd /eval/snapshots && git init \
    && git config user.email "eval@memex" \
    && git config user.name "memex-eval"
```

- [ ] **Step 2: Verify image builds**

Note: the image requires `dist/memex` binary. Build it first if not present:
```bash
cd /home/jim/workspace/github.com/jim80net/memex-claude && timeout 60 bun run build.ts
```

Then build the Docker image:
```bash
cd eval && timeout 120 docker build -t memex-eval .
```
Expected: builds successfully, image tagged `memex-eval`

- [ ] **Step 3: Verify container starts and has expected tools**

```bash
docker run --rm memex-eval bash -c "claude --version && memex --help 2>&1 | head -1 && python3 --version && jq --version && git --version"
```
Expected: version output for each tool

- [ ] **Step 4: Commit**

```bash
git add eval/Dockerfile
git commit -m "feat(eval): add Dockerfile for eval container"
```

---

## Task 3: Core shared scripts

**Files:**
- Create: `eval/scripts/snapshot.sh`
- Create: `eval/scripts/maintenance.sh`
- Create: `eval/scripts/invoke-task.sh`
- Create: `eval/scripts/collect-results.sh`
- Create: `eval/scripts/compare.sh`

- [ ] **Step 1: Write snapshot.sh**

```bash
#!/usr/bin/env bash
# snapshot.sh — Git-commit memory state after a turn
# Usage: snapshot.sh <turn-number> <summary>
set -euo pipefail

TURN="${1:?Usage: snapshot.sh <turn> <summary>}"
SUMMARY="${2:-no summary}"
SNAP_DIR="/eval/snapshots"

# Copy only the directories that change (not static config files)
mkdir -p "$SNAP_DIR/claude-home"
for dir in cache projects skills rules; do
    if [ -d "/home/eval/.claude/$dir" ]; then
        rm -rf "$SNAP_DIR/claude-home/$dir"
        cp -a "/home/eval/.claude/$dir" "$SNAP_DIR/claude-home/$dir"
    fi
done

# Capture per-repo project .claude/ directories
mkdir -p "$SNAP_DIR/project-claude"
for repo_claude in /eval/workdir/*/.claude; do
    [ -d "$repo_claude" ] || continue
    repo_name=$(basename "$(dirname "$repo_claude")")
    rm -rf "$SNAP_DIR/project-claude/$repo_name"
    cp -a "$repo_claude" "$SNAP_DIR/project-claude/$repo_name"
done

# Also copy checkpoint files if they exist
for ckpt in /eval/checkpoint.txt /eval/checkpoint-phase2.txt; do
    [ -f "$ckpt" ] && cp "$ckpt" "$SNAP_DIR/"
done

cd "$SNAP_DIR"
git add -A
git commit -m "turn-${TURN}: ${SUMMARY}" --allow-empty
git tag -f "turn-${TURN}"
```

- [ ] **Step 2: Write maintenance.sh**

```bash
#!/usr/bin/env bash
# maintenance.sh — Run sleep + deep-sleep per-repo
# Usage: maintenance.sh
set -euo pipefail

MAINT_TIMEOUT="${MAINT_TIMEOUT:-600}"
MODEL="${MODEL:-claude-sonnet-4-20250514}"

for repo in /eval/workdir/*/; do
    [ -d "$repo" ] || continue
    repo_name=$(basename "$repo")
    echo "[maintenance] Running /sleep on $repo_name"
    echo "/sleep" | timeout "$MAINT_TIMEOUT" claude --print \
        --model "$MODEL" --cwd "$repo" 2>/dev/null || true

    echo "[maintenance] Running /deep-sleep on $repo_name"
    echo "/deep-sleep" | timeout "$MAINT_TIMEOUT" claude --print \
        --model "$MODEL" --cwd "$repo" 2>/dev/null || true
done
```

- [ ] **Step 3: Write invoke-task.sh**

```bash
#!/usr/bin/env bash
# invoke-task.sh — Run one SWE-bench task via Claude Code
# Usage: invoke-task.sh <task-id> <repo-name> <commit> <issue-text-file>
set -euo pipefail

TASK_ID="${1:?Usage: invoke-task.sh <task-id> <repo> <commit> <issue-file>}"
REPO="${2:?}"
COMMIT="${3:?}"
ISSUE_FILE="${4:?}"
TASK_TIMEOUT="${TASK_TIMEOUT:-900}"
MODEL="${MODEL:-claude-sonnet-4-20250514}"

WORKDIR="/eval/workdir/$REPO"
RAW_DIR="/eval/raw"

# Checkout the correct commit
cd "$WORKDIR"
git checkout "$COMMIT" --force 2>/dev/null
git clean -fd 2>/dev/null

# Run Claude with the issue description
START_TIME=$(date +%s)
EXIT_CODE=0
cat "$ISSUE_FILE" | timeout "$TASK_TIMEOUT" claude --print \
    --model "$MODEL" \
    --cwd "$WORKDIR" \
    --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
    2>"$RAW_DIR/task-${TASK_ID}.stderr" \
    >"$RAW_DIR/task-${TASK_ID}.stdout" || EXIT_CODE=$?
END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Extract patch
git diff > "$RAW_DIR/task-${TASK_ID}.patch"

# Write per-task metadata
jq -n \
    --arg task_id "$TASK_ID" \
    --argjson exit_code "$EXIT_CODE" \
    --argjson duration "$DURATION" \
    '{task_id: $task_id, exit_code: $exit_code, duration_s: $duration}' \
    > "$RAW_DIR/task-${TASK_ID}.meta.json"

# Full reset for next task
git checkout . 2>/dev/null
git clean -fd 2>/dev/null
```

- [ ] **Step 4: Write collect-results.sh**

```bash
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
```

- [ ] **Step 5: Write compare.sh**

```bash
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
```

- [ ] **Step 6: Verify scripts are syntactically valid**

```bash
for f in eval/scripts/*.sh; do bash -n "$f" && echo "OK: $f"; done
```
Expected: `OK` for each script

- [ ] **Step 7: Commit**

```bash
git add eval/scripts/
git commit -m "feat(eval): add shared scripts (snapshot, maintenance, invoke, collect, compare)"
```

---

## Task 4: SWE-ContextBench adapter — setup.sh (host-side)

**Files:**
- Create: `eval/adapters/swe-contextbench/setup.sh`

- [ ] **Step 1: Write setup.sh**

This script runs on the host. It downloads the dataset and prepares repo clones. Since SWE-ContextBench dataset availability is uncertain, this script first checks for the dataset and falls back to SWE-bench Lite with a stub relationship file.

```bash
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
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n eval/adapters/swe-contextbench/setup.sh
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add eval/adapters/swe-contextbench/setup.sh
git commit -m "feat(eval): add SWE-ContextBench setup adapter (host-side)"
```

---

## Task 5: SWE-ContextBench adapter — populate.sh (Phase 1)

**Files:**
- Create: `eval/adapters/swe-contextbench/populate.sh`

- [ ] **Step 1: Write populate.sh**

```bash
#!/usr/bin/env bash
# populate.sh — Phase 1: Run base tasks to accumulate memory
# Env vars: ARM, MAINT, PILOT, RESUME, MODEL, TASK_TIMEOUT, MAINT_TIMEOUT, DAILY_BATCH_SIZE
set -euo pipefail

DATA_DIR="/eval/data/swe-contextbench"
CHECKPOINT="/eval/checkpoint.txt"
TASK_FILE="$DATA_DIR/base_tasks.jsonl"
BATCH_SIZE="${DAILY_BATCH_SIZE:-4}"
TURN=0

# Cold arm skips population entirely
if [ "$ARM" = "cold" ]; then
    echo "[populate] ARM=cold — skipping Phase 1."
    exit 0
fi

TOTAL=$(wc -l < "$TASK_FILE")
echo "[populate] Phase 1: $TOTAL base tasks, ARM=$ARM, MAINT=$MAINT"

# Resume support
START_LINE=1
if [ "$RESUME" = "true" ] && [ -f "$CHECKPOINT" ]; then
    START_LINE=$(cat "$CHECKPOINT")
    echo "[populate] Resuming from task $START_LINE"
fi

# Compute batch count offset for resume (so daily maintenance triggers correctly)
if [ "$START_LINE" -gt 1 ]; then
    BATCH_COUNT=$(( (START_LINE - 1) % BATCH_SIZE ))
else
    BATCH_COUNT=0
fi

while IFS= read -r line; do
    TURN=$((TURN + 1))

    # Skip already-completed tasks on resume
    if [ "$TURN" -lt "$START_LINE" ]; then
        continue
    fi

    # Extract task fields
    TASK_ID=$(echo "$line" | jq -r '.instance_id')
    REPO=$(echo "$line" | jq -r '.repo' | tr '/' '_')
    COMMIT=$(echo "$line" | jq -r '.base_commit')
    ISSUE_FILE="/tmp/issue-${TASK_ID}.txt"
    echo "$line" | jq -r '.problem_statement' > "$ISSUE_FILE"

    echo "[populate] Task $TURN/$TOTAL: $TASK_ID"
    /eval/scripts/invoke-task.sh "$TASK_ID" "$REPO" "$COMMIT" "$ISSUE_FILE" || true

    # Snapshot
    /eval/scripts/snapshot.sh "$TURN" "base: $TASK_ID"

    # Write checkpoint
    echo "$((TURN + 1))" > "$CHECKPOINT"

    # Maintenance check
    BATCH_COUNT=$((BATCH_COUNT + 1))
    case "$MAINT" in
        per-session)
            echo "[populate] Maintenance after task $TURN"
            /eval/scripts/maintenance.sh
            /eval/scripts/snapshot.sh "${TURN}-maint" "maintenance after $TASK_ID"
            ;;
        daily)
            if [ "$BATCH_COUNT" -ge "$BATCH_SIZE" ]; then
                echo "[populate] Daily maintenance after batch (task $TURN)"
                /eval/scripts/maintenance.sh
                /eval/scripts/snapshot.sh "${TURN}-maint" "daily maintenance"
                BATCH_COUNT=0
            fi
            ;;
        none)
            ;;
    esac

    rm -f "$ISSUE_FILE"
done < "$TASK_FILE"

echo "[populate] Phase 1 complete. $TURN tasks processed."
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n eval/adapters/swe-contextbench/populate.sh
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add eval/adapters/swe-contextbench/populate.sh
git commit -m "feat(eval): add SWE-ContextBench populate adapter (Phase 1)"
```

---

## Task 6: SWE-ContextBench adapter — run.sh (Phase 2)

**Files:**
- Create: `eval/adapters/swe-contextbench/run.sh`

- [ ] **Step 1: Write run.sh**

```bash
#!/usr/bin/env bash
# run.sh — Phase 2: Run related tasks and capture patches
# Env vars: ARM, PILOT, RESUME, MODEL, TASK_TIMEOUT
set -euo pipefail

DATA_DIR="/eval/data/swe-contextbench"
CHECKPOINT="/eval/checkpoint-phase2.txt"
TASK_FILE="$DATA_DIR/related_tasks.jsonl"
PILOT="${PILOT:-0}"

TOTAL=$(wc -l < "$TASK_FILE")
if [ "$PILOT" -gt 0 ] && [ "$PILOT" -lt "$TOTAL" ]; then
    TOTAL="$PILOT"
    echo "[run] Pilot mode: running $PILOT of $(wc -l < "$TASK_FILE") related tasks"
fi

echo "[run] Phase 2: $TOTAL related tasks, ARM=$ARM"

# Resume support
START_LINE=1
if [ "$RESUME" = "true" ] && [ -f "$CHECKPOINT" ]; then
    START_LINE=$(cat "$CHECKPOINT")
    echo "[run] Resuming from task $START_LINE"
fi

TURN=0
while IFS= read -r line; do
    TURN=$((TURN + 1))

    # Pilot limit
    if [ "$PILOT" -gt 0 ] && [ "$TURN" -gt "$PILOT" ]; then
        break
    fi

    # Skip already-completed tasks on resume
    if [ "$TURN" -lt "$START_LINE" ]; then
        continue
    fi

    # Extract task fields
    TASK_ID=$(echo "$line" | jq -r '.instance_id')
    REPO=$(echo "$line" | jq -r '.repo' | tr '/' '_')
    COMMIT=$(echo "$line" | jq -r '.base_commit')
    ISSUE_FILE="/tmp/issue-${TASK_ID}.txt"
    echo "$line" | jq -r '.problem_statement' > "$ISSUE_FILE"

    echo "[run] Task $TURN/$TOTAL: $TASK_ID"
    /eval/scripts/invoke-task.sh "$TASK_ID" "$REPO" "$COMMIT" "$ISSUE_FILE" || true

    # Snapshot
    /eval/scripts/snapshot.sh "eval-${TURN}" "related: $TASK_ID"

    # Write checkpoint
    echo "$((TURN + 1))" > "$CHECKPOINT"

    rm -f "$ISSUE_FILE"
done < "$TASK_FILE"

echo "[run] Phase 2 complete. $TURN tasks evaluated."

# Generate predictions.jsonl for SWE-bench scoring
echo "[run] Generating predictions.jsonl..."
PREDICTIONS="/eval/raw/predictions.jsonl"
> "$PREDICTIONS"
for meta in /eval/raw/task-*.meta.json; do
    TASK_ID=$(jq -r '.task_id' "$meta")
    PATCH_FILE="/eval/raw/task-${TASK_ID}.patch"
    if [ -f "$PATCH_FILE" ] && [ -s "$PATCH_FILE" ]; then
        PATCH=$(cat "$PATCH_FILE" | jq -Rs .)
        jq -n --arg id "$TASK_ID" --arg model "$MODEL" --argjson patch "$PATCH" \
            '{instance_id: $id, model_name_or_path: $model, model_patch: $patch}' \
            >> "$PREDICTIONS"
    fi
done
echo "[run] predictions.jsonl written with $(wc -l < "$PREDICTIONS") entries."
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n eval/adapters/swe-contextbench/run.sh
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add eval/adapters/swe-contextbench/run.sh
git commit -m "feat(eval): add SWE-ContextBench run adapter (Phase 2)"
```

---

## Task 7: SWE-ContextBench adapter — score.sh (host-side)

**Files:**
- Create: `eval/adapters/swe-contextbench/score.sh`

- [ ] **Step 1: Write score.sh**

```bash
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

# Parse SWE-bench results to build metrics.json
# SWE-bench outputs a results JSON; we transform it into our schema
python3 -c "
import json, sys, os, glob

results_dir = '$RESULTS_DIR'
raw_dir = os.path.join(results_dir, 'raw')

# Collect per-task metadata
per_task = []
total_tokens = 0
total_cost = 0.0
resolved_count = 0

# Read SWE-bench evaluation results
eval_results = {}
for f in glob.glob(os.path.join('$EVAL_LOG', '*.json')):
    with open(f) as fh:
        data = json.load(fh)
        if isinstance(data, dict):
            eval_results.update(data)

# Read per-task metadata from raw/
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
```

- [ ] **Step 2: Verify script syntax**

```bash
bash -n eval/adapters/swe-contextbench/score.sh
python3 -c "compile(open('/dev/null').read(), '/dev/null', 'exec')"  # just verify python3 works
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add eval/adapters/swe-contextbench/score.sh
git commit -m "feat(eval): add SWE-ContextBench score adapter (host-side)"
```

---

## Task 8: Integration smoke test with mock data

**Files:**
- Create: `eval/test/mock-data/swe-contextbench/base_tasks.jsonl`
- Create: `eval/test/mock-data/swe-contextbench/related_tasks.jsonl`
- Create: `eval/test/smoke-test.sh`

This task creates a minimal end-to-end test using mock data (2 base tasks, 1 related task) to verify the full pipeline works without requiring the real dataset or Claude API calls.

- [ ] **Step 1: Create mock dataset (2 base + 1 related)**

`eval/test/mock-data/swe-contextbench/base_tasks.jsonl`:
```jsonl
{"instance_id": "test__repo-001", "repo": "test/repo", "base_commit": "HEAD", "problem_statement": "Fix: add a file called hello.txt with 'hello world'"}
{"instance_id": "test__repo-002", "repo": "test/repo", "base_commit": "HEAD", "problem_statement": "Fix: add a file called goodbye.txt with 'goodbye world'"}
```

`eval/test/mock-data/swe-contextbench/related_tasks.jsonl`:
```jsonl
{"instance_id": "test__repo-003", "repo": "test/repo", "base_commit": "HEAD", "problem_statement": "Fix: add a file called combined.txt with 'hello and goodbye'"}
```

- [ ] **Step 2: Write smoke-test.sh**

```bash
#!/usr/bin/env bash
# smoke-test.sh — Verify the full pipeline works with mock data
# This replaces Claude with a simple script that creates the requested files
set -euo pipefail

EVAL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$EVAL_DIR"

echo "=== Smoke Test ==="

# Override data dir to use mock data
export DATA_OVERRIDE="test/mock-data"

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
```

- [ ] **Step 3: Run the smoke test**

```bash
cd eval && timeout 30 bash test/smoke-test.sh
```
Expected: `All smoke tests passed`

- [ ] **Step 4: Commit**

```bash
git add eval/test/
git commit -m "test(eval): add smoke test with mock data for pipeline verification"
```

---

## Task 9: Documentation

**Files:**
- Create: `eval/README.md`

- [ ] **Step 1: Write eval/README.md**

```markdown
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
```

- [ ] **Step 2: Commit**

```bash
git add eval/README.md
git commit -m "docs(eval): add README for benchmark harness"
```

---

## Task 10: Final integration and verification

- [ ] **Step 1: Run full smoke test suite**

```bash
cd eval && timeout 30 bash test/smoke-test.sh
```
Expected: all tests pass

- [ ] **Step 2: Verify Docker image builds**

```bash
cd /home/jim/workspace/github.com/jim80net/memex-claude && timeout 60 bun run build.ts
cd eval && timeout 120 docker build -t memex-eval .
```
Expected: image builds successfully

- [ ] **Step 3: Verify Makefile help/discoverability**

```bash
cd eval && make validate ARM=memex MAINT=daily
```
Expected: exits 0

- [ ] **Step 4: Run the project's existing tests to ensure no regressions**

```bash
cd /home/jim/workspace/github.com/jim80net/memex-claude && timeout 60 pnpm test
```
Expected: all existing tests pass

- [ ] **Step 5: Final commit with all remaining changes**

```bash
git add -A eval/
git status
# If any uncommitted eval files remain:
git commit -m "chore(eval): finalize benchmark harness scaffold"
```
