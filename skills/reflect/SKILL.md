---
name: reflect
description: "Extract learnings from the current conversation and save them as memories, rules, or skills so future sessions benefit from what happened here."
queries:
  - "save what we learned"
  - "remember this for next time"
  - "extract learnings from this session"
  - "what should I remember from this conversation"
  - "compound learnings"
  - "improve future sessions"
  - "consolidate this session"
---

# /reflect — Compound Learnings from This Conversation

Review the current conversation to extract corrections, preferences, patterns, and decisions, then save them as memories, rules, or skills so future sessions start smarter.

## Context: How Memex Works

Memex indexes entries from well-known directories and matches them to user prompts via semantic similarity. When you create an entry, its `queries` are embedded and compared against future prompts. Memex surfaces matching entries automatically — so the quality of your `queries` and `description` directly determines when content appears.

**Disclosure model** — determines how matched content is shown to Claude:

| Type | First match | Subsequent matches | Notes |
|------|------------|--------------------|----|
| `rule` | Full content | `one-liner` reminder only | Needs a good `one-liner` |
| `memory` | Full content | Full content | Keep short (1-5 lines) |
| `skill` | Description teaser | Full content (via Read) | Needs informative `description` |
| `workflow` | Description teaser | Full content (via Read) | Multi-step ordered processes |
| `tool-guidance` | Full content | Full content | Matched on PreToolUse, not user prompt |
| `stop-rule` | Behavioral rules | — | Matched on Stop hook |
| `session-learning` | Full content | Full content | Ephemeral, session-scoped |

**Telemetry**: The router tracks match counts, session counts, and timestamps for every entry. `/sleep` uses this telemetry to promote high-traffic memories to rules and demote low-traffic rules to skills. Entries created here feed into that lifecycle.

## When to Use

- At the end of a productive session
- After you've made corrections you don't want to repeat
- When you've established conventions or preferences during the conversation
- Before ending a session where significant decisions were made

## Process

### 1. Review the conversation

Scan the full conversation for reusable learnings. Look for these categories:

**Corrections** — Times the user corrected the assistant's approach:
- "No, use X instead of Y"
- "That's wrong, it should be..."
- "Don't do that, prefer..."
- Repeated nudges in the same direction

**Preferences** — Explicit or implicit choices:
- Tool/framework/convention preferences
- Communication style preferences
- Workflow preferences (e.g., "always commit", "create a PR")

**Patterns** — Recurring approaches that worked:
- Debugging strategies that succeeded
- Architecture decisions and their rationale
- Multi-step processes that were followed

**Decisions** — Architectural or design choices made during the session:
- "We decided to use X because Y"
- Trade-offs that were evaluated

**Pitfalls** — Things that went wrong and how they were fixed:
- Approaches that failed and why
- Gotchas specific to this codebase

For each learning, note *why* it matters — the reasoning, not just the conclusion.

### 2. Classify each learning

For each extracted learning, determine the best type based on what was observed and memex's disclosure model:

| Pattern observed | Type | Destination |
|-----------------|------|-------------|
| Corrected 3+ times in this conversation | `rule` | `<scope>/.claude/rules/<name>.md` |
| Short preference or fact (1-5 lines) | `memory` | `<scope>/.claude/skills/<name>/SKILL.md` |
| Multi-step procedure or detailed how-to | `skill` | `<scope>/.claude/skills/<name>/SKILL.md` |
| Ordered multi-step process | `workflow` | `<scope>/.claude/skills/<name>/SKILL.md` |
| Tool-specific guidance (Bash, Edit, etc.) | `tool-guidance` | `<scope>/.claude/skills/<name>/SKILL.md` |
| Gotcha or stop condition | `stop-rule` | `<scope>/.claude/skills/<name>/SKILL.md` |

**Rules vs memories**: Use a rule when the user corrected the same behavior multiple times — the `one-liner` acts as a persistent nudge on every future match. Use a memory when the information just needs to be *available* — it's context, not a directive.

**Correction threshold**: If the user corrected the same thing 3+ times (in this conversation or cumulatively with prior sessions), it's a rule. A single correction is a memory. This is consistent with `/deep-sleep`'s classification.

**When to use a skill**: Only for genuinely multi-step procedures. If it fits in 5 lines, it's a memory. If it's an imperative ("always do X"), it's a rule.

### 3. Deduplicate against existing knowledge

For each candidate learning, use memex's own semantic search to check for overlapping entries. Pipe the learning text as a `UserPromptSubmit` query:

```bash
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"<candidate learning text>","session_id":"reflect-dedup","cwd":"<cwd>"}' | $PLUGIN_ROOT/bin/memex
```

If the output contains `additionalContext` with a match at relevance >= 80%, the learning is already covered. Read the matched entry to confirm — if the existing entry says the same thing, skip the candidate. If the existing entry is related but incomplete, update it instead of creating a duplicate.

This uses the same embedding-based similarity that memex uses at runtime, so dedup quality matches injection quality.

For each learning, one of three outcomes:

- **No match** → create a new entry (step 5)
- **Match exists and is accurate** → skip, it's already covered
- **Match exists but is incomplete or misleading** → read the existing file and update it with the new insight. Preserve what's correct, fix what's wrong, add what's missing.

### 4. Determine scope

For each learning, decide where it belongs:

- **Project-scoped** (`<cwd>/.claude/rules/` or `<cwd>/.claude/skills/`) — specific to this codebase
- **Global** (`~/.claude/rules/` or `~/.claude/skills/`) — applies across all projects
- **Memory** (`~/.claude/projects/<encoded-cwd>/memory/`) — project-specific facts and preferences

When in doubt, prefer project scope. It's easy to promote later.

### 5. Create the files

#### For memories

The memory directory uses Claude Code's path encoding:

```
~/.claude/projects/<encoded-cwd>/memory/<topic>.md
```

Where `<encoded-cwd>` is `pwd` with `/` → `-` and `.` → `-`.

Group related memories into topic files (e.g., `tooling.md`, `conventions.md`). Use `##` headings for each entry within a topic file. Optionally add a `Triggers:` line so memex can match them more precisely:

```markdown
## Prefer pnpm
Triggers: install dependencies, npm install, which package manager
Use `pnpm` instead of `npm` for all operations.
```

Keep memories concise (1-5 lines per entry).

#### For rules

Create `<scope>/.claude/rules/<kebab-name>.md`:

```yaml
---
name: <kebab-name>
description: "<when this rule applies>"
type: rule
one-liner: "<10-word max reminder shown on subsequent matches>"
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
keywords:
  - "<single-word or short phrase for matching>"
---
<Full rule content with rationale>
```

The `one-liner` is critical — after the first match in a session, only this short reminder is shown. Make it actionable and specific (e.g., "Use pnpm, not npm" not "Package manager preference").

#### For skills, memories, workflows, and other types

Create `<scope>/.claude/skills/<kebab-name>/SKILL.md`:

```yaml
---
name: <kebab-name>
description: "<one sentence: what this does — shown as teaser until Claude reads the full skill>"
type: <memory|skill|workflow|tool-guidance|stop-rule>
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
  - "<natural query 4>"
  - "<natural query 5>"
---
<The actual content>
```

The `type` field controls disclosure behavior (see Context section). The `description` is the teaser for `skill` and `workflow` types — make it clear enough to decide relevance from the description alone.

#### Query quality

For all types, `queries` determine when the entry surfaces. Write 3-5 diverse, natural queries a developer would actually type:

- Vary phrasing (imperative, question, keyword-style)
- Include the problem, not just the solution ("tests failing on CI" not just "CI configuration")
- Avoid generic queries like "help" or "how to code"

### 6. Report results

Present a summary:
- Number of learnings extracted
- What was created (with file paths) grouped by type
- What was skipped (already covered by existing entries)
- What existing content was updated (with file paths)

Ask the user to confirm before writing, or if they passed `--dry-run`, just show the plan.

## Guidelines

- **Be selective.** Not everything in a conversation is worth saving. Skip one-off requests, transient debugging, and anything too specific to the current task.
- **Capture the why.** "Use pnpm" is less useful than "Use pnpm because the project uses pnpm-lock.yaml and the CI is configured for it."
- **Prefer updating over creating.** If an existing entry covers the same topic, extend it rather than creating a parallel entry. Two entries about the same thing split the router's attention.
- **Keep it concise.** Memories: 1-5 lines. Rules: fit on a screen. Only create a full skill for genuinely multi-step procedures.
- **Write for the router.** Good `queries`, `one-liner`, and `description` fields are what make the system work. A perfectly written rule that never surfaces is worthless.
- **Trust the lifecycle.** Don't agonize over memory vs rule. Create what seems right — `/sleep` will later promote high-traffic memories to rules or demote unused rules to skills based on telemetry data.

## Options

The user may specify:
- `--dry-run`: Show extracted learnings without writing files
- `--global-scope`: Write to `~/.claude/skills/` and `~/.claude/rules/` instead of project scope

$ARGUMENTS
