import { readdir, readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import { homedir } from "node:os";
import { embedTexts, cosineSimilarity } from "./embeddings.ts";
import { loadCache, saveCache, getCachedSkill, setCachedSkill } from "./cache.ts";
import { getProjectMemoryDir, getProjectSkillsDir } from "./path-encoder.ts";
import type {
  SkillRouterConfig,
  IndexedSkill,
  SkillSearchResult,
  SkillType,
  ParsedFrontmatter,
  CacheData,
} from "./types.ts";

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

export function parseFrontmatter(content: string): { meta: ParsedFrontmatter; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { meta: {}, body: content };

  const frontmatter = match[1];
  const body = match[2];
  const meta: ParsedFrontmatter = {};
  const queries: string[] = [];
  let inQueriesBlock = false;

  for (const line of frontmatter.split(/\r?\n/)) {
    if (inQueriesBlock) {
      const listItem = line.match(/^\s+-\s+(.*)/);
      if (listItem) {
        queries.push(listItem[1].replace(/^["']|["']$/g, "").trim());
        continue;
      }
      inQueriesBlock = false;
    }

    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const rawValue = line.slice(colonIdx + 1).trim();
    const value = rawValue.replace(/^["']|["']$/g, "");

    if (key === "name") meta.name = value;
    if (key === "description") meta.description = value;
    if (key === "type") meta.type = value as SkillType;
    if (key === "queries" && rawValue === "") inQueriesBlock = true;
  }

  if (queries.length > 0) meta.queries = queries;
  return { meta, body };
}

/**
 * Parse a memory markdown file (from project memory dir).
 * Extracts ## sections and looks for `Triggers:` lines as queries.
 */
export function parseMemoryFile(
  content: string,
  filePath: string
): Array<{ name: string; description: string; queries: string[]; body: string }> {
  const results: Array<{ name: string; description: string; queries: string[]; body: string }> = [];

  // Split by ## headings
  const sections = content.split(/^(?=##\s)/m);

  for (const section of sections) {
    const headingMatch = section.match(/^##\s+(.+)/);
    if (!headingMatch) continue;

    const name = headingMatch[1].trim();
    const bodyLines: string[] = [];
    const queries: string[] = [];

    for (const line of section.split(/\r?\n/).slice(1)) {
      const triggerMatch = line.match(/^Triggers?:\s*(.+)/i);
      if (triggerMatch) {
        // Parse comma-separated or quoted triggers
        const raw = triggerMatch[1];
        const parsed = raw
          .split(/,\s*/)
          .map((t) => t.replace(/^["']|["']$/g, "").trim())
          .filter((t) => t.length > 0);
        queries.push(...parsed);
      } else {
        bodyLines.push(line);
      }
    }

    const body = bodyLines.join("\n").trim();
    if (body.length > 0 || queries.length > 0) {
      // Use the first meaningful line as description if body is short
      const description = body.split("\n")[0]?.trim() || name;
      results.push({ name, description, queries, body });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Directory scanning
// ---------------------------------------------------------------------------

async function scanSkillDir(dir: string): Promise<string[]> {
  const skillFiles: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return skillFiles;
  }

  for (const entry of entries) {
    const skillMd = join(dir, entry, "SKILL.md");
    try {
      await stat(skillMd);
      skillFiles.push(skillMd);
    } catch {
      // No SKILL.md in this subdirectory
    }
  }

  return skillFiles;
}

async function scanMemoryDir(dir: string): Promise<string[]> {
  const memoryFiles: string[] = [];
  let entries: string[];
  try {
    entries = await readdir(dir);
  } catch {
    return memoryFiles;
  }

  for (const entry of entries) {
    if (!entry.endsWith(".md")) continue;
    // Skip MEMORY.md itself — it's injected by Claude Code already
    if (entry === "MEMORY.md") continue;
    memoryFiles.push(join(dir, entry));
  }

  return memoryFiles;
}

// ---------------------------------------------------------------------------
// SkillIndex
// ---------------------------------------------------------------------------

export class SkillIndex {
  private skills: IndexedSkill[] = [];
  private cache: CacheData | null = null;
  private lastBuildTime = 0;

  constructor(private config: SkillRouterConfig) {}

  get skillCount(): number {
    return this.skills.length;
  }

  /**
   * Build the index by scanning all skill directories and memory files.
   * Uses cache for unchanged files (mtime-gated).
   */
  async build(cwd: string): Promise<void> {
    // Load cache if not already loaded
    if (!this.cache) {
      this.cache = await loadCache(this.config.embeddingModel);
    }

    // Determine scan directories
    const globalSkillsDir = join(homedir(), ".claude", "skills");
    const projectSkillsDir = getProjectSkillsDir(cwd);
    const projectMemoryDir = getProjectMemoryDir(cwd);

    const skillDirs = [globalSkillsDir, projectSkillsDir, ...this.config.skillDirs];

    // Scan for SKILL.md files
    const skillFileArrays = await Promise.all(skillDirs.map(scanSkillDir));
    const skillFiles = skillFileArrays.flat();

    // Scan for memory files
    const memoryFiles = await scanMemoryDir(projectMemoryDir);

    // Stat all files to detect changes
    type FileInfo = { location: string; mtime: number; isMemory: boolean };
    const fileInfos: FileInfo[] = [];

    const statPromises = [
      ...skillFiles.map(async (f): Promise<FileInfo | null> => {
        try {
          const s = await stat(f);
          return { location: f, mtime: s.mtimeMs, isMemory: false };
        } catch {
          return null;
        }
      }),
      ...memoryFiles.map(async (f): Promise<FileInfo | null> => {
        try {
          const s = await stat(f);
          return { location: f, mtime: s.mtimeMs, isMemory: true };
        } catch {
          return null;
        }
      }),
    ];

    const statResults = (await Promise.all(statPromises)).filter(
      (r): r is FileInfo => r !== null
    );

    const currentLocations = new Set(statResults.map((s) => s.location));

    // Find files that need (re)embedding
    type ToEmbed = {
      name: string;
      description: string;
      location: string;
      queries: string[];
      type: SkillType;
      mtime: number;
      body: string;
    };
    const toEmbed: ToEmbed[] = [];

    for (const info of statResults) {
      const cached = getCachedSkill(this.cache, info.location);
      if (cached && cached.mtime === info.mtime) {
        // Restore from cache — no re-embed needed
        const existing = this.skills.find((s) => s.location === info.location);
        if (!existing) {
          this.skills.push({
            name: cached.name,
            description: cached.description,
            location: info.location,
            type: cached.type,
            embeddings: cached.embeddings,
            queries: cached.queries,
            mtime: cached.mtime,
          });
        }
        continue;
      }

      // File is new or changed — parse and queue for embedding
      try {
        const raw = await readFile(info.location, "utf-8");

        if (info.isMemory) {
          // Parse memory file into sections
          const sections = parseMemoryFile(raw, info.location);
          for (const section of sections) {
            const key = `${info.location}#${section.name}`;
            const queries =
              section.queries.length > 0 ? section.queries : [section.description];
            toEmbed.push({
              name: section.name,
              description: section.description,
              location: key,
              queries,
              type: "memory",
              mtime: info.mtime,
              body: section.body,
            });
          }
        } else {
          // Parse SKILL.md
          const { meta, body } = parseFrontmatter(raw);
          if (!meta.name || !meta.description) continue;
          const queries = meta.queries?.length ? meta.queries : [meta.description];
          const type = meta.type || "skill";
          toEmbed.push({
            name: meta.name,
            description: meta.description,
            location: info.location,
            queries,
            type,
            mtime: info.mtime,
            body,
          });
        }
      } catch {
        // Skip unreadable files
      }
    }

    // Embed new/changed skills in one batch
    if (toEmbed.length > 0) {
      const flatQueries = toEmbed.flatMap((p) => p.queries);
      const flatEmbeddings = await embedTexts(flatQueries, {
        model: this.config.embeddingModel,
      });

      let offset = 0;
      for (const item of toEmbed) {
        const embeddings = flatEmbeddings.slice(offset, offset + item.queries.length);
        const skill: IndexedSkill = {
          name: item.name,
          description: item.description,
          location: item.location,
          type: item.type,
          embeddings,
          queries: item.queries,
          mtime: item.mtime,
        };

        const existing = this.skills.findIndex((s) => s.location === item.location);
        if (existing >= 0) this.skills[existing] = skill;
        else this.skills.push(skill);

        // Update cache
        setCachedSkill(this.cache, item.location, {
          name: item.name,
          description: item.description,
          queries: item.queries,
          embeddings,
          mtime: item.mtime,
          type: item.type,
        });

        offset += item.queries.length;
      }
    }

    // Remove deleted skills
    this.skills = this.skills.filter((s) => {
      // For memory file sections (location contains #), check the base file
      const baseLocation = s.location.includes("#")
        ? s.location.split("#")[0]
        : s.location;
      return currentLocations.has(baseLocation) || currentLocations.has(s.location);
    });

    // Clean cache of deleted files
    for (const loc of Object.keys(this.cache.skills)) {
      const baseLoc = loc.includes("#") ? loc.split("#")[0] : loc;
      if (!currentLocations.has(baseLoc) && !currentLocations.has(loc)) {
        delete this.cache.skills[loc];
      }
    }

    // Save cache
    await saveCache(this.cache);

    this.lastBuildTime = Date.now();
  }

  /**
   * Search the index for skills matching the query.
   * Filters by skill type if typeFilter is provided.
   */
  async search(
    query: string,
    topK: number,
    threshold: number,
    typeFilter?: SkillType[]
  ): Promise<SkillSearchResult[]> {
    let candidates = this.skills;
    if (typeFilter && typeFilter.length > 0) {
      const allowed = new Set(typeFilter);
      candidates = candidates.filter((s) => allowed.has(s.type));
    }

    if (candidates.length === 0) return [];

    const [queryEmbedding] = await embedTexts([query], {
      model: this.config.embeddingModel,
    });

    const scored = candidates.map((skill) => {
      const similarities = skill.embeddings.map((e) => cosineSimilarity(queryEmbedding, e));
      const score = Math.max(...similarities); // Use max rather than avg for better precision
      return { skill, score };
    });

    return scored
      .filter((r) => r.score >= threshold)
      .sort((a, b) => b.score - a.score)
      .slice(0, topK);
  }

  /**
   * Read the body content of a skill file, stripping frontmatter.
   */
  async readSkillContent(location: string): Promise<string> {
    // Handle memory file sections (location is path#section-name)
    if (location.includes("#")) {
      const [filePath, sectionName] = location.split("#", 2);
      const raw = await readFile(filePath, "utf-8");
      const sections = parseMemoryFile(raw, filePath);
      const section = sections.find((s) => s.name === sectionName);
      return section?.body.trim() || "";
    }

    const raw = await readFile(location, "utf-8");
    const { body } = parseFrontmatter(raw);
    return body.trim();
  }
}
