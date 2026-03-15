import { homedir } from "node:os";
import { join } from "node:path";
import { encodeProjectPath } from "@jim80net/memex-core";
import type { MemexPaths } from "@jim80net/memex-core";

export function getClaudePaths(): MemexPaths {
  const home = homedir();
  return {
    cacheDir: join(home, ".claude", "cache"),
    modelsDir: join(home, ".claude", "cache", "models"),
    sessionsDir: join(home, ".claude", "cache", "sessions"),
    syncRepoDir: join(home, ".local", "share", "memex-claude"),
    projectsDir: join(home, ".claude", "projects"),
    telemetryPath: join(home, ".claude", "cache", "memex-telemetry.json"),
    registryPath: join(home, ".claude", "cache", "memex-projects.json"),
    tracesDir: join(home, ".claude", "cache", "memex-traces"),
  };
}

export function getProjectMemoryDir(cwd: string, projectsDir: string): string {
  const encoded = encodeProjectPath(cwd);
  return join(projectsDir, encoded, "memory");
}

export function getProjectSkillsDir(cwd: string): string {
  return join(cwd, ".claude", "skills");
}

export function getGlobalSkillsDir(): string {
  return join(homedir(), ".claude", "skills");
}

export function getGlobalRulesDir(): string {
  return join(homedir(), ".claude", "rules");
}

export function getProjectRulesDir(cwd: string): string {
  return join(cwd, ".claude", "rules");
}
