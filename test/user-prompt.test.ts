import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { handleUserPrompt } from "../src/hooks/user-prompt.ts";
import type { SkillIndex } from "../src/core/skill-index.ts";
import type { HookConfig, HookInput, SkillSearchResult } from "../src/core/types.ts";

function makeIndex(overrides: Partial<SkillIndex> = {}): SkillIndex {
  return {
    skillCount: 0,
    build: vi.fn().mockResolvedValue(undefined),
    search: vi.fn().mockResolvedValue([]),
    readSkillContent: vi.fn().mockResolvedValue(""),
    ...overrides,
  } as unknown as SkillIndex;
}

const BASE_CONFIG: HookConfig = {
  enabled: true,
  topK: 3,
  threshold: 0.5,
  maxInjectedChars: 8000,
  types: ["skill", "memory", "workflow", "session-learning"],
};

const BASE_INPUT: HookInput = {
  hook_event_name: "UserPromptSubmit",
  prompt: "how do I check the weather?",
  cwd: "/fake/workspace",
};

describe("handleUserPrompt", () => {
  // Suppress stderr in tests
  const origStderr = process.stderr.write;
  beforeAll(() => { process.stderr.write = vi.fn() as any; });
  afterAll(() => { process.stderr.write = origStderr; });

  it("returns empty when no skills match", async () => {
    const index = makeIndex({ search: vi.fn().mockResolvedValue([]) });
    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);
    expect(result.additionalContext).toBeUndefined();
  });

  it("returns empty for empty prompt", async () => {
    const index = makeIndex();
    const result = await handleUserPrompt(
      { ...BASE_INPUT, prompt: "" },
      index,
      BASE_CONFIG
    );
    expect(result.additionalContext).toBeUndefined();
  });

  it("injects matched skill content as additionalContext", async () => {
    const match: SkillSearchResult = {
      skill: {
        name: "weather",
        description: "Get weather",
        location: "/fake/skills/weather/SKILL.md",
        type: "skill",
        embeddings: [],
        queries: [],
        mtime: 0,
      },
      score: 0.92,
    };
    const index = makeIndex({
      search: vi.fn().mockResolvedValue([match]),
      readSkillContent: vi.fn().mockResolvedValue("# Weather\n\nFetch weather data."),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);

    expect(result.additionalContext).toBeDefined();
    expect(result.additionalContext).toContain("Matched Skill: weather");
    expect(result.additionalContext).toContain("92%");
    expect(result.additionalContext).toContain("Fetch weather data");
  });

  it("labels memory-type skills as Recalled Memory", async () => {
    const match: SkillSearchResult = {
      skill: {
        name: "prefer-bun",
        description: "Use bun over npm",
        location: "/fake/skills/bun/SKILL.md",
        type: "memory",
        embeddings: [],
        queries: [],
        mtime: 0,
      },
      score: 0.88,
    };
    const index = makeIndex({
      search: vi.fn().mockResolvedValue([match]),
      readSkillContent: vi.fn().mockResolvedValue("Use bun instead of npm."),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);

    expect(result.additionalContext).toContain("Recalled Memory: prefer-bun");
  });

  it("respects maxInjectedChars limit", async () => {
    const bigContent = "x".repeat(5000);
    const matches: SkillSearchResult[] = [
      {
        skill: { name: "skill-a", description: "A", location: "/a", type: "skill", embeddings: [], queries: [], mtime: 0 },
        score: 0.9,
      },
      {
        skill: { name: "skill-b", description: "B", location: "/b", type: "skill", embeddings: [], queries: [], mtime: 0 },
        score: 0.8,
      },
    ];
    const index = makeIndex({
      search: vi.fn().mockResolvedValue(matches),
      readSkillContent: vi.fn().mockResolvedValue(bigContent),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, {
      ...BASE_CONFIG,
      maxInjectedChars: 6000,
    });

    expect(result.additionalContext).toContain("skill-a");
    expect(result.additionalContext).not.toContain("skill-b");
  });

  it("passes type filter to search", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    await handleUserPrompt(BASE_INPUT, index, {
      ...BASE_CONFIG,
      types: ["memory", "workflow"],
    });

    expect(searchFn).toHaveBeenCalledWith(
      BASE_INPUT.prompt,
      BASE_CONFIG.topK,
      BASE_CONFIG.threshold,
      ["memory", "workflow"]
    );
  });

  it("skips unreadable skill files and continues", async () => {
    const matches: SkillSearchResult[] = [
      {
        skill: { name: "bad", description: "bad", location: "/bad", type: "skill", embeddings: [], queries: [], mtime: 0 },
        score: 0.9,
      },
      {
        skill: { name: "good", description: "good", location: "/good", type: "skill", embeddings: [], queries: [], mtime: 0 },
        score: 0.85,
      },
    ];
    const index = makeIndex({
      search: vi.fn().mockResolvedValue(matches),
      readSkillContent: vi
        .fn()
        .mockRejectedValueOnce(new Error("file not found"))
        .mockResolvedValueOnce("Good content"),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);

    expect(result.additionalContext).toContain("good");
    expect(result.additionalContext).not.toContain("bad");
  });
});
