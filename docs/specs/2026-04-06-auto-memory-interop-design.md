# Auto-Memory Interop Design

## Problem

Claude Code ships a built-in auto-memory feature that writes memory files to `~/.claude/memory/` (global) and `~/.claude/projects/<enc>/memory/` (project-scoped), then bulk-loads all of `MEMORY.md` into the system prompt at session start.

Memex-claude scans those same project memory directories, indexes them with embeddings, and injects semantically-matched memories per-prompt via the UserPromptSubmit hook.

Today these systems overlap silently: auto-memory bulk-loads all memories at session start, then memex may re-inject the same content semantically. There is no coordination on who creates, curates, or serves memories.

## Modes

Two operating modes, selected by `autoMemoryMode` in `~/.claude/memex.json`:

### `assist` (default)

Auto-memory is authoritative. Memex defers to it for memory creation and bulk injection.

- Auto-memory handles all memory lifecycle (creation, curation, MEMORY.md maintenance)
- Memex suppresses `memory` and `session-learning` types from UserPromptSubmit injection to avoid double-injection
- Skills, rules, workflows, and tool-guidance are still injected normally
- Sleep/deep-sleep skills remain available for manual use but have no automated triggers

### `takeover`

Memex owns the memory lifecycle. The user is expected to disable auto-memory.

- Session-start injects a memory-creation rule that tells Claude when and how to write memories in memex format (with `queries:` frontmatter for semantic indexing)
- Memex injects memories semantically via UserPromptSubmit (existing behavior, unchanged)
- Post-session extraction via manual `/reflect` and `/deep-sleep` (existing skills, unchanged)
- If auto-memory is still enabled (`CLAUDE_CODE_DISABLE_AUTO_MEMORY !== "1"`), session-start injects a one-time warning advising the user to disable it

## Implementation

Four independent changes that compose to implement both modes:

### 1. Config key

New top-level key in `~/.claude/memex.json`:

```json
{
  "autoMemoryMode": "assist"
}
```

Type: `"assist" | "takeover"`, default `"assist"`.

Added to the `MemexConfig` type in `src/core/config.ts`. The `loadConfig()` function defaults to `"assist"` when the key is absent, ensuring backward compatibility (existing installs get assist mode with no config change).

### 2. Auto-memory detection and warning

A utility function:

```typescript
function isAutoMemoryEnabled(): boolean {
  return process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== "1";
}
```

Lives in `src/core/config.ts` (co-located with other config utilities).

Used by `session-start.ts`: when `autoMemoryMode === "takeover"` and `isAutoMemoryEnabled()` returns true, inject a warning as `additionalContext`:

> "Memex is in takeover mode but Claude Code auto-memory is still enabled. This will cause duplicate memory writes. To disable auto-memory, set `CLAUDE_CODE_DISABLE_AUTO_MEMORY` to `1` in `~/.claude/settings.json` under the `env` key."

Gated by a watermark file at `~/.claude/cache/memex-automemory-warned` — fires once, not every session. Uses the same atomic-write-then-rename pattern as the cron watermark.

### 3. Memory-creation rule

A new bundled file at `skills/memory-creation/SKILL.md`.

Contains instructions for Claude on:

- **When to save**: user corrections, preferences, role/context info, explicit "remember this" requests
- **How to save**: write individual `.md` file with memex frontmatter (`name`, `description`, `type`, `queries`), then update `MEMORY.md` index
- **Where to save**: `~/.claude/projects/<encoded-cwd>/memory/`
- **Type taxonomy**: memex types (`memory`, `rule`, `session-learning`) instead of auto-memory types (`user`, `feedback`, `project`, `reference`)
- **Frontmatter format**: includes `queries:` field (5 natural language queries for semantic indexing)
- **What NOT to save**: code patterns derivable from files, git history, ephemeral task state

Injected by `session-start.ts` as `additionalContext` when `autoMemoryMode === "takeover"`. Fires every session (not watermarked) because it must be in context for every conversation, analogous to how auto-memory's system prompt instructions are always present.

Not indexed by memex's semantic search — this is a system-level instruction injected unconditionally in takeover mode.

### 4. Type filtering in assist mode

In `user-prompt.ts`, before calling `index.search()`:

```typescript
if (autoMemoryMode === "assist") {
  types = types.filter(t => t !== "memory" && t !== "session-learning");
}
```

If the filtered list is empty (user only configured memory types), skip the search and return `{}`.

No changes to other hooks:
- **PreToolUse**: already searches only `["tool-guidance", "skill"]`, no memory overlap
- **Stop**: searches for `stop-rule` type, no memory overlap
- **SessionStart**: mode-dependent behavior handled in change #2 and #3

## Config example

### Assist mode (default, no config change needed)

```json
{
  "enabled": true,
  "autoMemoryMode": "assist"
}
```

### Takeover mode

```json
{
  "enabled": true,
  "autoMemoryMode": "takeover"
}
```

User must also set in `~/.claude/settings.json`:

```json
{
  "env": {
    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"
  }
}
```

## Files changed

| File | Change |
|------|--------|
| `src/core/config.ts` | Add `autoMemoryMode` to config type, default, and `isAutoMemoryEnabled()` utility |
| `src/hooks/session-start.ts` | Inject memory-creation rule (takeover) or auto-memory warning (takeover + auto-memory still on) |
| `src/hooks/user-prompt.ts` | Filter memory types from search in assist mode |
| `skills/memory-creation/SKILL.md` | New file: memory-creation instructions for takeover mode |
| `test/session-start.test.ts` | Tests for warning injection and memory-creation rule injection |
| `test/user-prompt.test.ts` | Tests for type filtering in assist mode |
| `CLAUDE.md` | Document `autoMemoryMode` config key |

## What does NOT change

- Skill routing (unaffected by mode)
- Rule injection (unaffected by mode)
- PreToolUse hook (no memory types involved)
- Stop hook (no memory types involved)
- Sleep/deep-sleep skills (remain manual, mode-unaware)
- Sync behavior (unaffected by mode)
- Telemetry (unaffected — only records what was actually injected)
- Binary build / installation
