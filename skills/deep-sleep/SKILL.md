---
name: deep-sleep
description: "Extract learnings from past session transcripts and create appropriately-typed skills. Processes unreviewed sessions to find user preferences, recurring patterns, and troublesome workflows."
queries:
  - "learn from past sessions"
  - "extract patterns from conversation history"
  - "create memories from session transcripts"
  - "what did I learn in past sessions"
  - "analyze session history for patterns"
---

# /deep-sleep — Extract Learnings from Session Transcripts

Analyze past session transcripts to extract user preferences, recurring patterns, and troublesome workflows, then create appropriately-typed skills for future semantic injection.

## When to Use

- Daily to consolidate learnings from recent sessions
- After a productive session where many patterns were established
- When you notice the same corrections being made repeatedly

## Process

Perform the following steps directly — no external scripts or API keys needed.

### 1. Locate transcripts

Find session transcripts in the project directory. The path is encoded from the current working directory:

```
~/.claude/projects/<encoded-cwd>/
```

Where `<encoded-cwd>` is the cwd with `/` replaced by `-` and `.` replaced by `-`.

Look for `.jsonl` files in that directory. Each line is a JSON object with `role` and `content` fields.

Check the watermark file to find unprocessed sessions:
```
~/.claude/cache/deep-sleep-watermark
```

If the watermark exists, only process `.jsonl` files modified after that timestamp. If no watermark exists, process files from the last 7 days. The user may also specify `--since YYYY-MM-DD`.

### 2. Extract user messages

From each transcript, extract lines where `role` is `"user"`. The `content` may be a string or an array of `{type, text}` objects. Collect messages longer than 10 characters.

### 3. Analyze for learnings

Review the collected user messages and identify reusable patterns. Look for:

- **Preferences**: "always use X", "prefer Y over Z", "don't use W"
- **Recurring corrections**: User repeatedly fixing the same kind of mistake
- **Workflow patterns**: Multi-step processes the user follows
- **Tool usage tips**: Guidance about how to use specific tools (Bash, Edit, etc.)
- **Stop rules**: Patterns in assistant responses that should trigger continuation

Skip one-off requests. Only extract clear, reusable patterns.

### 4. Deduplicate against existing knowledge

For each candidate learning, use memex's own semantic search to check for overlapping entries. Pipe the learning text as a `UserPromptSubmit` query:

```bash
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"<candidate learning text>","session_id":"deep-sleep-dedup","cwd":"<cwd>"}' | $PLUGIN_ROOT/bin/memex
```

If the output contains `additionalContext` with a match at relevance >= 80%, the learning is already covered. Read the matched entry to confirm — if the existing entry says the same thing, skip the candidate. If the existing entry is related but incomplete, update it instead of creating a duplicate.

This uses the same embedding-based similarity that memex uses at runtime, so dedup quality matches injection quality.

### 5. Classify and create entries

For each novel learning, determine the right type based on how critical and universal it is:

| Pattern observed | Type | Destination |
|-----------------|------|-------------|
| Corrected 3+ times across sessions | `rule` | `<cwd>/.claude/rules/<name>.md` with frontmatter |
| Preference or fact stated once | `memory` | `<cwd>/.claude/skills/<name>/SKILL.md` |
| Multi-step procedure | `skill` | `<cwd>/.claude/skills/<name>/SKILL.md` |
| Ordered multi-step process | `workflow` | `<cwd>/.claude/skills/<name>/SKILL.md` |
| Tool-specific guidance | `tool-guidance` | `<cwd>/.claude/skills/<name>/SKILL.md` |
| Stop condition pattern | `stop-rule` | `<cwd>/.claude/skills/<name>/SKILL.md` |

**For entries classified as rules** (corrections made 3+ times), create a rule file with full frontmatter:

```yaml
---
name: <kebab-case-name>
description: "<one sentence: what this rule prevents>"
queries:
  - "<query 1>"
  - "<query 2>"
  - "<query 3>"
one-liner: "<short reminder version>"
---
<the full rule explanation>
```

**For all other types**, create a SKILL.md:

```yaml
---
name: <kebab-case-name>
description: "<one sentence: when is this useful>"
type: <memory|skill|workflow|tool-guidance|stop-rule>
queries:
  - "<natural query 1>"
  - "<natural query 2>"
  - "<natural query 3>"
  - "<natural query 4>"
  - "<natural query 5>"
---
<the actual instruction or knowledge, 1-5 lines>
```

### 6. Update watermark

Write the current ISO timestamp to the watermark file:
```bash
mkdir -p ~/.claude/cache
date -u +%Y-%m-%dT%H:%M:%SZ > ~/.claude/cache/deep-sleep-watermark
```

### 7. Report results

Summarize what was created:
- Number of transcripts processed
- Learnings found (by type)
- Rules created (for repeatedly-corrected patterns)
- Skills created (for other learnings)
- Duplicates skipped

## Options

The user may specify:
- `--dry-run`: Show extracted learnings without creating files
- `--since <date>`: Process transcripts from this date (ISO format)
- `--global-scope`: Write skills to `~/.claude/skills/` instead of `<cwd>/.claude/skills/`

$ARGUMENTS
