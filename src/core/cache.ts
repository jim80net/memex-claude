import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";
import type { CacheData, CachedSkill } from "./types.ts";

const CACHE_PATH = join(homedir(), ".claude", "cache", "skill-router.json");
const CACHE_VERSION = 1 as const;

export function getCachePath(): string {
  return CACHE_PATH;
}

export async function loadCache(embeddingModel: string): Promise<CacheData> {
  const empty: CacheData = { version: CACHE_VERSION, embeddingModel, skills: {} };
  try {
    const raw = await readFile(CACHE_PATH, "utf-8");
    const data = JSON.parse(raw) as CacheData;

    // Invalidate if model changed or version mismatch
    if (data.version !== CACHE_VERSION || data.embeddingModel !== embeddingModel) {
      return empty;
    }

    return data;
  } catch {
    return empty;
  }
}

export async function saveCache(data: CacheData): Promise<void> {
  const dir = dirname(CACHE_PATH);
  await mkdir(dir, { recursive: true });

  // Atomic write: temp file + rename
  const tmpPath = CACHE_PATH + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(tmpPath, JSON.stringify(data), "utf-8");
  await rename(tmpPath, CACHE_PATH);
}

export function getCachedSkill(cache: CacheData, location: string): CachedSkill | undefined {
  return cache.skills[location];
}

export function setCachedSkill(cache: CacheData, location: string, skill: CachedSkill): void {
  cache.skills[location] = skill;
}

export function removeCachedSkill(cache: CacheData, location: string): void {
  delete cache.skills[location];
}
