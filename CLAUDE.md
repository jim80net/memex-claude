# Claude Code Instructions

## Project

Claude Code hooks integration for the memex skill/memory/rule router. Ships as prebuilt binaries (via `bun build --compile`). Core engine lives in `@jim80net/memex-core`.

## Development

```bash
pnpm install         # install deps (memex-core linked from ../memex-core)
pnpm test            # run vitest
pnpm tsc --noEmit    # type check
bun run build.ts     # compile standalone binary
```

## Architecture

- `@jim80net/memex-core` — Shared engine (separate repo): embeddings (ONNX + OpenAI), skill-index, cache, config, session, telemetry, sync, project-mapping, project-registry, file-lock, traces, types
- `src/core/` — Claude-specific wrappers:
  - `paths.ts` — Claude path configuration (`~/.claude/...`)
  - `config.ts` — Extends `MemexCoreConfig` with hook-specific config, sync (`repoDir?`), sleep schedule
  - `projection.ts` — G3 thin adapter: `resolveOriginRoot` / `planProjection` / `applyProjection` into `~/.claude/rules`
  - `scan-roots.ts` — ScanDirs assembly + portable handle registry (skips raw origin/rules when projecting)
  - `session.ts` — File-based session persistence (wraps core's `SessionTracker` interface)
- `src/hooks/` — Hook handlers: user-prompt, pre-tool-use, stop, session-start
- `src/main.ts` — Entry point: SessionStart pulls/projects early; other registered events build `SkillIndex` and dispatch by `hook_event_name`
- `bin/` — Wrapper scripts (memex, memex.cmd, install.sh, sleep-schedule.sh)
- `build.ts` — Build script: compiles standalone binary via bun, stubs sharp, bundles ONNX
- `skills/` — Bundled skill definitions (sleep, deep-sleep, doctor, handoff, takeover, memory-creation)
- `test/` — Vitest tests for hook handlers and claude-specific modules

### Scan sources

| Source | Global path | Project path | Sync repo path |
|--------|------------|-------------|---------------|
| Rules | `~/.claude/rules/*.md` | `<cwd>/.claude/rules/*.md` | `<sync-repo>/rules/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<cwd>/.claude/skills/*/SKILL.md` | `<sync-repo>/skills/*/SKILL.md` |
| Memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` | — | `<sync-repo>/projects/<canonical-id>/memory/*.md` |

When sync is enabled, origin skills/memories are scanned alongside harness paths. When **rules projection** is active (`sync.enabled`), origin `rules/` is **not** double-scanned — harness `~/.claude/rules` holds symlinks into origin (pin `@jim80net/memex-core@^0.6.0`).

### Disclosure model

- **Rules**: full content on first match in session, one-liner reminder on subsequent matches
- **Skills/workflows**: description teaser only; Claude reads the SKILL.md if it chooses to use it
- **Memory**: full content always (they're short)

Session state for rule tracking persists at `~/.claude/cache/sessions/<session_id>.json`.

### Match telemetry

The UserPromptSubmit hook records match events to `~/.claude/cache/memex-telemetry.json`. Per-entry data includes match count, first/last matched timestamps, and unique session IDs. This telemetry drives the `/sleep` skill's promotion/demotion recommendations (e.g., high-frequency memories → promote to rules, low-frequency rules → demote to skills).

Additional GEPA telemetry fields:
- `queryHits` — per-query hit counts (maps query index to match count), enabling data-driven query refinement during `/sleep`
- `observations` — array of ASI (Autonomous Skill Improvement) insights from `/deep-sleep`, capped at 100 entries
- `formatTelemetryReport()` — generates a markdown table summarizing telemetry data (match counts, query effectiveness, observations) for human review
- `boost` — optional frontmatter field on entries that adds a fixed offset to similarity scores, nudging borderline entries above the match threshold

### Sleep schedule

When `sleepSchedule.enabled` is true in config, the SessionStart hook checks for a system cron entry to run `/sleep` and `/deep-sleep` daily. If missing, it injects context prompting Claude to set up the crontab (at `sleepSchedule.dailyAt`, default `03:00`). The `bin/sleep-schedule.sh` script iterates over `sleepSchedule.projects` (or auto-discovered projects from `~/.claude/cache/memex-projects.json`) and invokes `claude --print` for each.

The project registry is updated automatically on every SessionStart — each project `cwd` is recorded with a `lastSeen` timestamp.

### Binary installation

The wrapper scripts (`bin/memex`, `bin/memex.cmd`) download the binary synchronously on first run if missing, with SHA256 checksum verification. There is no tsx/node fallback — if the download fails, the hook outputs `{}` with a one-liner install command on stderr. Release artifacts include a `checksums.txt` generated during CI. Version updates are handled by Claude Code's plugin manager.

### Sync

When `sync.enabled` is true in `~/.claude/memex.json`, the router syncs rules, skills, and memories via a git repo:

- **SessionStart**: `git pull --rebase` from remote (auto-detects default branch), auto-resolve markdown conflicts
- **Stop**: copy local changes to sync repo, `git commit && push`
- **Project identity**: git remote URL → `host/owner/repo`; non-git projects → `_local/<encoded-path>`
- **Config**: `sync.repo` (git URL), `sync.projectMappings` (manual overrides)

### Auto-memory interop

The `autoMemoryMode` key in `~/.claude/memex.json` controls how memex coexists with Claude Code's built-in auto-memory:

| Mode | Default | Auto-memory | Memory injection | Memory creation |
|------|---------|-------------|-----------------|-----------------|
| `assist` | Yes | Authoritative | Suppressed (auto-memory handles it) | Auto-memory handles it |
| `takeover` | No | Should be disabled | Memex semantic injection | Session-start rule + manual /reflect, /deep-sleep |

In `assist` mode, memex filters `memory` and `session-learning` types from UserPromptSubmit search. In `takeover` mode, session-start injects a memory-creation rule and warns if `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is not `1`.

### Rule frontmatter extensions

Native Claude Code rules support `paths:`. The router adds: `hooks:`, `keywords:`, `queries:`, `one-liner:`. List keys support both block-style (indented `- items`) and inline values (e.g. `queries: "single query"`). Rules without frontmatter are indexed using filename as name.

## Conventions

- Production: prebuilt binary via `bun build --compile`; development: TypeScript runs directly via tsx (dev only, not a production fallback)
- Core engine (`@jim80net/memex-core`) is a separate npm package — all shared types, embeddings, indexing, caching live there
- `src/core/` contains only claude-specific code: path config, file-based session, extended config
- Tests mock `@jim80net/memex-core` functions (telemetry, sync, etc.) to avoid filesystem side effects
- All Claude-specific paths are centralized in `src/core/paths.ts`
- File writes to shared state (telemetry, session, registry) use advisory file locks from `@jim80net/memex-core`
- Only hooks whose handler does real work are registered in `hooks/hooks.json` (SessionStart, UserPromptSubmit, PreToolUse, Stop); per-hook `enabled` config controls activation. A hook gated behind a default-`false` config flag must NOT be registered unconditionally — the registration cost (binary spawn + ONNX model load) is paid on every event regardless of the flag, so a static registration whose handler no-ops just burns a cold-start (and PreCompact's 10s timeout raced that cold-start during `/compact`). A registered event MUST have a matching dispatch case in `src/main.ts`; `test/hooks-registration.test.ts` enforces this invariant.
