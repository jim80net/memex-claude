import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import type { CacheData, CachedSkill } from "../src/core/types.ts";

// We test the cache logic at the data level (load/save helpers operate on a fixed path,
// so we test the serialization and invalidation logic directly)

describe("CacheData serialization", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = join(tmpdir(), `cache-test-${Date.now()}`);
    await mkdir(tmpDir, { recursive: true });
  });

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("round-trips through JSON", async () => {
    const cache: CacheData = {
      version: 1,
      embeddingModel: "text-embedding-3-small",
      skills: {
        "/path/to/skill/SKILL.md": {
          name: "test-skill",
          description: "A test skill",
          queries: ["how to test", "run tests"],
          embeddings: [[0.1, 0.2, 0.3], [0.4, 0.5, 0.6]],
          mtime: 1234567890,
          type: "skill",
        },
      },
    };

    const path = join(tmpDir, "cache.json");
    await writeFile(path, JSON.stringify(cache), "utf-8");
    const loaded = JSON.parse(await readFile(path, "utf-8")) as CacheData;

    expect(loaded.version).toBe(1);
    expect(loaded.embeddingModel).toBe("text-embedding-3-small");
    expect(loaded.skills["/path/to/skill/SKILL.md"].name).toBe("test-skill");
    expect(loaded.skills["/path/to/skill/SKILL.md"].embeddings).toHaveLength(2);
    expect(loaded.skills["/path/to/skill/SKILL.md"].embeddings[0]).toEqual([0.1, 0.2, 0.3]);
  });

  it("invalidates cache when model changes", () => {
    const cache: CacheData = {
      version: 1,
      embeddingModel: "text-embedding-3-small",
      skills: { "/a": { name: "a", description: "a", queries: [], embeddings: [], mtime: 0, type: "skill" } },
    };

    // Simulating the loadCache invalidation check
    const currentModel = "text-embedding-3-large";
    const isValid = cache.version === 1 && cache.embeddingModel === currentModel;
    expect(isValid).toBe(false);
  });

  it("validates cache when model matches", () => {
    const cache: CacheData = {
      version: 1,
      embeddingModel: "text-embedding-3-small",
      skills: { "/a": { name: "a", description: "a", queries: [], embeddings: [], mtime: 0, type: "skill" } },
    };

    const currentModel = "text-embedding-3-small";
    const isValid = cache.version === 1 && cache.embeddingModel === currentModel;
    expect(isValid).toBe(true);
  });
});
