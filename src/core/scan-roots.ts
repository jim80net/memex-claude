import { join } from "node:path";
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

/** Assemble scan directories — mirrors src/main.ts wiring. */
export async function assembleClaudeScanDirs(
  cwd: string,
  paths: Pick<ClaudePaths, "globalSkillsDir" | "globalRulesDir" | "projectsDir" | "syncRepoDir">,
  extraSkillDirs: string[],
  syncConfig: SyncConfig,
): Promise<ScanDirs> {
  const scanDirs: ScanDirs = {
    skillDirs: [paths.globalSkillsDir, getProjectSkillsDir(cwd), ...extraSkillDirs],
    memoryDirs: [getProjectMemoryDir(cwd, paths.projectsDir)],
    ruleDirs: [paths.globalRulesDir, getProjectRulesDir(cwd)],
  };

  if (syncConfig.enabled) {
    const syncDirs = getSyncScanDirs(paths.syncRepoDir);
    scanDirs.skillDirs.push(syncDirs.skillsDir);
    scanDirs.ruleDirs.push(syncDirs.rulesDir);

    const syncMemDirs = await findMatchingProjectMemoryDirs(
      cwd,
      paths.syncRepoDir,
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