import type { SkillIndex } from "../core/skill-index.ts";
import type { HookInput, HookOutput, HookConfig } from "../core/types.ts";

export async function handlePreToolUse(
  input: HookInput,
  index: SkillIndex,
  hookConfig: HookConfig
): Promise<HookOutput> {
  const toolName = input.tool_name;
  if (!toolName) return {};

  // Build a query combining tool name and relevant input context
  const inputContext = input.tool_input
    ? summarizeToolInput(toolName, input.tool_input)
    : "";
  const query = inputContext
    ? `using ${toolName}: ${inputContext}`
    : `using ${toolName} tool`;

  const results = await index.search(
    query,
    hookConfig.topK,
    hookConfig.threshold,
    hookConfig.types
  );

  if (results.length === 0) return {};

  let totalChars = 0;
  const sections: string[] = [];

  for (const result of results) {
    let content: string;
    try {
      content = await index.readSkillContent(result.skill.location);
    } catch {
      continue;
    }

    if (totalChars + content.length > hookConfig.maxInjectedChars) break;

    sections.push(
      `## Tool Guidance: ${result.skill.name} (relevance: ${(result.score * 100).toFixed(0)}%)\n\n${content}`
    );
    totalChars += content.length;
  }

  if (sections.length === 0) return {};

  const additionalContext = sections.join("\n\n---\n\n");

  process.stderr.write(
    `skill-router[PreToolUse]: injected ${sections.length} guidance(s) for ${toolName} (${totalChars} chars)\n`
  );

  return { additionalContext };
}

/**
 * Extract a short context string from tool input for better matching.
 */
function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>
): string {
  switch (toolName) {
    case "Bash":
      return typeof toolInput.command === "string"
        ? toolInput.command.slice(0, 200)
        : "";
    case "Write":
    case "Read":
    case "Edit":
      return typeof toolInput.file_path === "string"
        ? toolInput.file_path
        : "";
    case "Glob":
      return typeof toolInput.pattern === "string"
        ? toolInput.pattern
        : "";
    case "Grep":
      return typeof toolInput.pattern === "string"
        ? toolInput.pattern
        : "";
    default:
      // For unknown tools, try to grab the first string value
      for (const val of Object.values(toolInput)) {
        if (typeof val === "string" && val.length > 0) {
          return val.slice(0, 200);
        }
      }
      return "";
  }
}
