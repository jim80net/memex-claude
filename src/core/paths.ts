import { homedir } from "node:os";
import { join } from "node:path";
import { encodeProjectPath } from "@jim80net/memex-core";
import type { MemexPaths } from "@jim80net/memex-core";

export type ClaudePaths = MemexPaths & {
  configPath: string;
  preCompactDir: string;
  cronWatermarkPath: string;
};

export function getClaudePaths(): ClaudePaths {
  const home = homedir();
  const cacheDir = join(home, ".claude", "cache");
  return {
    cacheDir,
    modelsDir: join(cacheDir, "models"),
    sessionsDir: join(cacheDir, "sessions"),
    syncRepoDir: join(home, ".local", "share", "memex-claude"),
    projectsDir: join(home, ".claude", "projects"),
    telemetryPath: join(cacheDir, "memex-telemetry.json"),
    registryPath: join(cacheDir, "memex-projects.json"),
    tracesDir: join(cacheDir, "memex-traces"),
    configPath: join(home, ".claude", "memex.json"),
    preCompactDir: join(cacheDir, "pre-compact"),
    cronWatermarkPath: join(cacheDir, "memex-cron-watermark"),
    globalSkillsDir: join(home, ".claude", "skills"),
    globalRulesDir: join(home, ".claude", "rules"),
  };
}

export function getProjectMemoryDir(cwd: string, projectsDir: string): string {
  const encoded = encodeProjectPath(cwd);
  return join(projectsDir, encoded, "memory");
}

export function getProjectSkillsDir(cwd: string): string {
  return join(cwd, ".claude", "skills");
}

export function getProjectRulesDir(cwd: string): string {
  return join(cwd, ".claude", "rules");
}
