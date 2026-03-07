import { execFile } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { readdir, readFile, writeFile, mkdir, stat, cp } from "node:fs/promises";
import { promisify } from "node:util";
import { encodeProjectPath } from "./path-encoder.ts";
import { getSyncProjectMemoryDir } from "./project-mapping.ts";
import type { SyncConfig } from "./types.ts";

const execFileAsync = promisify(execFile);

const SYNC_REPO_DIR = join(homedir(), ".local", "share", "claude-skill-router");

export function getSyncRepoPath(): string {
  return SYNC_REPO_DIR;
}

// ---------------------------------------------------------------------------
// Git helpers
// ---------------------------------------------------------------------------

async function git(args: string[], cwd: string): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", args, { cwd, timeout: 30_000 });
}

async function isGitRepo(dir: string): Promise<boolean> {
  try {
    await git(["rev-parse", "--git-dir"], dir);
    return true;
  } catch {
    return false;
  }
}

async function hasRemote(dir: string): Promise<boolean> {
  try {
    const { stdout } = await git(["remote"], dir);
    return stdout.trim().length > 0;
  } catch {
    return false;
  }
}

async function hasCommits(dir: string): Promise<boolean> {
  try {
    await git(["rev-parse", "HEAD"], dir);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Conflict resolution
// ---------------------------------------------------------------------------

/**
 * Auto-resolve merge conflicts in markdown files by keeping both sides.
 * Conflict markers are replaced with both versions separated by a heading.
 */
function autoResolveMarkdownConflict(content: string): string {
  const conflictPattern = /^<{7}\s.*\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7}\s.*$/gm;

  return content.replace(conflictPattern, (_match, ours: string, theirs: string) => {
    const oursTrimmed = ours.trim();
    const theirsTrimmed = theirs.trim();

    // If identical after trimming, just keep one
    if (oursTrimmed === theirsTrimmed) return oursTrimmed;

    // Keep both sides
    return `${oursTrimmed}\n\n${theirsTrimmed}`;
  });
}

/**
 * Resolve all conflicted files in the repo by auto-merging markdown content.
 * Returns list of files that were auto-resolved.
 */
async function resolveConflicts(repoDir: string): Promise<string[]> {
  const { stdout } = await git(["diff", "--name-only", "--diff-filter=U"], repoDir);
  const conflictedFiles = stdout.trim().split("\n").filter(Boolean);
  const resolved: string[] = [];

  for (const file of conflictedFiles) {
    const filePath = join(repoDir, file);
    if (!file.endsWith(".md")) {
      // Non-markdown: accept theirs
      await git(["checkout", "--theirs", file], repoDir);
      await git(["add", file], repoDir);
      resolved.push(file);
      continue;
    }

    try {
      const content = await readFile(filePath, "utf-8");
      const merged = autoResolveMarkdownConflict(content);
      await writeFile(filePath, merged, "utf-8");
      await git(["add", file], repoDir);
      resolved.push(file);
    } catch {
      // If we can't read/resolve, accept theirs as fallback
      try {
        await git(["checkout", "--theirs", file], repoDir);
        await git(["add", file], repoDir);
        resolved.push(file);
      } catch {
        // skip
      }
    }
  }

  return resolved;
}

// ---------------------------------------------------------------------------
// Core sync operations
// ---------------------------------------------------------------------------

/**
 * Initialize the sync repo. Clone if it doesn't exist, verify if it does.
 */
export async function initSyncRepo(config: SyncConfig): Promise<void> {
  if (!config.enabled || !config.repo) return;

  await mkdir(SYNC_REPO_DIR, { recursive: true });

  if (await isGitRepo(SYNC_REPO_DIR)) {
    // Verify remote matches config
    try {
      const { stdout } = await git(["remote", "get-url", "origin"], SYNC_REPO_DIR);
      if (stdout.trim() !== config.repo) {
        await git(["remote", "set-url", "origin", config.repo], SYNC_REPO_DIR);
        process.stderr.write(`skill-router[sync]: updated remote to ${config.repo}\n`);
      }
    } catch {
      await git(["remote", "add", "origin", config.repo], SYNC_REPO_DIR);
    }
    return;
  }

  // Clone the repo
  try {
    await execFileAsync("git", ["clone", config.repo, SYNC_REPO_DIR], { timeout: 60_000 });
    process.stderr.write(`skill-router[sync]: cloned ${config.repo}\n`);
  } catch (err) {
    // If clone fails (e.g., empty repo), init locally and add remote
    await git(["init"], SYNC_REPO_DIR);
    await git(["remote", "add", "origin", config.repo], SYNC_REPO_DIR);
    process.stderr.write(`skill-router[sync]: initialized new repo with remote ${config.repo}\n`);
  }
}

/**
 * Pull latest changes from remote.
 * Auto-resolves conflicts in markdown files.
 * Returns a summary of what happened.
 */
export async function syncPull(config: SyncConfig): Promise<string> {
  if (!config.enabled || !config.repo) return "sync disabled";

  await initSyncRepo(config);

  if (!(await hasRemote(SYNC_REPO_DIR))) return "no remote configured";
  if (!(await hasCommits(SYNC_REPO_DIR))) return "no commits yet";

  try {
    // Fetch first to check if remote has anything
    await git(["fetch", "origin"], SYNC_REPO_DIR);
  } catch {
    return "fetch failed (remote unreachable?)";
  }

  try {
    await git(["rebase", "origin/main"], SYNC_REPO_DIR);
    return "pulled successfully";
  } catch {
    // Rebase conflict — try to auto-resolve
    const resolved = await resolveConflicts(SYNC_REPO_DIR);

    if (resolved.length > 0) {
      try {
        await git(["rebase", "--continue"], SYNC_REPO_DIR);
        process.stderr.write(
          `skill-router[sync]: auto-resolved conflicts in ${resolved.join(", ")}\n`
        );
        return `pulled with auto-resolved conflicts: ${resolved.join(", ")}`;
      } catch {
        // If continue fails, abort and try merge instead
        await git(["rebase", "--abort"], SYNC_REPO_DIR);
      }
    } else {
      await git(["rebase", "--abort"], SYNC_REPO_DIR);
    }

    // Fallback: merge instead of rebase
    try {
      await git(["merge", "origin/main", "--no-edit"], SYNC_REPO_DIR);
      return "pulled (merge)";
    } catch {
      const mergeResolved = await resolveConflicts(SYNC_REPO_DIR);
      if (mergeResolved.length > 0) {
        await git(["commit", "--no-edit", "-m", "Auto-resolve merge conflicts"], SYNC_REPO_DIR);
        return `pulled with merge + auto-resolved: ${mergeResolved.join(", ")}`;
      }
      // Last resort: abort merge
      try {
        await git(["merge", "--abort"], SYNC_REPO_DIR);
      } catch { /* already clean */ }
      return "pull failed: unresolvable conflicts";
    }
  }
}

/**
 * Collect local changes from ~/.claude/ and copy them into the sync repo.
 * Then commit and push.
 */
export async function syncCommitAndPush(config: SyncConfig, cwd: string): Promise<string> {
  if (!config.enabled || !config.repo) return "sync disabled";

  await initSyncRepo(config);

  const claudeDir = join(homedir(), ".claude");
  let changeCount = 0;

  // Sync global rules
  changeCount += await syncDirectory(
    join(claudeDir, "rules"),
    join(SYNC_REPO_DIR, "rules"),
    "*.md"
  );

  // Sync global skills
  changeCount += await syncSkillsDirectory(
    join(claudeDir, "skills"),
    join(SYNC_REPO_DIR, "skills")
  );

  // Sync project memories for current cwd
  const encodedPath = encodeProjectPath(cwd);
  const localMemoryDir = join(claudeDir, "projects", encodedPath, "memory");
  const syncMemoryDir = await getSyncProjectMemoryDir(cwd, SYNC_REPO_DIR, config);
  changeCount += await syncDirectory(localMemoryDir, syncMemoryDir, "*.md");

  if (changeCount === 0) return "no changes to sync";

  // Commit and push
  try {
    await git(["add", "-A"], SYNC_REPO_DIR);
    const { stdout: statusOut } = await git(["status", "--porcelain"], SYNC_REPO_DIR);
    if (!statusOut.trim()) return "no changes after staging";

    const hostname = (await execFileAsync("hostname", [], { timeout: 5000 })).stdout.trim();
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const message = `sync from ${hostname} at ${timestamp}`;

    await git(["commit", "-m", message], SYNC_REPO_DIR);
    process.stderr.write(`skill-router[sync]: committed ${changeCount} file(s)\n`);
  } catch (err) {
    return `commit failed: ${err}`;
  }

  // Push
  if (!(await hasRemote(SYNC_REPO_DIR))) return "committed (no remote)";

  try {
    // Try push; if remote has no branch yet, set upstream
    try {
      await git(["push"], SYNC_REPO_DIR);
    } catch {
      await git(["push", "-u", "origin", "main"], SYNC_REPO_DIR);
    }
    process.stderr.write(`skill-router[sync]: pushed to remote\n`);
    return `synced ${changeCount} file(s)`;
  } catch (err) {
    process.stderr.write(`skill-router[sync]: push failed: ${err}\n`);
    return `committed locally, push failed: ${err}`;
  }
}

// ---------------------------------------------------------------------------
// File sync helpers
// ---------------------------------------------------------------------------

/**
 * Copy new/changed .md files from a source dir to a destination dir.
 * Returns the number of files copied.
 */
async function syncDirectory(srcDir: string, destDir: string, pattern: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(srcDir);
  } catch {
    return 0;
  }

  const ext = pattern.replace("*", "");
  const filtered = entries.filter((e) => e.endsWith(ext));
  let copied = 0;

  for (const entry of filtered) {
    const srcPath = join(srcDir, entry);
    const destPath = join(destDir, entry);

    try {
      const srcStat = await stat(srcPath);
      if (!srcStat.isFile()) continue;

      let needsCopy = false;
      try {
        const destStat = await stat(destPath);
        // Copy if source is newer
        needsCopy = srcStat.mtimeMs > destStat.mtimeMs;
      } catch {
        // Destination doesn't exist
        needsCopy = true;
      }

      if (needsCopy) {
        await mkdir(destDir, { recursive: true });
        const content = await readFile(srcPath, "utf-8");
        await writeFile(destPath, content, "utf-8");
        copied++;
      }
    } catch {
      // skip unreadable files
    }
  }

  return copied;
}

/**
 * Sync skills directories (each skill is a subdirectory with a SKILL.md).
 */
async function syncSkillsDirectory(srcDir: string, destDir: string): Promise<number> {
  let entries: string[];
  try {
    entries = await readdir(srcDir);
  } catch {
    return 0;
  }

  let copied = 0;

  for (const entry of entries) {
    const srcSkillMd = join(srcDir, entry, "SKILL.md");
    const destSkillMd = join(destDir, entry, "SKILL.md");

    try {
      const srcStat = await stat(srcSkillMd);
      if (!srcStat.isFile()) continue;

      let needsCopy = false;
      try {
        const destStat = await stat(destSkillMd);
        needsCopy = srcStat.mtimeMs > destStat.mtimeMs;
      } catch {
        needsCopy = true;
      }

      if (needsCopy) {
        await mkdir(join(destDir, entry), { recursive: true });
        const content = await readFile(srcSkillMd, "utf-8");
        await writeFile(destSkillMd, content, "utf-8");
        copied++;
      }
    } catch {
      // skip
    }
  }

  return copied;
}

/**
 * Get the list of directories in the sync repo that should be scanned
 * for the given cwd. Returns paths for rules, skills, and matching project memories.
 */
export function getSyncScanDirs(syncRepoPath: string): {
  rulesDir: string;
  skillsDir: string;
} {
  return {
    rulesDir: join(syncRepoPath, "rules"),
    skillsDir: join(syncRepoPath, "skills"),
  };
}
