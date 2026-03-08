---
name: sleep
description: "Manage the sleep cycle: migrate MEMORY.md, CLAUDE.md, and rules into semantically-searchable skills, and promote/demote entries based on match telemetry."
queries:
  - "convert memories to skills"
  - "optimize memory for semantic search"
  - "migrate MEMORY.md to skill format"
  - "make memories searchable"
  - "reduce context window usage from memories"
  - "clean up CLAUDE.md"
  - "move rules to skills"
  - "promote memory to rule"
  - "demote rule to skill"
  - "sleep management"
---

# /sleep — Knowledge Lifecycle Management

Manage the bidirectional flow between front-of-context (always loaded: CLAUDE.md, rules/, MEMORY.md) and back-of-context (semantically loaded: skills). Migrate growing content into skills, and promote/demote entries based on match telemetry.

## When to Use

- After accumulating many entries in MEMORY.md or topic files
- When CLAUDE.md has grown with task-specific knowledge that doesn't belong at startup
- When rules/ contains situational guidelines that should be semantically loaded instead
- To review match telemetry and promote/demote entries based on usage patterns
- Daily as knowledge hygiene

## Process

Perform the following steps directly — no external scripts or API keys needed.

### 1. Gather sources

Locate all knowledge sources for this project:

```
# MEMORY.md and topic files
~/.claude/projects/<encoded-cwd>/memory/MEMORY.md

# CLAUDE.md files
<cwd>/CLAUDE.md
~/.claude/CLAUDE.md

# Rules
<cwd>/.claude/rules/*.md
~/.claude/rules/*.md

# Existing skills
<cwd>/.claude/skills/*/SKILL.md
~/.claude/skills/*/SKILL.md

# Match telemetry
~/.claude/cache/skill-router-telemetry.json
```

Where `<encoded-cwd>` is the cwd with `/` replaced by `-` and `.` replaced by `-`.

Read all of these. The telemetry file contains per-entry match counts, session counts, and timestamps.

### 2. Audit CLAUDE.md

Read each CLAUDE.md and split into sections. Classify each section:

- **universal**: Project identity, build commands, architecture overview, core conventions — keep in CLAUDE.md
- **task-specific**: Procedures, checklists, domain knowledge that only applies during certain tasks — migrate to skill
- **preference**: Short rules or preferences — migrate to memory-skill or consider as rule candidate

For task-specific sections, create a SKILL.md (see step 5). Remove the migrated section from CLAUDE.md but add a one-line comment noting the skill name so maintainers know where it went:

```markdown
<!-- Migrated to skill: deployment-checklist -->
```

**Do not** remove the project identity, build commands, or architecture sections from CLAUDE.md. These are universal and belong at the front of context.

### 3. Audit rules

Read each rule file in `.claude/rules/`. For each rule:

- If it **lacks frontmatter** (no `---` block), add frontmatter with `name`, `description`, `queries`, and `one-liner` fields. This enables the skill-router to do graduated disclosure (full → one-liner on subsequent matches) instead of Claude Code's native full-content-every-time loading.

- If it is **situational** (only relevant during specific tasks, not a universal guardrail), migrate it from `rules/` to a skill with `type: rule`. The skill-router will inject it semantically instead of Claude Code loading it on every prompt.

Example frontmatter for a rule that stays in `rules/`:

```yaml
---
name: no-force-push
description: "Never force-push to main or master branches"
queries:
  - "git push"
  - "force push"
  - "push to main"
one-liner: "Never force-push to main/master."
---
```

### 4. Audit MEMORY.md

Read MEMORY.md and any linked topic files. Split into sections and classify:

- **memory**: Short preference, rule, or fact → migrate to skill with `type: memory`
- **skill**: Procedural knowledge with steps → migrate to skill with `type: skill`
- **workflow**: Multi-step ordered process → migrate to skill with `type: workflow`
- **keep**: Structural reference, navigation link, or TOC entry → stays in MEMORY.md

### 5. Deduplicate against existing knowledge

Before creating new entries, check each candidate against the existing index using the skill-router's semantic search:

```bash
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"<candidate section text>","session_id":"sleep-dedup","cwd":"<cwd>"}' | $PLUGIN_ROOT/bin/skill-router
```

If the output contains `additionalContext` with a match at relevance >= 80%, an existing entry already covers this knowledge. Read the matched entry to confirm — if it says the same thing, skip the candidate. If the existing entry is related but incomplete, update it instead of creating a duplicate.

### 6. Generate SKILL.md for each migratable section

For each section to migrate, create:

```
<cwd>/.claude/skills/<kebab-case-name>/SKILL.md
```

Format:

```yaml
---
name: <kebab-case-name>
description: "<one sentence describing when this knowledge is needed>"
type: <memory|skill|workflow|rule>
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

### 7. Review telemetry for promotion/demotion

Read `~/.claude/cache/skill-router-telemetry.json`. For each indexed entry, review its telemetry:

| Signal | Recommendation |
|--------|---------------|
| Memory with high matchCount (>20) across many sessions (>10) | **Promote to rule** — this is important enough to always be present. Move to `<cwd>/.claude/rules/` or `~/.claude/rules/` with frontmatter. |
| Rule with low matchCount (<3) or no matches in 30+ days | **Demote to skill** — this is situational, not universal. Move from `rules/` to a skill with `type: rule`. |
| Multiple memories on the same topic | **Consolidate into skill** — merge related memories into a single, richer skill entry. |
| Skill that's rarely matched (<2 matches ever) | **Review for relevance** — queries may need updating, or the knowledge may be obsolete. Flag for user review. |

Present a table of recommended actions to the user:

```
Entry                    Type     Matches  Sessions  Last Matched  Recommendation
─────────────────────────────────────────────────────────────────────────────────
prefer-pnpm              memory   45       22        2d ago        Promote to rule
deploy-checklist         rule     2        2         45d ago       Demote to skill
git-rebase-workflow      memory   0        0         never         Review/remove
api-key-location         memory   31       18        1d ago        Promote to rule
test-db-setup            memory   8        6         3d ago        OK (no action)
debug-tips-1             memory   12       8         5d ago        Consolidate with debug-tips-2
```

Execute promotions/demotions that the user approves.

### 8. Clean up source files

- Remove migrated sections from MEMORY.md. If empty, delete it.
- Remove migrated sections from CLAUDE.md (leave migration comments).
- Delete rule files that were demoted to skills.
- Delete individual memory-skills that were consolidated.

### 9. Verify

List the created/modified files and confirm everything looks correct:

```bash
ls -la <cwd>/.claude/skills/*/SKILL.md
ls -la <cwd>/.claude/rules/*.md
cat <cwd>/CLAUDE.md | head -20
```

The skill-router cache will auto-rebuild on next hook invocation (mtime-based).

## Options

The user may specify:
- `--dry-run`: Show what would be created/moved/promoted without writing files
- `--global-scope`: Write skills to `~/.claude/skills/` instead of `<cwd>/.claude/skills/`
- `--telemetry-only`: Skip migration, only show telemetry review and promotion/demotion recommendations
- `--no-telemetry`: Skip telemetry review, only do migration

$ARGUMENTS
