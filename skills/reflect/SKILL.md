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

For each extracted learning, determine the best format:

| Format | When to use | Example |
|--------|------------|---------|
| **memory** | Short preference or fact (1-3 lines) | "Use pnpm, not npm" |
| **rule** | Guideline that should be enforced and reminded about | "Always run tests before committing" |
| **skill** | Procedure with steps, or detailed how-to | "How to debug ONNX loading issues" |

**Rules vs memories**: Use a rule when the learning should trigger a reminder every time it's relevant (with `one-liner` for subsequent matches). Use a memory when it's informational context that's useful but doesn't need active enforcement.

### 3. Deduplicate against existing content

Check what already exists:

```bash
# Existing skills
ls ~/.claude/skills/*/SKILL.md .claude/skills/*/SKILL.md 2>/dev/null

# Existing rules
ls ~/.claude/rules/*.md .claude/rules/*.md 2>/dev/null

# Existing memories
ENCODED_CWD=$(pwd | sed 's|/|-|g; s|\.|-|g')
ls ~/.claude/projects/"$ENCODED_CWD"/memory/*.md 2>/dev/null
```

Read existing files to avoid creating duplicates. If an existing entry covers the same topic but is incomplete, **update it** rather than creating a new one.

### 4. Determine scope

For each learning, decide where it belongs:

- **Project-scoped** (`<cwd>/.claude/skills/` or `<cwd>/.claude/rules/`) — specific to this codebase
- **Global** (`~/.claude/skills/` or `~/.claude/rules/`) — applies across all projects
- **Memory** (`~/.claude/projects/<encoded-cwd>/memory/`) — project-specific facts

When in doubt, prefer project scope. It's easy to promote later.

### 5. Create the files

#### For memories

Add to or create a topic file in the memory directory:

```bash
ENCODED_CWD=$(pwd | sed 's|/|-|g; s|\.|-|g')
MEMORY_DIR=~/.claude/projects/"$ENCODED_CWD"/memory
mkdir -p "$MEMORY_DIR"
```

Append to an existing topic file or create a new one. Keep memories concise (1-5 lines).

#### For rules

Create `<scope>/.claude/rules/<kebab-name>.md`:

```yaml
---
name: <kebab-name>
description: "<when this rule applies>"
type: rule
one-liner: "<short reminder for subsequent matches>"
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
---
<Full rule content with rationale>
```

#### For skills

Create `<scope>/.claude/skills/<kebab-name>/SKILL.md`:

```yaml
---
name: <kebab-name>
description: "<one sentence: when is this useful>"
type: <skill|memory|workflow>
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
  - "<natural query 4>"
  - "<natural query 5>"
---
<The actual content>
```

Generate 3-5 diverse, natural queries a developer would type when they need this knowledge.

### 6. Report results

Present a summary:
- Number of learnings extracted
- What was created (with file paths) grouped by type
- What was skipped (duplicates or too session-specific)
- What existing content was updated

Ask the user to confirm before writing, or if they passed `--dry-run`, just show the plan.

## Guidelines

- **Be selective.** Not everything in a conversation is worth saving. Skip one-off requests, transient debugging, and anything too specific to the current task.
- **Capture the why.** "Use pnpm" is less useful than "Use pnpm because the project uses pnpm-lock.yaml and the CI is configured for it."
- **Prefer updating over creating.** If an existing memory or rule covers the same topic, extend it rather than creating a parallel entry.
- **Keep it concise.** Memories should be 1-5 lines. Rules should fit on a screen. Only create a full skill for genuinely multi-step procedures.
- **Test the queries.** Each query should be something a developer would actually type when they need this knowledge. Avoid generic queries like "help" or "how to code."

## Options

The user may specify:
- `--dry-run`: Show extracted learnings without writing files
- `--global-scope`: Write to `~/.claude/skills/` and `~/.claude/rules/` instead of project scope

$ARGUMENTS
