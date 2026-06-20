#!/usr/bin/env node
import { join } from "node:path";
import { SkillIndex, LocalEmbeddingProvider } from "@jim80net/memex-core";
import type { HookInput, HookOutput } from "@jim80net/memex-core";
import { loadConfig } from "./core/config.ts";
import { getClaudePaths } from "./core/paths.ts";
import { assembleClaudeScanDirs, buildClaudeScanRoots } from "./core/scan-roots.ts";
import { resolveClaudeOrigin } from "./core/projection.ts";
import { handleUserPrompt } from "./hooks/user-prompt.ts";
import { handleStop } from "./hooks/stop.ts";
import { handlePreToolUse } from "./hooks/pre-tool-use.ts";
import { handleSessionStart } from "./hooks/session-start.ts";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf-8");
}

async function main(): Promise<void> {
  const raw = await readStdin();
  let input: HookInput;
  try {
    input = JSON.parse(raw) as HookInput;
  } catch (err) {
    process.stderr.write(`memex: invalid JSON input: ${err}\n`);
    process.exit(1);
  }

  const config = await loadConfig();

  if (!config.enabled) {
    outputResult({});
    return;
  }

  const cwd = input.cwd || process.cwd();
  const paths = getClaudePaths();
  const event = input.hook_event_name;

  // SessionStart: pull + project before any index work (design §8).
  // SessionStart does not use the skill index.
  if (event === "SessionStart") {
    let result: HookOutput = {};
    try {
      result = await handleSessionStart(
        input,
        config.sync,
        config.sleepSchedule,
        config.autoMemoryMode,
        config,
      );
    } catch (err) {
      process.stderr.write(`memex: handler error for SessionStart: ${err}\n`);
    }
    outputResult(result);
    return;
  }

  // Resolve origin for scan policy (avoid hardcoding only legacy syncRepoDir)
  let originRoot: string | undefined;
  try {
    const origin = await resolveClaudeOrigin(config);
    originRoot = origin.root;
  } catch {
    originRoot = undefined;
  }

  // Construct core objects
  const provider = new LocalEmbeddingProvider(config.embeddingModel, paths.modelsDir);
  const cachePath = join(paths.cacheDir, "memex-cache.json");

  const scanDirs = await assembleClaudeScanDirs(
    cwd,
    paths,
    config.skillDirs,
    config.sync,
    { originRoot },
  );
  const registry = buildClaudeScanRoots(cwd, paths, scanDirs, config.sync.enabled);
  const index = new SkillIndex(config, provider, cachePath, { registry });

  // Build index (will use cache for unchanged files)
  try {
    await index.build(scanDirs);
  } catch (err) {
    process.stderr.write(`memex: index build failed: ${err}\n`);
    outputResult({});
    return;
  }

  let result: HookOutput = {};

  try {
    switch (event) {
      case "UserPromptSubmit":
        if (config.hooks.UserPromptSubmit.enabled) {
          result = await handleUserPrompt(
            input,
            index,
            config.hooks.UserPromptSubmit,
            config.autoMemoryMode,
            registry,
          );
        }
        break;

      case "PreToolUse":
        if (config.hooks.PreToolUse.enabled) {
          result = await handlePreToolUse(input, index, config.hooks.PreToolUse);
        }
        break;

      case "Stop":
        if (config.hooks.Stop.enabled) {
          await handleStop(input, index, config.hooks.Stop, config.sync, config);
        }
        break;

      default:
        process.stderr.write(`memex: unknown hook event: ${event}\n`);
    }
  } catch (err) {
    process.stderr.write(`memex: handler error for ${event}: ${err}\n`);
  }

  outputResult(result);
}

function outputResult(result: HookOutput): void {
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(`memex: fatal error: ${err}\n`);
  process.exit(1);
});
