import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { loadSession, saveSession, hasRuleBeenShown, markRuleShown } from "../src/core/session.ts";

// Mock homedir so tests don't touch real files
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => join(tmpdir(), "fake-test-home-session") };
});

describe("session state", () => {
  const fakeHome = join(tmpdir(), "fake-test-home-session");

  beforeEach(async () => {
    await mkdir(join(fakeHome, ".claude", "cache", "sessions"), { recursive: true });
  });

  afterEach(async () => {
    await rm(fakeHome, { recursive: true, force: true });
  });

  it("returns empty state for unknown session", async () => {
    const state = await loadSession("nonexistent");
    expect(state.sessionId).toBe("nonexistent");
    expect(state.shownRules).toEqual({});
  });

  it("returns empty state when no session id", async () => {
    const state = await loadSession(undefined);
    expect(state.sessionId).toBe("");
    expect(state.shownRules).toEqual({});
  });

  it("saves and loads session state", async () => {
    const state = { sessionId: "test-123", shownRules: { "/rules/foo.md": 1000 } };
    await saveSession(state);

    const loaded = await loadSession("test-123");
    expect(loaded.sessionId).toBe("test-123");
    expect(loaded.shownRules["/rules/foo.md"]).toBe(1000);
  });

  it("hasRuleBeenShown returns false for unseen rules", () => {
    const state = { sessionId: "test", shownRules: {} };
    expect(hasRuleBeenShown(state, "/rules/new.md")).toBe(false);
  });

  it("hasRuleBeenShown returns true after markRuleShown", () => {
    const state = { sessionId: "test", shownRules: {} };
    markRuleShown(state, "/rules/new.md");
    expect(hasRuleBeenShown(state, "/rules/new.md")).toBe(true);
  });
});
