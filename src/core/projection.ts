/**
 * Claude harness projection — thin adapter over memex-core origin primitives.
 *
 * Design: docs/specs/2026-07-11-g3-adapter-alignment-file-rules-projection.md
 * Proven path: memex-grok#31 src/core/projection.ts
 * Core: resolveOriginRoot / planProjection / applyProjection (@jim80net/memex-core@0.6+)
 *
 * Does not invent a parallel origin layout. Prefer file-shaped rules under
 * ~/.claude/rules; no new inject paths.
 */

import {
  applyProjection,
  initSyncRepo,
  isPathInsideRoot,
  planProjection,
  resolveOriginRoot,
  syncPull,
  type ApplyProjectionResult,
  type ProjectPlan,
  type ProjectionTarget,
  type ResolvedOriginRoot,
  type SyncConfig,
  type SyncProfile,
} from "@jim80net/memex-core";
import { copyFile, lstat, mkdir, readdir, readlink, rm } from "node:fs/promises";
import { dirname, isAbsolute, join, resolve } from "node:path";
import type { ClaudeSyncConfig, SkillRouterConfig } from "./config.ts";
import {
  getClaudePaths,
  getProjectRulesDir,
  type ClaudePaths,
} from "./paths.ts";

export type ProjectionRunOptions = {
  config: SkillRouterConfig;
  /** Project cwd for optional project-scoped rules projection. Default process.cwd(). */
  cwd?: string;
  paths?: ClaudePaths;
  /** When true, plan only — do not apply or mkdir origin. */
  dryRun?: boolean;
  /** Override home for resolveOriginRoot (tests). */
  homeDir?: string;
  env?: NodeJS.ProcessEnv;
  /**
   * When true, also syncPull if repo + autoPull (SessionStart path).
   * Default false for pure init; SessionStart passes true.
   */
  pull?: boolean;
};

export type ProjectionRunReport = {
  profileSet: boolean;
  origin: ResolvedOriginRoot | null;
  plan: ProjectPlan | null;
  apply: ApplyProjectionResult | null;
  pullMessage: string | null;
  message: string;
};

/** Profile is set when adapter sync is enabled (maps to SyncProfile.enabled). */
export function isProjectionProfileSet(
  config: Pick<SkillRouterConfig, "sync"> | ClaudeSyncConfig | SyncConfig,
): boolean {
  const sync = "sync" in config ? config.sync : config;
  return sync.enabled === true;
}

/**
 * Whether rules are expected to be projected into harness dirs (scan policy).
 * When true, assembleClaudeScanDirs must not also append raw origin/rules.
 */
export function rulesProjectionActive(
  config: Pick<SkillRouterConfig, "sync"> | ClaudeSyncConfig | SyncConfig,
): boolean {
  return isProjectionProfileSet(config);
}

/**
 * Build harness-neutral projection targets for Claude user rules.
 *
 * v1: project `cwd/.claude/rules` only when callers pass an explicit
 * `projectOriginRelDir` (e.g. `projects/<id>/rules`). Linking the same
 * origin `rules/` into both user and project dirs would double-index.
 * Skills projection is a follow-on (design backlog).
 */
export function buildClaudeProjectionTargets(
  cwd: string,
  paths: ClaudePaths = getClaudePaths(),
  opts: { projectOriginRelDir?: string } = {},
): ProjectionTarget[] {
  const targets: ProjectionTarget[] = [
    {
      id: "claude-user-rules",
      targetDir: paths.globalRulesDir,
      originRelDir: "rules",
      entryKind: "files",
      pattern: "*.md",
      initTargetDir: true,
    },
  ];
  if (opts.projectOriginRelDir) {
    targets.push({
      id: "claude-project-rules",
      targetDir: getProjectRulesDir(cwd),
      originRelDir: opts.projectOriginRelDir,
      entryKind: "files",
      pattern: "*.md",
      initTargetDir: true,
    });
  }
  return targets;
}

/**
 * Construct a SyncProfile from claude config (legacy SyncConfig bridge).
 * Prefer core types only — no forked origin schema.
 */
export function buildClaudeSyncProfile(
  config: SkillRouterConfig,
  cwd: string,
  paths: ClaudePaths = getClaudePaths(),
): SyncProfile {
  return {
    version: 1,
    enabled: config.sync.enabled,
    origin: {
      root: config.sync.repoDir,
      repo: config.sync.repo || undefined,
    },
    projections: config.sync.enabled
      ? buildClaudeProjectionTargets(cwd, paths)
      : [],
    onClobber: "fail-closed",
    relinkManaged: true,
    sync: {
      autoPull: config.sync.autoPull,
      autoCommitPush: config.sync.autoCommitPush,
      projectMappings: config.sync.projectMappings,
      caseSensitive: config.sync.caseSensitive,
    },
  };
}

/** Map adapter sync config to core SyncConfig for initSyncRepo / syncPull. */
export function toCoreSyncConfig(config: SkillRouterConfig | ClaudeSyncConfig): SyncConfig {
  const sync = "sync" in config && config.sync ? config.sync : (config as ClaudeSyncConfig);
  return {
    enabled: sync.enabled,
    repo: sync.repo,
    autoPull: sync.autoPull,
    autoCommitPush: sync.autoCommitPush,
    projectMappings: sync.projectMappings,
    caseSensitive: sync.caseSensitive,
  };
}

/**
 * Resolve live origin root via core resolver (product default ~/.memex).
 * Explicit config.sync.repoDir maps to profile origin.root.
 */
export async function resolveClaudeOrigin(
  config: SkillRouterConfig | ClaudeSyncConfig,
  opts: { homeDir?: string; env?: NodeJS.ProcessEnv } = {},
): Promise<ResolvedOriginRoot> {
  const sync = "sync" in config && config.sync ? config.sync : (config as ClaudeSyncConfig);
  return resolveOriginRoot({
    root: sync.repoDir,
    homeDir: opts.homeDir,
    env: opts.env,
  });
}

/**
 * Ensure origin exists, optionally pull remote, plan + apply rules projection.
 */
export async function runClaudeProjection(
  opts: ProjectionRunOptions,
): Promise<ProjectionRunReport> {
  const { config } = opts;
  const cwd = opts.cwd ?? process.cwd();
  const paths = opts.paths ?? getClaudePaths();
  const dryRun = opts.dryRun === true;
  const doPull = opts.pull === true;

  if (!isProjectionProfileSet(config)) {
    return {
      profileSet: false,
      origin: null,
      plan: null,
      apply: null,
      pullMessage: null,
      message:
        "sync profile not set (sync.enabled=false); enable in memex.json to project rules",
    };
  }

  const origin = await resolveClaudeOrigin(config, {
    homeDir: opts.homeDir,
    env: opts.env,
  });
  const coreSync = toCoreSyncConfig(config);

  if (!dryRun) {
    await mkdir(origin.root, { recursive: true });
    await mkdir(join(origin.root, "rules"), { recursive: true });
    if (coreSync.repo) {
      await initSyncRepo(coreSync, origin.root);
    }
  }

  let pullMessage: string | null = null;
  if (!dryRun && doPull && coreSync.repo && coreSync.autoPull) {
    pullMessage = await syncPull(coreSync, origin.root);
  }

  const targets = buildClaudeProjectionTargets(cwd, paths);
  const plan = await planProjection(origin.root, targets, { relinkManaged: true });

  if (dryRun) {
    return {
      profileSet: true,
      origin,
      plan,
      apply: null,
      pullMessage,
      message: `dry-run: origin=${origin.root} source=${origin.source} links=${plan.links.length} conflicts=${plan.conflicts.length}`,
    };
  }

  const apply = await applyProjection(plan, { onClobber: "fail-closed" });
  return {
    profileSet: true,
    origin,
    plan,
    apply,
    pullMessage,
    message: `origin=${origin.root} source=${origin.source} linked=${apply.linked} skipped=${apply.skipped} conflicts=${apply.conflicts.length}`,
  };
}

/**
 * True when path is a symlink whose target resolves under originRoot
 * (managed projection link — do not copy-up on Stop).
 */
export async function isManagedOriginSymlink(
  path: string,
  originRoot: string,
): Promise<boolean> {
  try {
    const st = await lstat(path);
    if (!st.isSymbolicLink()) return false;
    const target = await readlink(path);
    const abs = isAbsolute(target) ? resolve(target) : resolve(dirname(path), target);
    return isPathInsideRoot(originRoot, abs);
  } catch {
    return false;
  }
}

/**
 * Stage only non-managed harness rule entries for Stop copy-up.
 * Managed origin symlinks are skipped so syncCommitAndPush does not thrash origin.
 * Returns null when staging is unnecessary (caller should use rulesDir as-is).
 */
export async function stageRulesForCopyUp(
  rulesDir: string,
  originRoot: string,
  stageDir: string,
): Promise<{ staged: number; skippedManaged: number }> {
  await mkdir(stageDir, { recursive: true });
  let entries: string[];
  try {
    entries = await readdir(rulesDir);
  } catch {
    return { staged: 0, skippedManaged: 0 };
  }

  let staged = 0;
  let skippedManaged = 0;

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    const src = join(rulesDir, entry);
    if (await isManagedOriginSymlink(src, originRoot)) {
      skippedManaged++;
      continue;
    }
    try {
      const st = await lstat(src);
      if (!st.isFile() && !st.isSymbolicLink()) continue;
      await copyFile(src, join(stageDir, entry));
      staged++;
    } catch {
      // skip unreadable
    }
  }

  return { staged, skippedManaged };
}

/** Remove a staging directory created for Stop copy-up (best-effort). */
export async function cleanupStageDir(stageDir: string): Promise<void> {
  try {
    await rm(stageDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}
