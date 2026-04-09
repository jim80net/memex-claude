# Auto-Memory Interop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add two operating modes (`assist` / `takeover`) so memex-claude coexists cleanly with Claude Code's built-in auto-memory.

**Architecture:** A single config key `autoMemoryMode` selects the mode. In `assist` (default), memex filters memory types from UserPromptSubmit search. In `takeover`, session-start injects a memory-creation rule and warns if auto-memory is still enabled. Four independent changes compose to implement both modes.

**Tech Stack:** TypeScript, Vitest, @jim80net/memex-core

**Spec:** `docs/specs/2026-04-06-auto-memory-interop-design.md`

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `src/core/config.ts` | Modify | Add `autoMemoryMode` to `SkillRouterConfig`, defaults, merge logic, `isAutoMemoryEnabled()` |
| `src/hooks/user-prompt.ts` | Modify | Accept `autoMemoryMode`, filter memory types in assist mode |
| `src/hooks/session-start.ts` | Modify | Accept `autoMemoryMode`, inject warning or memory-creation rule |
| `src/main.ts` | Modify | Thread `autoMemoryMode` to `handleUserPrompt` and `handleSessionStart` |
| `skills/memory-creation/SKILL.md` | Create | Memory-creation instructions for takeover mode |
| `test/user-prompt.test.ts` | Modify | Tests for assist-mode type filtering |
| `test/session-start.test.ts` | Modify | Tests for takeover warning and rule injection |
| `CLAUDE.md` | Modify | Document `autoMemoryMode` config key |

---

### Task 1: Add `autoMemoryMode` to config

**Files:**
- Modify: `src/core/config.ts:30-40` (SkillRouterConfig type)
- Modify: `src/core/config.ts:42-83` (DEFAULT_CONFIG)
- Modify: `src/core/config.ts:97-142` (mergeConfig)

- [ ] **Step 1: Add `AutoMemoryMode` type and `autoMemoryMode` field to `SkillRouterConfig`**

In `src/core/config.ts`, add the type alias before `SkillRouterConfig` and add the field:

```typescript
export type AutoMemoryMode = "assist" | "takeover";

export type SkillRouterConfig = MemexCoreConfig & {
  autoMemoryMode: AutoMemoryMode;
  skillDirs: string[];
  sync: SyncConfig;
  sleepSchedule: SleepScheduleConfig;
  hooks: {
    UserPromptSubmit: HookConfig;
    PreToolUse: HookConfig;
    Stop: StopHookConfig;
    PreCompact: { enabled: boolean };
  };
};
```

- [ ] **Step 2: Add default value to `DEFAULT_CONFIG`**

Add `autoMemoryMode: "assist"` to `DEFAULT_CONFIG`:

```typescript
export const DEFAULT_CONFIG: SkillRouterConfig = {
  ...DEFAULT_CORE_CONFIG,
  enabled: true,
  autoMemoryMode: "assist",
  skillDirs: [],
  // ... rest unchanged
```

- [ ] **Step 3: Add merge logic for `autoMemoryMode`**

In `mergeConfig()`, add after the `enabled` check:

```typescript
if (user.autoMemoryMode === "assist" || user.autoMemoryMode === "takeover") {
  base.autoMemoryMode = user.autoMemoryMode;
}
```

- [ ] **Step 4: Add `isAutoMemoryEnabled()` utility**

Add at the bottom of `src/core/config.ts`:

```typescript
export function isAutoMemoryEnabled(): boolean {
  return process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY !== "1";
}
```

- [ ] **Step 5: Run typecheck**

Run: `timeout 30 pnpm tsc --noEmit`
Expected: No errors (existing tests still compile)

- [ ] **Step 6: Commit**

```bash
git add src/core/config.ts
git commit -m "feat: add autoMemoryMode config key with assist/takeover modes"
```

---

### Task 2: Type filtering in assist mode (UserPromptSubmit)

**Files:**
- Modify: `test/user-prompt.test.ts`
- Modify: `src/hooks/user-prompt.ts`
- Modify: `src/main.ts:95-98`

- [ ] **Step 1: Write failing test — assist mode filters out memory types**

Add to `test/user-prompt.test.ts` inside the `describe("handleUserPrompt")` block:

```typescript
it("filters memory and session-learning types in assist mode", async () => {
  const searchFn = vi.fn().mockResolvedValue([]);
  const index = makeIndex({ search: searchFn });

  await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG, "assist");

  // Should strip "memory" and "session-learning" from the types list
  expect(searchFn).toHaveBeenCalledWith(
    BASE_INPUT.prompt,
    BASE_CONFIG.topK,
    BASE_CONFIG.threshold,
    ["skill", "workflow", "rule"]
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 30 pnpm test -- --run test/user-prompt.test.ts -t "filters memory"`
Expected: FAIL — `handleUserPrompt` doesn't accept a 4th argument yet

- [ ] **Step 3: Write failing test — takeover mode preserves all types**

Add to `test/user-prompt.test.ts`:

```typescript
it("preserves memory types in takeover mode", async () => {
  const searchFn = vi.fn().mockResolvedValue([]);
  const index = makeIndex({ search: searchFn });

  await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG, "takeover");

  expect(searchFn).toHaveBeenCalledWith(
    BASE_INPUT.prompt,
    BASE_CONFIG.topK,
    BASE_CONFIG.threshold,
    ["skill", "memory", "workflow", "session-learning", "rule"]
  );
});
```

- [ ] **Step 4: Write failing test — assist mode with only memory types returns empty**

Add to `test/user-prompt.test.ts`:

```typescript
it("returns empty in assist mode when only memory types configured", async () => {
  const index = makeIndex();

  const result = await handleUserPrompt(
    BASE_INPUT,
    index,
    { ...BASE_CONFIG, types: ["memory", "session-learning"] },
    "assist"
  );

  expect(result.additionalContext).toBeUndefined();
});
```

- [ ] **Step 5: Update existing tests to pass `autoMemoryMode` parameter**

Every existing call to `handleUserPrompt` in the test file needs a 4th argument. Add `"takeover"` to all existing calls so behavior is unchanged (takeover = no filtering = existing behavior):

Find all `await handleUserPrompt(` calls and append `, "takeover"` as the last argument. There are 8 existing calls:

```typescript
// Each existing call like:
await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG)
// becomes:
await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG, "takeover")
```

Also add the import for `AutoMemoryMode`:

```typescript
import type { HookConfig, AutoMemoryMode } from "../src/core/config.ts";
```

- [ ] **Step 6: Implement — update `handleUserPrompt` signature and add filtering**

In `src/hooks/user-prompt.ts`, update the import and function signature:

```typescript
import type { HookConfig, AutoMemoryMode } from "../core/config.ts";

export async function handleUserPrompt(
  input: HookInput,
  index: SkillIndex,
  hookConfig: HookConfig,
  autoMemoryMode: AutoMemoryMode
): Promise<HookOutput> {
  const prompt = input.prompt;
  if (!prompt || prompt.trim().length === 0) return {};

  // In assist mode, filter out memory types — auto-memory already loaded them
  let types = hookConfig.types;
  if (autoMemoryMode === "assist") {
    types = types.filter(t => t !== "memory" && t !== "session-learning");
    if (types.length === 0) return {};
  }

  // Search for matching entries
  const results = await index.search(
    prompt,
    hookConfig.topK,
    hookConfig.threshold,
    types
  );
```

- [ ] **Step 7: Update `main.ts` to pass `autoMemoryMode`**

In `src/main.ts`, change line 97:

```typescript
case "UserPromptSubmit":
  if (config.hooks.UserPromptSubmit.enabled) {
    result = await handleUserPrompt(input, index, config.hooks.UserPromptSubmit, config.autoMemoryMode);
  }
  break;
```

- [ ] **Step 8: Run all tests to verify they pass**

Run: `timeout 30 pnpm test -- --run test/user-prompt.test.ts`
Expected: All tests PASS

- [ ] **Step 9: Run typecheck**

Run: `timeout 30 pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 10: Commit**

```bash
git add src/hooks/user-prompt.ts src/main.ts test/user-prompt.test.ts
git commit -m "feat: filter memory types from UserPromptSubmit in assist mode"
```

---

### Task 3: Auto-memory warning in takeover mode (SessionStart)

**Files:**
- Modify: `test/session-start.test.ts`
- Modify: `src/hooks/session-start.ts`
- Modify: `src/main.ts:91-93`

- [ ] **Step 1: Write failing test — takeover mode warns when auto-memory is enabled**

Add to `test/session-start.test.ts` inside the `describe("handleSessionStart")` block:

```typescript
it("warns in takeover mode when auto-memory is still enabled", async () => {
  // Simulate CLAUDE_CODE_DISABLE_AUTO_MEMORY not set (auto-memory enabled)
  const prev = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;

  const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "takeover");

  expect(result.additionalContext).toBeDefined();
  expect(result.additionalContext).toContain("takeover mode");
  expect(result.additionalContext).toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY");

  // Restore
  if (prev !== undefined) process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = prev;
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `timeout 30 pnpm test -- --run test/session-start.test.ts -t "warns in takeover"`
Expected: FAIL — `handleSessionStart` doesn't accept a 4th argument

- [ ] **Step 3: Write failing test — takeover mode does NOT warn when auto-memory is disabled**

```typescript
it("does not warn in takeover mode when auto-memory is disabled", async () => {
  const prev = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";

  const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "takeover");

  // Should not contain warning — may contain memory-creation rule instead
  if (result.additionalContext) {
    expect(result.additionalContext).not.toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY");
  }

  // Restore
  if (prev !== undefined) {
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = prev;
  } else {
    delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  }
});
```

- [ ] **Step 4: Write failing test — assist mode does NOT warn even if auto-memory is enabled**

```typescript
it("does not warn in assist mode regardless of auto-memory state", async () => {
  const prev = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;

  const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "assist");

  if (result.additionalContext) {
    expect(result.additionalContext).not.toContain("takeover mode");
  }

  if (prev !== undefined) process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = prev;
});
```

- [ ] **Step 5: Write failing test — warning only fires once (watermark)**

```typescript
it("only warns about auto-memory once (watermark)", async () => {
  const prev = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;

  // First call — should warn
  const result1 = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "takeover");
  expect(result1.additionalContext).toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY");

  // Second call — watermark exists, should not warn again
  const result2 = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "takeover");
  // The additionalContext should either be undefined or not contain the warning
  if (result2.additionalContext) {
    expect(result2.additionalContext).not.toContain("CLAUDE_CODE_DISABLE_AUTO_MEMORY");
  }

  if (prev !== undefined) process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = prev;
});
```

- [ ] **Step 6: Update existing tests to pass `autoMemoryMode` parameter**

All existing `handleSessionStart` calls need a 4th argument. Add `"assist"` to all existing calls (assist = no new behavior = existing behavior):

```typescript
// Each existing call like:
await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED)
// becomes:
await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "assist")
```

Also add the import:

```typescript
import type { SleepScheduleConfig, AutoMemoryMode } from "../src/core/config.ts";
```

- [ ] **Step 7: Implement — update `handleSessionStart` signature and add warning logic**

In `src/hooks/session-start.ts`, add imports and update the function:

```typescript
import type { SleepScheduleConfig, AutoMemoryMode } from "../core/config.ts";
import { isAutoMemoryEnabled } from "../core/config.ts";

export async function handleSessionStart(
  input: HookInput,
  syncConfig: SyncConfig,
  sleepConfig: SleepScheduleConfig,
  autoMemoryMode: AutoMemoryMode
): Promise<HookOutput> {
```

After the sync pull section and before the sleep schedule section, add:

```typescript
  // 3. Auto-memory interop
  if (autoMemoryMode === "takeover" && isAutoMemoryEnabled()) {
    if (!(await hasAutoMemoryWarned())) {
      await writeAutoMemoryWatermark();
      const sections: string[] = [];
      sections.push(buildAutoMemoryWarning());
      // Also inject memory-creation rule (Task 4 will add this)
      return { additionalContext: sections.join("\n\n") };
    }
  }
```

Add the helper functions (modeled on the existing cron watermark pattern):

```typescript
async function hasAutoMemoryWarned(): Promise<boolean> {
  try {
    await readFile(getAutoMemoryWatermarkPath(), "utf-8");
    return true;
  } catch {
    return false;
  }
}

function getAutoMemoryWatermarkPath(): string {
  return join(getClaudePaths().cacheDir, "memex-automemory-warned");
}

async function writeAutoMemoryWatermark(): Promise<void> {
  try {
    const watermarkPath = getAutoMemoryWatermarkPath();
    await mkdir(dirname(watermarkPath), { recursive: true });
    const tmpPath = watermarkPath + "." + randomBytes(4).toString("hex") + ".tmp";
    await writeFile(tmpPath, new Date().toISOString(), "utf-8");
    await rename(tmpPath, watermarkPath);
  } catch {
    // Best-effort
  }
}

function buildAutoMemoryWarning(): string {
  return [
    "## Memex: Auto-memory conflict detected",
    "",
    "Memex is in **takeover mode** but Claude Code auto-memory is still enabled.",
    "This will cause duplicate memory writes — both systems will try to create and manage memory files.",
    "",
    "To disable auto-memory, set `CLAUDE_CODE_DISABLE_AUTO_MEMORY` to `1` in `~/.claude/settings.json`:",
    "",
    "```json",
    '{',
    '  "env": {',
    '    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"',
    "  }",
    "}",
    "```",
    "",
    "Or set `autoMemoryMode` to `assist` in `~/.claude/memex.json` to let auto-memory stay authoritative.",
  ].join("\n");
}
```

- [ ] **Step 8: Update `main.ts` to pass `autoMemoryMode`**

In `src/main.ts`, change the SessionStart case:

```typescript
case "SessionStart":
  result = await handleSessionStart(input, config.sync, config.sleepSchedule, config.autoMemoryMode);
  break;
```

- [ ] **Step 9: Run all session-start tests**

Run: `timeout 30 pnpm test -- --run test/session-start.test.ts`
Expected: All tests PASS

- [ ] **Step 10: Run full test suite + typecheck**

Run: `timeout 30 pnpm test -- --run && timeout 30 pnpm tsc --noEmit`
Expected: All PASS, no type errors

- [ ] **Step 11: Commit**

```bash
git add src/hooks/session-start.ts src/main.ts test/session-start.test.ts
git commit -m "feat: warn when takeover mode conflicts with auto-memory"
```

---

### Task 4: Memory-creation rule for takeover mode

**Files:**
- Create: `skills/memory-creation/SKILL.md`
- Modify: `test/session-start.test.ts`
- Modify: `src/hooks/session-start.ts`

- [ ] **Step 1: Create `skills/memory-creation/SKILL.md`**

```markdown
---
name: memory-creation
description: Instructions for creating and managing memories in memex format (injected in takeover mode)
type: skill
---

# Memory Management

You have a persistent, file-based memory system. Build it up over time so future conversations benefit from what you learn.

## When to save

Save a memory when you learn something that will be useful in **future conversations**:

- **User corrections**: "don't do X", "always use Y" — save as `type: rule`
- **User confirmations**: "yes exactly", "perfect" for a non-obvious approach — save as `type: rule`
- **User profile**: role, expertise, communication preferences — save as `type: memory`
- **Project context**: deadlines, stakeholder decisions, ongoing initiatives — save as `type: memory`
- **Explicit requests**: "remember this" — save as whatever type fits best

## What NOT to save

- Code patterns derivable from reading files
- Git history or recent changes (`git log` is authoritative)
- Debugging solutions (the fix is in the code)
- Anything in CLAUDE.md files
- Ephemeral task details only relevant to this conversation

## How to save

**Step 1** — Write the memory to its own file:

```markdown
---
name: {{short-name}}
description: {{one-line description — be specific, this drives semantic matching}}
type: {{memory | rule | session-learning}}
queries:
  - "{{natural language query that would match this memory}}"
  - "{{another angle someone might ask about this}}"
  - "{{a third variation}}"
  - "{{a fourth variation}}"
  - "{{a fifth variation}}"
---

{{content — keep it concise}}
```

Save to: `~/.claude/projects/<encoded-cwd>/memory/{{short-name}}.md`

The `<encoded-cwd>` is the current working directory with `/` replaced by `-` and `.` replaced by `-`.

**Step 2** — Add a pointer to `MEMORY.md` in the same directory:

```markdown
- [{{short-name}}.md]({{short-name}}.md) — {{one-line hook, under 150 chars}}
```

## Important

- Check for existing memories before writing duplicates
- The `queries` field is critical — it determines when this memory surfaces in future sessions. Write 5 natural language queries that someone might ask when this memory would be relevant.
- Update or remove memories that become wrong or outdated
- Convert relative dates to absolute dates (e.g., "Thursday" -> "2026-04-10")
```

- [ ] **Step 2: Write failing test — takeover mode injects memory-creation rule**

Add to `test/session-start.test.ts`:

```typescript
it("injects memory-creation rule in takeover mode when auto-memory is disabled", async () => {
  const prev = process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = "1";

  const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "takeover");

  expect(result.additionalContext).toBeDefined();
  expect(result.additionalContext).toContain("Memory Management");
  expect(result.additionalContext).toContain("queries");

  if (prev !== undefined) {
    process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY = prev;
  } else {
    delete process.env.CLAUDE_CODE_DISABLE_AUTO_MEMORY;
  }
});
```

- [ ] **Step 3: Write failing test — assist mode does NOT inject memory-creation rule**

```typescript
it("does not inject memory-creation rule in assist mode", async () => {
  const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED, "assist");

  if (result.additionalContext) {
    expect(result.additionalContext).not.toContain("Memory Management");
  }
});
```

- [ ] **Step 4: Run tests to verify they fail**

Run: `timeout 30 pnpm test -- --run test/session-start.test.ts -t "memory-creation"`
Expected: FAIL — no memory-creation rule injection implemented yet

- [ ] **Step 5: Implement — read and inject the memory-creation rule**

In `src/hooks/session-start.ts`, add a function to read the bundled SKILL.md:

```typescript
async function readMemoryCreationRule(): Promise<string> {
  const skillPath = join(getPluginRoot(), "skills", "memory-creation", "SKILL.md");
  try {
    const raw = await readFile(skillPath, "utf-8");
    // Strip frontmatter (everything between first --- and second ---)
    const fmEnd = raw.indexOf("---", 4);
    const body = fmEnd >= 0 ? raw.slice(raw.indexOf("\n", fmEnd) + 1).trim() : raw;
    return `## Memex: Memory creation instructions\n\n${body}`;
  } catch {
    process.stderr.write("memex: could not read memory-creation SKILL.md\n");
    return "";
  }
}
```

Update the takeover section in `handleSessionStart`. The full auto-memory interop block should be:

```typescript
  // 3. Auto-memory interop
  if (autoMemoryMode === "takeover") {
    const sections: string[] = [];

    if (isAutoMemoryEnabled() && !(await hasAutoMemoryWarned())) {
      await writeAutoMemoryWatermark();
      sections.push(buildAutoMemoryWarning());
    }

    // Always inject memory-creation rule in takeover mode
    const rule = await readMemoryCreationRule();
    if (rule) sections.push(rule);

    if (sections.length > 0) {
      // If sleep schedule also wants to inject, combine them
      // (sleep check comes after, so we return early here and let
      //  the sleep check happen on next session if needed)
      return { additionalContext: sections.join("\n\n") };
    }
  }
```

**Note:** This replaces the simpler block from Task 3 Step 7. The warning logic is preserved but now combined with rule injection.

- [ ] **Step 6: Run all session-start tests**

Run: `timeout 30 pnpm test -- --run test/session-start.test.ts`
Expected: All tests PASS

- [ ] **Step 7: Run full test suite + typecheck**

Run: `timeout 30 pnpm test -- --run && timeout 30 pnpm tsc --noEmit`
Expected: All PASS, no type errors

- [ ] **Step 8: Commit**

```bash
git add skills/memory-creation/SKILL.md src/hooks/session-start.ts test/session-start.test.ts
git commit -m "feat: inject memory-creation rule in takeover mode"
```

---

### Task 5: Update CLAUDE.md documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add `autoMemoryMode` to the Architecture section**

In `CLAUDE.md`, add a new subsection after the "Sync" subsection:

```markdown
### Auto-memory interop

The `autoMemoryMode` key in `~/.claude/memex.json` controls how memex coexists with Claude Code's built-in auto-memory:

| Mode | Default | Auto-memory | Memory injection | Memory creation |
|------|---------|-------------|-----------------|-----------------|
| `assist` | Yes | Authoritative | Suppressed (auto-memory handles it) | Auto-memory handles it |
| `takeover` | No | Should be disabled | Memex semantic injection | Session-start rule + manual /reflect, /deep-sleep |

In `assist` mode, memex filters `memory` and `session-learning` types from UserPromptSubmit search. In `takeover` mode, session-start injects a memory-creation rule and warns if `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is not `1`.
```

- [ ] **Step 2: Add to config table or conventions**

If there is a config reference, add `autoMemoryMode` to it. Otherwise the Architecture section addition is sufficient.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document autoMemoryMode config key"
```

---

### Task 6: Final integration verification

- [ ] **Step 1: Run full test suite**

Run: `timeout 30 pnpm test -- --run`
Expected: All tests PASS

- [ ] **Step 2: Run typecheck**

Run: `timeout 30 pnpm tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Verify the default behavior is unchanged**

Confirm: with no `autoMemoryMode` in config, `loadConfig()` returns `autoMemoryMode: "assist"`. In assist mode, UserPromptSubmit filters memory types. SessionStart does not inject warning or rule. This means existing users get assist mode automatically — memex stops double-injecting memories that auto-memory already loaded.

- [ ] **Step 4: Verify takeover behavior end-to-end**

Manually test with `autoMemoryMode: "takeover"` in `~/.claude/memex.json`:
1. SessionStart should inject memory-creation rule
2. If `CLAUDE_CODE_DISABLE_AUTO_MEMORY` is not `1`, should also warn
3. UserPromptSubmit should include memory types in search (not filtered)

- [ ] **Step 5: Squash or tidy commits if needed, then push**

Review the 5 commits from Tasks 1-5. If they tell a clean story, push as-is. If not, consider squashing related commits.
