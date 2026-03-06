# Claude Code Instructions

## Project

Semantic skill/memory/rule router for Claude Code. TypeScript, runs via `node --import tsx`. No external API keys — embeddings run locally via ONNX.

## Development

```bash
pnpm install         # install deps
pnpm test            # run vitest
pnpm tsc --noEmit    # type check
```

## Architecture

- `src/core/` — Shared engine: embeddings (local ONNX), skill-index, cache, config, session, types
- `src/hooks/` — Hook handlers: user-prompt, pre-tool-use, stop, pre-compact
- `src/main.ts` — Single entry point, dispatches by `hook_event_name` from stdin JSON
- `skills/` — Bundled skill definitions (sleep, deep-sleep)
- `test/` — Vitest tests mirroring src/ structure

### Three scan sources

| Source | Global path | Project path |
|--------|------------|-------------|
| Rules | `~/.claude/rules/*.md` | `<cwd>/.claude/rules/*.md` |
| Skills | `~/.claude/skills/*/SKILL.md` | `<cwd>/.claude/skills/*/SKILL.md` |
| Memory | `~/.claude/projects/<encoded-cwd>/memory/*.md` | — |

### Disclosure model

- **Rules**: full content on first match in session, one-liner reminder on subsequent matches
- **Skills/workflows**: description teaser only; Claude reads the SKILL.md if it chooses to use it
- **Memory**: full content always (they're short)

Session state for rule tracking persists at `~/.claude/cache/sessions/<session_id>.json`.

### Rule frontmatter extensions

Native Claude Code rules support `paths:`. The router adds: `hooks:`, `keywords:`, `queries:`, `one-liner:`. Rules without frontmatter are indexed using filename as name.

## Conventions

- No build step — TypeScript runs directly via tsx
- Tests mock the `embedTexts` function to avoid loading ONNX models
- Cache and session modules are mocked in tests to avoid filesystem side effects
- All paths use `node:path` join + `node:os` homedir — no hardcoded absolute paths
