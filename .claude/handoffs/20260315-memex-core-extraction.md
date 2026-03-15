# Handoff: Extract shared core into @jim80net/memex-core

**Date:** 2026-03-15
**Branch:** main (both repos)
**Working directories:**
- `claude-skill-router`: `/home/jim/workspace/github.com/jim80net/claude-skill-router`
- `memex-core`: `/home/jim/workspace/github.com/jim80net/memex-core`
- `openclaw-skill-router`: `/home/jim/workspace/github.com/jim80net/openclaw-skill-router`

## Objective

Extract the shared core engine from `claude-skill-router` and `openclaw-skill-router` into a standalone `@jim80net/memex-core` npm package, then update both consumers to depend on it. This is the first step of a rebrand: `claude-skill-router` → `memex-claude`, `openclaw-skill-router` → `memex-openclaw`. The brand name "memex" references Vannevar Bush's 1945 vision of a personal knowledge machine.

**3-repo architecture** (not monorepo — explicitly chosen by user):
1. `jim80net/memex-core` — shared engine, published to npm as `@jim80net/memex-core`
2. `jim80net/claude-skill-router` (will rename to `memex-claude`) — Claude Code hooks
3. `jim80net/openclaw-skill-router` (will rename to `memex-openclaw`) — OpenClaw plugin

## Completed

### memex-core (new repo at `../memex-core/`)

- **Commit `8e2d2dc`**: `feat: initial @jim80net/memex-core package`
- Created full project scaffold: `package.json`, `tsconfig.json`, `biome.json`, `vitest.config.ts`, `release-please-config.json`
- Wrote 14 source modules merging the superset of both repos:
  - `types.ts` — Union of both repos' types. `IndexedSkill` no longer has `mtime` (it's a cache concern). Cache version 2. Added `Logger`, `MemexPaths`, `MemexCoreConfig`, `ScoringMode`, `ExecutionTrace`, `SyncConfig`, `ProjectRegistry`, `EntryTelemetry`, `TelemetryData`, `HookInput`, `HookOutput`, `SessionState`
  - `embeddings.ts` — `EmbeddingProvider` interface (from openclaw) + `LocalEmbeddingProvider` (ONNX) + `OpenAIEmbeddingProvider` + `cosineSimilarity()` (claude's optimized version with unit-vector fast path)
  - `skill-index.ts` — `SkillIndex` class with injected `EmbeddingProvider` and `ScanDirs` pattern (consumer passes directories, no hardcoded paths). Supports relative + absolute scoring modes, `needsRebuild()`, rule/memory/skill parsing, inline frontmatter values
  - `cache.ts` — Version 2, parameterized `cachePath`. Both `getCachedSkill/setCachedSkill/removeCachedSkill` (claude pattern) and `toCachedSkill/fromCachedSkill` (openclaw pattern)
  - `config.ts` — `DEFAULT_CORE_CONFIG` + `resolveCoreConfig()`. No file loading (platform-specific)
  - `session.ts` — `SessionTracker` interface + `InMemorySessionTracker` class
  - `telemetry.ts` — Parameterized `telemetryPath`. Normalized `sessionIds` field name (was `sessionKeys` in openclaw)
  - `file-lock.ts` — Advisory mkdir-based locking, as-is from claude
  - `path-encoder.ts` — Only `encodeProjectPath()` (directory helpers that reference `.claude/` stay in consumer)
  - `project-mapping.ts` — `normalizeGitUrl()`, `resolveProjectId()`, etc. As-is from claude (already generic)
  - `project-registry.ts` — Parameterized `registryPath`
  - `sync.ts` — `syncCommitAndPush()` refactored to accept source directories as params. `autoResolveMarkdownConflict` exported for testing
  - `traces.ts` — `TraceAccumulator` constructor takes `tracesDir` param
  - `version.ts` — `MEMEX_CORE_VERSION` env var
- Wrote 9 test files, 84 tests — all passing
- Clean TypeScript build to `dist/` with declarations + source maps
- All internal imports use `.js` extensions (required for tsc compilation)

### claude-skill-router (this repo)

- **Commit `e78d672`**: `refactor: consume @jim80net/memex-core, remove duplicated core modules`
- Deleted 11 files from `src/core/` (replaced by `@jim80net/memex-core`)
- Created `src/core/paths.ts` — Claude-specific path configuration (`~/.claude/...`)
- Updated `src/core/config.ts` — Extends `MemexCoreConfig` with `hooks`, `sync`, `sleepSchedule`
- Updated `src/core/session.ts` — File-based session persistence, imports `withFileLock` from core
- Updated `src/main.ts` — Constructs `LocalEmbeddingProvider`, `SkillIndex(config, provider, cachePath)`, builds `ScanDirs` from claude-specific paths
- Updated all 5 hook handlers to import from `@jim80net/memex-core`
- Deleted 9 test files (migrated to memex-core), updated 5 remaining test files
- Net: -2,429 lines
- 27 tests passing, type-check clean, binary build verified (`bun run build.ts` produces working binary)

## Remaining

- [ ] **Create GitHub repo `jim80net/memex-core`** and push the initial commit
- [ ] **Set up CI for memex-core** (GitHub Actions: lint, typecheck, test, publish)
- [ ] **Publish `@jim80net/memex-core` to npm** (initial `0.1.0` release)
- [ ] **Switch claude-skill-router's dependency** from `"link:../memex-core"` to `"^0.1.0"` in `package.json`
- [ ] **Update openclaw-skill-router** to consume `@jim80net/memex-core` (similar refactoring: replace `src/embeddings.ts`, `src/skill-index.ts`, `src/cache.ts`, `src/config.ts`, `src/session.ts`, `src/telemetry.ts`, `src/traces.ts` with core imports)
- [ ] **Rename repos** when ready: `claude-skill-router` → `memex-claude`, `openclaw-skill-router` → `memex-openclaw`
- [ ] **Update the stop hook's sync source dirs** — currently `stop.ts:72` constructs rules/skills paths relative to `cacheDir` which is fragile. Should use the same helpers from `paths.ts` that `main.ts` uses. Specifically `join(paths.cacheDir, "..", "rules")` should be `join(homedir(), ".claude", "rules")` or use `getGlobalRulesDir()`.

## Current State

```
# claude-skill-router
Branch: main
Commit: e78d672 refactor: consume @jim80net/memex-core, remove duplicated core modules
Status: clean (no uncommitted changes)
Dependency: "@jim80net/memex-core": "link:../memex-core" (local link, not yet published)

# memex-core
Branch: main
Commit: 8e2d2dc feat: initial @jim80net/memex-core package
Status: clean
Not yet on GitHub — local git repo only
```

## Key Decisions

- **3-repo architecture** (not monorepo): User explicitly chose separate repos over monorepo. Core published to npm. Reason: prefers clean separation over atomic cross-package changes.
- **Brand: "memex"**: Named after Vannevar Bush's 1945 personal knowledge machine concept. npm scope: `@jim80net/memex-core`. All three repos will eventually be renamed to `memex-*`.
- **Maximal core boundary**: User wanted as much parity as possible between implementations. Almost everything moved to core, including sync, project-registry, project-mapping, traces.
- **IndexedSkill without mtime**: Following openclaw's pattern — `mtime` is a cache concern, stored in `CachedSkill` but not `IndexedSkill`. The `toCachedSkill(skill, mtime)` function takes it as a separate parameter.
- **Cache version 2**: Core uses v2 (from openclaw). Claude's existing v1 caches auto-invalidate on version mismatch and rebuild automatically.
- **Parameterized paths**: All hardcoded paths (`.claude/`, `.openclaw/`) removed from core. Each consumer constructs a `MemexPaths` object and passes paths as function parameters.
- **ScanDirs pattern**: `SkillIndex.build()` takes `ScanDirs = { skillDirs, memoryDirs, ruleDirs }` instead of hardcoding directories. Consumer responsible for constructing the directory list.
- **EmbeddingProvider injection**: `SkillIndex` constructor takes `(config, provider, cachePath)` — the consumer chooses which provider to use.
- **Telemetry field name**: Normalized to `sessionIds` (claude's name). Openclaw used `sessionKeys`. This is a breaking change for openclaw's existing telemetry data — needs a migration adapter when updating memex-openclaw.

## Gotchas

- **pnpm link vs npm link**: `npm link` doesn't work with pnpm-managed `node_modules` (crashes with "Cannot read properties of null"). Use `"link:../memex-core"` in `package.json` instead.
- **ONNX postinstall failure**: `pnpm install` in memex-core fails because onnxruntime-node's postinstall tries to download CUDA 11 binaries. Use `pnpm install --ignore-scripts` to skip this. The ONNX runtime is loaded at runtime, not at install time.
- **Import extensions**: memex-core uses `.js` extensions in internal imports (required for `tsc` compilation to `dist/`). Consumers import from `@jim80net/memex-core` (resolved by node/bun module resolution, no extension needed).
- **`createRequire` type issue**: TypeScript's `node:module` types don't expose `createRequire` via destructuring. Fixed with `(moduleMod as any).createRequire` cast in `embeddings.ts`.
- **stop.ts sync source dirs**: The current `stop.ts:72` uses `join(paths.cacheDir, "..", "rules")` to get the global rules dir, which is fragile. Should use `getGlobalRulesDir()` from `paths.ts` instead. Not fixed yet.
- **`@huggingface/transformers`** remains a direct dependency of claude-skill-router AND an optionalDependency of memex-core. Both need it for the bun binary build. When openclaw consumes core, it should also keep it as a dependency (or optionalDep).

## To Resume

1. Read this file: `cat .claude/handoffs/20260315-memex-core-extraction.md`
2. Both repos are on `main` branch, clean state
3. Start with: Create GitHub repo `jim80net/memex-core`, push, set up CI, publish to npm
4. Then: Switch claude-skill-router from local link to npm dependency
5. Then: Update openclaw-skill-router to consume core
