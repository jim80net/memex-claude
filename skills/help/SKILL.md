---
name: help
description: "Show how to use the skill-router: what it does, how to create skills/rules/memories, available commands, current status, and troubleshooting."
queries:
  - "how does the skill router work"
  - "how to use skill router"
  - "what skills are available"
  - "how to create a skill"
  - "how to create a rule"
  - "skill-router help"
  - "skill-router is not working"
  - "no skills are being injected"
---

# /help — Skill-Router Guide & Status

## What is the skill-router?

The skill-router injects relevant knowledge into your session based on what you're working on. Instead of loading everything into context at once, it uses semantic similarity to surface only what's needed right now.

## How it works

Each prompt you type is embedded locally (ONNX, no API calls) and compared against your indexed skills, rules, and memories. The top matches are injected as additional context.

**Disclosure model:**
- **Rules** — full content on first match, one-liner reminder after that
- **Skills/workflows** — description teaser; read the full SKILL.md if you choose to use it
- **Memories** — full content always (they're short)

## Bundled skills

| Command | Description |
|---------|-------------|
| `/sleep` | Migrate MEMORY.md entries into semantically-searchable skills |
| `/deep-sleep` | Analyze past sessions to extract recurring patterns into skills |
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

Memories live in `~/.claude/projects/<encoded-cwd>/memory/*.md`. Use `/sleep` to convert accumulated MEMORY.md entries into searchable skills.

## Check status

Run these to inspect the router's current state:

```bash
# Config (or defaults if no file)
cat ~/.claude/skill-router.json 2>/dev/null || echo "Using defaults"

# What's indexed — global
ls ~/.claude/skills/*/SKILL.md 2>/dev/null
ls ~/.claude/rules/*.md 2>/dev/null

# What's indexed — this project
ls .claude/skills/*/SKILL.md 2>/dev/null
ls .claude/rules/*.md 2>/dev/null

# Memories for this project
ls ~/.claude/projects/*/memory/*.md 2>/dev/null

# Cache status
ls -la ~/.claude/cache/skill-router.json 2>/dev/null

# Model cache
ls ~/.claude/cache/models/ 2>/dev/null
```

## Configuration

Create `~/.claude/skill-router.json` to customize. All fields optional — defaults shown:

```json
{
  "enabled": true,
  "embeddingModel": "Xenova/all-MiniLM-L6-v2",
  "cacheTimeMs": 300000,
  "skillDirs": [],
  "hooks": {
    "UserPromptSubmit": {
      "enabled": true,
      "topK": 3,
      "threshold": 0.5,
      "maxInjectedChars": 8000
    }
  }
}
```

Key tuning knobs:
- **`threshold`** — lower to match more broadly (default 0.5), raise for precision
- **`topK`** — how many matches to inject per prompt (default 3)
- **`maxInjectedChars`** — character budget for injected content (default 8000)

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Nothing is being injected | Are there skills/rules/memories in the scan paths? (see "Check status" above) |
| Wrong things are injected | Adjust `threshold` higher, or improve `queries` in your SKILL.md frontmatter |
| Everything is injected | `threshold` may be too low, raise it (e.g. 0.6) |
| Slow first run | Model download (~23MB), needs internet access |
| Stale results after editing skills | Delete `~/.claude/cache/skill-router.json` to force rebuild |
| Hook not running at all | Check `~/.claude/settings.json` for the hook registration |

$ARGUMENTS
