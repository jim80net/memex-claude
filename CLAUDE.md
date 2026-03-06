# Claude Code Instructions

## Project

Semantic skill/memory router for Claude Code. TypeScript, runs via `node --import tsx`.

## Development

```bash
npm install          # install deps
npm test             # run vitest
npx tsc --noEmit     # type check
```

## Architecture

- `src/core/` — Shared engine: embeddings (local ONNX), skill-index, cache, config, types
- `src/hooks/` — Hook handlers: user-prompt, pre-tool-use, stop, pre-compact
- `src/main.ts` — Single entry point, dispatches by `hook_event_name` from stdin JSON
- `skills/` — Bundled skill definitions (sleep, deep-sleep)
- `test/` — Vitest tests mirroring src/ structure

## Conventions

- No build step — TypeScript runs directly via tsx
- Tests mock the `embedTexts` function to avoid loading ONNX models
- Cache module is mocked in tests to avoid filesystem side effects
- All paths use `node:path` join + `node:os` homedir — no hardcoded absolute paths
