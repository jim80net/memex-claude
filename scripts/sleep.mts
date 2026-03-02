#!/usr/bin/env node
/**
 * /sleep backend: Migrate MEMORY.md entries into memory-skills (SKILL.md format).
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node --import tsx scripts/sleep.mts <cwd> [--dry-run] [--global-scope]
 *
 * Process:
 * 1. Read MEMORY.md + linked topic files for the project
 * 2. Parse ## sections
 * 3. Classify via LLM → memory-skill or keep in MEMORY.md
 * 4. Generate name, description, 5 queries per entry
 * 5. Write SKILL.md files
 * 6. Trim MEMORY.md to navigation index
 */

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.OPENAI_API_KEY;
const MODEL = "gpt-4.1-nano";
const QUERY_COUNT = 5;

if (!API_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const cwd = args.find((a) => !a.startsWith("--")) || process.cwd();
const dryRun = args.includes("--dry-run");
const globalScope = args.includes("--global-scope");

// ---------------------------------------------------------------------------
// Path helpers
// ---------------------------------------------------------------------------

function encodeProjectPath(p: string): string {
  return p.replace(/\//g, "-").replace(/\./g, "-");
}

function getProjectMemoryDir(): string {
  return join(homedir(), ".claude", "projects", encodeProjectPath(cwd), "memory");
}

function getOutputSkillsDir(): string {
  if (globalScope) return join(homedir(), ".claude", "skills");
  return join(cwd, ".claude", "skills");
}

// ---------------------------------------------------------------------------
// LLM helpers
// ---------------------------------------------------------------------------

async function callLLM(systemPrompt: string, userPrompt: string): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: 800,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

// ---------------------------------------------------------------------------
// Section parsing
// ---------------------------------------------------------------------------

type Section = {
  heading: string;
  level: number;
  body: string;
  sourceFile: string;
  triggers: string[];
};

function parseSections(content: string, sourceFile: string): Section[] {
  const sections: Section[] = [];
  const lines = content.split(/\r?\n/);
  let current: Section | null = null;

  for (const line of lines) {
    const headingMatch = line.match(/^(#{2,3})\s+(.+)/);
    if (headingMatch) {
      if (current && (current.body.trim().length > 0 || current.triggers.length > 0)) {
        sections.push(current);
      }
      current = {
        heading: headingMatch[2].trim(),
        level: headingMatch[1].length,
        body: "",
        sourceFile,
        triggers: [],
      };
      continue;
    }

    if (!current) continue;

    // Extract trigger lines
    const triggerMatch = line.match(/^Triggers?:\s*(.+)/i);
    if (triggerMatch) {
      const parsed = triggerMatch[1]
        .split(/,\s*/)
        .map((t) => t.replace(/^["']|["']$/g, "").trim())
        .filter((t) => t.length > 0);
      current.triggers.push(...parsed);
      continue;
    }

    current.body += line + "\n";
  }

  if (current && (current.body.trim().length > 0 || current.triggers.length > 0)) {
    sections.push(current);
  }

  return sections;
}

// ---------------------------------------------------------------------------
// Classification
// ---------------------------------------------------------------------------

type Classification = {
  type: "memory" | "skill" | "workflow" | "keep";
  name: string;
  description: string;
  queries: string[];
};

async function classifySection(section: Section): Promise<Classification> {
  const bodyPreview = section.body.trim().slice(0, 500);

  const response = await callLLM(
    `You classify knowledge entries for a semantic search system. Given a heading and body from a developer's memory file, classify it and generate metadata.

Output EXACTLY this JSON format, nothing else:
{
  "type": "memory|skill|workflow|keep",
  "name": "kebab-case-name",
  "description": "One sentence describing when this knowledge is needed",
  "queries": ["query1", "query2", "query3", "query4", "query5"]
}

Classification rules:
- "memory": Short preference, rule, or fact (e.g., "use pnpm not npm", "API key is in X file")
- "skill": Procedural knowledge with steps (e.g., "how to debug cron errors", "how to deploy")
- "workflow": Multi-step process that follows a specific order
- "keep": Structural reference (e.g., "See [file.md]"), navigation link, or table of contents entry — these should stay in MEMORY.md

Generate 5 diverse, natural queries a developer would ask when they need this knowledge.`,
    `Heading: ${section.heading}\nBody:\n${bodyPreview}`
  );

  try {
    // Extract JSON from response (may have markdown fences)
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON in response");
    const parsed = JSON.parse(jsonMatch[0]) as Classification;

    // Validate
    if (!["memory", "skill", "workflow", "keep"].includes(parsed.type)) {
      parsed.type = "memory";
    }
    if (!parsed.name || typeof parsed.name !== "string") {
      parsed.name = section.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "");
    }
    if (!parsed.description || typeof parsed.description !== "string") {
      parsed.description = section.heading;
    }
    if (!Array.isArray(parsed.queries) || parsed.queries.length === 0) {
      parsed.queries = [parsed.description];
    }

    return parsed;
  } catch {
    // Fallback classification
    return {
      type: "memory",
      name: section.heading
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, ""),
      description: section.heading,
      queries: section.triggers.length > 0
        ? section.triggers
        : [section.heading],
    };
  }
}

// ---------------------------------------------------------------------------
// SKILL.md generation
// ---------------------------------------------------------------------------

function generateSkillMd(
  classification: Classification,
  section: Section
): string {
  const queriesYaml = classification.queries
    .slice(0, QUERY_COUNT)
    .map((q) => `  - "${q.replace(/"/g, '\\"')}"`)
    .join("\n");

  const body = section.body.trim();

  return `---
name: ${classification.name}
description: "${classification.description.replace(/"/g, '\\"')}"
type: ${classification.type}
queries:
${queriesYaml}
---
${body}
`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const memoryDir = getProjectMemoryDir();
  const outputDir = getOutputSkillsDir();

  console.log(`Memory dir: ${memoryDir}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Dry run: ${dryRun}`);
  console.log();

  // 1. Read MEMORY.md
  let memoryMd: string;
  try {
    memoryMd = await readFile(join(memoryDir, "MEMORY.md"), "utf-8");
  } catch {
    console.error("No MEMORY.md found at", join(memoryDir, "MEMORY.md"));
    process.exit(1);
  }

  // 2. Find linked topic files
  const linkedFiles: string[] = [];
  const linkRegex = /\[([^\]]+)\]\(([^)]+\.md)\)/g;
  let match;
  while ((match = linkRegex.exec(memoryMd)) !== null) {
    linkedFiles.push(match[2]);
  }

  // 3. Parse all sections
  const allSections: Section[] = [];

  // Parse MEMORY.md sections
  allSections.push(...parseSections(memoryMd, "MEMORY.md"));

  // Parse linked topic files
  for (const linked of linkedFiles) {
    try {
      const content = await readFile(join(memoryDir, linked), "utf-8");
      allSections.push(...parseSections(content, linked));
    } catch {
      console.warn(`  Warning: linked file not found: ${linked}`);
    }
  }

  console.log(`Found ${allSections.length} sections across ${1 + linkedFiles.length} files\n`);

  // 4. Classify each section
  const toCreate: Array<{ classification: Classification; section: Section }> = [];
  const toKeep: Section[] = [];

  for (const section of allSections) {
    // Skip very short sections (likely just references)
    if (section.body.trim().length < 20 && section.triggers.length === 0) {
      toKeep.push(section);
      continue;
    }

    console.log(`  Classifying: ${section.heading}...`);
    const classification = await classifySection(section);

    if (classification.type === "keep") {
      toKeep.push(section);
      console.log(`    → keep in MEMORY.md`);
    } else {
      toCreate.push({ classification, section });
      console.log(`    → ${classification.type}: ${classification.name}`);
    }
  }

  console.log(
    `\nResults: ${toCreate.length} to create, ${toKeep.length} to keep\n`
  );

  if (dryRun) {
    console.log("--- DRY RUN — would create these skills ---\n");
    for (const { classification, section } of toCreate) {
      console.log(`  ${classification.type}: ${classification.name}`);
      console.log(`    ${classification.description}`);
      console.log(`    queries: ${classification.queries.join(", ")}`);
      console.log();
    }
    return;
  }

  // 5. Write SKILL.md files
  let created = 0;
  for (const { classification, section } of toCreate) {
    const skillDir = join(outputDir, classification.name);
    const skillPath = join(skillDir, "SKILL.md");

    try {
      await mkdir(skillDir, { recursive: true });
      const content = generateSkillMd(classification, section);
      await writeFile(skillPath, content, "utf-8");
      console.log(`  Created: ${skillPath}`);
      created++;
    } catch (err) {
      console.error(`  Failed to create ${skillPath}: ${err}`);
    }
  }

  // 6. Trim MEMORY.md to navigation index
  const trimmedLines: string[] = [
    "# Project Memory",
    "",
    "> Memories have been migrated to memory-skills for semantic search.",
    "> Run `/sleep` again to re-migrate after adding new entries.",
    "",
  ];

  // Keep structural references and topic file links
  for (const section of toKeep) {
    trimmedLines.push(`## ${section.heading}`);
    trimmedLines.push(section.body.trim());
    trimmedLines.push("");
  }

  // Add links to migrated skills as references
  if (toCreate.length > 0) {
    trimmedLines.push("## Migrated Skills");
    trimmedLines.push("");
    for (const { classification } of toCreate) {
      const scope = globalScope ? "~/.claude/skills" : ".claude/skills";
      trimmedLines.push(
        `- **${classification.name}** (${classification.type}): ${classification.description} → \`${scope}/${classification.name}/SKILL.md\``
      );
    }
    trimmedLines.push("");
  }

  // Add topic file references
  if (linkedFiles.length > 0) {
    trimmedLines.push("## Topic Files");
    trimmedLines.push("");
    for (const linked of linkedFiles) {
      trimmedLines.push(`- [${basename(linked, ".md")}](${linked})`);
    }
    trimmedLines.push("");
  }

  const trimmedContent = trimmedLines.join("\n");
  await writeFile(join(memoryDir, "MEMORY.md"), trimmedContent, "utf-8");
  console.log(`\nTrimmed MEMORY.md (${trimmedContent.length} chars)`);

  console.log(`\nDone. Created ${created} memory-skills.`);
  console.log("Skill-router cache will auto-rebuild on next hook invocation.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
