import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { randomBytes } from "node:crypto";
import { withFileLock } from "@jim80net/memex-core";
import type { SessionState } from "@jim80net/memex-core";
import { getClaudePaths } from "./paths.ts";

function getSessionPath(sessionId: string): string {
  const paths = getClaudePaths();
  return join(paths.sessionsDir, `${sessionId}.json`);
}

export async function loadSession(sessionId: string | undefined): Promise<SessionState> {
  const empty: SessionState = { sessionId: sessionId || "", shownRules: {} };
  if (!sessionId) return empty;

  try {
    const raw = await readFile(getSessionPath(sessionId), "utf-8");
    return JSON.parse(raw) as SessionState;
  } catch {
    return empty;
  }
}

export async function saveSession(state: SessionState): Promise<void> {
  if (!state.sessionId) return;

  const path = getSessionPath(state.sessionId);
  await withFileLock(path, async () => {
    await mkdir(dirname(path), { recursive: true });
    const tmpPath = path + "." + randomBytes(4).toString("hex") + ".tmp";
    await writeFile(tmpPath, JSON.stringify(state), "utf-8");
    await rename(tmpPath, path);
  });
}

export function hasRuleBeenShown(state: SessionState, location: string): boolean {
  return location in state.shownRules;
}

export function markRuleShown(state: SessionState, location: string): void {
  state.shownRules[location] = Date.now();
}
