import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const TELEMETRY_PATH = join(homedir(), ".claude", "cache", "skill-router-telemetry.json");

export type EntryTelemetry = {
  matchCount: number;
  lastMatched: string; // ISO timestamp
  firstMatched: string; // ISO timestamp
  sessionIds: string[]; // unique session IDs (capped)
};

export type TelemetryData = {
  version: 1;
  entries: Record<string, EntryTelemetry>; // keyed by skill location
};

const MAX_SESSION_IDS = 50;

export function getTelemetryPath(): string {
  return TELEMETRY_PATH;
}

export async function loadTelemetry(): Promise<TelemetryData> {
  const empty: TelemetryData = { version: 1, entries: {} };
  try {
    const raw = await readFile(TELEMETRY_PATH, "utf-8");
    const data = JSON.parse(raw) as TelemetryData;
    if (data.version !== 1) return empty;
    return data;
  } catch {
    return empty;
  }
}

export async function saveTelemetry(data: TelemetryData): Promise<void> {
  const dir = dirname(TELEMETRY_PATH);
  await mkdir(dir, { recursive: true });

  const tmpPath = TELEMETRY_PATH + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, TELEMETRY_PATH);
}

/**
 * Record that a skill was matched and injected.
 * Mutates the telemetry data in place.
 */
export function recordMatch(
  telemetry: TelemetryData,
  location: string,
  sessionId: string
): void {
  const now = new Date().toISOString();
  const existing = telemetry.entries[location];

  if (existing) {
    existing.matchCount++;
    existing.lastMatched = now;
    if (!existing.sessionIds.includes(sessionId)) {
      existing.sessionIds.push(sessionId);
      if (existing.sessionIds.length > MAX_SESSION_IDS) {
        existing.sessionIds = existing.sessionIds.slice(-MAX_SESSION_IDS);
      }
    }
  } else {
    telemetry.entries[location] = {
      matchCount: 1,
      lastMatched: now,
      firstMatched: now,
      sessionIds: [sessionId],
    };
  }
}

/**
 * Get telemetry for a specific entry. Returns undefined if no data exists.
 */
export function getEntryTelemetry(
  telemetry: TelemetryData,
  location: string
): EntryTelemetry | undefined {
  return telemetry.entries[location];
}
