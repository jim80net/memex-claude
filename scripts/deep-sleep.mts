#!/usr/bin/env node
/**
 * /deep-sleep backend: Extract learnings from session transcripts
 * and create memory-skills for semantic injection.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... node --import tsx scripts/deep-sleep.mts <cwd> [--dry-run] [--global-scope] [--since YYYY-MM-DD]
 */

import { readFile, writeFile, readdir, mkdir, stat } from "node:fs/promises";
import { join, basename } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const API_KEY = process.env.OPENAI_API_KEY;
const CLASSIFY_MODEL = "gpt-4.1-nano";
const EMBED_MODEL = "text-embedding-3-small";
const DEDUP_THRESHOLD = 0.85;
const QUERY_COUNT = 5;
const WATERMARK_PATH = join(homedir(), ".claude", "cache", "deep-sleep-watermark");

if (!API_KEY) {
  console.error("OPENAI_API_KEY not set");
  process.exit(1);
}

const args = process.argv.slice(2);
const cwd = args.find((a) => !a.startsWith("--")) || process.cwd();
const dryRun = args.includes("--dry-run");
const globalScope = args.includes("--global-scope");
const sinceIdx = args.indexOf("--since");
const sinceDate = sinceIdx >= 0 ? new Date(args[sinceIdx + 1]) : null;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function encodeProjectPath(p: string): string {
  return p.replace(/\//g, "-").replace(/\./g, "-");
}

function getOutputSkillsDir(): string {
  if (globalScope) return join(homedir(), ".claude", "skills");
  return join(cwd, ".claude", "skills");
}

async function callLLM(systemPrompt: string, userPrompt: string, maxTokens = 1500): Promise<string> {
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({
      model: CLASSIFY_MODEL,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      max_tokens: maxTokens,
    }),
  });

  if (!res.ok) throw new Error(`OpenAI error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { choices: Array<{ message: { content: string } }> };
  return json.choices?.[0]?.message?.content ?? "";
}

async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const res = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
  });

  if (!res.ok) throw new Error(`Embeddings error ${res.status}: ${await res.text()}`);
  const json = await res.json() as { data: Array<{ embedding: number[]; index: number }> };
  const result: number[][] = new Array(texts.length);
  for (const item of json.data) result[item.index] = item.embedding;
  return result;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ---------------------------------------------------------------------------
// Transcript processing
// ---------------------------------------------------------------------------

type TranscriptEntry = {
  role: string;
  content: string | Array<{ type: string; text?: string }>;
};

function extractText(entry: TranscriptEntry): string {
  if (typeof entry.content === "string") return entry.content;
  if (Array.isArray(entry.content)) {
    return entry.content
      .filter((p) => p.type === "text" && p.text)
      .map((p) => p.text!)
      .join("\n");
  }
  return "";
}

async function findTranscripts(): Promise<string[]> {
  const encoded = encodeProjectPath(cwd);
  const projectDir = join(homedir(), ".claude", "projects", encoded);

  // Look for session files
  const transcripts: string[] = [];
  const sessionDirs = [
    projectDir, // direct transcripts
  ];

  for (const dir of sessionDirs) {
    try {
      const entries = await readdir(dir);
      for (const entry of entries) {
        if (!entry.endsWith(".jsonl")) continue;
        const fullPath = join(dir, entry);
        const s = await stat(fullPath);

        // Filter by watermark or --since date
        let cutoff: Date;
        if (sinceDate) {
          cutoff = sinceDate;
        } else {
          try {
            const wm = await readFile(WATERMARK_PATH, "utf-8");
            cutoff = new Date(wm.trim());
          } catch {
            // No watermark — process last 7 days
            cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          }
        }

        if (s.mtime >= cutoff) {
          transcripts.push(fullPath);
        }
      }
    } catch {
      // dir doesn't exist
    }
  }

  return transcripts;
}

async function extractUserMessages(transcriptPath: string): Promise<string[]> {
  const messages: string[] = [];
  try {
    const raw = await readFile(transcriptPath, "utf-8");
    for (const line of raw.split("\n")) {
      if (!line.trim()) continue;
      try {
        const entry = JSON.parse(line) as TranscriptEntry;
        if (entry.role === "user") {
          const text = extractText(entry);
          if (text.length > 10) messages.push(text);
        }
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    // skip unreadable files
  }
  return messages;
}

// ---------------------------------------------------------------------------
// Learning extraction
// ---------------------------------------------------------------------------

type Learning = {
  type: "memory" | "skill" | "workflow" | "tool-guidance" | "stop-rule";
  name: string;
  description: string;
  queries: string[];
  body: string;
};

async function extractLearnings(userMessages: string[]): Promise<Learning[]> {
  if (userMessages.length === 0) return [];

  // Sample messages (cap at 50 to avoid huge context)
  const sampled = userMessages.length > 50
    ? userMessages.filter((_, i) => i % Math.ceil(userMessages.length / 50) === 0)
    : userMessages;

  const messageBlock = sampled
    .map((m, i) => `[${i + 1}] ${m.slice(0, 300)}`)
    .join("\n\n");

  const response = await callLLM(
    `You analyze developer chat messages to extract reusable learnings.
Output a JSON array of learnings. Each learning should have:
{
  "type": "memory|skill|workflow|tool-guidance|stop-rule",
  "name": "kebab-case-name",
  "description": "One sentence: when is this useful",
  "queries": ["5 natural queries that would trigger this"],
  "body": "The actual instruction or knowledge (1-5 lines)"
}

Types:
- "memory": Preference or fact ("always use pnpm", "API key is in .env")
- "skill": Procedure with steps
- "workflow": Multi-step ordered process
- "tool-guidance": Tips for using a specific tool (Bash, Edit, etc.)
- "stop-rule": Pattern to detect in assistant responses that should trigger continuation

Extract ONLY clear, reusable patterns. Skip one-off requests.
Output just the JSON array, nothing else.`,
    `User messages from recent sessions:\n\n${messageBlock}`,
    2000
  );

  try {
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    const parsed = JSON.parse(jsonMatch[0]) as Learning[];
    return parsed.filter(
      (l) =>
        l.name &&
        l.description &&
        l.queries?.length > 0 &&
        l.body &&
        ["memory", "skill", "workflow", "tool-guidance", "stop-rule"].includes(l.type)
    );
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Deduplication
// ---------------------------------------------------------------------------

async function deduplicateAgainstExisting(
  learnings: Learning[]
): Promise<Learning[]> {
  if (learnings.length === 0) return [];

  // Load existing skill embeddings from cache
  const cachePath = join(homedir(), ".claude", "cache", "skill-router.json");
  let existingEmbeddings: number[][] = [];

  try {
    const raw = await readFile(cachePath, "utf-8");
    const cache = JSON.parse(raw) as {
      skills: Record<string, { embeddings: number[][] }>;
    };
    for (const skill of Object.values(cache.skills)) {
      if (skill.embeddings?.length > 0) {
        existingEmbeddings.push(skill.embeddings[0]); // Use first embedding
      }
    }
  } catch {
    // No cache — no dedup needed
    return learnings;
  }

  if (existingEmbeddings.length === 0) return learnings;

  // Embed learning descriptions
  const descriptions = learnings.map((l) => l.description);
  const newEmbeddings = await embedTexts(descriptions);

  // Check each learning against all existing
  const novel: Learning[] = [];
  for (let i = 0; i < learnings.length; i++) {
    const newEmb = newEmbeddings[i];
    let maxSim = 0;
    for (const existing of existingEmbeddings) {
      const sim = cosineSimilarity(newEmb, existing);
      if (sim > maxSim) maxSim = sim;
    }

    if (maxSim < DEDUP_THRESHOLD) {
      novel.push(learnings[i]);
    } else {
      console.log(`  Dedup: "${learnings[i].name}" (similarity ${(maxSim * 100).toFixed(0)}% to existing)`);
    }
  }

  return novel;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const outputDir = getOutputSkillsDir();

  console.log(`Working directory: ${cwd}`);
  console.log(`Output dir: ${outputDir}`);
  console.log(`Dry run: ${dryRun}\n`);

  // 1. Find transcripts
  const transcripts = await findTranscripts();
  console.log(`Found ${transcripts.length} unprocessed transcripts\n`);

  if (transcripts.length === 0) {
    console.log("No new transcripts to process.");
    return;
  }

  // 2. Extract user messages
  const allMessages: string[] = [];
  for (const t of transcripts) {
    const messages = await extractUserMessages(t);
    allMessages.push(...messages);
    console.log(`  ${basename(t)}: ${messages.length} user messages`);
  }

  console.log(`\nTotal: ${allMessages.length} user messages\n`);

  // 3. Extract learnings via LLM
  console.log("Extracting learnings...");
  const learnings = await extractLearnings(allMessages);
  console.log(`  Found ${learnings.length} potential learnings\n`);

  if (learnings.length === 0) {
    console.log("No learnings extracted.");
    await updateWatermark();
    return;
  }

  // 4. Deduplicate
  console.log("Deduplicating against existing skills...");
  const novel = await deduplicateAgainstExisting(learnings);
  console.log(`  ${novel.length} novel learnings (${learnings.length - novel.length} duplicates)\n`);

  if (novel.length === 0) {
    console.log("All learnings already captured.");
    await updateWatermark();
    return;
  }

  // 5. Create skills
  if (dryRun) {
    console.log("--- DRY RUN — would create these skills ---\n");
    for (const learning of novel) {
      console.log(`  ${learning.type}: ${learning.name}`);
      console.log(`    ${learning.description}`);
      console.log(`    queries: ${learning.queries.join(", ")}`);
      console.log(`    body: ${learning.body.slice(0, 100)}...`);
      console.log();
    }
    return;
  }

  let created = 0;
  for (const learning of novel) {
    const skillDir = join(outputDir, learning.name);
    const skillPath = join(skillDir, "SKILL.md");

    const queriesYaml = learning.queries
      .slice(0, QUERY_COUNT)
      .map((q) => `  - "${q.replace(/"/g, '\\"')}"`)
      .join("\n");

    const content = `---
name: ${learning.name}
description: "${learning.description.replace(/"/g, '\\"')}"
type: ${learning.type}
queries:
${queriesYaml}
---
${learning.body.trim()}
`;

    try {
      await mkdir(skillDir, { recursive: true });
      await writeFile(skillPath, content, "utf-8");
      console.log(`  Created: ${skillPath}`);
      created++;
    } catch (err) {
      console.error(`  Failed: ${skillPath}: ${err}`);
    }
  }

  // 6. Update watermark
  await updateWatermark();

  console.log(`\nDone. Created ${created} memory-skills from ${transcripts.length} transcripts.`);
}

async function updateWatermark(): Promise<void> {
  try {
    await mkdir(join(homedir(), ".claude", "cache"), { recursive: true });
    await writeFile(WATERMARK_PATH, new Date().toISOString(), "utf-8");
  } catch {
    // non-critical
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
