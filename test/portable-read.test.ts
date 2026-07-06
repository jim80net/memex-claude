import { mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_CORE_CONFIG,
  SkillIndex,
  encodePortableLocation,
} from "@jim80net/memex-core";
import type { EmbeddingProvider } from "@jim80net/memex-core";
import { buildClaudeScanRoots } from "../src/core/scan-roots.ts";

const SKILL_BODY = "Use the weather API with the user's preferred units.";

describe("portable handle read path", () => {
  let root: string;
  let cwd: string;
  let claudeHome: string;
  let globalSkillsDir: string;
  let cachePath: string;
  let mockEmbed: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    root = join(tmpdir(), `portable-read-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    cwd = join(root, "workspace");
    claudeHome = join(root, ".claude");
    globalSkillsDir = join(claudeHome, "skills");
    cachePath = join(claudeHome, "cache", "memex-cache.json");

    await mkdir(join(globalSkillsDir, "weather"), { recursive: true });
    await writeFile(
      join(globalSkillsDir, "weather", "SKILL.md"),
      `---
name: weather
description: Weather lookups
---
${SKILL_BODY}
`,
      "utf-8",
    );

    mockEmbed = vi.fn().mockResolvedValue([[1, 0, 0, 0]]);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("index stores portable handles and readSkillContent round-trips them", async () => {
    const paths = {
      globalSkillsDir,
      globalRulesDir: join(claudeHome, "rules"),
      syncRepoDir: join(root, "sync"),
    };
    const scanDirs = {
      skillDirs: [globalSkillsDir, join(cwd, ".claude", "skills")],
      memoryDirs: [join(claudeHome, "projects", "x", "memory")],
      ruleDirs: [paths.globalRulesDir],
    };
    const registry = buildClaudeScanRoots(cwd, paths, scanDirs, false);

    const skillPath = join(globalSkillsDir, "weather", "SKILL.md");
    const handle = encodePortableLocation(registry, skillPath);
    expect(handle).toBe("memex://claude-global/weather/SKILL.md");

    const provider: EmbeddingProvider = { embed: mockEmbed };
    const index = new SkillIndex({ ...DEFAULT_CORE_CONFIG }, provider, cachePath, {
      registry,
    });
    await index.build(scanDirs);

    const body = await index.readSkillContent(handle!);
    expect(body).toBe(SKILL_BODY);
  });
});