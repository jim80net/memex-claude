// ---------------------------------------------------------------------------
// Skill types
// ---------------------------------------------------------------------------

export type SkillType =
  | "skill"
  | "memory"
  | "tool-guidance"
  | "workflow"
  | "session-learning"
  | "stop-rule"
  | "rule";

export type IndexedSkill = {
  name: string;
  description: string;
  location: string;
  type: SkillType;
  embeddings: number[][];
  queries: string[];
  mtime: number;
  oneLiner?: string;
};

export type SkillSearchResult = {
  skill: IndexedSkill;
  score: number;
};

export type ParsedFrontmatter = {
  name?: string;
  description?: string;
  queries?: string[];
  type?: SkillType;
  paths?: string[];
  hooks?: string[];
  keywords?: string[];
  oneLiner?: string;
  [key: string]: unknown;
};

export type ParsedSkill = {
  meta: ParsedFrontmatter;
  body: string;
};

// ---------------------------------------------------------------------------
// Cache schema
// ---------------------------------------------------------------------------

export type CachedSkill = {
  name: string;
  description: string;
  queries: string[];
  embeddings: number[][];
  mtime: number;
  type: SkillType;
  oneLiner?: string;
};

export type CacheData = {
  version: 1;
  embeddingModel: string;
  skills: Record<string, CachedSkill>;
};

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

export type SessionState = {
  sessionId: string;
  shownRules: Record<string, number>; // rule location → timestamp of full injection
};

// ---------------------------------------------------------------------------
// Hook I/O
// ---------------------------------------------------------------------------

export type HookInput = {
  hook_event_name: string;
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  prompt?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
};

export type HookOutput = {
  additionalContext?: string;
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

export type HookConfig = {
  enabled: boolean;
  topK: number;
  threshold: number;
  maxInjectedChars: number;
  types: SkillType[];
};

export type StopHookConfig = {
  enabled: boolean;
  extractLearnings: boolean;
  extractionModel: string;
  behavioralRules: boolean;
};

export type SkillRouterConfig = {
  enabled: boolean;
  embeddingModel: string;
  cacheTimeMs: number;
  skillDirs: string[];
  hooks: {
    UserPromptSubmit: HookConfig;
    PreToolUse: HookConfig;
    Stop: StopHookConfig;
    PreCompact: { enabled: boolean };
  };
};
