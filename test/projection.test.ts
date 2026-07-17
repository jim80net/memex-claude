import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { lstat, mkdir, readlink, rm, writeFile, symlink } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { DEFAULT_CONFIG } from "../src/core/config.ts";
import type { ClaudePaths } from "../src/core/paths.ts";
import {
  buildClaudeProjectionTargets,
  isManagedOriginSymlink,
  isProjectionProfileSet,
  runClaudeProjection,
  stageRulesForCopyUp,
} from "../src/core/projection.ts";
import { assembleClaudeScanDirs } from "../src/core/scan-roots.ts";

function fakePaths(root: string): ClaudePaths {
  const cacheDir = join(root, ".claude", "cache");
  return {
    cacheDir,
    modelsDir: join(cacheDir, "models"),
    sessionsDir: join(cacheDir, "sessions"),
    syncRepoDir: join(root, "origin"),
    projectsDir: join(root, ".claude", "projects"),
    telemetryPath: join(cacheDir, "memex-telemetry.json"),
    registryPath: join(cacheDir, "memex-projects.json"),
    tracesDir: join(cacheDir, "memex-traces"),
    configPath: join(root, ".claude", "memex.json"),
    cronWatermarkPath: join(cacheDir, "memex-cron-watermark"),
    autoMemoryWatermarkPath: join(cacheDir, "memex-automemory-warned"),
    globalSkillsDir: join(root, ".claude", "skills"),
    globalRulesDir: join(root, ".claude", "rules"),
  };
}

describe("projection profile gate", () => {
  it("is off when sync.enabled is false (default)", () => {
    expect(isProjectionProfileSet(DEFAULT_CONFIG)).toBe(false);
  });

  it("is on when sync.enabled is true", () => {
    expect(
      isProjectionProfileSet({
        ...DEFAULT_CONFIG,
        sync: { ...DEFAULT_CONFIG.sync, enabled: true },
      }),
    ).toBe(true);
  });
});

describe("buildClaudeProjectionTargets", () => {
  it("projects user rules only by default (no double-index of origin rules)", () => {
    const root = "/tmp/claude-proj-paths";
    const paths = fakePaths(root);
    const targets = buildClaudeProjectionTargets("/work/repo", paths);
    expect(targets).toHaveLength(1);
    expect(targets[0]!.id).toBe("claude-user-rules");
    expect(targets[0]!.targetDir).toBe(join(root, ".claude", "rules"));
    expect(targets[0]!.originRelDir).toBe("rules");
    expect(targets[0]!.entryKind).toBe("files");
  });

  it("adds project rules only when projectOriginRelDir is explicit", () => {
    const paths = fakePaths("/tmp/p");
    const targets = buildClaudeProjectionTargets("/work/repo", paths, {
      projectOriginRelDir: "projects/foo/rules",
    });
    expect(targets.map((t) => t.id)).toEqual([
      "claude-user-rules",
      "claude-project-rules",
    ]);
    expect(targets[1]!.originRelDir).toBe("projects/foo/rules");
    expect(targets[1]!.targetDir).toBe(join("/work/repo", ".claude", "rules"));
  });
});

describe("runClaudeProjection", () => {
  let root: string;
  let paths: ClaudePaths;

  beforeEach(async () => {
    root = join(tmpdir(), `mc-proj-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(root, { recursive: true });
    paths = fakePaths(root);
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("no-ops with clear message when profile not set", async () => {
    const report = await runClaudeProjection({
      config: DEFAULT_CONFIG,
      paths,
      cwd: root,
      homeDir: root,
    });
    expect(report.profileSet).toBe(false);
    expect(report.apply).toBeNull();
    expect(report.message).toMatch(/sync\.enabled=false/);
  });

  it("creates absolute symlinks from origin rules into ~/.claude/rules", async () => {
    const origin = paths.syncRepoDir;
    await mkdir(join(origin, "rules"), { recursive: true });
    await writeFile(join(origin, "rules", "dogfood.md"), "# dogfood\n", "utf8");

    const report = await runClaudeProjection({
      config: {
        ...DEFAULT_CONFIG,
        sync: {
          ...DEFAULT_CONFIG.sync,
          enabled: true,
          repoDir: origin,
          autoPull: false,
        },
      },
      paths,
      cwd: root,
      homeDir: root,
    });

    expect(report.profileSet).toBe(true);
    expect(report.apply?.linked).toBe(1);
    expect(report.apply?.conflicts).toEqual([]);

    const linkPath = join(paths.globalRulesDir, "dogfood.md");
    const st = await lstat(linkPath);
    expect(st.isSymbolicLink()).toBe(true);
    const target = await readlink(linkPath);
    expect(target).toBe(join(origin, "rules", "dogfood.md"));
  });

  it("does not clobber a real file (conflict, partial apply)", async () => {
    const origin = paths.syncRepoDir;
    await mkdir(join(origin, "rules"), { recursive: true });
    await writeFile(join(origin, "rules", "a.md"), "origin-a\n", "utf8");
    await writeFile(join(origin, "rules", "b.md"), "origin-b\n", "utf8");
    await mkdir(paths.globalRulesDir, { recursive: true });
    await writeFile(join(paths.globalRulesDir, "a.md"), "local-real\n", "utf8");

    const report = await runClaudeProjection({
      config: {
        ...DEFAULT_CONFIG,
        sync: {
          ...DEFAULT_CONFIG.sync,
          enabled: true,
          repoDir: origin,
          autoPull: false,
        },
      },
      paths,
      cwd: root,
      homeDir: root,
    });

    expect(report.apply?.conflicts.some((c) => c.reason === "real-file")).toBe(true);
    const b = join(paths.globalRulesDir, "b.md");
    expect((await lstat(b)).isSymbolicLink()).toBe(true);
    expect((await lstat(join(paths.globalRulesDir, "a.md"))).isSymbolicLink()).toBe(false);
  });

  it("dry-run does not create links", async () => {
    const origin = paths.syncRepoDir;
    await mkdir(join(origin, "rules"), { recursive: true });
    await writeFile(join(origin, "rules", "x.md"), "x\n", "utf8");

    const report = await runClaudeProjection({
      config: {
        ...DEFAULT_CONFIG,
        sync: { ...DEFAULT_CONFIG.sync, enabled: true, repoDir: origin, autoPull: false },
      },
      paths,
      cwd: root,
      homeDir: root,
      dryRun: true,
    });

    expect(report.plan?.links.length).toBeGreaterThan(0);
    expect(report.apply).toBeNull();
    await expect(lstat(join(paths.globalRulesDir, "x.md"))).rejects.toThrow();
  });
});

describe("assembleClaudeScanDirs projection policy", () => {
  it("does not append origin/rules when projection is active", async () => {
    const root = join(tmpdir(), `mc-scan-${Date.now()}`);
    const paths = fakePaths(root);
    const origin = join(root, "origin");
    const scanDirs = await assembleClaudeScanDirs(
      join(root, "proj"),
      paths,
      [],
      { enabled: true, repo: "", autoPull: false, autoCommitPush: false, projectMappings: {} },
      { originRoot: origin },
    );
    expect(scanDirs.ruleDirs).toContain(paths.globalRulesDir);
    expect(scanDirs.ruleDirs).not.toContain(join(origin, "rules"));
    // skills still scan origin
    expect(scanDirs.skillDirs).toContain(join(origin, "skills"));
    await rm(root, { recursive: true, force: true });
  });

  it("appends origin/rules when sync enabled but projection inactive", async () => {
    // projection active === sync.enabled; when disabled, no origin append either
    const root = join(tmpdir(), `mc-scan2-${Date.now()}`);
    const paths = fakePaths(root);
    const origin = join(root, "origin");
    const scanDirs = await assembleClaudeScanDirs(
      join(root, "proj"),
      paths,
      [],
      { enabled: false, repo: "", autoPull: false, autoCommitPush: false, projectMappings: {} },
      { originRoot: origin },
    );
    expect(scanDirs.ruleDirs).not.toContain(join(origin, "rules"));
    await rm(root, { recursive: true, force: true });
  });
});

describe("stageRulesForCopyUp", () => {
  let root: string;

  beforeEach(async () => {
    root = join(tmpdir(), `mc-stage-${Date.now()}-${Math.random().toString(16).slice(2)}`);
    await mkdir(root, { recursive: true });
  });

  afterEach(async () => {
    await rm(root, { recursive: true, force: true });
  });

  it("skips managed origin symlinks and stages real files", async () => {
    const origin = join(root, "origin");
    const rulesDir = join(root, "rules");
    const stage = join(root, "stage");
    await mkdir(join(origin, "rules"), { recursive: true });
    await mkdir(rulesDir, { recursive: true });
    await writeFile(join(origin, "rules", "managed.md"), "from-origin\n", "utf8");
    await symlink(join(origin, "rules", "managed.md"), join(rulesDir, "managed.md"));
    await writeFile(join(rulesDir, "local.md"), "local-only\n", "utf8");

    expect(await isManagedOriginSymlink(join(rulesDir, "managed.md"), origin)).toBe(true);

    const result = await stageRulesForCopyUp(rulesDir, origin, stage);
    expect(result.skippedManaged).toBe(1);
    expect(result.staged).toBe(1);
    expect((await lstat(join(stage, "local.md"))).isFile()).toBe(true);
    await expect(lstat(join(stage, "managed.md"))).rejects.toThrow();
  });
});
