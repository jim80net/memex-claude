import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir, platform, arch } from "node:os";
import { delimiter, join, resolve } from "node:path";

const home = mkdtempSync(join(tmpdir(), "memex-claude-packaged-"));

try {
  const skillDir = join(home, ".claude", "skills", "packaged-smoke");
  mkdirSync(skillDir, { recursive: true });
  writeFileSync(
    join(skillDir, "SKILL.md"),
    [
      "---",
      "name: packaged-smoke",
      "description: Packaged runtime embedding smoke",
      "---",
      "",
      "# Packaged runtime",
      "",
      "Proves a cold standalone index can generate a real embedding.",
      "",
    ].join("\n"),
  );

  const platformKey = `${platform()}-${arch()}`;
  const outputDir = resolve("dist", platformKey);
  const binary = join(outputDir, platform() === "win32" ? "memex.exe" : "memex");
  const input = JSON.stringify({
    hook_event_name: "UserPromptSubmit",
    cwd: home,
    prompt: "find the packaged runtime skill",
  });
  const env = {
    ...process.env,
    HOME: home,
    LD_LIBRARY_PATH: [outputDir, process.env.LD_LIBRARY_PATH].filter(Boolean).join(delimiter),
    PATH: [outputDir, process.env.PATH].filter(Boolean).join(delimiter),
  };

  const result = spawnSync(binary, {
    input,
    encoding: "utf-8",
    env,
    timeout: 120_000,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(`packaged binary exited ${result.status}: ${result.stderr}`);
  }
  if (result.stderr.includes("index build failed")) {
    throw new Error(`packaged cold index failed: ${result.stderr}`);
  }

  const cache = JSON.parse(
    readFileSync(join(home, ".claude", "cache", "memex-cache.json"), "utf-8"),
  ) as {
    skills?: Record<string, { embeddings?: number[][] }>;
  };
  const entry = Object.values(cache.skills ?? {}).find(
    (candidate) => candidate.embeddings?.length,
  );
  const embedding = entry?.embeddings?.[0];
  if (
    !embedding ||
    embedding.length !== 384 ||
    !embedding.every((value) => Number.isFinite(value))
  ) {
    throw new Error("packaged cold index did not persist one finite 384-dimensional embedding");
  }

  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      platform: platformKey,
      embeddingDimensions: embedding.length,
      stderr: result.stderr,
    })}\n`,
  );
} finally {
  rmSync(home, { recursive: true, force: true });
}
