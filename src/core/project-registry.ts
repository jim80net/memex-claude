import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { randomBytes } from "node:crypto";

const REGISTRY_PATH = join(homedir(), ".claude", "cache", "skill-router-projects.json");

export type ProjectRegistry = {
  version: 1;
  projects: Record<string, { lastSeen: string }>; // cwd → metadata
};

export function getRegistryPath(): string {
  return REGISTRY_PATH;
}

export async function loadRegistry(): Promise<ProjectRegistry> {
  const empty: ProjectRegistry = { version: 1, projects: {} };
  try {
    const raw = await readFile(REGISTRY_PATH, "utf-8");
    const data = JSON.parse(raw) as ProjectRegistry;
    if (data.version !== 1) return empty;
    return data;
  } catch {
    return empty;
  }
}

export async function saveRegistry(data: ProjectRegistry): Promise<void> {
  const dir = dirname(REGISTRY_PATH);
  await mkdir(dir, { recursive: true });

  const tmpPath = REGISTRY_PATH + "." + randomBytes(4).toString("hex") + ".tmp";
  await writeFile(tmpPath, JSON.stringify(data, null, 2), "utf-8");
  await rename(tmpPath, REGISTRY_PATH);
}

/**
 * Register a project cwd as known. Mutates in place.
 */
export function registerProject(registry: ProjectRegistry, cwd: string): void {
  registry.projects[cwd] = { lastSeen: new Date().toISOString() };
}

/**
 * Get list of known project paths, sorted by most recently seen.
 */
export function getKnownProjects(registry: ProjectRegistry): string[] {
  return Object.entries(registry.projects)
    .sort(([, a], [, b]) => b.lastSeen.localeCompare(a.lastSeen))
    .map(([path]) => path);
}
