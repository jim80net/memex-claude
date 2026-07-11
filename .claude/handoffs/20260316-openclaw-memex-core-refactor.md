# Handoff: Refactor openclaw-skill-router to consume memex-core, rebrand to memex-openclaw

**Date:** 2026-03-16
**Branch:** main (all repos)
**Working directories:**
- `memex-claude`: `/home/jim/workspace/github.com/jim80net/memex-claude`
- `memex-core`: `/home/jim/workspace/github.com/jim80net/memex-core`
- `openclaw-skill-router`: `/home/jim/workspace/github.com/jim80net/openclaw-skill-router`

## Objective

Refactor `openclaw-skill-router` to consume `@jim80net/memex-core` (removing duplicated modules), then rebrand the repo to `memex-openclaw`. This mirrors the completed refactor of `claude-skill-router` → `memex-claude`.

## Completed (prior sessions)

### memex-core (`@jim80net/memex-core` v0.2.3 on npm)

- Extracted shared engine from claude-skill-router into standalone package
- 14 source modules: embeddings, skill-index, cache, config, session, telemetry, file-lock, path-encoder, project-mapping, project-registry, sync, traces, types, version
- 88+ tests passing
- **v0.2.3** includes frontmatter memory parsing fix (PR jim80net/memex-core#10)

### memex-claude (v1.4.0 released with binaries)

- Fully refactored to consume `@jim80net/memex-core@^0.2.2`
- Rebranded from `claude-skill-router`
- Release workflow fixed (chained into release-please)
- Plugin marketplace updated (jim80net/claude-plugins PR#4)
- All binary assets published on v1.4.0

### Open PRs

- `jim80net/memex-claude#32` — bump memex-core to 0.2.3 (ready to merge)
- `jim80net/claude-plugins#4` — rebrand in marketplace (ready to merge)

## Remaining

### Phase 1: Refactor openclaw-skill-router to use memex-core

- [ ] **Add `@jim80net/memex-core` dependency** to `package.json`
- [ ] **Delete `src/embeddings.ts`** — replace with `LocalEmbeddingProvider`, `OpenAIEmbeddingProvider`, `cosineSimilarity` from core
- [ ] **Delete `src/skill-index.ts`** — replace with `SkillIndex`, `parseFrontmatter`, `parseMemoryFile` from core. Note: openclaw's SkillIndex uses `search(query, topK, threshold, typeFilter?, scoringMode?, maxDropoff?)` — same signature as core
- [ ] **Delete `src/cache.ts`** — replace with `loadCache`, `saveCache`, `toCachedSkill`, `fromCachedSkill` from core
- [ ] **Delete `src/session.ts`** — replace with `InMemorySessionTracker` from core (openclaw uses in-memory only)
- [ ] **Delete `src/telemetry.ts`** — replace with core. **MIGRATION NOTE:** openclaw used field name `sessionKeys`, core uses `sessionIds`. Existing telemetry files need migration or will reset
- [ ] **Delete `src/traces.ts`** — replace with `TraceAccumulator`, `writeTrace` from core
- [ ] **Delete `src/types.ts`** — replace with types from core. Keep `PluginLogger` if it's openclaw-specific
- [ ] **Update `src/config.ts`** — extend `MemexCoreConfig` from core with openclaw-specific config (OpenAI API key resolution, plugin-specific options). Follow memex-claude's `src/core/config.ts` pattern
- [ ] **Update `src/router.ts`** — import types from core instead of local modules
- [ ] **Update `src/index.ts`** — construct `SkillIndex(config, provider, cachePath)` with injected provider and path params (follow memex-claude's `src/main.ts` pattern)
- [ ] **Keep `src/prompt-extractor.ts`** — openclaw-specific (strips Discord envelope), not in core
- [ ] **Update tests** — delete tests for deleted modules, update remaining to use core imports
- [ ] **Verify all tests pass**

### Phase 2: Rebrand to memex-openclaw

- [ ] **Rename repo** on GitHub: `openclaw-skill-router` → `memex-openclaw`
- [ ] **Update `package.json`** — name, description, repository URL
- [ ] **Update `openclaw.plugin.json`** — plugin name/description
- [ ] **Update README.md** — new name, description, install instructions
- [ ] **Update CLAUDE.md** — if project-specific instructions exist
- [ ] **Grep for remaining `skill-router` references** and update (follow same cleanup done for memex-claude)
- [ ] **Set up release-please** if not already configured
- [ ] **Publish initial release** with binaries if applicable

## Current State

```
# memex-claude (this repo)
Branch: main
Commit: d07bb83 chore(main): release 1.4.0 (#31)
Status: clean (3 untracked: .claude/skills/, .gitnexus/, AGENTS.md)

# memex-core
Branch: fix/frontmatter-memory-parsing (merged to main)
Latest: v0.2.3 on npm

# openclaw-skill-router
Branch: main
Location: /home/jim/workspace/github.com/jim80net/openclaw-skill-router
Status: not yet refactored — still uses local implementations of all core modules
```

## Key Decisions (from prior sessions)

- **3-repo architecture** (not monorepo): User explicitly chose separate repos. Core published to npm.
- **Brand: "memex"**: Named after Vannevar Bush's 1945 personal knowledge machine.
- **Maximal core boundary**: As much shared code as possible in core.
- **Parameterized paths**: Core has no hardcoded paths. Consumer constructs `MemexPaths` and passes paths as params.
- **ScanDirs pattern**: `SkillIndex.build()` takes `ScanDirs = { skillDirs, memoryDirs, ruleDirs }`.
- **EmbeddingProvider injection**: `SkillIndex` constructor takes `(config, provider, cachePath)`.
- **Telemetry field rename**: Core uses `sessionIds` (was `sessionKeys` in openclaw). Breaking change for existing telemetry data.

## Gotchas

- **Telemetry migration**: openclaw used `sessionKeys` field, core uses `sessionIds`. Existing telemetry JSON files will lose session tracking history unless migrated. Consider a one-time adapter or accept the reset.
- **`@huggingface/transformers`**: Keep as a dependency in openclaw if using local ONNX embeddings. It's an optionalDependency in memex-core.
- **OpenAI embedding provider**: openclaw supports both local and OpenAI embeddings. Core exports both providers — make sure the config resolution picks the right one based on API key presence.
- **`PluginLogger` type**: openclaw has a `PluginLogger` interface that may not exist in core. Keep it locally if needed.
- **Import extensions**: memex-core uses `.js` extensions internally. Consumers import from `@jim80net/memex-core` (no extension needed).
- **ONNX postinstall**: If `pnpm install` fails after adding memex-core, use `pnpm install --ignore-scripts` to skip onnxruntime-node's CUDA download.
- **User handles destructive git ops manually**: Don't run `git reset --hard` or `git push` to main. Create PR branches; tell the user when to push.

## Module Mapping Reference

| openclaw file to delete | memex-core replacement imports |
|---|---|
| `src/embeddings.ts` | `LocalEmbeddingProvider`, `OpenAIEmbeddingProvider`, `cosineSimilarity` |
| `src/skill-index.ts` | `SkillIndex`, `parseFrontmatter`, `parseMemoryFile`, `ScanDirs` (type) |
| `src/cache.ts` | `loadCache`, `saveCache`, `toCachedSkill`, `fromCachedSkill` |
| `src/session.ts` | `InMemorySessionTracker` |
| `src/telemetry.ts` | `loadTelemetry`, `saveTelemetry`, `recordMatch`, `getEntryTelemetry` |
| `src/traces.ts` | `TraceAccumulator`, `writeTrace` |
| `src/types.ts` | `SkillType`, `IndexedSkill`, `ParsedFrontmatter`, `SkillSearchResult`, etc. |

## To Resume

1. Read this file: `cat .claude/handoffs/20260316-openclaw-memex-core-refactor.md`
2. `cd /home/jim/workspace/github.com/jim80net/openclaw-skill-router`
3. Start with: Add `@jim80net/memex-core` dependency, then delete/replace modules one at a time starting with `embeddings.ts`
4. Use memex-claude's refactor (commit `e78d672`) as a reference: `git show e78d672 --stat` in the memex-claude repo
