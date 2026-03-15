import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { SkillIndex, SkillSearchResult } from "@jim80net/memex-core";
import type { StopHookConfig } from "../src/core/config.ts";

// Mock memex-core sync functions
vi.mock("@jim80net/memex-core", async (importOriginal) => {
  const original = await importOriginal<typeof import("@jim80net/memex-core")>();
  return {
    ...original,
    syncCommitAndPush: vi.fn().mockResolvedValue("mocked"),
  };
});

// Mock paths
vi.mock("../src/core/paths.ts", () => ({
  getClaudePaths: () => ({
    cacheDir: "/fake/cache",
    modelsDir: "/fake/models",
    sessionsDir: "/fake/sessions",
    syncRepoDir: "/fake/sync",
    projectsDir: "/fake/projects",
    telemetryPath: "/fake/telemetry.json",
    registryPath: "/fake/registry.json",
    tracesDir: "/fake/traces",
  }),
  getProjectMemoryDir: () => "/fake/memory",
}));

function makeIndex(overrides: Partial<SkillIndex> = {}): SkillIndex {
  return {
    skillCount: 0,
    build: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    readSkillContent: vi.fn().mockResolvedValue(""),
    needsRebuild: vi.fn().mockReturnValue(false),
    ...overrides,
  } as unknown as SkillIndex;
}

const BASE_CONFIG: StopHookConfig = {
  enabled: true,
  extractLearnings: false,
  extractionModel: "",
  behavioralRules: true,
};

describe("Stop hook logic", () => {
  let tmpDir: string;

  beforeAll(() => { process.stderr.write = vi.fn() as any; });

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `stop-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("searches for stop-rules using last assistant response", async () => {
    const transcriptPath = join(tmpDir, "transcript.jsonl");
    await writeFile(
      transcriptPath,
      [
        JSON.stringify({ role: "user", content: "fix the bug" }),
        JSON.stringify({ role: "assistant", content: "That change is out of scope for this PR." }),
      ].join("\n")
    );

    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    const { handleStop } = await import("../src/hooks/stop.ts");

    await handleStop(
      {
        hook_event_name: "Stop",
        transcript_path: transcriptPath,
      },
      index,
      BASE_CONFIG
    );

    expect(searchFn).toHaveBeenCalledWith(
      expect.stringContaining("out of scope"),
      3,
      0.6,
      ["stop-rule"]
    );
  });

  it("does not search when behavioralRules is false", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    const { handleStop } = await import("../src/hooks/stop.ts");

    await handleStop(
      {
        hook_event_name: "Stop",
        transcript_path: join(tmpDir, "nonexistent.jsonl"),
      },
      index,
      { ...BASE_CONFIG, behavioralRules: false }
    );

    expect(searchFn).not.toHaveBeenCalled();
  });

  it("does not search when no transcript path", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    const { handleStop } = await import("../src/hooks/stop.ts");

    await handleStop(
      { hook_event_name: "Stop" },
      index,
      BASE_CONFIG
    );

    expect(searchFn).not.toHaveBeenCalled();
  });
});
