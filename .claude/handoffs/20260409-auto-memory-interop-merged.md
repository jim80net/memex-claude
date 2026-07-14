# Handoff: Auto-memory interop (assist/takeover modes)

**Date:** 2026-04-09
**Branch:** worktree-auto-memory-interop (merged to main)
**Working directory:** /home/jim/workspace/github.com/jim80net/memex-claude/.claude/worktrees/auto-memory-interop

## Objective

Implement two operating modes (`assist` and `takeover`) so memex-claude coexists cleanly with Claude Code's built-in auto-memory feature, preventing double-injection of memory content.

## Session Summary

Responded to PR #45 review feedback. Two review comments from the claude[bot] reviewer were addressed:

1. **Path centralization review** — `getAutoMemoryWatermarkPath()` was defined inline in `session-start.ts`, violating the CLAUDE.md convention that all Claude-specific paths must be centralized in `src/core/paths.ts`. Fixed by moving it to the `ClaudePaths` type alongside `cronWatermarkPath`.

2. **Concurrency safety review** — Both `writeAutoMemoryWatermark()` and `writeCronWatermark()` wrote to shared state (`~/.claude/cache/`) without advisory file locks, violating the CLAUDE.md convention. Fixed by wrapping both in `withFileLock()` consistent with the registry write pattern.

The PR was already merged before these review fixes were pushed, so the two fix commits (258e918, 9dc4fe6) landed on the branch after merge.

## Completed Work

### PR #45 — Auto-memory interop with assist/takeover modes

**PR:** #45 — https://github.com/jim80net/memex-claude/pull/45
**Status:** MERGED (merged at 2026-04-09T10:27:55Z)
**Problem:** Memex and Claude Code auto-memory both inject memory content at session start, causing duplicate context delivery.
**Fix:** Added `autoMemoryMode` config key (default: `assist`) that controls interop behavior:
  - `assist` mode: memex filters `memory`/`session-learning` types from UserPromptSubmit — auto-memory is authoritative
  - `takeover` mode: memex injects a memory-creation rule at session start and warns (once, via watermark) if auto-memory is still enabled
**Files changed:**
  - `src/core/config.ts` — `AutoMemoryMode` type, config field, merge logic, `isAutoMemoryEnabled()` utility
  - `src/core/paths.ts` — added `autoMemoryWatermarkPath` to `ClaudePaths` type (review fix)
  - `src/hooks/user-prompt.ts` — filters memory types in assist mode before `index.search()`
  - `src/hooks/session-start.ts` — takeover warning + memory-creation rule injection, combined with sleep schedule; `getPluginRoot()` fix for Bun-compiled binaries; both watermark writes wrapped in `withFileLock` (review fix)
  - `skills/memory-creation/SKILL.md` — new bundled skill
  - `test/user-prompt.test.ts` — 3 new tests for assist-mode filtering
  - `test/session-start.test.ts` — 5 new tests for warning, rule injection, watermarking, combined output
  - `CLAUDE.md` — documents `autoMemoryMode`
**Tests:** 37/37 pass
**Review feedback addressed:**
  1. Centralized `autoMemoryWatermarkPath` in `ClaudePaths` type (commit 258e918)
  2. Wrapped both watermark writes in `withFileLock` for concurrency safety (commit 9dc4fe6)

### Key Decisions

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| Default to `assist` mode | Zero-disruption for existing installs; immediately stops double-injection | Default to `takeover` would require all users to set env var |
| Watermark-based one-time warning | Simple file existence check; no state management needed | Session-registry approach (overkill for a one-time nudge) |
| Combine takeover output with sleep schedule | Avoids multiple hook responses; both are session-start concerns | Separate responses would work but create unnecessary noise |
| Centralize `autoMemoryWatermarkPath` in paths.ts | Follows existing `cronWatermarkPath` pattern; CLAUDE.md convention | Keep as inline function (violates convention) |
| withFileLock for watermark writes | Follows CLAUDE.md convention; prevents race conditions from concurrent sessions | No lock (pre-existing gap; review caught it) |

## Current State

### Git
```
% git log --oneline -5
9dc4fe6 fix: wrap watermark writes in withFileLock for concurrency safety
258e918 fix: centralize autoMemoryWatermarkPath in paths.ts per review feedback
bbe9b22 fix: handle compiled binary path in getPluginRoot
a1caac7 fix: combine takeover + sleep schedule sections instead of early return
1194005 docs: document autoMemoryMode config key

% git status
On branch worktree-auto-memory-interop
nothing to commit, working tree clean

% git branch --show-current
worktree-auto-memory-interop
```

### Open PRs
None — #45 is merged.

## Remaining Work

### 1. Manual testing [medium priority]

**What:** The PR's test plan includes 4 manual test scenarios that were not executed in this session:
  - Verify assist mode suppresses memory injection (check stderr for `memex: injected N skills` without memory counts)
  - Verify takeover mode shows warning when auto-memory is still enabled
  - Verify takeover mode injects only memory-creation rule when `CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`
  - Verify `getPluginRoot()` fix works in compiled binary (`bun run build.ts` then invoke binary)

**Where:** Requires running the actual binary with config changes
**Approach:** Build binary, set `autoMemoryMode` in `~/.claude/memex.json`, run hooks manually
**Verify:** Each scenario produces expected output

### 2. Runtime verification of withFileLock [low priority]

**What:** Verify that concurrent session starts don't produce duplicate watermark writes
**Where:** `~/.claude/cache/memex-automemory-warned` and `~/.claude/cache/memex-cron-watermark`
**Approach:** This is a theoretical race condition; the fix matches the existing registry write pattern. Low risk.

## Failed Approaches & Dead Ends

None — both review fixes were straightforward pattern-matching to existing conventions.

## Gotchas & Environment Notes

- `rtk` tool wraps some commands (git, gh) but doesn't understand `pnpm` — use `npx` directly for vitest/tsc
- The project uses `bun build --compile` for production binaries; `import.meta.url` resolves to a virtual `$bunfs` path in compiled mode, which is why `getPluginRoot()` needed fixing
- PR was merged before review feedback was pushed — the two fix commits are on the feature branch but after the merge point

## To Resume

1. Read this file: `cat .claude/handoffs/20260409-auto-memory-interop-merged.md`
2. `cd /home/jim/workspace/github.com/jim80net/memex-claude && gh pr list --state open` to check for new issues
3. Manual testing of the 4 scenarios listed in Remaining Work if desired