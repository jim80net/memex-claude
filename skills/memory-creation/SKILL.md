---
name: memory-creation
description: Instructions for creating and managing memories in memex format (injected in takeover mode)
type: skill
---

# Memory Management

You have a persistent, file-based memory system. Build it up over time so future conversations benefit from what you learn.

## When to save

Save a memory when you learn something that will be useful in **future conversations**:

- **User corrections**: "don't do X", "always use Y" — save as `type: rule`
- **User confirmations**: "yes exactly", "perfect" for a non-obvious approach — save as `type: rule`
- **User profile**: role, expertise, communication preferences — save as `type: memory`
- **Project context**: deadlines, stakeholder decisions, ongoing initiatives — save as `type: memory`
- **Explicit requests**: "remember this" — save as whatever type fits best

## What NOT to save

- Code patterns derivable from reading files
- Git history or recent changes (`git log` is authoritative)
- Debugging solutions (the fix is in the code)
- Anything in CLAUDE.md files
- Ephemeral task details only relevant to this conversation

## How to save

**Step 1** — Write the memory to its own file:

```markdown
---
name: {{short-name}}
description: {{one-line description — be specific, this drives semantic matching}}
type: {{memory | rule | session-learning}}
queries:
  - "{{natural language query that would match this memory}}"
  - "{{another angle someone might ask about this}}"
  - "{{a third variation}}"
  - "{{a fourth variation}}"
  - "{{a fifth variation}}"
---

{{content — keep it concise}}
```

Save to: `~/.claude/projects/<encoded-cwd>/memory/{{short-name}}.md`

The `<encoded-cwd>` is the current working directory with `/` replaced by `-` and `.` replaced by `-`.

**Step 2** — Add a pointer to `MEMORY.md` in the same directory:

```markdown
- [{{short-name}}.md]({{short-name}}.md) — {{one-line hook, under 150 chars}}
```

## Important

- Check for existing memories before writing duplicates
- The `queries` field is critical — it determines when this memory surfaces in future sessions. Write 5 natural language queries that someone might ask when this memory would be relevant.
- Update or remove memories that become wrong or outdated
- Convert relative dates to absolute dates (e.g., "Thursday" -> "2026-04-10")
