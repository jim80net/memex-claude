import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleSessionStart } from "../src/hooks/session-start.ts";
import type { HookInput, SyncConfig, SleepScheduleConfig } from "../src/core/types.ts";

// Mock homedir
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => join(tmpdir(), "fake-test-home-session-start") };
});

// Mock sync to avoid git operations
vi.mock("../src/core/sync.ts", () => ({
  syncPull: vi.fn().mockResolvedValue("mocked"),
}));

// Mock project registry
vi.mock("../src/core/project-registry.ts", () => ({
  loadRegistry: vi.fn().mockResolvedValue({ version: 1, projects: {} }),
  saveRegistry: vi.fn().mockResolvedValue(undefined),
  registerProject: vi.fn(),
}));

// Mock execFile for crontab checks
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return {
    ...original,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
      // Simulate empty crontab
      cb(new Error("no crontab"), "", "");
    }),
  };
});

const BASE_INPUT: HookInput = {
  hook_event_name: "SessionStart",
  cwd: "/fake/project",
  session_id: "test-session",
};

const SYNC_DISABLED: SyncConfig = {
  enabled: false,
  repo: "",
  autoPull: false,
  autoCommitPush: false,
  projectMappings: {},
};

const SLEEP_DISABLED: SleepScheduleConfig = {
  enabled: false,
  dailyAt: "03:00",
  projects: [],
};

const SLEEP_ENABLED: SleepScheduleConfig = {
  enabled: true,
  dailyAt: "03:00",
  projects: [],
};

describe("handleSessionStart", () => {
  const fakeHome = join(tmpdir(), "fake-test-home-session-start");

  // Suppress stderr
  const origStderr = process.stderr.write;
  beforeEach(async () => {
    process.stderr.write = vi.fn() as any;
    await mkdir(join(fakeHome, ".claude", "cache"), { recursive: true });
  });
  afterEach(async () => {
    process.stderr.write = origStderr;
    await rm(fakeHome, { recursive: true, force: true });
  });

  it("returns empty output when sleep schedule is disabled", async () => {
    const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED);
    expect(result).toEqual({});
  });

  it("registers project on every session start", async () => {
    const { registerProject } = await import("../src/core/project-registry.ts");
    (registerProject as ReturnType<typeof vi.fn>).mockClear();

    await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_DISABLED);

    expect(registerProject).toHaveBeenCalledWith(
      expect.any(Object),
      "/fake/project"
    );
  });

  it("returns cron setup instructions when sleep schedule enabled and no cron exists", async () => {
    const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_ENABLED);

    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain("sleep schedule setup needed");
    expect(result.additionalContext).toContain("03:00");
  });

  it("defaults to 03:00 when dailyAt is malformed", async () => {
    const malformed: SleepScheduleConfig = { enabled: true, dailyAt: "garbage", projects: [] };
    const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, malformed);

    expect(result.additionalContext).toBeDefined();
    // Should fall back to "0 3 * * *"
    expect(result.additionalContext).toContain("0 3 * * *");
  });

  it("skips cron prompt when watermark is fresh", async () => {
    // Write a fresh watermark
    const watermarkPath = join(fakeHome, ".claude", "cache", "skill-router-cron-watermark");
    await writeFile(watermarkPath, new Date().toISOString(), "utf-8");

    const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_ENABLED);

    expect(result.additionalContext).toBeUndefined();
  });
});
