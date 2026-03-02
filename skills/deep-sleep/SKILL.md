---
name: deep-sleep
description: "Extract learnings from past session transcripts and create memory-skills. Processes unreviewed sessions to find user preferences, recurring patterns, and troublesome workflows."
queries:
  - "learn from past sessions"
  - "extract patterns from conversation history"
  - "create memories from session transcripts"
  - "what did I learn in past sessions"
  - "analyze session history for patterns"
---

# /deep-sleep — Extract Learnings from Session Transcripts

Analyze past session transcripts to extract user preferences, recurring patterns, and troublesome workflows, then create memory-skills for future semantic injection.

## When to Use

- Periodically (weekly) to consolidate learnings from recent sessions
- After a productive session where many patterns were established
- When you notice the same corrections being made repeatedly

## Process

Find the plugin's script directory and run:

```bash
# If installed as plugin:
PLUGIN_DIR="$(find ~/.claude/plugins -name 'claude-skill-router' -type d 2>/dev/null | head -1)"

# If cloned manually:
PLUGIN_DIR="${PLUGIN_DIR:-$HOME/projects/claude-skill-router}"

OPENAI_API_KEY="${OPENAI_API_KEY}" node --import tsx "$PLUGIN_DIR/scripts/deep-sleep.mts" "$(pwd)"
```

The script:
1. Finds unprocessed session transcripts (newer than watermark)
2. Extracts user messages and error-fix sequences from JSONL transcripts
3. Batches through LLM to extract:
   - User preference statements ("always use X", "prefer Y")
   - Troublesome workflows (repeated errors, user corrections)
   - Recurring patterns and conventions
4. Deduplicates against existing skills (embedding similarity > 0.85 = skip)
5. Creates memory-skills from novel extractions
6. Updates the watermark file

## Options

- `--dry-run`: Show extracted learnings without creating files
- `--since <date>`: Process transcripts from this date (ISO format)
- `--project-scope`: Write skills to `<cwd>/.claude/skills/` (default)
- `--global-scope`: Write skills to `~/.claude/skills/`

$ARGUMENTS
