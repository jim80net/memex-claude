---
name: help
description: "Show how to use memex: what it does, how to create skills/rules/memories, available commands, current status, and troubleshooting."
queries:
  - "how does memex work"
  - "how to use memex"
  - "what skills are available"
  - "how to create a skill"
  - "how to create a rule"
  - "memex help"
  - "memex is not working"
  - "no skills are being injected"
---

# /help — Memex Guide & Status

## What is memex?

Memex injects relevant knowledge into your session based on what you're working on. Instead of loading everything into context at once, it uses semantic similarity to surface only what's needed right now.

## How it works

Each prompt you type is embedded locally (ONNX, no API calls) and compared against your indexed skills, rules, and memories. The top matches are injected as additional context. Match counts are tracked via telemetry (`~/.claude/cache/memex-telemetry.json`).

**Entry types and disclosure model:**

| Type | First match | Subsequent matches | Matched on |
|------|------------|--------------------|----|
| `rule` | Full content | `one-liner` reminder only | UserPromptSubmit |
| `memory` | Full content | Full content | UserPromptSubmit |
| `skill` | Description teaser | Full content (via Read) | UserPromptSubmit |
| `workflow` | Description teaser | Full content (via Read) | UserPromptSubmit |
| `tool-guidance` | Full content | Full content | PreToolUse |
| `stop-rule` | Behavioral rules | — | Stop |
| `session-learning` | Full content | Full content | UserPromptSubmit |

## Bundled skills

| Command | Description |
|---------|-------------|
| `/sleep` | Knowledge lifecycle: migrate CLAUDE.md/MEMORY.md/rules into skills, promote/demote entries based on match telemetry |
| `/deep-sleep` | Analyze past session transcripts to extract recurring patterns, classify into appropriate types |
| `/reflect` | Extract learnings from the *current* conversation and save as memories, rules, or skills |
| `/doctor` | Diagnose installation and configuration issues |
| `/handoff` | Write a continuation plan to disk so a fresh session can pick up where this one left off |
| `/takeover` | Read a handoff document and resume the work |
| `/help` | This guide |

## Creating content

### Skills

Create `~/.claude/skills/<name>/SKILL.md` (global) or `<project>/.claude/skills/<name>/SKILL.md` (project):

```yaml
---
name: my-skill
description: "What this skill does"
queries:
  - "when would someone need this"
  - "another example query"
---
The skill content.
```

### Rules

Create `~/.claude/rules/<name>.md` (global) or `<project>/.claude/rules/<name>.md` (project):

```yaml
---
name: my-rule
description: "What this rule enforces"
type: rule
one-liner: "Short reminder for subsequent matches"
queries:
  - "when this rule applies"
---
Full rule content shown on first match.
```

Rules without frontmatter work too — filename becomes name, first line becomes description.

### Memories

Memories live in `~/.claude/projects/<encoded-cwd>/memory/*.md` (where `<encoded-cwd>` is the cwd with `/` → `-` and `.` → `-`).

Use `##` headings for each entry and optionally add `Triggers:` lines for better semantic matching:

```markdown
## Prefer pnpm
Triggers: install dependencies, npm install, which package manager
Use `pnpm` instead of `npm` for all operations.
```

Use `/sleep` to convert accumulated MEMORY.md entries into searchable skills, and `/reflect` to extract learnings from the current conversation.

## Check status

Run these to inspect memex's current state:

```bash
# Config (or defaults if no file)
cat ~/.claude/memex.json 2>/dev/null || echo "Using defaults"

# What's indexed — global
ls ~/.claude/skills/*/SKILL.md 2>/dev/null
ls ~/.claude/rules/*.md 2>/dev/null

# What's indexed — this project
ls .claude/skills/*/SKILL.md 2>/dev/null
ls .claude/rules/*.md 2>/dev/null

# Memories for this project
ls ~/.claude/projects/*/memory/*.md 2>/dev/null

# Cache status
ls -la ~/.claude/cache/memex-cache.json 2>/dev/null

# Match telemetry
cat ~/.claude/cache/memex-telemetry.json 2>/dev/null

# Model cache
ls ~/.claude/cache/models/ 2>/dev/null
```

## Configuration

Create `~/.claude/memex.json` to customize. All fields optional — defaults shown:

```json
{
  "enabled": true,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2",
  "cacheTimeMs": 300000,
  "skillDirs": [],
  "sync": {
    "enabled": false,
    "repo": "",
    "autoPull": true,
    "autoCommitPush": true,
    "projectMappings": {}
  },
  "sleepSchedule": {
    "enabled": false,
    "dailyAt": "03:00",
    "projects": []
  },
  "hooks": {
    "UserPromptSubmit": {
      "enabled": true,
      "topK": 3,
      "threshold": 0.5,
      "maxInjectedChars": 8000,
      "types": ["skill", "memory", "workflow", "session-learning", "rule"]
    },
    "PreToolUse": {
      "enabled": false,
      "topK": 2,
      "threshold": 0.6,
      "maxInjectedChars": 4000,
      "types": ["tool-guidance", "skill"]
    },
    "Stop": {
      "enabled": false,
      "extractLearnings": true,
      "behavioralRules": true
    }
  }
}
```

Key tuning knobs:
- **`threshold`** — lower to match more broadly (default 0.5), raise for precision
- **`topK`** — how many matches to inject per prompt (default 3)
- **`maxInjectedChars`** — character budget for injected content (default 8000)
- **`sync`** — enable cross-machine sync via a private git repo (see README)

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Nothing is being injected | Are there skills/rules/memories in the scan paths? (see "Check status" above) |
| Wrong things are injected | Adjust `threshold` higher, or improve `queries` in your SKILL.md frontmatter |
| Everything is injected | `threshold` may be too low, raise it (e.g. 0.6) |
| Slow first run | Model download (~23MB), needs internet access |
| Stale results after editing skills | Delete `~/.claude/cache/memex-cache.json` to force rebuild |
| Hook not running at all | Check `~/.claude/settings.json` for the hook registration |

$ARGUMENTS
