# Usage

## Configuration

Create `~/.claude/memex.json` to customize behavior. All fields are optional — omitted fields use the defaults shown below.

### Full default configuration

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
      "extractionModel": "",
      "behavioralRules": true
    },
    "PreCompact": {
      "enabled": false
    }
  }
}
```

### Config reference

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Master switch — disables all routing when `false` |
| `embeddingModel` | string | `"Xenova/all-MiniLM-L6-v2"` | HuggingFace model for embeddings (downloaded on first use to `~/.claude/cache/models/`) |
| `cacheTimeMs` | number | `300000` | How long (ms) before the skill index is rebuilt |
| `skillDirs` | string[] | `[]` | Additional directories to scan for skills |

#### `hooks.UserPromptSubmit`

Runs on every user prompt. Matches the prompt against skills, memories, and rules.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `true` | Enable/disable this hook |
| `topK` | number | `3` | Maximum number of matches to inject |
| `threshold` | number | `0.5` | Minimum cosine similarity score (0–1) |
| `maxInjectedChars` | number | `8000` | Character budget for injected content |
| `types` | string[] | `["skill", "memory", "workflow", "session-learning", "rule"]` | Which entry types to match |

#### `hooks.PreToolUse`

Runs before each tool call. Matches tool-specific guidance.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable this hook |
| `topK` | number | `2` | Maximum number of matches to inject |
| `threshold` | number | `0.6` | Minimum cosine similarity score (0–1) |
| `maxInjectedChars` | number | `4000` | Character budget for injected content |
| `types` | string[] | `["tool-guidance", "skill"]` | Which entry types to match |

#### `hooks.Stop`

Runs at session end. Extracts learnings and applies behavioral rules.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable this hook |
| `extractLearnings` | boolean | `true` | Extract session learnings into memory |
| `extractionModel` | string | `""` | Model for extraction (empty = use default) |
| `behavioralRules` | boolean | `true` | Apply behavioral stop rules |

#### `hooks.PreCompact`

Runs before context compaction.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable this hook |

#### `sync`

Cross-machine sync via a private git repo. See [Cross-machine sync](#cross-machine-sync) below.

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable sync |
| `repo` | string | `""` | Git URL of the sync repo |
| `autoPull` | boolean | `true` | Pull from remote on session start |
| `autoCommitPush` | boolean | `true` | Commit and push changes on session end |
| `projectMappings` | object | `{}` | Manual overrides: local path to canonical project ID |
| `caseSensitive` | boolean | `false` | Preserve case in canonical project IDs. When `false` (default), all project IDs are lowercased across manual mappings, git remote URLs, and encoded `_local/` fallbacks, so `GitHub.com:Jim80Net/Repo` and `github.com:jim80net/repo` collapse to the same sync repo path. |

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

Rules without frontmatter are indexed using the filename as name and the first line as description.

### Extended frontmatter keys

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
boost: 0.05  # optional: nudge similarity score for entries near the threshold
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

Migrates `MEMORY.md` entries into semantically-searchable skills and rules. Claude Code performs the classification and migration directly — no external API calls needed. Run this after accumulating entries in memory files to keep the corpus organized and searchable. `/sleep` also performs query evolution based on `queryHits` and `observations` telemetry — weak queries that rarely match are refined or replaced.

### `/deep-sleep` — Learn from sessions

Analyzes past session transcripts to extract recurring patterns, preferences, and corrections. Creates new memory-skills from what it finds. Run this periodically to capture learnings that weren't explicitly saved.

## Cross-machine sync

The router can sync your growing corpus of rules, skills, and memories across workstations via a private git repo.

### Setup

1. Create a private git repo (e.g., `github.com/you/claude-corpus`)
2. Enable sync in `~/.claude/memex.json`:

```json
{
  "sync": {
    "enabled": true,
    "repo": "git@github.com:you/claude-corpus.git"
  }
}
```

### How it works

- **Session start**: pulls latest changes from the remote repo (`git pull --rebase`)
- **Session end**: copies new/changed rules, skills, and memories into the sync repo, commits, and pushes
- **Conflict resolution**: markdown conflicts are auto-resolved by keeping both sides

### Sync repo structure

```
~/.local/share/memex-claude/
├── .git/
├── rules/                                      # synced global rules
├── skills/                                     # synced global skills
│   └── my-skill/SKILL.md
└── projects/
    ├── github.com/you/my-project/              # git-identified projects
    │   └── memory/*.md
    └── _local/                                 # non-git projects
        └── -home-you-some-project/
            └── memory/*.md
```

### Project identity

Memories are stored per-project. The router resolves project identity using a cascade:

1. **Manual mapping** — `sync.projectMappings` in config (explicit override)
2. **Git remote URL** — normalized to `host/owner/repo` (handles SSH + HTTPS, strips `.git`)
3. **Encoded path** — falls back to `_local/<encoded-cwd>` for non-git directories

All three paths are lowercased by default, so the same git project on different machines (with different checkout paths **or different casing** — e.g., `Jim80Net/Repo` vs `jim80net/repo`) maps to the same canonical location in the sync repo. Set `sync.caseSensitive: true` to preserve the original casing.

On first sync after upgrading from memex-core < 0.4, `syncPull` runs a one-shot migration that renames any legacy mixed-case directories under `projects/` to lowercase and writes a `.memex-sync/version.json` marker so the scan only runs once. The migration is safe across devices, idempotent, and handles case-insensitive filesystems (macOS APFS, Windows NTFS) correctly.
