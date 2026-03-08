import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { homedir } from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { syncPull } from "../core/sync.ts";
import { loadRegistry, saveRegistry, registerProject } from "../core/project-registry.ts";
import type { HookInput, HookOutput, SyncConfig, SleepScheduleConfig } from "../core/types.ts";

const execFileAsync = promisify(execFile);

const CRON_WATERMARK_PATH = join(homedir(), ".claude", "cache", "skill-router-cron-watermark");
const CRON_MARKER = "skill-router-sleep";
const CRON_WATERMARK_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * SessionStart hook:
 * 1. Register project in known-projects registry
 * 2. Pull latest content from sync remote
 * 3. Check if lifecycle cron needs setup
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

  // 3. Lifecycle cron check
  if (sleepConfig.enabled) {
    const needsCron = await shouldSetupCron();
    if (needsCron) {
      const cronExists = await hasCronEntry();
      if (!cronExists) {
        await writeCronWatermark();
        return {
          additionalContext: buildCronSetupInstructions(sleepConfig),
        };
      }
      // Cron exists, just refresh watermark
      await writeCronWatermark();
    }
  }

  return {};
}

/**
 * Check if we should attempt cron setup (watermark stale or missing).
 */
async function shouldSetupCron(): Promise<boolean> {
  try {
    const raw = await readFile(CRON_WATERMARK_PATH, "utf-8");
    const timestamp = new Date(raw.trim()).getTime();
    return Date.now() - timestamp > CRON_WATERMARK_MAX_AGE_MS;
  } catch {
    return true; // No watermark = never set up
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
    await mkdir(dirname(CRON_WATERMARK_PATH), { recursive: true });
    await writeFile(CRON_WATERMARK_PATH, new Date().toISOString(), "utf-8");
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
    `${m} ${h} * * * ${join(homedir(), ".claude", "plugins", "cache", "jim80net-plugins", "claude-skill-router")}/_active/bin/sleep-schedule.sh`,
    "```",
    "",
    "Use `crontab -l` to list current entries, then `crontab -` to write the updated list.",
    "Do NOT replace existing cron entries — append this one.",
    "",
    "If the user declines, suggest setting `sleepSchedule.enabled: false` in `~/.claude/skill-router.json` to stop this prompt.",
  ].join("\n");
}
