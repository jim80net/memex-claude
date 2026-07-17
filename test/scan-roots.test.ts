import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  encodePortableLocation,
  decodePortableLocation,
} from "@jim80net/memex-core";
import { buildClaudeScanRoots } from "../src/core/scan-roots.ts";

describe("buildClaudeScanRoots", () => {
  const cwd = resolve("/home/user/project");
  const claudeHome = resolve("/home/user/.claude");
  const syncRepoDir = resolve("/home/user/.local/share/memex-claude");

  it("labels claude-global, claude-project, and sync-skills roots", () => {
    const paths = {
      globalSkillsDir: join(claudeHome, "skills"),
      globalRulesDir: join(claudeHome, "rules"),
      syncRepoDir,
    };
    const scanDirs = {
      skillDirs: [
        paths.globalSkillsDir,
        join(cwd, ".claude", "skills"),
        join(syncRepoDir, "skills"),
      ],
      memoryDirs: [join(claudeHome, "projects", "abc", "memory")],
      ruleDirs: [paths.globalRulesDir, join(syncRepoDir, "rules")],
    };

    const registry = buildClaudeScanRoots(cwd, paths, scanDirs, true);

    const globalSkill = join(claudeHome, "skills", "weather", "SKILL.md");
    const projectSkill = join(cwd, ".claude", "skills", "deploy", "SKILL.md");
    const syncSkill = join(syncRepoDir, "skills", "weather", "SKILL.md");

    const globalHandle = encodePortableLocation(registry, globalSkill);
    const projectHandle = encodePortableLocation(registry, projectSkill);
    const syncHandle = encodePortableLocation(registry, syncSkill);

    expect(globalHandle).toBe("memex://claude-global/weather/SKILL.md");
    expect(projectHandle).toBe("memex://claude-project/deploy/SKILL.md");
    expect(syncHandle).toBe("memex://sync-skills/weather/SKILL.md");

    expect(decodePortableLocation(registry, globalHandle!)).toBe(globalSkill);
    expect(decodePortableLocation(registry, projectHandle!)).toBe(projectSkill);
    expect(decodePortableLocation(registry, syncHandle!)).toBe(syncSkill);
  });
});
