import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// Resolve repo paths relative to this test file so the test is cwd-independent.
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const hooksJson = JSON.parse(
  readFileSync(join(repoRoot, "hooks", "hooks.json"), "utf-8"),
) as { hooks: Record<string, Array<{ hooks: Array<{ timeout?: number }> }>> };
const mainSource = readFileSync(join(repoRoot, "src", "main.ts"), "utf-8");

/**
 * Extract the hook-event names handled by an explicit `case "Event":` in the
 * main.ts dispatch switch. This is intentionally a source-text scan rather than
 * an import: it asserts the *static registration* (hooks.json) lines up with the
 * *static dispatch* (main.ts) without spawning the heavyweight binary.
 */
function dispatchedEvents(): Set<string> {
  const events = new Set<string>();
  const re = /case\s+"([A-Za-z]+)"\s*:/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(mainSource)) !== null) {
    events.add(m[1]);
  }
  return events;
}

describe("hooks.json registration ↔ main.ts dispatch (issue #50)", () => {
  const registered = Object.keys(hooksJson.hooks);
  const dispatched = dispatchedEvents();

  it("registers only events that main.ts dispatches", () => {
    // A statically-registered hook with no dispatch case cold-starts the
    // ~117 MB binary (memex.bin + onnxruntime) just to no-op — exactly the
    // PreCompact regression. Every registered event must be handled.
    for (const event of registered) {
      expect(
        dispatched.has(event),
        `hooks.json registers "${event}" but main.ts has no \`case "${event}":\` — ` +
          `a registered-but-undispatched hook pays a binary cold-start to no-op`,
      ).toBe(true);
    }
  });

  it("does not register PreCompact (dead breadcrumb hook removed)", () => {
    // PreCompact wrote a breadcrumb nothing consumed and raced its 10s timeout
    // during /compact, surfacing as a recurring "Hook cancelled". It is removed
    // outright; guard against any re-introduction.
    expect(registered).not.toContain("PreCompact");
    expect(dispatched.has("PreCompact")).toBe(false);
    expect(mainSource).not.toContain("PreCompact");
    expect(mainSource).not.toContain("pre-compact");
  });

  it("gives every registered hook at least SessionStart's cold-start headroom", () => {
    // The binary can be evicted from page cache and cold-load ~117 MB on its
    // next firing. SessionStart's 15s timeout is the baseline that survives a
    // cold start; no registered hook should be tighter than that, or it risks
    // the same cancellation PreCompact hit at 10s.
    const sessionStartTimeout =
      hooksJson.hooks.SessionStart[0].hooks[0].timeout ?? 0;
    expect(sessionStartTimeout).toBeGreaterThanOrEqual(15);

    for (const [event, matchers] of Object.entries(hooksJson.hooks)) {
      for (const matcher of matchers) {
        for (const hook of matcher.hooks) {
          // UserPromptSubmit fires on every prompt and is kept warm by design;
          // its 10s budget is fine. Hooks that can cold-start on a quiet window
          // (SessionStart, PreToolUse, Stop) must carry full headroom.
          if (event === "UserPromptSubmit") continue;
          expect(
            hook.timeout ?? 0,
            `${event} timeout must be >= 15s to survive a binary cold-start`,
          ).toBeGreaterThanOrEqual(15);
        }
      }
    }
  });
});
