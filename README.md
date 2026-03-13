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

| Source | Global path | Project path | Sync repo path |
|--------|------------|-------------|---------------|
| Rules | `~/.claude/rules/*.md` | `<cwd>/.claude/rules/*.md` | `<sync-repo>/rules/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<cwd>/.claude/skills/*/SKILL.md` | `<sync-repo>/skills/*/SKILL.md` |
| Memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` | — | `<sync-repo>/projects/<canonical-id>/memory/*.md` |
| Extra dirs | — | `skillDirs[]` from config | — |

## Prerequisites

No prerequisites — prebuilt binaries are available for all major platforms. No external API keys required — embeddings run locally via ONNX.

For development, you need Node.js 20+ and pnpm.

## Installation

### Option A: Claude Code plugin (recommended)

```
/plugin marketplace add jim80net/claude-skill-router
/plugin install claude-skill-router
```

The plugin automatically downloads the prebuilt binary for your platform on first run. If the download hasn't completed yet, it falls back to `node --import tsx` until the binary is available.

The plugin registers hooks and ships with `/claude-skill-router:sleep` and `/claude-skill-router:deep-sleep` skills.

### Option B: Prebuilt binary (manual)

```bash
git clone https://github.com/jim80net/claude-skill-router.git ~/projects/claude-skill-router
cd ~/projects/claude-skill-router
./bin/install.sh   # downloads the right binary for your platform
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
            "command": "~/projects/claude-skill-router/bin/skill-router",
            "timeout": 10
          }
        ]
      }
    ]
  }
}
```

### Option C: From source (development)

```bash
git clone https://github.com/jim80net/claude-skill-router.git ~/projects/claude-skill-router
cd ~/projects/claude-skill-router
pnpm install
```

The `bin/skill-router` wrapper will automatically download the prebuilt binary in the background on first run and fall back to `node --import tsx` until it's available.

## Configuration

Optionally create `~/.claude/skill-router.json` to customize behavior. See [USAGE.md](USAGE.md) for full defaults, all options, and detailed usage including rules, skills, cross-machine sync, and bundled skills.

## Performance

- **Steady-state** (cache hit): ~200ms (one local embedding call for the query)
- **Cold start** (no cache): ~500ms (embed all skills + query)
- **First run**: Model download (~23MB for all-MiniLM-L6-v2, cached at `~/.claude/cache/models/`)
- Cache persists at `~/.claude/cache/skill-router.json`
- Rebuilds only when files change (mtime-gated)

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, build instructions, and architecture details.

## License

MIT
