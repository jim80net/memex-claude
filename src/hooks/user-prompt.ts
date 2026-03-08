import type { SkillIndex } from "../core/skill-index.ts";
import type { HookInput, HookOutput, HookConfig } from "../core/types.ts";
import { loadSession, saveSession, hasRuleBeenShown, markRuleShown } from "../core/session.ts";
import { loadTelemetry, saveTelemetry, recordMatch } from "../core/telemetry.ts";

export async function handleUserPrompt(
  input: HookInput,
  index: SkillIndex,
  hookConfig: HookConfig
): Promise<HookOutput> {
  const prompt = input.prompt;
  if (!prompt || prompt.trim().length === 0) return {};

  // Search for matching entries
  const results = await index.search(
    prompt,
    hookConfig.topK,
    hookConfig.threshold,
    hookConfig.types
  );

  if (results.length === 0) return {};

  // Load session state for rule disclosure tracking
  const session = await loadSession(input.session_id);

  // Read and assemble content with type-specific disclosure
  let totalChars = 0;
  const sections: string[] = [];
  const injectedLocations: string[] = [];
  let sessionDirty = false;

  for (const result of results) {
    const { skill, score } = result;
    const relevance = `${(score * 100).toFixed(0)}%`;
    let section: string;

    if (skill.type === "rule") {
      if (hasRuleBeenShown(session, skill.location)) {
        // Subsequent match: one-liner reminder
        const reminder = skill.oneLiner || skill.description;
        section = `## Rule reminder: ${skill.name} (relevance: ${relevance})\n\n${reminder}`;
      } else {
        // First match: full content
        let content: string;
        try {
          content = await index.readSkillContent(skill.location);
        } catch {
          continue;
        }
        section = `## Rule: ${skill.name} (relevance: ${relevance})\n\n${content}`;
        markRuleShown(session, skill.location);
        sessionDirty = true;
      }
    } else if (skill.type === "memory" || skill.type === "session-learning") {
      // Memory: always inject full content (they're short)
      let content: string;
      try {
        content = await index.readSkillContent(skill.location);
      } catch {
        continue;
      }
      section = `## Recalled Memory: ${skill.name} (relevance: ${relevance})\n\n${content}`;
    } else {
      // Skill, workflow, tool-guidance: description teaser only
      section = `## Available Skill: ${skill.name} (relevance: ${relevance})\n\n**${skill.name}**: ${skill.description}\n\nTo use this skill, read the full instructions at: \`${skill.location}\``;
    }

    if (totalChars + section.length > hookConfig.maxInjectedChars) break;

    sections.push(section);
    injectedLocations.push(skill.location);
    totalChars += section.length;
  }

  // Persist session state if rules were shown for the first time
  if (sessionDirty) {
    await saveSession(session);
  }

  // Record match telemetry only for entries that were actually injected
  if (injectedLocations.length > 0 && input.session_id) {
    try {
      const telemetry = await loadTelemetry();
      for (const location of injectedLocations) {
        recordMatch(telemetry, location, input.session_id);
      }
      await saveTelemetry(telemetry);
    } catch {
      // Telemetry is best-effort — don't fail the hook
    }
  }

  if (sections.length === 0) return {};

  const additionalContext = [
    "The following was automatically loaded based on semantic relevance to your message:",
    "",
    ...sections,
    "",
    "---",
  ].join("\n");

  // Log to stderr (visible in Claude Code verbose mode)
  const counts = { rules: 0, memories: 0, skills: 0 };
  for (const r of results) {
    if (r.skill.type === "rule") counts.rules++;
    else if (r.skill.type === "memory" || r.skill.type === "session-learning") counts.memories++;
    else counts.skills++;
  }
  const parts: string[] = [];
  if (counts.rules > 0) parts.push(`${counts.rules} rule${counts.rules > 1 ? "s" : ""}`);
  if (counts.skills > 0) parts.push(`${counts.skills} skill${counts.skills > 1 ? "s" : ""}`);
  if (counts.memories > 0) parts.push(`${counts.memories} memor${counts.memories > 1 ? "ies" : "y"}`);
  process.stderr.write(
    `skill-router: injected ${parts.join(" + ")} (${totalChars} chars)\n`
  );

  return { additionalContext };
}
