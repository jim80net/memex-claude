import { readFile } from "node:fs/promises";
import type { SkillIndex } from "../core/skill-index.ts";
import { syncCommitAndPush } from "../core/sync.ts";
import type { HookInput, StopHookConfig, SyncConfig } from "../core/types.ts";

/**
 * Stop hook has two roles:
 * 1. Behavioral rules: match stop-rule type skills against the last assistant
 *    response. If a rule matches, exit 2 with corrective feedback on stderr
 *    to make Claude continue working.
 * 2. Learning extraction: extract session learnings and create memory-skills.
 *    (Phase 4 — requires /deep-sleep infrastructure)
 */
export async function handleStop(
  input: HookInput,
  index: SkillIndex,
  hookConfig: StopHookConfig,
  syncConfig?: SyncConfig
): Promise<void> {
  // --- Behavioral rules ---
  if (hookConfig.behavioralRules) {
    const lastResponse = await getLastAssistantResponse(input.transcript_path);
    if (lastResponse) {
      const results = await index.search(
        lastResponse.slice(0, 500), // Use first 500 chars as query
        3,
        0.6,
        ["stop-rule"]
      );

      if (results.length > 0) {
        // A stop-rule matched — read the rule content for corrective feedback
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

        const feedback = feedbackParts.join("\n\n");
        process.stderr.write(
          `skill-router[Stop]: behavioral rule triggered — ${results.map((r) => r.skill.name).join(", ")}\n${feedback}\n`
        );
        process.exit(2); // Exit 2 tells Claude Code to continue with feedback
      }
    }
  }

  // --- Learning extraction ---
  // Phase 4 stub: will extract session learnings via LLM and create memory-skills
  if (hookConfig.extractLearnings) {
    // TODO: Implement in Phase 4 with /deep-sleep infrastructure
  }

  // --- Sync commit + push ---
  if (syncConfig?.enabled && syncConfig.autoCommitPush) {
    const cwd = input.cwd || process.cwd();
    try {
      const result = await syncCommitAndPush(syncConfig, cwd);
      process.stderr.write(`skill-router[sync]: ${result}\n`);
    } catch (err) {
      process.stderr.write(`skill-router[sync]: commit+push failed: ${err}\n`);
    }
  }
}

/**
 * Read the last assistant response from the session transcript.
 * Transcript is JSONL format — find the last assistant message.
 */
async function getLastAssistantResponse(
  transcriptPath?: string
): Promise<string | null> {
  if (!transcriptPath) return null;

  try {
    const raw = await readFile(transcriptPath, "utf-8");
    const lines = raw.trim().split("\n");

    // Walk backwards to find the last assistant message
    for (let i = lines.length - 1; i >= 0; i--) {
      try {
        const entry = JSON.parse(lines[i]);
        if (entry.role === "assistant" && typeof entry.content === "string") {
          return entry.content;
        }
        // Handle array content format
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
