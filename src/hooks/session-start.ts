import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { syncPull } from "../core/sync.ts";
import { loadRegistry, saveRegistry, registerProject } from "../core/project-registry.ts";
import type { HookInput, HookOutput, SyncConfig, SleepScheduleConfig } from "../core/types.ts";

const execFileAsync = promisify(execFile);

const CRON_WATERMARK_PATH = join(homedir(), ".claude", "cache", "skill-router-cron-watermark");
const CRON_MARKER = "skill-router-sleep";

/** Resolve the plugin root from this file's location (src/hooks/session-start.ts → root). */
function getPluginRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "..", "..");
}

/**
 * SessionStart hook:
 * 1. Register project in known-projects registry
 * 2. Pull latest content from sync remote
 * 3. Check if sleep schedule cron needs setup
 */
export async function handleSessionStart(
  input: HookInput,
  syncConfig: SyncConfig,
  sleepConfig: SleepScheduleConfig
): Promise<HookOutput> {
  const cwd = input.cwd || process.cwd();

  // 1. Register this project
  try {
    const registry = await loadRegistry();
    registerProject(registry, cwd);
    await saveRegistry(registry);
  } catch {
    // Best-effort
  }

  // 2. Sync pull
  if (syncConfig.enabled && syncConfig.autoPull) {
    try {
      const result = await syncPull(syncConfig);
      process.stderr.write(`skill-router[sync]: ${result}\n`);
    } catch (err) {
      process.stderr.write(`skill-router[sync]: pull failed: ${err}\n`);
    }
  }

  // 3. Sleep schedule cron check
  if (sleepConfig.enabled && !(await hasBeenPrompted())) {
    const cronExists = await hasCronEntry();
    if (!cronExists) {
      await writeCronWatermark();
      return {
        additionalContext: buildCronSetupInstructions(sleepConfig),
      };
    }
    // Cron exists, mark as prompted so we don't check crontab every session
    await writeCronWatermark();
  }

  return {};
}

/**
 * Check if we've already prompted the user about cron setup.
 */
async function hasBeenPrompted(): Promise<boolean> {
  try {
    await readFile(CRON_WATERMARK_PATH, "utf-8");
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if the system crontab already has our entry.
 */
async function hasCronEntry(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"], { timeout: 5000 });
    return stdout.includes(CRON_MARKER);
  } catch {
    return false; // No crontab or crontab not available
  }
}

/**
 * Write the cron watermark to avoid re-prompting.
 */
async function writeCronWatermark(): Promise<void> {
  try {
    const dir = dirname(CRON_WATERMARK_PATH);
    await mkdir(dir, { recursive: true });
    const tmpPath = CRON_WATERMARK_PATH + "." + randomBytes(4).toString("hex") + ".tmp";
    await writeFile(tmpPath, new Date().toISOString(), "utf-8");
    await rename(tmpPath, CRON_WATERMARK_PATH);
  } catch {
    // Best-effort
  }
}

/**
 * Build instructions for Claude to set up the system crontab entry.
 */
function buildCronSetupInstructions(config: SleepScheduleConfig): string {
  const [hour, minute] = config.dailyAt.split(":").map(Number);
  const h = isNaN(hour) ? 3 : hour;
  const m = isNaN(minute) ? 0 : minute;

  return [
    "## Skill-Router: Daily sleep schedule setup needed",
    "",
    "The skill-router's daily sleep schedule (/sleep and /deep-sleep) should run but no system cron entry was found.",
    "",
    "**Ask the user** if they'd like to set up a daily cron job to run sleep management.",
    `The configured time is ${config.dailyAt} (local time). Offer to change it or disable sleepSchedule in ~/.claude/skill-router.json.`,
    "",
    "If the user agrees, add this crontab entry:",
    "",
    "```bash",
    `# ${CRON_MARKER}`,
    `${m} ${h} * * * ${join(getPluginRoot(), "bin", "sleep-schedule.sh")}`,
    "```",
    "",
    "Use `crontab -l` to list current entries, then `crontab -` to write the updated list.",
    "Do NOT replace existing cron entries — append this one.",
    "",
    "If the user declines, suggest setting `sleepSchedule.enabled: false` in `~/.claude/skill-router.json` to stop this prompt.",
  ].join("\n");
}
