import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { handleSessionStart } from "../src/hooks/session-start.ts";
import type { HookInput, SyncConfig } from "@jim80net/memex-core";
import type { SleepScheduleConfig } from "../src/core/config.ts";

// Mock homedir
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => join(tmpdir(), "fake-test-home-session-start") };
});

// Mock memex-core functions
vi.mock("@jim80net/memex-core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@jim80net/memex-core")>();
  return {
    ...original,
    syncPull: vi.fn().mockResolvedValue("mocked"),
    loadRegistry: vi.fn().mockResolvedValue({ version: 1, projects: {} }),
    saveRegistry: vi.fn().mockResolvedValue(undefined),
    registerProject: vi.fn(),
    withFileLock: vi.fn(async (_path: string, fn: () => Promise<unknown>) => fn()),
  };
});

// Mock paths
vi.mock("../src/core/paths.ts", () => ({
  getClaudePaths: () => {
    const fakeCache = join(tmpdir(), "fake-test-home-session-start", ".claude", "cache");
    return {
      cacheDir: fakeCache,
      modelsDir: "/fake/models",
      sessionsDir: "/fake/sessions",
      syncRepoDir: "/fake/sync",
      projectsDir: "/fake/projects",
      telemetryPath: "/fake/telemetry.json",
      registryPath: "/fake/registry.json",
      tracesDir: "/fake/traces",
      configPath: "/fake/memex.json",
      preCompactDir: join(fakeCache, "pre-compact"),
      cronWatermarkPath: join(fakeCache, "memex-cron-watermark"),
      globalSkillsDir: "/fake/skills",
      globalRulesDir: "/fake/rules",
    };
  },
}));

// Mock execFile for crontab checks
vi.mock("node:child_process", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:child_process")>();
  return {
    ...original,
    execFile: vi.fn((_cmd: string, _args: string[], _opts: unknown, cb: Function) => {
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
    const { registerProject } = await import("@jim80net/memex-core");
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
    expect(result.additionalContext).toContain("0 3 * * *");
  });

  it("skips cron prompt when watermark is fresh", async () => {
    const watermarkPath = join(fakeHome, ".claude", "cache", "memex-cron-watermark");
    await writeFile(watermarkPath, new Date().toISOString(), "utf-8");

    const result = await handleSessionStart(BASE_INPUT, SYNC_DISABLED, SLEEP_ENABLED);

    expect(result.additionalContext).toBeUndefined();
  });
});
