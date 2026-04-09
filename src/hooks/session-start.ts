import { readFile, writeFile, mkdir, rename } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { syncPull, loadRegistry, saveRegistry, registerProject, withFileLock } from "@jim80net/memex-core";
import type { HookInput, HookOutput, SyncConfig } from "@jim80net/memex-core";
import type { SleepScheduleConfig, AutoMemoryMode } from "../core/config.ts";
import { isAutoMemoryEnabled } from "../core/config.ts";
import { getClaudePaths } from "../core/paths.ts";

const execFileAsync = promisify(execFile);

const CRON_MARKER = "memex-sleep";

function getPluginRoot(): string {
  // Dev mode: resolve from source file location
  const thisFile = fileURLToPath(import.meta.url);
  const devRoot = join(dirname(thisFile), "..", "..");
  if (existsSync(join(devRoot, "package.json"))) {
    return devRoot;
  }
  // Compiled binary: import.meta.url is virtual (Bun bundles into $bunfs).
  // Binary is at <plugin-root>/bin/memex.bin, so go up one level.
  return join(dirname(process.execPath), "..");
}

export async function handleSessionStart(
  input: HookInput,
  syncConfig: SyncConfig,
  sleepConfig: SleepScheduleConfig,
  autoMemoryMode: AutoMemoryMode
): Promise<HookOutput> {
  const cwd = input.cwd || process.cwd();
  const paths = getClaudePaths();
  const sections: string[] = [];

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

  // 3. Auto-memory interop
  if (autoMemoryMode === "takeover") {
    if (isAutoMemoryEnabled() && !(await hasAutoMemoryWarned())) {
      await writeAutoMemoryWatermark();
      sections.push(buildAutoMemoryWarning());
    }

    // Always inject memory-creation rule in takeover mode
    const rule = await readMemoryCreationRule();
    if (rule) sections.push(rule);
  }

  // 4. Sleep schedule cron check
  if (sleepConfig.enabled && !(await hasBeenPrompted())) {
    const cronExists = await hasCronEntry();
    if (!cronExists) {
      await writeCronWatermark();
      sections.push(buildCronSetupInstructions(sleepConfig));
    } else {
      await writeCronWatermark();
    }
  }

  if (sections.length > 0) {
    return { additionalContext: sections.join("\n\n") };
  }

  return {};
}

async function readMemoryCreationRule(): Promise<string> {
  const skillPath = join(getPluginRoot(), "skills", "memory-creation", "SKILL.md");
  try {
    const raw = await readFile(skillPath, "utf-8");
    // Strip frontmatter (everything between first --- and second ---)
    const fmEnd = raw.indexOf("---", 4);
    const body = fmEnd >= 0 ? raw.slice(raw.indexOf("\n", fmEnd) + 1).trim() : raw;
    return `## Memex: Memory creation instructions\n\n${body}`;
  } catch {
    process.stderr.write("memex: could not read memory-creation SKILL.md\n");
    return "";
  }
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
    await withFileLock(watermarkPath, async () => {
      await mkdir(dirname(watermarkPath), { recursive: true });
      const tmpPath = watermarkPath + "." + randomBytes(4).toString("hex") + ".tmp";
      await writeFile(tmpPath, new Date().toISOString(), "utf-8");
      await rename(tmpPath, watermarkPath);
    });
  } catch {
    // Best-effort
  }
}

async function hasAutoMemoryWarned(): Promise<boolean> {
  try {
    await readFile(getClaudePaths().autoMemoryWatermarkPath, "utf-8");
    return true;
  } catch {
    return false;
  }
}

async function writeAutoMemoryWatermark(): Promise<void> {
  try {
    const watermarkPath = getClaudePaths().autoMemoryWatermarkPath;
    await withFileLock(watermarkPath, async () => {
      await mkdir(dirname(watermarkPath), { recursive: true });
      const tmpPath = watermarkPath + "." + randomBytes(4).toString("hex") + ".tmp";
      await writeFile(tmpPath, new Date().toISOString(), "utf-8");
      await rename(tmpPath, watermarkPath);
    });
  } catch {
    // Best-effort
  }
}

function buildAutoMemoryWarning(): string {
  return [
    "## Memex: Auto-memory conflict detected",
    "",
    "Memex is in **takeover mode** but Claude Code auto-memory is still enabled.",
    "This will cause duplicate memory writes — both systems will try to create and manage memory files.",
    "",
    "To disable auto-memory, set `CLAUDE_CODE_DISABLE_AUTO_MEMORY` to `1` in `~/.claude/settings.json`:",
    "",
    "```json",
    "{",
    '  "env": {',
    '    "CLAUDE_CODE_DISABLE_AUTO_MEMORY": "1"',
    "  }",
    "}",
    "```",
    "",
    "Or set `autoMemoryMode` to `assist` in `~/.claude/memex.json` to let auto-memory stay authoritative.",
  ].join("\n");
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
