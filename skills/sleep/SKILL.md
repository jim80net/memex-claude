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

Find the plugin's script directory and run:

```bash
# If installed as plugin:
PLUGIN_DIR="$(find ~/.claude/plugins -name 'claude-skill-router' -type d 2>/dev/null | head -1)"

# If cloned manually:
PLUGIN_DIR="${PLUGIN_DIR:-$HOME/projects/claude-skill-router}"

OPENAI_API_KEY="${OPENAI_API_KEY}" node --import tsx "$PLUGIN_DIR/scripts/sleep.mts" "$(pwd)"
```

The script:
1. Reads MEMORY.md and all linked topic files for the current project
2. Parses each `##`/`###` section
3. Classifies each section via LLM (gpt-4.1-nano):
   - **Rule/preference** → `type: memory` skill (minimal body, 5 queries)
   - **Procedural knowledge** → `type: skill` or `type: workflow` (full body, 5 queries)
   - **Structural reference** (e.g., "See [file.md]") → kept in MEMORY.md as navigation
4. Generates name, description, and 5 queries for each convertible entry
5. Writes SKILL.md files to the project's `.claude/skills/` directory
6. Trims MEMORY.md to a minimal navigation index

## After Running

1. Verify the generated skills look correct:
   ```bash
   ls -la .claude/skills/*/SKILL.md
   ```
2. The skill-router cache will auto-rebuild on next invocation (mtime-based)
3. Test semantic matching by typing a prompt that should trigger one of the migrated memories

## What Stays in MEMORY.md

- Table-of-contents references to topic files
- The `# Project Memory` header and project identification
- Items explicitly marked as "always inject"
- Navigation links (these are useful as a fast index)

## Options

- `--dry-run`: Show what would be created without writing files
- `--project-scope`: Write skills to `<cwd>/.claude/skills/` (default for project memories)
- `--global-scope`: Write skills to `~/.claude/skills/` (for global memories)

$ARGUMENTS
