import { readFile } from "node:fs/promises";
import type { SkillIndex } from "@jim80net/memex-core";
import type { HookInput, SyncConfig } from "@jim80net/memex-core";
import { syncCommitAndPush } from "@jim80net/memex-core";
import type { StopHookConfig } from "../core/config.ts";
import { getClaudePaths, getProjectMemoryDir } from "../core/paths.ts";


export async function handleStop(
  input: HookInput,
  index: SkillIndex,
  hookConfig: StopHookConfig,
  syncConfig?: SyncConfig
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
    try {
      const result = await syncCommitAndPush(
        syncConfig,
        paths.syncRepoDir,
        {
          rules: paths.globalRulesDir,
          skills: paths.globalSkillsDir,
          projectMemoryDir: getProjectMemoryDir(cwd, paths.projectsDir),
        },
        cwd,
      );
      process.stderr.write(`memex[sync]: ${result}\n`);
    } catch (err) {
      process.stderr.write(`memex[sync]: commit+push failed: ${err}\n`);
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
