# claude-skill-router

Semantic skill and memory router for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Injects relevant skills and memories into your session based on what you're actually asking about, instead of loading everything at once.

## Problem

Claude Code's auto-memory system (`MEMORY.md`) injects all memories at session start, wasting context window space when most entries aren't relevant. Skills are discovered by name/description but not semantically matched.

## Solution

A `UserPromptSubmit` hook that embeds your prompt and matches it against pre-embedded skills and memories using cosine similarity. Only relevant content is injected as `additionalContext`.

```
User prompt → embed → cosine similarity against skill index → inject top matches
```

## How it works

```
┌─────────────────────────────────────────────────────────┐
│                    Shared Core                          │
│  SkillIndex ←→ Cache (~/.claude/cache/skill-router.json)│
│  embeddings (OpenAI text-embedding-3-small)             │
│  cosineSimilarity, mtime-based rebuild                  │
└──────────┬──────────────┬───────────────┬───────────────┘
           │              │               │
    ┌──────▼──────┐ ┌────▼─────┐  ┌──────▼──────┐
    │ UserPrompt  │ │   Stop   │  │ PreToolUse  │
    │  Submit     │ │          │  │             │
    │ Match query │ │ Behavioral│ │ Match tool- │
    │ → inject    │ │ rules +  │  │ specific    │
    │ skills +    │ │ learning │  │ guidance    │
    │ memories    │ │ extraction│ │             │
    └─────────────┘ └──────────┘  └─────────────┘
```

### Skill types

| Type | Description | Matched on |
|------|-------------|------------|
| `skill` | Regular skill with full body | UserPromptSubmit |
| `memory` | Short preference/fact | UserPromptSubmit |
| `tool-guidance` | Tool-specific tips | PreToolUse |
| `workflow` | Multi-step procedures | UserPromptSubmit |
| `session-learning` | Auto-extracted from sessions | UserPromptSubmit |
| `stop-rule` | Behavioral rules for Stop hook | Stop |

## Prerequisites

- Node.js 20+
- An OpenAI API key (for `text-embedding-3-small` embeddings)
- `OPENAI_API_KEY` set in your shell environment

## Installation

### Option A: Claude Code plugin (recommended)

```
/plugin marketplace add jim80net/claude-skill-router
/plugin install claude-skill-router
```

Dependencies are installed automatically on first session start.

The plugin registers hooks and ships with `/claude-skill-router:sleep` and `/claude-skill-router:deep-sleep` skills.

### Option B: Manual hook

```bash
# Clone and install
git clone https://github.com/jim80net/claude-skill-router.git ~/projects/claude-skill-router
cd ~/projects/claude-skill-router
npm install
```

Add to `~/.claude/settings.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "matcher": "",
        "hooks": [
          {
            "type": "command",
            "command": "cd ~/projects/claude-skill-router && node --import tsx src/main.ts",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

## Configuration (optional)

Create `~/.claude/skill-router.json` to customize behavior:

```json
{
  "enabled": true,
  "embeddingModel": "text-embedding-3-small",
  "cacheTimeMs": 300000,
  "skillDirs": [],
  "hooks": {
    "UserPromptSubmit": {
      "enabled": true,
      "topK": 3,
      "threshold": 0.5,
      "maxInjectedChars": 8000,
      "types": ["skill", "memory", "workflow", "session-learning"]
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
      "extractionModel": "gpt-4.1-nano",
      "behavioralRules": true
    }
  }
}
```

## Creating skills

Skills live in `~/.claude/skills/<name>/SKILL.md` (global) or `<project>/.claude/skills/<name>/SKILL.md` (project-specific).

### Regular skill

```yaml
---
name: my-skill
description: "What this skill does"
queries:
  - "when would someone need this"
  - "another example query"
  - "third example"
---
The actual skill content that gets injected.
```

### Memory-skill

A short preference or fact with minimal body:

```yaml
---
name: prefer-pnpm
description: Always use pnpm instead of npm for package management
type: memory
queries:
  - "install dependencies"
  - "run npm install"
  - "which package manager"
---
Use `pnpm` instead of `npm` for all operations:
- `pnpm install`, `pnpm add <pkg>`, `pnpm run <script>`
```

### Generating queries

If you don't want to write queries manually, generate them with an LLM:

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" node scripts/generate-queries.mjs [skill-dir]
```

Scans `~/.claude/skills/` by default. Pass additional directories as arguments.

## Scan directories

The router scans these locations for skills:

| Source | Path |
|--------|------|
| Global skills | `~/.claude/skills/*/SKILL.md` |
| Project skills | `<cwd>/.claude/skills/*/SKILL.md` |
| Project memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` |
| Extra dirs | `skillDirs[]` from config |

## Bundled skills

### `/sleep` — Migrate memories to skills

Converts MEMORY.md entries into semantically-searchable memory-skills via LLM classification:

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" node --import tsx scripts/sleep.mts "$(pwd)" [--dry-run]
```

### `/deep-sleep` — Extract learnings from sessions

Analyzes past session transcripts to find patterns and create memory-skills:

```bash
OPENAI_API_KEY="$OPENAI_API_KEY" node --import tsx scripts/deep-sleep.mts "$(pwd)" [--dry-run]
```

## Performance

- **Steady-state** (cache hit): ~200ms (one embedding API call for the query)
- **Cold start** (no cache): ~500ms (embed all skills + query)
- Cache persists at `~/.claude/cache/skill-router.json`
- Rebuilds only when files change (mtime-gated)

## Development

```bash
npm install     # install dependencies
npm test        # run vitest (46 tests)
npx tsc --noEmit  # type check
```

## License

MIT
