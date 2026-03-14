import { homedir } from "node:os";
import { join } from "node:path";

/**
 * Encode an absolute path to Claude's project directory name format.
 * `/home/user/.myproject` → `-home-user--myproject`
 *
 * Rules:
 * - Leading `/` becomes `-`
 * - Each `/` separator becomes `-`
 * - Dots `.` become `-`
 * - Underscores `_` become `-`
 * - Consecutive `-` are preserved (they encode dots/separators)
 */
export function encodeProjectPath(cwd: string): string {
  // Claude Code uses this encoding: replace /, ., and _ with -
  // e.g. /home/user/.myproject becomes -home-user--myproject
  // e.g. /home/user/a_book becomes -home-user-a-book
  return cwd.replace(/\//g, "-").replace(/\./g, "-").replace(/_/g, "-");
}

/**
 * Get the Claude project memory directory for a given cwd.
 */
export function getProjectMemoryDir(cwd: string): string {
  const encoded = encodeProjectPath(cwd);
  return join(homedir(), ".claude", "projects", encoded, "memory");
}

/**
 * Get the Claude project skills directory for a given cwd.
 */
export function getProjectSkillsDir(cwd: string): string {
  return join(cwd, ".claude", "skills");
}

/**
 * Get the global rules directory.
 */
export function getGlobalRulesDir(): string {
  return join(homedir(), ".claude", "rules");
}

/**
 * Get the project-local rules directory for a given cwd.
 */
export function getProjectRulesDir(cwd: string): string {
  return join(cwd, ".claude", "rules");
}
