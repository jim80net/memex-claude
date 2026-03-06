---
name: sleep
description: "Migrate MEMORY.md entries into semantically-searchable memory-skills (SKILL.md files with queries). Converts flat memory files into the skill-router's indexed format for context-efficient injection."
queries:
  - "convert memories to skills"
  - "optimize memory for semantic search"
  - "migrate MEMORY.md to skill format"
  - "make memories searchable"
  - "reduce context window usage from memories"
---

# /sleep — Migrate Memories to Skill-Router Format

Convert MEMORY.md entries and topic files into memory-skills (SKILL.md files with `type: memory`) that are semantically searchable by the skill-router, instead of being bulk-injected into every session.

## When to Use

- After accumulating many entries in MEMORY.md or topic files
- When context window is being wasted on irrelevant memories
- To make memories discoverable via semantic search instead of always-on injection

## Process

Perform the following steps directly — no external scripts or API keys needed.

### 1. Locate memory files

Find the project's memory directory. The path is encoded from the current working directory:

```
~/.claude/projects/<encoded-cwd>/memory/MEMORY.md
```

Where `<encoded-cwd>` is the cwd with `/` replaced by `-` and `.` replaced by `-`.

Read `MEMORY.md` and any linked `.md` topic files in the same directory.

### 2. Parse sections

Split each file into `##` / `###` sections. For each section, note:
- The heading
- The body text
- Any `Triggers:` lines (comma-separated quoted strings)

### 3. Classify each section

For each section with meaningful content (body > 20 chars or has triggers), classify it:

- **memory**: Short preference, rule, or fact (e.g., "use pnpm not npm", "API key is in X file")
- **skill**: Procedural knowledge with steps (e.g., "how to debug cron errors", "how to deploy")
- **workflow**: Multi-step process that follows a specific order
- **keep**: Structural reference (e.g., "See [file.md]"), navigation link, or table of contents entry — these stay in MEMORY.md

### 4. Generate SKILL.md for each convertible section

For each section classified as memory, skill, or workflow, create a SKILL.md file:

```
<cwd>/.claude/skills/<kebab-case-name>/SKILL.md
```

Use this format:

```yaml
---
name: <kebab-case-name>
description: "<one sentence describing when this knowledge is needed>"
type: <memory|skill|workflow>
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
  - "<natural query 4>"
  - "<natural query 5>"
---
<original section body>
```

Generate 5 diverse, natural queries a developer would type when they need this knowledge.

### 5. Clean up MEMORY.md

Remove migrated sections from MEMORY.md. The skill-router will handle injecting them via semantic search, so they no longer need to live in MEMORY.md.

If MEMORY.md is now empty, delete it. Otherwise leave only unmigrated content.

### 6. Verify

List the created skill files and confirm the migration looks correct:
```bash
ls -la <cwd>/.claude/skills/*/SKILL.md
```

The skill-router cache will auto-rebuild on next hook invocation (mtime-based).

## Options

The user may specify:
- `--dry-run`: Show what would be created without writing files
- `--global-scope`: Write skills to `~/.claude/skills/` instead of `<cwd>/.claude/skills/`

$ARGUMENTS
