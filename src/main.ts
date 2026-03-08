#!/usr/bin/env node
import { loadConfig } from "./core/config.ts";
import { SkillIndex } from "./core/skill-index.ts";
import { handleUserPrompt } from "./hooks/user-prompt.ts";
import { handleStop } from "./hooks/stop.ts";
import { handlePreToolUse } from "./hooks/pre-tool-use.ts";
import { handlePreCompact } from "./hooks/pre-compact.ts";
import { handleSessionStart } from "./hooks/session-start.ts";
import type { HookInput, HookOutput } from "./core/types.ts";

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
    process.stderr.write(`skill-router: invalid JSON input: ${err}\n`);
    process.exit(1);
  }

  const config = await loadConfig();

  if (!config.enabled) {
    outputResult({});
    return;
  }

  const cwd = input.cwd || process.cwd();
  const index = new SkillIndex(config);

  // Build index (will use cache for unchanged files)
  try {
    await index.build(cwd);
  } catch (err) {
    process.stderr.write(`skill-router: index build failed: ${err}\n`);
    outputResult({});
    return;
  }

  const event = input.hook_event_name;
  let result: HookOutput = {};

  try {
    switch (event) {
      case "SessionStart":
        result = await handleSessionStart(input, config.sync, config.sleepSchedule);
        break;

      case "UserPromptSubmit":
        if (config.hooks.UserPromptSubmit.enabled) {
          result = await handleUserPrompt(input, index, config.hooks.UserPromptSubmit);
        }
        break;

      case "PreToolUse":
        if (config.hooks.PreToolUse.enabled) {
          result = await handlePreToolUse(input, index, config.hooks.PreToolUse);
        }
        break;

      case "Stop":
        if (config.hooks.Stop.enabled) {
          await handleStop(input, index, config.hooks.Stop, config.sync);
        }
        break;

      case "PreCompact":
        if (config.hooks.PreCompact.enabled) {
          await handlePreCompact(input);
        }
        break;

      default:
        process.stderr.write(`skill-router: unknown hook event: ${event}\n`);
    }
  } catch (err) {
    process.stderr.write(`skill-router: handler error for ${event}: ${err}\n`);
  }

  outputResult(result);
}

function outputResult(result: HookOutput): void {
  process.stdout.write(JSON.stringify(result));
}

main().catch((err) => {
  process.stderr.write(`skill-router: fatal error: ${err}\n`);
  process.exit(1);
});
