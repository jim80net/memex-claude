import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import type { SessionState } from "./types.ts";

function getSessionPath(sessionId: string): string {
  return join(homedir(), ".claude", "cache", "sessions", `${sessionId}.json`);
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
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(state), "utf-8");
}

export function hasRuleBeenShown(state: SessionState, location: string): boolean {
  return location in state.shownRules;
}

export function markRuleShown(state: SessionState, location: string): void {
  state.shownRules[location] = Date.now();
}
