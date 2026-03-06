import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { handleUserPrompt } from "../src/hooks/user-prompt.ts";
import type { SkillIndex } from "../src/core/skill-index.ts";
import type { HookConfig, HookInput, SkillSearchResult } from "../src/core/types.ts";

// Mock session module to avoid filesystem side effects
vi.mock("../src/core/session.ts", () => ({
  loadSession: vi.fn().mockResolvedValue({ sessionId: "test", shownRules: {} }),
  saveSession: vi.fn().mockResolvedValue(undefined),
  hasRuleBeenShown: vi.fn().mockReturnValue(false),
  markRuleShown: vi.fn(),
}));

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
  types: ["skill", "memory", "workflow", "session-learning", "rule"],
};

const BASE_INPUT: HookInput = {
  hook_event_name: "UserPromptSubmit",
  prompt: "how do I check the weather?",
  cwd: "/fake/workspace",
  session_id: "test-session",
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

  it("injects skill teaser (not full content) for skill type", async () => {
    const match: SkillSearchResult = {
      skill: {
        name: "weather",
        description: "Get weather forecasts",
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
    expect(result.additionalContext).toContain("Available Skill: weather");
    expect(result.additionalContext).toContain("Get weather forecasts");
    expect(result.additionalContext).toContain("92%");
    // Should NOT contain full content — only teaser
    expect(result.additionalContext).not.toContain("Fetch weather data");
    expect(result.additionalContext).toContain("read the full instructions at");
  });

  it("injects full content for memory type", async () => {
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
    expect(result.additionalContext).toContain("Use bun instead of npm.");
  });

  it("injects full content for rule on first match", async () => {
    const { hasRuleBeenShown } = await import("../src/core/session.ts");
    (hasRuleBeenShown as ReturnType<typeof vi.fn>).mockReturnValue(false);

    const match: SkillSearchResult = {
      skill: {
        name: "prefer-pnpm",
        description: "Use pnpm instead of npm",
        location: "/fake/rules/prefer-pnpm.md",
        type: "rule",
        embeddings: [],
        queries: [],
        mtime: 0,
        oneLiner: "Use pnpm, not npm.",
      },
      score: 0.85,
    };
    const index = makeIndex({
      search: vi.fn().mockResolvedValue([match]),
      readSkillContent: vi.fn().mockResolvedValue("Always use pnpm for package management.\n- pnpm install\n- pnpm add <pkg>"),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);

    expect(result.additionalContext).toContain("Rule: prefer-pnpm");
    expect(result.additionalContext).toContain("Always use pnpm for package management.");
  });

  it("injects one-liner for rule on subsequent match", async () => {
    const { hasRuleBeenShown } = await import("../src/core/session.ts");
    (hasRuleBeenShown as ReturnType<typeof vi.fn>).mockReturnValue(true);

    const match: SkillSearchResult = {
      skill: {
        name: "prefer-pnpm",
        description: "Use pnpm instead of npm",
        location: "/fake/rules/prefer-pnpm.md",
        type: "rule",
        embeddings: [],
        queries: [],
        mtime: 0,
        oneLiner: "Use pnpm, not npm.",
      },
      score: 0.85,
    };
    const index = makeIndex({
      search: vi.fn().mockResolvedValue([match]),
    });

    const result = await handleUserPrompt(BASE_INPUT, index, BASE_CONFIG);

    expect(result.additionalContext).toContain("Rule reminder: prefer-pnpm");
    expect(result.additionalContext).toContain("Use pnpm, not npm.");
    // Should NOT contain full content
    expect(result.additionalContext).not.toContain("Always use pnpm for package management");
  });

  it("respects maxInjectedChars limit", async () => {
    const bigContent = "x".repeat(5000);
    const matches: SkillSearchResult[] = [
      {
        skill: { name: "skill-a", description: "A", location: "/a", type: "memory", embeddings: [], queries: [], mtime: 0 },
        score: 0.9,
      },
      {
        skill: { name: "skill-b", description: "B", location: "/b", type: "memory", embeddings: [], queries: [], mtime: 0 },
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
        skill: { name: "bad", description: "bad", location: "/bad", type: "memory", embeddings: [], queries: [], mtime: 0 },
        score: 0.9,
      },
      {
        skill: { name: "good", description: "good", location: "/good", type: "memory", embeddings: [], queries: [], mtime: 0 },
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
