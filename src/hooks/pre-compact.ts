import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { HookInput } from "@jim80net/memex-core";
import { getClaudePaths } from "../core/paths.ts";

export async function handlePreCompact(input: HookInput): Promise<void> {
  if (!input.transcript_path) return;

  const paths = getClaudePaths();
  const stagingDir = paths.preCompactDir;
  const stagingFile = join(stagingDir, `${input.session_id || "unknown"}.md`);

  try {
    await mkdir(stagingDir, { recursive: true });

    const timestamp = new Date().toISOString();
    await writeFile(
      stagingFile,
      `# Pre-Compaction Context\nTimestamp: ${timestamp}\nSession: ${input.session_id}\nTranscript: ${input.transcript_path}\n`,
      "utf-8"
    );

    process.stderr.write(
      `memex[PreCompact]: staged context for session ${input.session_id}\n`
    );
  } catch (err) {
    process.stderr.write(
      `memex[PreCompact]: failed to stage context: ${err}\n`
    );
  }
}
