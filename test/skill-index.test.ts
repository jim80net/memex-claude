import { describe, it, expect, vi, beforeEach, afterEach, afterAll } from "vitest";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { parseFrontmatter, parseMemoryFile, SkillIndex } from "../src/core/skill-index.ts";
import { cosineSimilarity } from "../src/core/embeddings.ts";
import { DEFAULT_CONFIG } from "../src/core/config.ts";

// Mock homedir and cache so tests don't touch real files
vi.mock("node:os", async (importOriginal) => {
  const original = await importOriginal<typeof import("node:os")>();
  return { ...original, homedir: () => join(tmpdir(), "fake-test-home-csr") };
});

// Mock cache module to avoid real file I/O
vi.mock("../src/core/cache.ts", () => ({
  loadCache: vi.fn().mockResolvedValue({ version: 1, embeddingModel: "Xenova/all-MiniLM-L6-v2", skills: {} }),
  saveCache: vi.fn().mockResolvedValue(undefined),
  getCachedSkill: vi.fn().mockReturnValue(undefined),
  setCachedSkill: vi.fn(),
  removeCachedSkill: vi.fn(),
}));

// Mock embeddings to avoid loading ONNX model in tests
const mockEmbedTexts = vi.fn();
vi.mock("../src/core/embeddings.ts", async (importOriginal) => {
  const original = await importOriginal<typeof import("../src/core/embeddings.ts")>();
  return {
    ...original,
    embedTexts: (...args: unknown[]) => mockEmbedTexts(...args),
  };
});

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

describe("parseFrontmatter", () => {
  it("parses name, description, and type from frontmatter", () => {
    const content = `---
name: weather
description: "Get current weather and forecasts"
type: skill
---
# Weather Skill

Do stuff with weather.`;
    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBe("weather");
    expect(meta.description).toBe("Get current weather and forecasts");
    expect(meta.type).toBe("skill");
    expect(body).toContain("# Weather Skill");
  });

  it("handles single-quoted values", () => {
    const content = `---\nname: 'my-skill'\ndescription: 'A skill'\n---\nbody`;
    const { meta } = parseFrontmatter(content);
    expect(meta.name).toBe("my-skill");
    expect(meta.description).toBe("A skill");
  });

  it("handles unquoted values", () => {
    const content = `---\nname: simple\ndescription: plain description\n---\nbody`;
    const { meta } = parseFrontmatter(content);
    expect(meta.name).toBe("simple");
    expect(meta.description).toBe("plain description");
  });

  it("returns empty meta when no frontmatter present", () => {
    const content = "# Just a heading\n\nSome content.";
    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBeUndefined();
    expect(meta.description).toBeUndefined();
    expect(body).toBe(content);
  });

  it("parses queries list from frontmatter", () => {
    const content = `---
name: weather
description: Get weather
queries:
  - "What is the weather today?"
  - "Show me the forecast"
  - "Is it going to rain?"
---
# Weather`;
    const { meta } = parseFrontmatter(content);
    expect(meta.queries).toHaveLength(3);
    expect(meta.queries?.[0]).toBe("What is the weather today?");
    expect(meta.queries?.[1]).toBe("Show me the forecast");
    expect(meta.queries?.[2]).toBe("Is it going to rain?");
  });

  it("parses type: memory", () => {
    const content = `---\nname: prefer-bun\ndescription: Use bun over npm\ntype: memory\n---\nUse bun.`;
    const { meta } = parseFrontmatter(content);
    expect(meta.type).toBe("memory");
  });

  it("defaults type to undefined when not specified", () => {
    const content = `---\nname: test\ndescription: desc\n---\nbody`;
    const { meta } = parseFrontmatter(content);
    expect(meta.type).toBeUndefined();
  });

  it("parses rule frontmatter with paths, hooks, keywords, one-liner", () => {
    const content = `---
name: prefer-pnpm
description: "Use pnpm instead of npm"
type: rule
one-liner: "Use pnpm, not npm."
paths:
  - "package.json"
  - "*.ts"
hooks:
  - UserPromptSubmit
  - PreToolUse
keywords:
  - pnpm
  - "package manager"
queries:
  - "install dependencies"
  - "npm install"
---
Always use pnpm for all package management.`;
    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBe("prefer-pnpm");
    expect(meta.type).toBe("rule");
    expect(meta.oneLiner).toBe("Use pnpm, not npm.");
    expect(meta.paths).toEqual(["package.json", "*.ts"]);
    expect(meta.hooks).toEqual(["UserPromptSubmit", "PreToolUse"]);
    expect(meta.keywords).toEqual(["pnpm", "package manager"]);
    expect(meta.queries).toEqual(["install dependencies", "npm install"]);
    expect(body).toContain("Always use pnpm");
  });

  it("handles rule files without frontmatter", () => {
    const content = "Always use pnpm instead of npm.";
    const { meta, body } = parseFrontmatter(content);
    expect(meta.name).toBeUndefined();
    expect(body).toBe(content);
  });
});

// ---------------------------------------------------------------------------
// Memory file parsing
// ---------------------------------------------------------------------------

describe("parseMemoryFile", () => {
  it("extracts sections with triggers", () => {
    const content = `# Project Memory

## Prefer Bun
Always use bun instead of npm

Triggers: "install dependencies", "npm install", "package manager"

## File Structure
The project uses src/ for source code

Triggers: "where are files", "project structure"
`;
    const sections = parseMemoryFile(content, "/test/memory.md");
    expect(sections).toHaveLength(2);
    expect(sections[0].name).toBe("Prefer Bun");
    expect(sections[0].queries).toEqual(["install dependencies", "npm install", "package manager"]);
    expect(sections[0].body).toContain("Always use bun");
    expect(sections[1].name).toBe("File Structure");
    expect(sections[1].queries).toHaveLength(2);
  });

  it("handles sections without triggers", () => {
    const content = `## No Triggers Here
Just some info about the project.
`;
    const sections = parseMemoryFile(content, "/test/memory.md");
    expect(sections).toHaveLength(1);
    expect(sections[0].queries).toEqual([]);
    expect(sections[0].body).toContain("Just some info");
  });

  it("skips headings with no content", () => {
    const content = `## Empty Section
`;
    const sections = parseMemoryFile(content, "/test/memory.md");
    expect(sections).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Cosine similarity
// ---------------------------------------------------------------------------

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    expect(cosineSimilarity([1, 2, 3, 4], [1, 2, 3, 4])).toBeCloseTo(1.0);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0.0);
  });

  it("returns -1 for opposite vectors", () => {
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1.0);
  });

  it("returns 0 for zero vectors", () => {
    expect(cosineSimilarity([0, 0], [1, 2])).toBe(0);
  });

  it("returns 0 for mismatched lengths", () => {
    expect(cosineSimilarity([1, 2], [1, 2, 3])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// SkillIndex build + search (mocked embeddings)
// ---------------------------------------------------------------------------

describe("SkillIndex", () => {
  let testDir: string;

  function makeEmbeddings(count: number): number[][] {
    return Array.from({ length: count }, (_, i) =>
      Array.from({ length: 4 }, (_, j) => (j === i % 4 ? 1 : 0))
    );
  }

  beforeEach(async () => {
    testDir = join(tmpdir(), `skill-index-test-${Date.now()}`);
    // Create project-local .claude/skills/ structure
    await mkdir(join(testDir, ".claude", "skills", "weather"), { recursive: true });
    await mkdir(join(testDir, ".claude", "skills", "git"), { recursive: true });

    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\ndescription: Get current weather and forecasts\n---\n# Weather\n\nFetch weather data.`
    );
    await writeFile(
      join(testDir, ".claude", "skills", "git", "SKILL.md"),
      `---\nname: git\ndescription: Git version control operations\n---\n# Git\n\nRun git commands.`
    );

    mockEmbedTexts.mockReset();
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("builds an index from project skills", async () => {
    mockEmbedTexts.mockResolvedValueOnce(makeEmbeddings(2));

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    expect(index.skillCount).toBe(2);
    expect(mockEmbedTexts).toHaveBeenCalledTimes(1);
    expect(mockEmbedTexts.mock.calls[0][0]).toHaveLength(2);
  });

  it("uses frontmatter queries when present", async () => {
    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\ndescription: Get weather\nqueries:\n  - "What is the weather?"\n  - "Will it rain?"\n  - "Temperature today"\n---\n# Weather`
    );
    // 3 queries for weather + 1 description fallback for git = 4 total
    mockEmbedTexts.mockResolvedValueOnce([
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [1, 0, 0, 0],
      [0, 1, 0, 0],
    ]);

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    expect(index.skillCount).toBe(2);
    expect(mockEmbedTexts.mock.calls[0][0]).toHaveLength(4);
  });

  it("search returns results above threshold", async () => {
    mockEmbedTexts
      .mockResolvedValueOnce(makeEmbeddings(2))
      .mockResolvedValueOnce([[1, 0, 0, 0]]);

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    const results = await index.search("what is the weather?", 3, 0.5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it("search filters results below threshold", async () => {
    mockEmbedTexts
      .mockResolvedValueOnce(makeEmbeddings(2))
      .mockResolvedValueOnce([[1, 0, 0, 0]]);

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    const results = await index.search("weather", 3, 0.65);
    expect(results).toHaveLength(1);
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it("search filters by type", async () => {
    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\ndescription: Get weather\ntype: memory\n---\nWeather info.`
    );

    mockEmbedTexts
      .mockResolvedValueOnce(makeEmbeddings(2))
      .mockResolvedValueOnce([[0.5, 0.5, 0, 0]]);

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    // Only match "skill" type — weather is "memory", git is "skill"
    const results = await index.search("anything", 3, 0.0, ["skill"]);
    const names = results.map((r) => r.skill.name);
    expect(names).not.toContain("weather");
    expect(names).toContain("git");
  });

  it("search respects topK limit", async () => {
    mockEmbedTexts
      .mockResolvedValueOnce(makeEmbeddings(2))
      .mockResolvedValueOnce([[1, 1, 0, 0]]);

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    const results = await index.search("anything", 1, 0.0);
    expect(results).toHaveLength(1);
  });

  it("readSkillContent strips frontmatter and returns body", async () => {
    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    const location = join(testDir, ".claude", "skills", "weather", "SKILL.md");
    const content = await index.readSkillContent(location);
    expect(content).toContain("Fetch weather data");
    expect(content).not.toContain("---");
  });

  it("handles empty workspace gracefully", async () => {
    const emptyDir = join(tmpdir(), `empty-workspace-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(emptyDir);

    expect(index.skillCount).toBe(0);
    expect(mockEmbedTexts).not.toHaveBeenCalled();

    await rm(emptyDir, { recursive: true, force: true });
  });

  it("indexes rule files from .claude/rules/", async () => {
    // Create a rules directory with a rule file
    await mkdir(join(testDir, ".claude", "rules"), { recursive: true });
    await writeFile(
      join(testDir, ".claude", "rules", "prefer-pnpm.md"),
      `---
name: prefer-pnpm
description: "Use pnpm instead of npm"
type: rule
one-liner: "Use pnpm, not npm."
queries:
  - "install dependencies"
  - "npm install"
---
Always use pnpm for all package management.`
    );

    // 2 skills + 1 rule (2 queries) = 4 embeddings
    mockEmbedTexts.mockResolvedValueOnce(makeEmbeddings(4));

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    expect(index.skillCount).toBe(3);
  });

  it("indexes rule files without frontmatter using filename as name", async () => {
    await mkdir(join(testDir, ".claude", "rules"), { recursive: true });
    await writeFile(
      join(testDir, ".claude", "rules", "no-console-log.md"),
      "Do not use console.log in production code. Use a proper logger instead."
    );

    // 2 skills + 1 rule (1 fallback query) = 3 embeddings
    mockEmbedTexts.mockResolvedValueOnce(makeEmbeddings(3));

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    expect(index.skillCount).toBe(3);
  });

  it("skips SKILL.md files with missing name or description", async () => {
    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\n---\n# Missing description`
    );
    // Only git skill is valid
    mockEmbedTexts.mockResolvedValueOnce(makeEmbeddings(1));

    const index = new SkillIndex({ ...DEFAULT_CONFIG });
    await index.build(testDir);

    expect(index.skillCount).toBe(1);
  });
});
