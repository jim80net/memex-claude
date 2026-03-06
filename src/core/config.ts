import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import type { SkillRouterConfig } from "./types.ts";

export const DEFAULT_CONFIG: SkillRouterConfig = {
  enabled: true,
  embeddingModel: "Xenova/all-MiniLM-L6-v2",
  cacheTimeMs: 300_000, // 5 min
  skillDirs: [],
  hooks: {
    UserPromptSubmit: {
      enabled: true,
      topK: 3,
      threshold: 0.5,
      maxInjectedChars: 8000,
      types: ["skill", "memory", "workflow", "session-learning", "rule"],
    },
    PreToolUse: {
      enabled: false,
      topK: 2,
      threshold: 0.6,
      maxInjectedChars: 4000,
      types: ["tool-guidance", "skill"],
    },
    Stop: {
      enabled: false,
      extractLearnings: true,
      extractionModel: "",
      behavioralRules: true,
    },
    PreCompact: {
      enabled: false,
    },
  },
};

export async function loadConfig(): Promise<SkillRouterConfig> {
  const configPath = join(homedir(), ".claude", "skill-router.json");
  try {
    const raw = await readFile(configPath, "utf-8");
    const user = JSON.parse(raw) as Partial<SkillRouterConfig>;
    return mergeConfig(user);
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function mergeConfig(user: Partial<SkillRouterConfig>): SkillRouterConfig {
  const base = { ...DEFAULT_CONFIG };

  if (typeof user.enabled === "boolean") base.enabled = user.enabled;
  if (typeof user.embeddingModel === "string") base.embeddingModel = user.embeddingModel;
  if (typeof user.cacheTimeMs === "number") base.cacheTimeMs = user.cacheTimeMs;
  if (Array.isArray(user.skillDirs)) base.skillDirs = user.skillDirs.map(String);

  if (user.hooks) {
    const uh = user.hooks;
    if (uh.UserPromptSubmit) {
      base.hooks.UserPromptSubmit = {
        ...base.hooks.UserPromptSubmit,
        ...uh.UserPromptSubmit,
      };
    }
    if (uh.PreToolUse) {
      base.hooks.PreToolUse = {
        ...base.hooks.PreToolUse,
        ...uh.PreToolUse,
      };
    }
    if (uh.Stop) {
      base.hooks.Stop = {
        ...base.hooks.Stop,
        ...uh.Stop,
      };
    }
    if (uh.PreCompact) {
      base.hooks.PreCompact = {
        ...base.hooks.PreCompact,
        ...uh.PreCompact,
      };
    }
  }

  return base;
}
