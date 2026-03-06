# claude-skill-router

Semantic skill, memory, and rule router for [Claude Code](https://docs.anthropic.com/en/docs/claude-code). Injects relevant knowledge into your session based on what you're actually working on, instead of loading everything at once.

## Why this exists

AI coding assistants are essentially paint-by-number systems. You start with a canvas (the model) and a system prompt (the outline of the picture). Then you add your own directives — `CLAUDE.md`, `MEMORY.md`, rules — which are like adding more lines to the coloring book before you begin.

This works well at first. But as you accumulate knowledge — git workflows, ticket tracking conventions, deployment procedures, coding standards, domain-specific patterns — the coloring page gets crowded. Every session starts with *all* of this context loaded, whether it's relevant or not. The LLM's attention is split across git rules when you're debugging CSS, and deployment procedures when you're writing tests. Performance degrades as the corpus grows.

The solution is **gradual disclosure**: start with universal principles only, then bring in additional directives at the point of consumption, when the conversation actually turns toward those specific tasks. When you need to trade a ticker, the relevant know-how appears. When you're deploying, the deployment checklist surfaces. When you're just writing code, nothing extra clutters the context.

This is what the skill-router does. As skills, memories, and rules are created, they are embedded for semantic retrieval. Each type has a disclosure pattern suited to its nature:

- **Skills** — large procedural checklists — are gradually disclosed: a description teaser first, then the full `SKILL.md` when Claude chooses to use it, which may in turn reference other documents and scripts.
- **Memories** — generally small preferences and facts — are disclosed in full at the moment they become relevant.
- **Rules** — important guidelines — are disclosed in full when first relevant, then reduced to one-line reminders on subsequent matches, keeping them present without dominating the context.

The result is a system that drives the conversation according to the task at hand. Performance stays consistent even as learnings amass, because the context window carries only what's needed right now.

To manage the growing corpus, two bundled skills handle the lifecycle: **`/sleep`** organizes and migrates memories into semantically-searchable skills, while **`/deep-sleep`** trawls past conversations to extract recurring patterns and preferences. Together, the system learns from how you work, builds a corpus of guidelines, and interjects them at the right moments — becoming more intuitive over time.

## How it works

```
User prompt → embed (local ONNX) → cosine similarity against skill index → inject top matches
```

```
┌─────────────────────────────────────────────────────┐
│                    Shared Core                       │
│  SkillIndex ←→ Cache (~/.claude/cache/skill-router…) │
│  embeddings (local ONNX via all-MiniLM-L6-v2)       │
│  cosineSimilarity, mtime-based rebuild               │
└──────────┬──────────────┬───────────────┬───────────┘
           │              │               │
    ┌──────▼──────┐ ┌────▼─────┐  ┌──────▼──────┐
    │ UserPrompt  │ │   Stop   │  │ PreToolUse  │
    │  Submit     │ │          │  │             │
    │ Match query │ │ Behavioral│ │ Match tool- │
    │ → inject    │ │ rules    │  │ specific    │
    │ skills +    │ │          │  │ guidance    │
    │ memories +  │ │          │  │             │
    │ rules       │ │          │  │             │
    └─────────────┘ └──────────┘  └─────────────┘
```

### Entry types and disclosure

| Type | First match | Subsequent | Matched on |
|------|------------|------------|------------|
| `rule` | Full content | One-liner reminder | UserPromptSubmit |
| `memory` | Full content | Full content | UserPromptSubmit |
| `skill` | Description teaser | Full (via Read) | UserPromptSubmit |
| `workflow` | Description teaser | Full (via Read) | UserPromptSubmit |
| `tool-guidance` | Full content | Full content | PreToolUse |
| `session-learning` | Full content | Full content | UserPromptSubmit |
| `stop-rule` | Behavioral rules for Stop hook | — | Stop |

### Three sources

The router indexes knowledge from three locations, each at global and project scope:

| Source | Global path | Project path |
|--------|------------|-------------|
| Rules | `~/.claude/rules/*.md` | `<cwd>/.claude/rules/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<cwd>/.claude/skills/*/SKILL.md` |
| Memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` | — |
| Extra dirs | — | `skillDirs[]` from config |

## Prerequisites

- Node.js 20+

No external API keys required — embeddings run locally via ONNX.

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
pnpm install
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
  "embeddingModel": "Xenova/all-MiniLM-L6-v2",
  "cacheTimeMs": 300000,
  "skillDirs": [],
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
      "enabled": false
    }
  }
}
```

## Rules

Rules in `~/.claude/rules/` and `<project>/.claude/rules/` are automatically indexed. Native Claude Code rule files work as-is — the router extends them with optional frontmatter:

```yaml
---
name: prefer-pnpm
description: "Use pnpm instead of npm"
type: rule
one-liner: "Use pnpm, not npm."
paths:
  - "package.json"
hooks:
  - UserPromptSubmit
keywords:
  - pnpm
  - "package manager"
queries:
  - "install dependencies"
  - "npm install"
---
Always use pnpm for all package management operations.
Use `pnpm install`, `pnpm add <pkg>`, `pnpm run <script>`.
```

Rules without frontmatter are indexed using the filename as name and the first line as description. Extended frontmatter keys:

| Key | Description |
|-----|-------------|
| `one-liner` | Short reminder shown on subsequent matches (defaults to description) |
| `paths` | Glob patterns for applicable file paths (native Claude Code key) |
| `hooks` | Which hooks should match this rule |
| `keywords` | Additional keywords for semantic matching |
| `queries` | Natural language queries that should trigger this rule |

**Disclosure**: First time a rule matches in a session, the full content is injected. On subsequent matches, only the `one-liner` is shown as a reminder.

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

## Bundled skills

### `/sleep` — Organize knowledge

Migrates `MEMORY.md` entries into semantically-searchable skills and rules. Claude Code performs the classification and migration directly — no external API calls needed. Run this after accumulating entries in memory files to keep the corpus organized and searchable.

### `/deep-sleep` — Learn from sessions

Analyzes past session transcripts to extract recurring patterns, preferences, and corrections. Creates new memory-skills from what it finds. Run this periodically to capture learnings that weren't explicitly saved.

## Performance

- **Steady-state** (cache hit): ~200ms (one local embedding call for the query)
- **Cold start** (no cache): ~500ms (embed all skills + query)
- **First run**: Model download (~23MB for all-MiniLM-L6-v2, cached at `~/.claude/cache/models/`)
- Cache persists at `~/.claude/cache/skill-router.json`
- Rebuilds only when files change (mtime-gated)

## Development

```bash
pnpm install      # install dependencies
pnpm test         # run vitest (57 tests)
pnpm tsc --noEmit # type check
```

## License

MIT
