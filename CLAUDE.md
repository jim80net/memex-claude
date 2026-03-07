# Claude Code Instructions

## Project

Semantic skill/memory/rule router for Claude Code. Ships as prebuilt binaries (via `bun build --compile`), falls back to `node --import tsx` for development. No external API keys — embeddings run locally via ONNX.

## Development

```bash
pnpm install         # install deps
pnpm test            # run vitest
pnpm tsc --noEmit    # type check
bun run build.ts     # compile standalone binary
```

## Architecture

- `src/core/` — Shared engine: embeddings (local ONNX), skill-index, cache, config, session, sync, project-mapping, types
- `src/hooks/` — Hook handlers: user-prompt, pre-tool-use, stop, pre-compact, session-start
- `src/main.ts` — Single entry point, dispatches by `hook_event_name` from stdin JSON
- `bin/` — Wrapper scripts (skill-router, skill-router.cmd, install.sh)
- `build.ts` — Build script: compiles standalone binary via bun, stubs sharp, bundles ONNX
- `skills/` — Bundled skill definitions (sleep, deep-sleep)
- `test/` — Vitest tests mirroring src/ structure

### Scan sources

| Source | Global path | Project path | Sync repo path |
|--------|------------|-------------|---------------|
| Rules | `~/.claude/rules/*.md` | `<cwd>/.claude/rules/*.md` | `<sync-repo>/rules/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<cwd>/.claude/skills/*/SKILL.md` | `<sync-repo>/skills/*/SKILL.md` |
| Memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` | — | `<sync-repo>/projects/<canonical-id>/memory/*.md` |

When sync is enabled, the sync repo at `~/.local/share/claude-skill-router/` is scanned alongside local paths.

### Disclosure model

- **Rules**: full content on first match in session, one-liner reminder on subsequent matches
- **Skills/workflows**: description teaser only; Claude reads the SKILL.md if it chooses to use it
- **Memory**: full content always (they're short)

Session state for rule tracking persists at `~/.claude/cache/sessions/<session_id>.json`.

### Sync

When `sync.enabled` is true in `~/.claude/skill-router.json`, the router syncs rules, skills, and memories via a git repo:

- **SessionStart**: `git pull --rebase` from remote, auto-resolve markdown conflicts
- **Stop**: copy local changes to sync repo, `git commit && push`
- **Project identity**: git remote URL → `host/owner/repo`; non-git projects → `_local/<encoded-path>`
- **Config**: `sync.repo` (git URL), `sync.projectMappings` (manual overrides)

### Rule frontmatter extensions

Native Claude Code rules support `paths:`. The router adds: `hooks:`, `keywords:`, `queries:`, `one-liner:`. Rules without frontmatter are indexed using filename as name.

## Conventions

- Production: prebuilt binary via `bun build --compile`; development: TypeScript runs directly via tsx
- Tests mock the `embedTexts` function to avoid loading ONNX models
- Cache and session modules are mocked in tests to avoid filesystem side effects
- All paths use `node:path` join + `node:os` homedir — no hardcoded absolute paths
