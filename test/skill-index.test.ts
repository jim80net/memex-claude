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
  loadCache: vi.fn().mockResolvedValue({ version: 1, embeddingModel: "text-embedding-3-small", skills: {} }),
  saveCache: vi.fn().mockResolvedValue(undefined),
  getCachedSkill: vi.fn().mockReturnValue(undefined),
  setCachedSkill: vi.fn(),
  removeCachedSkill: vi.fn(),
}));

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
// SkillIndex build + search (mocked embeddings API)
// ---------------------------------------------------------------------------

describe("SkillIndex", () => {
  let testDir: string;
  const mockFetch = vi.fn();
  const origFetch = global.fetch;

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

    mockFetch.mockReset();
    global.fetch = mockFetch;
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  afterAll(() => {
    global.fetch = origFetch;
  });

  function makeEmbeddingResponse(count: number) {
    const data: Array<{ index: number; embedding: number[] }> = [];
    for (let i = 0; i < count; i++) {
      data.push({
        index: i,
        embedding: Array.from({ length: 4 }, (_, j) => (j === i % 4 ? 1 : 0)),
      });
    }
    return { ok: true, json: async () => ({ data }) };
  }

  it("builds an index from project skills", async () => {
    mockFetch.mockResolvedValueOnce(makeEmbeddingResponse(2));

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    expect(index.skillCount).toBe(2);
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe("https://api.openai.com/v1/embeddings");
  });

  it("uses frontmatter queries when present", async () => {
    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\ndescription: Get weather\nqueries:\n  - "What is the weather?"\n  - "Will it rain?"\n  - "Temperature today"\n---\n# Weather`
    );
    // 3 queries for weather + 1 description fallback for git = 4 total
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: [
          { index: 0, embedding: [1, 0, 0, 0] },
          { index: 1, embedding: [1, 0, 0, 0] },
          { index: 2, embedding: [1, 0, 0, 0] },
          { index: 3, embedding: [0, 1, 0, 0] },
        ],
      }),
    });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    expect(index.skillCount).toBe(2);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body as string);
    expect(body.input).toHaveLength(4);
  });

  it("search returns results above threshold", async () => {
    mockFetch
      .mockResolvedValueOnce(makeEmbeddingResponse(2))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] }),
      });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    const results = await index.search("what is the weather?", 3, 0.5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].score).toBeCloseTo(1.0);
  });

  it("search filters results below threshold", async () => {
    mockFetch
      .mockResolvedValueOnce(makeEmbeddingResponse(2))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [1, 0, 0, 0] }] }),
      });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
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

    mockFetch
      .mockResolvedValueOnce(makeEmbeddingResponse(2))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [0.5, 0.5, 0, 0] }] }),
      });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    // Only match "skill" type — weather is "memory", git is "skill"
    const results = await index.search("anything", 3, 0.0, ["skill"]);
    const names = results.map((r) => r.skill.name);
    expect(names).not.toContain("weather");
    expect(names).toContain("git");
  });

  it("search respects topK limit", async () => {
    mockFetch
      .mockResolvedValueOnce(makeEmbeddingResponse(2))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: [{ index: 0, embedding: [1, 1, 0, 0] }] }),
      });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    const results = await index.search("anything", 1, 0.0);
    expect(results).toHaveLength(1);
  });

  it("readSkillContent strips frontmatter and returns body", async () => {
    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    const location = join(testDir, ".claude", "skills", "weather", "SKILL.md");
    const content = await index.readSkillContent(location);
    expect(content).toContain("Fetch weather data");
    expect(content).not.toContain("---");
  });

  it("handles empty workspace gracefully", async () => {
    const emptyDir = join(tmpdir(), `empty-workspace-${Date.now()}`);
    await mkdir(emptyDir, { recursive: true });

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(emptyDir);

    expect(index.skillCount).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();

    await rm(emptyDir, { recursive: true, force: true });
  });

  it("skips SKILL.md files with missing name or description", async () => {
    await writeFile(
      join(testDir, ".claude", "skills", "weather", "SKILL.md"),
      `---\nname: weather\n---\n# Missing description`
    );
    // Only git skill is valid
    mockFetch.mockResolvedValueOnce(makeEmbeddingResponse(1));

    const index = new SkillIndex({ ...DEFAULT_CONFIG }, "test-key");
    await index.build(testDir);

    expect(index.skillCount).toBe(1);
  });
});
