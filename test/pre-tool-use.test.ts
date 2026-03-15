import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { handlePreToolUse } from "../src/hooks/pre-tool-use.ts";
import type { SkillIndex, HookInput, SkillSearchResult } from "@jim80net/memex-core";
import type { HookConfig } from "../src/core/config.ts";

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

const BASE_CONFIG: HookConfig = {
  enabled: true,
  topK: 2,
  threshold: 0.6,
  maxInjectedChars: 4000,
  types: ["tool-guidance", "skill"],
};

describe("handlePreToolUse", () => {
  const origStderr = process.stderr.write;
  beforeAll(() => { process.stderr.write = vi.fn() as any; });
  afterAll(() => { process.stderr.write = origStderr; });

  it("returns empty when no tool_name provided", async () => {
    const index = makeIndex();
    const result = await handlePreToolUse(
      { hook_event_name: "PreToolUse" },
      index,
      BASE_CONFIG
    );
    expect(result.additionalContext).toBeUndefined();
  });

  it("builds query from tool name and command input", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    await handlePreToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm install express" },
      },
      index,
      BASE_CONFIG
    );

    expect(searchFn).toHaveBeenCalledWith(
      "using Bash: npm install express",
      2,
      0.6,
      ["tool-guidance", "skill"]
    );
  });

  it("injects tool guidance when matched", async () => {
    const match: SkillSearchResult = {
      skill: {
        name: "prefer-pnpm",
        description: "Use pnpm over npm",
        location: "/fake/pnpm/SKILL.md",
        type: "tool-guidance",
        embeddings: [],
        queries: [],
      },
      score: 0.75,
    };
    const index = makeIndex({
      search: vi.fn().mockResolvedValue([match]),
      readSkillContent: vi.fn().mockResolvedValue("Use pnpm instead of npm."),
    });

    const result = await handlePreToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "npm install" },
      },
      index,
      BASE_CONFIG
    );

    expect(result.additionalContext).toContain("Tool Guidance: prefer-pnpm");
    expect(result.additionalContext).toContain("Use pnpm instead of npm");
  });

  it("uses file_path for Read/Write/Edit tools", async () => {
    const searchFn = vi.fn().mockResolvedValue([]);
    const index = makeIndex({ search: searchFn });

    await handlePreToolUse(
      {
        hook_event_name: "PreToolUse",
        tool_name: "Edit",
        tool_input: { file_path: "/home/user/project/src/index.ts" },
      },
      index,
      BASE_CONFIG
    );

    expect(searchFn.mock.calls[0][0]).toContain("/home/user/project/src/index.ts");
  });
});
