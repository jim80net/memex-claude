import type { SkillIndex } from "../core/skill-index.ts";
import type { HookInput, HookOutput, HookConfig } from "../core/types.ts";

export async function handleUserPrompt(
  input: HookInput,
  index: SkillIndex,
  hookConfig: HookConfig
): Promise<HookOutput> {
  const prompt = input.prompt;
  if (!prompt || prompt.trim().length === 0) return {};

  // Search for matching skills
  const results = await index.search(
    prompt,
    hookConfig.topK,
    hookConfig.threshold,
    hookConfig.types
  );

  if (results.length === 0) return {};

  // Read and assemble skill content
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

    const label =
      result.skill.type === "memory" || result.skill.type === "session-learning"
        ? "Recalled Memory"
        : "Matched Skill";

    sections.push(
      `## ${label}: ${result.skill.name} (relevance: ${(result.score * 100).toFixed(0)}%)\n\n**${result.skill.name}**: ${result.skill.description}\n\n${content}`
    );
    totalChars += content.length;
  }

  if (sections.length === 0) return {};

  const additionalContext = [
    "The following skills/memories were automatically loaded based on semantic relevance to your message:",
    "",
    ...sections,
    "",
    "---",
  ].join("\n");

  // Log to stderr (visible in Claude Code verbose mode)
  const memCount = results.filter(
    (r) => r.skill.type === "memory" || r.skill.type === "session-learning"
  ).length;
  const skillCount = results.length - memCount;
  const parts: string[] = [];
  if (skillCount > 0) parts.push(`${skillCount} skill${skillCount > 1 ? "s" : ""}`);
  if (memCount > 0) parts.push(`${memCount} memor${memCount > 1 ? "ies" : "y"}`);
  process.stderr.write(
    `skill-router: injected ${parts.join(" + ")} (${totalChars} chars)\n`
  );

  return { additionalContext };
}
