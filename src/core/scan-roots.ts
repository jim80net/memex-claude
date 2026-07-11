import {
  buildScanRoots,
  findMatchingProjectMemoryDirs,
  getSyncScanDirs,
} from "@jim80net/memex-core";
import type { ScanDirs, ScanRootRegistry, SyncConfig } from "@jim80net/memex-core";
import type { ClaudePaths } from "./paths.ts";
import {
  getProjectMemoryDir,
  getProjectRulesDir,
  getProjectSkillsDir,
} from "./paths.ts";
import { rulesProjectionActive } from "./projection.ts";

export type AssembleClaudeScanDirsOptions = {
  /**
   * Resolved shared origin root (from resolveOriginRoot / resolveClaudeOrigin).
   * When omitted and sync is enabled, falls back to paths.syncRepoDir (legacy).
   */
  originRoot?: string;
};

/** Assemble scan directories — mirrors src/main.ts wiring. */
export async function assembleClaudeScanDirs(
  cwd: string,
  paths: Pick<ClaudePaths, "globalSkillsDir" | "globalRulesDir" | "projectsDir" | "syncRepoDir">,
  extraSkillDirs: string[],
  syncConfig: SyncConfig,
  opts: AssembleClaudeScanDirsOptions = {},
): Promise<ScanDirs> {
  const scanDirs: ScanDirs = {
    skillDirs: [paths.globalSkillsDir, getProjectSkillsDir(cwd), ...extraSkillDirs],
    memoryDirs: [getProjectMemoryDir(cwd, paths.projectsDir)],
    ruleDirs: [paths.globalRulesDir, getProjectRulesDir(cwd)],
  };

  if (syncConfig.enabled) {
    const repoDir = opts.originRoot ?? paths.syncRepoDir;
    const syncDirs = getSyncScanDirs(repoDir);
    scanDirs.skillDirs.push(syncDirs.skillsDir);

    // When rules projection is active, harness rule dirs hold symlinks into
    // origin — do not also append raw origin/rules (one blob → one index entry).
    if (!rulesProjectionActive(syncConfig)) {
      scanDirs.ruleDirs.push(syncDirs.rulesDir);
    }

    const syncMemDirs = await findMatchingProjectMemoryDirs(
      cwd,
      repoDir,
      syncConfig,
    );
    scanDirs.memoryDirs.push(...syncMemDirs);
  }

  return scanDirs;
}

/** Labeled scan roots for portable memex:// handles (harness: claude). */
export function buildClaudeScanRoots(
  cwd: string,
  paths: Pick<ClaudePaths, "globalSkillsDir" | "globalRulesDir" | "syncRepoDir">,
  scanDirs: ScanDirs,
  syncEnabled: boolean,
): ScanRootRegistry {
  return buildScanRoots(
    {
      cwd,
      syncRepoDir: paths.syncRepoDir,
      syncEnabled,
      globalSkillsDirs: [paths.globalSkillsDir],
      globalRulesDirs: [paths.globalRulesDir],
      projectSkillsDir: getProjectSkillsDir(cwd),
      projectRulesDir: getProjectRulesDir(cwd),
      harness: "claude",
    },
    scanDirs,
  );
}
