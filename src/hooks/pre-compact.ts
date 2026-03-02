import { writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { HookInput } from "../core/types.ts";

/**
 * PreCompact hook: Save important context before Claude Code compacts
 * the conversation. Writes a staging file that can be read by the
 * UserPromptSubmit hook to restore context after compaction.
 */
export async function handlePreCompact(input: HookInput): Promise<void> {
  // The transcript_path gives us access to the full conversation
  // before compaction. We save key context to a staging file.
  if (!input.transcript_path) return;

  const stagingDir = join(homedir(), ".claude", "cache", "pre-compact");
  const stagingFile = join(stagingDir, `${input.session_id || "unknown"}.md`);

  try {
    await mkdir(stagingDir, { recursive: true });

    // TODO: Phase 3 full implementation
    // For now, just record that compaction happened
    const timestamp = new Date().toISOString();
    await writeFile(
      stagingFile,
      `# Pre-Compaction Context\nTimestamp: ${timestamp}\nSession: ${input.session_id}\nTranscript: ${input.transcript_path}\n`,
      "utf-8"
    );

    process.stderr.write(
      `skill-router[PreCompact]: staged context for session ${input.session_id}\n`
    );
  } catch (err) {
    process.stderr.write(
      `skill-router[PreCompact]: failed to stage context: ${err}\n`
    );
  }
}
