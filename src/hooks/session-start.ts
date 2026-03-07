import { syncPull } from "../core/sync.ts";
import type { HookInput, SyncConfig } from "../core/types.ts";

/**
 * SessionStart hook: pull latest content from the sync remote.
 */
export async function handleSessionStart(
  _input: HookInput,
  syncConfig: SyncConfig
): Promise<void> {
  if (!syncConfig.enabled || !syncConfig.autoPull) return;

  const result = await syncPull(syncConfig);
  process.stderr.write(`skill-router[sync]: ${result}\n`);
}
