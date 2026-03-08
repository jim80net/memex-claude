#!/bin/sh
# skill-router-sleep-schedule — daily knowledge sleep-schedule runner.
# Iterates over known projects and runs /sleep + /deep-sleep via claude CLI.
# Intended to be called from system cron.
set -e

CONFIG="$HOME/.claude/skill-router.json"
REGISTRY="$HOME/.claude/cache/skill-router-projects.json"
LOG="$HOME/.claude/cache/skill-router-sleep-schedule.log"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" >> "$LOG"
}

# Check if claude CLI is available
if ! command -v claude >/dev/null 2>&1; then
  log "ERROR: claude CLI not found in PATH"
  exit 1
fi

# Read project list from config (sleep-schedule.projects), fall back to registry
PROJECTS=""
if [ -f "$CONFIG" ]; then
  # Extract sleep-schedule.projects array from config
  PROJECTS=$(node -e "
    const c = JSON.parse(require('fs').readFileSync('$CONFIG', 'utf-8'));
    const p = c.sleepSchedule?.projects || [];
    if (p.length) p.forEach(x => console.log(x));
  " 2>/dev/null || true)
fi

# Fall back to auto-discovered registry
if [ -z "$PROJECTS" ] && [ -f "$REGISTRY" ]; then
  PROJECTS=$(node -e "
    const r = JSON.parse(require('fs').readFileSync('$REGISTRY', 'utf-8'));
    Object.keys(r.projects || {}).forEach(x => console.log(x));
  " 2>/dev/null || true)
fi

if [ -z "$PROJECTS" ]; then
  log "No projects found in config or registry. Nothing to do."
  exit 0
fi

log "Starting sleep-schedule run"

echo "$PROJECTS" | while IFS= read -r project; do
  if [ ! -d "$project" ]; then
    log "SKIP: $project (directory not found)"
    continue
  fi

  log "Running /sleep for $project"
  echo "/claude-skill-router:sleep" | claude --print --cwd "$project" >> "$LOG" 2>&1 || log "WARN: /sleep failed for $project (exit $?)"

  log "Running /deep-sleep for $project"
  echo "/claude-skill-router:deep-sleep" | claude --print --cwd "$project" >> "$LOG" 2>&1 || log "WARN: /deep-sleep failed for $project (exit $?)"

  log "Done: $project"
done

log "Sleep schedule run complete"
