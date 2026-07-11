import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { SkillIndex } from "@jim80net/memex-core";
import type { HookInput } from "@jim80net/memex-core";
import { syncCommitAndPush } from "@jim80net/memex-core";
import type { ClaudeSyncConfig, SkillRouterConfig, StopHookConfig } from "../core/config.ts";
import { getClaudePaths, getProjectMemoryDir } from "../core/paths.ts";
import {
  cleanupStageDir,
  resolveClaudeOrigin,
  rulesProjectionActive,
  stageRulesForCopyUp,
  toCoreSyncConfig,
} from "../core/projection.ts";


export async function handleStop(
  input: HookInput,
  index: SkillIndex,
  hookConfig: StopHookConfig,
  syncConfig?: ClaudeSyncConfig,
  routerConfig?: SkillRouterConfig,
): Promise<void> {
  // --- Behavioral rules ---
  let behavioralRuleFeedback: string | null = null;

  if (hookConfig.behavioralRules) {
    const lastResponse = await getLastAssistantResponse(input.transcript_path);
    if (lastResponse) {
      const results = await index.search(
        lastResponse.slice(0, 500),
        3,
        0.6,
        ["stop-rule"]
      );

      if (results.length > 0) {
        const feedbackParts: string[] = [];
        for (const result of results) {
          try {
            const content = await index.readSkillContent(result.skill.location);
            feedbackParts.push(
              `[stop-rule: ${result.skill.name}] ${content.trim()}`
            );
          } catch {
            feedbackParts.push(
              `[stop-rule: ${result.skill.name}] ${result.skill.description}`
            );
          }
        }

        behavioralRuleFeedback = feedbackParts.join("\n\n");
        process.stderr.write(
          `memex[Stop]: behavioral rule triggered — ${results.map((r) => r.skill.name).join(", ")}\n${behavioralRuleFeedback}\n`
        );
      }
    }
  }

  // --- Learning extraction ---
  if (hookConfig.extractLearnings) {
    // TODO: Implement in Phase 4 with /deep-sleep infrastructure
  }

  // --- Sync commit + push (always runs, even when a behavioral rule fires) ---
  if (syncConfig?.enabled && syncConfig.autoCommitPush) {
    const cwd = input.cwd || process.cwd();
    const paths = getClaudePaths();
    const coreSync = toCoreSyncConfig(
      routerConfig ?? ({ sync: syncConfig } as SkillRouterConfig),
    );

    let originRoot = paths.syncRepoDir;
    try {
      const origin = await resolveClaudeOrigin(
        routerConfig ?? ({ sync: syncConfig } as SkillRouterConfig),
      );
      originRoot = origin.root;
    } catch {
      // keep legacy syncRepoDir
    }

    // When rules projection is active, stage only non-managed (real) rule files
    // so managed origin symlinks are not copy-up thrash (design §7.2A).
    let rulesSource = paths.globalRulesDir;
    let stageDir: string | null = null;
    if (rulesProjectionActive(syncConfig)) {
      stageDir = join(paths.cacheDir, `stop-rules-stage-${process.pid}`);
      try {
        const { staged, skippedManaged } = await stageRulesForCopyUp(
          paths.globalRulesDir,
          originRoot,
          stageDir,
        );
        rulesSource = stageDir;
        if (skippedManaged > 0) {
          process.stderr.write(
            `memex[sync]: skipped ${skippedManaged} managed rule symlink(s); staging ${staged} local rule(s)\n`,
          );
        }
      } catch (err) {
        process.stderr.write(`memex[sync]: rules stage failed, using harness dir: ${err}\n`);
        stageDir = null;
        rulesSource = paths.globalRulesDir;
      }
    }

    try {
      const result = await syncCommitAndPush(
        coreSync,
        originRoot,
        {
          rules: rulesSource,
          skills: paths.globalSkillsDir,
          projectMemoryDir: getProjectMemoryDir(cwd, paths.projectsDir),
        },
        cwd,
      );
      process.stderr.write(`memex[sync]: ${result}\n`);
    } catch (err) {
      process.stderr.write(`memex[sync]: commit+push failed: ${err}\n`);
    } finally {
      if (stageDir) await cleanupStageDir(stageDir);
    }
  }

  // --- Exit with corrective feedback after sync completes ---
  if (behavioralRuleFeedback) {
    process.exit(2);
  }
}

async function getLastAssistantResponse(
  transcriptPath?: string
): Promise<string | null> {
  if (!transcriptPath) return null;

  try {
    const raw = await readFile(transcriptPath, "utf-8");
    const lines = raw.trim().split("\n");

    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === "assistant" && typeof entry.content === "string") {
          return entry.content;
        }
        if (entry.role === "assistant" && Array.isArray(entry.content)) {
          const textParts = entry.content
            .filter((p: { type: string }) => p.type === "text")
            .map((p: { text: string }) => p.text);
          if (textParts.length > 0) return textParts.join("\n");
        }
      } catch {
        // Skip malformed JSONL lines
      }
    }
  } catch {
    // Transcript not readable
  }

  return null;
}
