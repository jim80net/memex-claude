# memex-claude addendum — G3 file-rules projection (shared-origin alignment)

**Date:** 2026-07-11  
**Status:** design only — **no implementation in this PR**  
**Authority:** operator steer `flotilla-dispatch-c29001c1` · G3 brief `adapter-alignment-g3-2026-07-11.md`  
**Pin (impl):** `@jim80net/memex-core@^0.6.0` (currently package.json pins `^0.5.0` — bump at impl)  
**Proven path:** memex-grok#30 design + #31 impl (`src/core/projection.ts`)  
**Core contract:** `resolveOriginRoot` / `planProjection` / `applyProjection` / `defaultOriginRoot` / `legacyClaudeOriginRoot`  
**Parent product brief:** `memex-flotilla/briefs/file-rules-shared-origin-2026-07-10.md`  
**Scope:** memex-claude only. Author ≠ merger; surface PRs to **memex** for gate/merge.

---

## 0. Bottom line

Align the Claude adapter with the **same lifecycle model** Grok proved: core owns origin truth and symlink policy; this adapter owns **Claude harness paths**, **when** projection runs, **scan/index coexistence** with the existing copy-sync path, and **doctor/health messaging**.

Claude already delivers rules/skills/memory via **hooks** (`UserPromptSubmit` inject) and optional git **copy-sync** (`SessionStart` pull → scan origin tree; `Stop` copy harness → origin). G3 does **not** replace hook delivery or invent inject-first. It adds **file-shaped provenance**: managed origin rules appear under `~/.claude/rules` (and optionally project rules) as **absolute symlinks into the shared origin**, fail-closed, with **one content blob → one index entry**.

**Impl gate:** this design passes memex systems-review → pin `memex-core@^0.6.0` → implement projection + scan policy + doctor skill checks → dogfood / manual verify → no freeze-SHA / self-merge from this seat.

---

## 1. Verified current state (code + host — no invented paths)

### 1.1 Harness paths (`src/core/paths.ts`)

| Role | Function / field | Absolute shape |
|------|------------------|----------------|
| Config | `getClaudePaths().configPath` | `~/.claude/memex.json` |
| Global rules | `globalRulesDir` | `~/.claude/rules` |
| Project rules | `getProjectRulesDir(cwd)` | `<cwd>/.claude/rules` |
| Global skills | `globalSkillsDir` | `~/.claude/skills` |
| Project skills | `getProjectSkillsDir(cwd)` | `<cwd>/.claude/skills` |
| Project memory | `getProjectMemoryDir(cwd, projectsDir)` | `~/.claude/projects/<encoded-cwd>/memory` |
| Legacy sync corpus | `syncRepoDir` | `~/.local/share/memex-claude` |
| Cache / sessions / telemetry | under `~/.claude/cache/…` | (unchanged by G3) |

Evidence: `src/core/paths.ts` lines 13–45 (read 2026-07-11).

### 1.2 Scan assembly today (`src/core/scan-roots.ts`)

`assembleClaudeScanDirs` always scans:

- skills: `globalSkillsDir`, project skills, `config.skillDirs`
- rules: `globalRulesDir`, project rules
- memory: project memory dir under `~/.claude/projects/…`

When `syncConfig.enabled`:

- **also** appends `getSyncScanDirs(syncRepoDir)` → `syncRepoDir/rules` and `syncRepoDir/skills`
- **also** appends matching project memory dirs under the sync repo

**Double-index risk (rules):** if the same rule body exists both as a real file under `~/.claude/rules` *and* under `syncRepoDir/rules` (copy-sync model), both paths can enter the index. Grok #31 fixed the projected case by **not** appending raw `origin/rules` when projection is active (`memex-grok/src/core/index-init.ts`).

### 1.3 Copy-sync lifecycle today (not projection)

| Hook | Behavior | Code |
|------|----------|------|
| `SessionStart` | `syncPull(syncConfig, paths.syncRepoDir)` when `enabled && autoPull` | `src/hooks/session-start.ts` |
| `Stop` | `syncCommitAndPush(…, { rules: globalRulesDir, skills: globalSkillsDir, projectMemoryDir })` when `enabled && autoCommitPush` | `src/hooks/stop.ts` |
| Index | Scans harness **and** sync-repo trees | `assembleClaudeScanDirs` |

`syncCommitAndPush` **copies bytes** (mtime-based) into the sync repo — it does not create symlinks (`memex-core/src/sync.ts`).

### 1.4 Entrypoint shape

- Production binary is **hooks-stdin only** (`src/main.ts` reads JSON from stdin; dispatches by `hook_event_name`).
- `bin/memex` execs `memex.bin` with `"$@"` but there is **no** argv subcommand router today (unlike grok `mcp` / `doctor` / `init` / `sync`).
- “Doctor” is a **bundled skill** (`skills/doctor/SKILL.md`) — checklist run by the agent, not a CLI doctor process.

### 1.5 Pin and config

| Fact | Evidence |
|------|----------|
| package pin | `"@jim80net/memex-core": "^0.5.0"` in `package.json` — **below** G3 pin `^0.6.0` |
| Profile knobs | `SkillRouterConfig.sync: SyncConfig` — `enabled`, `repo`, `autoPull`, `autoCommitPush`, `projectMappings`, optional `caseSensitive` (`src/core/config.ts`; core `SyncConfig` has **no** `repoDir` field) |
| Default | `sync.enabled: false` in `DEFAULT_CONFIG`; live dogfood host may override |

### 1.6 Dogfood host snapshot (2026-07-11 — this machine)

| Path | State |
|------|--------|
| `~/.claude/memex.json` | present; `sync.enabled: true`; remote corpus configured |
| `~/.claude/rules` | **~34 real files, 0 symlinks** (copy model, not projected) |
| `~/.local/share/memex-claude` | live git corpus (`rules/`, `skills/`, `projects/`) |
| `~/.memex` | present post Grok dogfood (core product default) |

**Implication for clobber policy:** a naive “project all origin rules into `~/.claude/rules`” run against this host will produce **many `real-file` conflicts**. That is correct fail-closed behavior — design must document it, not “fix” by overwriting.

---

## 2. Goals and non-goals

### Goals (Claude adapter slice of G3)

| ID | Goal |
|----|------|
| **C1** | Pin `@jim80net/memex-core@^0.6.0` and call **only** core origin APIs for FS policy (no forked symlink logic). |
| **C2** | Project origin `rules/` → `~/.claude/rules` as absolute symlinks when profile is set; optional project-scope projection only with an **explicit** origin rel path (mirror grok v1 — avoid double-linking the same `rules/` into user + project). |
| **C3** | Fail-closed: never clobber real files / real dirs / foreign symlinks; partial apply + conflict report. |
| **C4** | Scan policy: when rules projection is active, **do not** also append raw `origin/rules` (one blob → one index entry). Skills/memory keep today’s scan behavior unless a later skills-projection follow-on lands. |
| **C5** | Coexist with copy-sync: pull still refreshes origin; Stop copy-up must not thrash projected links or invent a second origin tree. |
| **C6** | Doctor skill (+ optional stderr one-liners): origin present, projection status, conflict WARN, memory surface = existing hooks/auto-memory model (not “switch to inject-first”). |
| **C7** | Dogfood or documented manual verify plan with `readlink` provenance checks. |

### Non-goals (this wave)

- inject-first redesign; new ambient inject surfaces beyond existing hook behavior
- skill/rule **refinement** product
- memex-hermes **#20** constitution dump into a shareable origin
- forking origin layout (`~/.memex-claude-origin`, etc.)
- mass-migrating live `~/.claude/rules` real files → symlinks in one shot
- skills projection (same pattern later; design allows, impl defer)
- codex-memex-dev cutover; freeze-SHA ownership (memex XO)
- reimplementing core FS policy in the adapter

---

## 3. Core API mapping (Grok proven → Claude)

Thin adapter module (proposed name: `src/core/projection.ts`) mirrors `memex-grok/src/core/projection.ts`.

| Core API | Claude use |
|----------|------------|
| `resolveOriginRoot({ root?, homeDir?, env? })` | Resolve effective origin. Optional explicit root from config extension (see §5). Precedence already includes `legacy-claude` → `~/.local/share/memex-claude`. |
| `defaultOriginRoot` / `legacyClaudeOriginRoot` | Doctor messaging and migration hints only. |
| `planProjection(originRoot, targets, { relinkManaged })` | Build plan for Claude targets. |
| `applyProjection(plan, { onClobber: "fail-closed" })` | Partial apply; leave conflicts untouched. |
| `initSyncRepo` / `syncPull` | Keep existing SessionStart pull; pass **resolved origin root** (not hard-coded `paths.syncRepoDir` alone once resolver is wired). |
| `materializeEntry` | Follow-on for “new rule authored only under harness” → write into origin; **not** required for v1 projection of existing origin rules. |

### 3.1 Projection targets (v1)

```ts
// Pseudocode — names illustrative; verified targetDir sources only.
buildClaudeProjectionTargets(cwd, paths, opts?: { projectOriginRelDir?: string }): ProjectionTarget[] => [
  {
    id: "claude-user-rules",
    targetDir: paths.globalRulesDir,          // ~/.claude/rules
    originRelDir: "rules",
    entryKind: "files",
    pattern: "*.md",
    initTargetDir: true,
  },
  // Only when opts.projectOriginRelDir is explicitly supplied (e.g. projects/<id>/rules):
  // {
  //   id: "claude-project-rules",
  //   targetDir: getProjectRulesDir(cwd),    // <cwd>/.claude/rules
  //   originRelDir: opts.projectOriginRelDir,
  //   entryKind: "files",
  //   pattern: "*.md",
  //   initTargetDir: true,
  // },
]
```

**v1 default:** user/global rules only (same as grok #31). Project rules projection is opt-in to prevent double-linking the same origin `rules/` tree into both dirs.

### 3.2 What Claude must not reimplement

- Absolute-vs-relative symlink policy
- Conflict classification (`real-file`, `real-dir`, `foreign-symlink`, …)
- Origin root precedence chain
- Origin layout schema

---

## 4. Profile “set” signal

**v1 definition (Claude):** projection profile is **set** when:

```text
config.sync.enabled === true
```

Optional future (not blocking): explicit `sync.projectRules === false` to disable projection while keeping pull/copy — **default ON when enabled**, matching grok.

**Not** required for “set”:

- remote `sync.repo` non-empty (local-only origin is valid)
- prior successful projection run
- flotilla desk binding

Sources of truth:

1. `~/.claude/memex.json` `sync` block (primary) via `loadConfig()`
2. Env `MEMEX_ORIGIN` (core resolver) for origin path override
3. Explicit origin root override if/when config gains a field (see §5) — maps to `resolveOriginRoot({ root })`

When profile is **not** set: no projection automation; scan stays as today (harness dirs only; no sync-repo append). Doctor skill notes projection inactive.

---

## 5. Origin root vs `paths.syncRepoDir`

Today SessionStart/Stop/scan hardcode **`paths.syncRepoDir`** = `~/.local/share/memex-claude`.

Core 0.6.0 resolver product default is **`~/.memex`**, with XDG + **legacy-claude** fallbacks when those exist.

| Adapter concern | Recommendation |
|-----------------|----------------|
| Effective origin for pull + projection | Always `resolveOriginRoot({ root: configOriginOverride })` — do **not** invent a third tree |
| `paths.syncRepoDir` | Keep as the **legacy path constant** for docs/compat; prefer passing `origin.root` into `syncPull` / `initSyncRepo` once projection lands so pull and project share one tree |
| Config override | Prefer core-native: optional `sync` extension **or** env `MEMEX_ORIGIN`. Grok added local `repoDir?: string` on its SyncConfig bridge — Claude may mirror that **thin** optional field **or** rely on `MEMEX_ORIGIN` only in v1 to avoid schema drift. **Recommendation:** accept optional `sync.repoDir` (string) in mergeConfig as adapter-local override mapped to `resolveOriginRoot({ root })`, same as grok, until core documents a single JSON field name. |
| Live host with both `~/.memex` and legacy corpus | Resolver returns first existing in precedence; doctor must print `source` (`default` \| `xdg` \| `legacy-claude` \| `env` \| `explicit`) so operators see which tree is active |

**Non-goal this wave:** force-migrate production origin to `~/.memex` (brief: optional follow-on).

---

## 6. When projection runs (entrypoint)

Claude has no CLI doctor/init today. Recommended surfaces (post-gate impl):

| Surface | Role | Rationale |
|---------|------|-----------|
| **SessionStart** (primary) | After successful/attempted `syncPull`, call `runClaudeProjection` (idempotent plan+apply) | Matches existing sync lifecycle; zero new operator CLI habit |
| **Manual / CI** | Optional argv: `memex init [--dry-run] [--strict]` **or** a small `bin/memex-init` script that loads config and runs the same helper | Offline dogfood + CI; only if argv routing is cheap. Prefer sharing one `runClaudeProjection` function. |
| **Doctor skill** | Checklist steps for origin, `readlink`, conflicts; not a separate daemon | Extends existing Claude UX |

**SessionStart failure policy:** projection errors → stderr one-liner + continue hooks (fail-open for session usability). Conflicts → stderr summary; never clobber. Do not block SessionStart on conflicts.

**Strict mode:** only for explicit CLI/CI (`--strict` → non-zero exit when conflicts > 0).

---

## 7. Coexistence with copy-sync (Stop / pull)

This is the **Claude-specific** hard edge (Grok’s Stop write-path was weaker / deferred).

### 7.1 Pull (SessionStart)

1. Resolve origin via core.
2. `syncPull(config, origin.root)` when `enabled && autoPull && repo`.
3. `planProjection` + `applyProjection` for Claude targets.

### 7.2 Push / commit (Stop) when projection active

`syncCommitAndPush` copies **files** from harness dirs into origin. With projected symlinks:

- `stat`/`readFile` **follow** links → content is origin content → mtime compare may noop or rewrite identical bytes (noise risk).
- Real (non-link) files in `~/.claude/rules` remain the local-edit surface that should flow into origin.

**v1 policy (required):**

1. When `rulesProjectionActive(config)`:
   - **Stop copy for rules:** only consider harness entries that are **not** managed symlinks into origin (real files / unmanaged). Implementation options (pick one at impl; prefer A):
     - **A (preferred):** filter source dir before copy — skip paths where `lstat` is symlink and `realpath` is under `origin.root`.
     - **B:** disable rules half of `syncCommitAndPush` when projection active; rely on `materializeEntry` later for new content (larger behavior change).
   - Skills/memory copy behavior **unchanged** in v1 (skills not projected yet).
2. Never delete real harness files to “make room” for links.
3. Origin remains single tree — no write to a parallel corpus.

### 7.3 Operator mental model

| Content class | Where truth lives | Harness appearance |
|---------------|-------------------|--------------------|
| Managed origin rule | Origin | Symlink under `~/.claude/rules` (after projection) |
| Local-only rule (real file, not in origin) | Harness file | Real file; Stop may copy into origin (existing model) |
| Conflict name (real file **and** origin entry) | Both sides untouched for the link | Doctor WARN; operator renames/removes local or origin entry |

---

## 8. Scan / index policy (no double-index)

Update `assembleClaudeScanDirs`:

```text
if sync.enabled:
  append origin skills (unchanged v1)
  append origin project memories (unchanged v1)
  if rulesProjectionActive(config):
    # harness rule dirs only — symlinks resolve to origin content
    do NOT push origin/rules
  else:
    append origin/rules  # legacy copy-scan path
```

Invariant: **one content blob → one index entry** for rules when projection is the delivery path.

Portable `memex://` handles (`buildClaudeScanRoots`) continue to label harness roots; symlink targets under origin remain valid read targets for `readSkillContent` (same as grok).

Optional first-call: if profile set and harness rules dir empty/missing with zero conflicts planned, SessionStart projection already fills links before index build on the same process — **order matters:** project then `index.build` within a session. Today index builds in `main` **before** SessionStart handler… 

**Verified ordering bug risk (`src/main.ts`):**

```
index.build(scanDirs)  // first
switch(event):
  SessionStart → syncPull only today
```

For SessionStart, index is built **before** pull/projection. That is acceptable if:

- pull/projection run, and
- **subsequent** hooks in the same session rebuild or the cache mtime invalidates,

**or** SessionStart path skips index build / rebuilds after projection.

**Impl requirement:** either (1) special-case SessionStart to pull → project → (optional light) rebuild, or (2) document that first prompt after SessionStart rebuilds via cache miss when new links appear. Prefer **(1)** for correctness: run pull+project **before** `index.build` when `hook_event_name === "SessionStart"`, or rebuild after projection. Call out in PR tests.

---

## 9. Doctor / health messaging

Claude doctor is skill-based. Extend `skills/doctor/SKILL.md` with a **G3 section** (and optionally stderr diagnostics from projection runs).

| Check | When | Severity guidance | Message intent |
|-------|------|-------------------|----------------|
| `shared-origin` | always when diagnosing sync | OK if resolved origin exists; WARN if profile set and missing; note `source=` including `legacy-claude` | Origin present / which tree |
| `rules-projection` | profile set | OK if managed links point into origin; WARN if never projected; WARN list **real-file conflicts** (expect many on current dogfood host until names diverge or locals migrate) | Links + no clobber |
| `scan-double-count` | profile set | OK if doctor procedure confirms origin/rules not dual-scanned (document expected code path); WARN if both trees still in scan | One blob → one entry |
| `memory-surface` | always | OK describing **existing** Claude delivery: hooks inject + auto-memory assist/takeover; not “memory = MCP only” (that is Grok wording) | Do **not** regress Claude toward inject-first *novelty*; do **not** claim MCP-primary |
| `pin` | always | WARN if installed `@jim80net/memex-core` major/minor &lt; 0.6 when projection features expected | Pin alignment |

Host-path egress: prefer relative/`~/…` in skill prose; scrub absolute host paths in any machine-emitted reports if a CLI doctor is added later (grok #13 family).

---

## 10. Memory surface (Claude-specific)

| Surface | Stance for G3 |
|---------|----------------|
| UserPromptSubmit inject | **Remains** primary delivery for matched rules/skills/memories (existing product) |
| `autoMemoryMode` assist/takeover | Unchanged |
| MCP | Not Claude’s primary surface; do not add inject-first *as if* Claude lacked delivery |
| File rules projection | Makes **on-disk** rules provenance inspectable for tools/humans/other harnesses sharing origin; hooks still read via index |

**Non-goal wording to avoid in doctor:** “memory = tools you call, not inject” (Grok). Claude doctor should say: **“rules/skills/memories deliver via hooks; projection makes shared-origin files visible under `~/.claude/rules` as symlinks.”**

---

## 11. Implementation sketch (post-gate only — do not start now)

1. **Pin** `@jim80net/memex-core@^0.6.0`; update lockfile; typecheck.
2. **`src/core/projection.ts`:** `isProjectionProfileSet`, `buildClaudeProjectionTargets`, `resolveClaudeOrigin`, `runClaudeProjection`, `rulesProjectionActive` (mirror grok).
3. **Wire SessionStart:** resolve origin → pull into `origin.root` → project; stderr summary.
4. **`assembleClaudeScanDirs`:** skip raw origin/rules when projection active; unit tests.
5. **`main.ts` order:** pull/project before index build on SessionStart (or rebuild after).
6. **Stop coexistence filter** for projected rule symlinks (§7.2A).
7. **Optional** `init` argv or script for dry-run/strict.
8. **Doctor skill** G3 section + tests where code-backed.
9. **USAGE.md / CLAUDE.md** short projection + pin notes.
10. **Dogfood / verify** §12.

---

## 12. Dogfood / verify plan

### 12.1 Preconditions

- Design gated by **memex**.
- Impl merged with pin `^0.6.0`.
- Host has resolvable origin (legacy-claude and/or `~/.memex`).
- `~/.claude/memex.json` with `sync.enabled: true` **or** a scratch config for a non-production home override in tests.

### 12.2 Safe verify (does not require wiping live rules)

1. Unit tests with **temp HOME** / temp origin / temp `~/.claude/rules` — create, idempotent re-run, real-file conflict, foreign symlink, scan no-double-count.
2. Dry-run projection against live config if CLI exists: expect **conflicts** for names already real under `~/.claude/rules`; **zero clobbers**.
3. Optional: empty scratch rules dir + small origin fixture → `readlink` proves origin; SessionStart path in integration test.

### 12.3 Live dogfood (operator host — careful)

1. Confirm baseline: count real vs symlink under `~/.claude/rules`.
2. Place a **unique** origin-only rule name that does **not** exist as a real harness file (e.g. `g3-claude-dogfood-rule.md` under origin `rules/`).
3. Trigger SessionStart (or `memex init`) with profile set.
4. Prove: `readlink` on the new harness entry → under origin root; pre-existing real files untouched.
5. Conflict drill: origin entry matching an existing real file → remains real; conflict listed; content not overwritten.
6. Index: search/inject finds the dogfood rule **once** (no duplicate scores from dual paths).
7. Stop path: projected symlink not re-copied as a noisy rewrite; local-only real file still eligible for copy-up.
8. Record results (paths scrubbed) for memex XO.

### 12.4 Success criteria (chapter done for claude)

- [ ] Design gated by memex
- [ ] Impl PR: pin 0.6.0 + projection + scan policy + Stop filter + doctor skill updates
- [ ] Tests green including conflict + no-double-index
- [ ] Verify §12.2/12.3 evidence captured
- [ ] No new inject-first path; no origin layout fork

---

## 13. Test plan (acceptance)

| Layer | Coverage |
|-------|----------|
| Unit | plan/apply via core with Claude target dirs; idempotent; real-file conflict; profile off no-ops |
| Unit | `assembleClaudeScanDirs` omits origin/rules when projection active |
| Unit | Stop filter skips managed rule symlinks |
| Unit | SessionStart ordering: project before index when event is SessionStart (or rebuild) |
| Integration | existing hook handler tests still pass; no live network required |
| Manual | §12 |

---

## 14. Risks and mitigations

| Risk | Mitigation |
|------|------------|
| 34 live real rules → mass conflicts | Expected; fail-closed; project only free names; no bulk rewrite |
| Double-index harness + origin | §8 scan policy |
| SessionStart index-before-pull | §8 ordering fix |
| Stop copy thrash via followed symlinks | §7.2 filter |
| Origin split `~/.memex` vs legacy-claude | Core resolver + doctor `source=` messaging |
| Pin still 0.5.0 | Impl PR first commit: bump to `^0.6.0` |
| Operators expect “projection = delete my rules” | Doctor + USAGE: never clobber; conflicts are WARN |

---

## 15. Relationship to Grok proven path

| Concern | Grok #31 | Claude (this addendum) |
|---------|----------|-------------------------|
| Core APIs | same | same |
| User rules dir | `~/.grok/rules` | `~/.claude/rules` |
| Project rules | `.grok/rules` opt-in | `.claude/rules` opt-in |
| Profile set | `sync.enabled` | `sync.enabled` |
| CLI init/sync | primary | SessionStart primary; CLI optional |
| Doctor | CLI `memex doctor` | Skill checklist (+ stderr) |
| Memory messaging | MCP tools, not inject | Hooks + auto-memory (existing) |
| Copy-sync Stop | weaker / deferred | **must** filter projected links |

---

## 16. Coordination / backlog settle markers

### For memex (flotilla XO)

- Gate this design PR (systems-review bar).
- After gate: authorize impl PR against pin `^0.6.0`.
- Do not require freeze-SHA from this seat.

### ## Backlog

| Marker | Item | Owner |
|--------|------|-------|
| `[blocked] settle: design-gate` | Impl blocked until this design is gated by memex. | memex |
| `[ready] settle: core-pin` | Core 0.6.0 published; pin bump is impl-step 1. | memex-claude (post-gate) |
| `[follow-on] settle: skills-projection` | Same symlink model for `~/.claude/skills` after rules path proven. | memex-claude |
| `[follow-on] settle: live-rules-migration` | Optional tool to convert identical real files → managed symlinks (content-equal only). | memex-claude / memex |
| `[follow-on] settle: origin-migrate-to-memex` | Optional host migrate legacy-claude → `~/.memex` (core-owned story). | memex-core |
| `[non-goal] settle: inject-first` | Explicitly out of scope. | — |
| `[non-goal] settle: refinement-product` | Deferred by operator. | — |

---

## 17. References (read for this draft)

- G3 brief: `~/workspace/memex-flotilla/briefs/adapter-alignment-g3-2026-07-11.md`
- Product brief: `~/workspace/memex-flotilla/briefs/file-rules-shared-origin-2026-07-10.md`
- Core design: memex-core `design/shared-origin-sync-profile.md` + `src/origin.ts` + `openspec/specs/origin/spec.md`
- Grok design: memex-grok `docs/superpowers/specs/2026-07-10-file-rules-symlink-init.md` (#30)
- Grok impl: memex-grok#31 `src/core/projection.ts`, `src/core/index-init.ts`, doctor checks
- This tree: `src/core/paths.ts`, `src/core/scan-roots.ts`, `src/core/config.ts`, `src/hooks/session-start.ts`, `src/hooks/stop.ts`, `src/main.ts`, `skills/doctor/SKILL.md`, `package.json`
