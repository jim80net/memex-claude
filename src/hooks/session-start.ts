import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { syncPull, loadRegistry, saveRegistry, registerProject, withFileLock } from "@jim80net/memex-core";
import type { HookInput, HookOutput, SyncConfig } from "@jim80net/memex-core";
import type { SleepScheduleConfig } from "../core/config.ts";
import { getClaudePaths } from "../core/paths.ts";

const execFileAsync = promisify(execFile);

const CRON_MARKER = "memex-sleep";

function getPluginRoot(): string {
  const thisFile = fileURLToPath(import.meta.url);
  return join(dirname(thisFile), "..", "..");
}

export async function handleSessionStart(
  input: HookInput,
  syncConfig: SyncConfig,
  sleepConfig: SleepScheduleConfig
): Promise<HookOutput> {
  const cwd = input.cwd || process.cwd();
  const paths = getClaudePaths();

  // 1. Register this project
  try {
    await withFileLock(paths.registryPath, async () => {
      const registry = await loadRegistry(paths.registryPath);
      registerProject(registry, cwd);
      await saveRegistry(paths.registryPath, registry);
    });
  } catch {
    // Best-effort
  }

  // 2. Sync pull
  if (syncConfig.enabled && syncConfig.autoPull) {
    try {
      const result = await syncPull(syncConfig, paths.syncRepoDir);
      process.stderr.write(`memex[sync]: ${result}\n`);
    } catch (err) {
      process.stderr.write(`memex[sync]: pull failed: ${err}\n`);
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
    await writeCronWatermark();
  }

  return {};
}

async function hasBeenPrompted(): Promise<boolean> {
  try {
    await readFile(getClaudePaths().cronWatermarkPath, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function hasCronEntry(): Promise<boolean> {
  try {
    const { stdout } = await execFileAsync("crontab", ["-l"], { timeout: 5000 });
    return stdout.includes(CRON_MARKER);
  } catch {
    return false;
  }
}

async function writeCronWatermark(): Promise<void> {
  try {
    const watermarkPath = getClaudePaths().cronWatermarkPath;
    await mkdir(dirname(watermarkPath), { recursive: true });
    const tmpPath = watermarkPath + "." + randomBytes(4).toString("hex") + ".tmp";
    await writeFile(tmpPath, new Date().toISOString(), "utf-8");
    await rename(tmpPath, watermarkPath);
  } catch {
    // Best-effort
  }
}

function buildCronSetupInstructions(config: SleepScheduleConfig): string {
  const [hour, minute] = config.dailyAt.split(":").map(Number);
  const h = isNaN(hour) ? 3 : hour;
  const m = isNaN(minute) ? 0 : minute;

  return [
    "## Memex: Daily sleep schedule setup needed",
    "",
    "The memex daily sleep schedule (/sleep and /deep-sleep) should run but no system cron entry was found.",
    "",
    "**Ask the user** if they'd like to set up a daily cron job to run sleep management.",
    `The configured time is ${config.dailyAt} (local time). Offer to change it or disable sleepSchedule in ~/.claude/memex.json.`,
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
    "If the user declines, suggest setting `sleepSchedule.enabled: false` in `~/.claude/memex.json` to stop this prompt.",
  ].join("\n");
}
