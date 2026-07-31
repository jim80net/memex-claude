import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(repoRoot, "scripts", "verify-installed.mjs");
const cleanup: string[] = [];

const validHandoff = `### 7. Write the handoff file\nresolve **that exact file** to an absolute path\n\n### 9. Tell the user how to take over\n\n\`\`\`text\nWritten: <absolute-written-handoff-path>\n/takeover <absolute-written-handoff-path>\n\`\`\`\n`;

function sha256(path: string) {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function createFixture() {
  const root = mkdtempSync(join(tmpdir(), "memex-installed-verifier-"));
  cleanup.push(root);
  const claudeHome = join(root, "claude");
  const sourceRoot = join(root, "source");
  const installedRoot = join(root, "installed");
  const releaseDir = join(root, "release");

  for (const target of [sourceRoot, installedRoot]) {
    mkdirSync(join(target, ".claude-plugin"), { recursive: true });
    mkdirSync(join(target, "skills", "handoff"), { recursive: true });
    mkdirSync(join(target, "skills", "takeover"), { recursive: true });
    mkdirSync(join(target, "test"), { recursive: true });
    writeFileSync(join(target, "package.json"), JSON.stringify({ name: "memex-claude", version: "1.9.1" }));
    writeFileSync(join(target, ".claude-plugin", "plugin.json"), JSON.stringify({ name: "memex-claude", version: "1.9.1" }));
    writeFileSync(join(target, "skills", "handoff", "SKILL.md"), validHandoff);
    writeFileSync(join(target, "skills", "takeover", "SKILL.md"), "takeover\n");
    writeFileSync(join(target, "test", "handoff-skill.test.ts"), "handoff regression\n");
  }

  mkdirSync(join(claudeHome, "plugins"), { recursive: true });
  writeFileSync(
    join(claudeHome, "settings.json"),
    JSON.stringify({ enabledPlugins: { "memex-claude@jim80net-plugins": true } }),
  );
  writeFileSync(
    join(claudeHome, "plugins", "installed_plugins.json"),
    JSON.stringify({
      version: 2,
      plugins: {
        "memex-claude@jim80net-plugins": [
          { scope: "user", installPath: installedRoot, version: "1.9.1" },
        ],
      },
    }),
  );

  mkdirSync(releaseDir);
  writeFileSync(join(releaseDir, "memex-linux-x64.tar.gz"), "release asset\n");
  writeFileSync(
    join(releaseDir, "checksums.txt"),
    `${sha256(join(releaseDir, "memex-linux-x64.tar.gz"))}  memex-linux-x64.tar.gz\n`,
  );

  return { root, claudeHome, sourceRoot, installedRoot, releaseDir };
}

function run(fixture: ReturnType<typeof createFixture>) {
  const result = spawnSync(
    process.execPath,
    [
      script,
      "--claude-home",
      fixture.claudeHome,
      "--source-root",
      fixture.sourceRoot,
      "--release-dir",
      fixture.releaseDir,
    ],
    { encoding: "utf8" },
  );
  return { ...result, report: JSON.parse(result.stdout) };
}

function snapshot(root: string): Record<string, string> {
  const result: Record<string, string> = {};
  function visit(path: string, relative = "") {
    for (const name of readdirSync(path).sort()) {
      const child = join(path, name);
      const childRelative = join(relative, name);
      if (statSync(child).isDirectory()) visit(child, childRelative);
      else result[childRelative] = sha256(child);
    }
  }
  visit(root);
  return result;
}

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("read-only installed verifier", () => {
  it("passes aligned version, source hashes, checksums, and absolute handoff", () => {
    const fixture = createFixture();
    const before = snapshot(fixture.root);
    const result = run(fixture);
    expect(result.status).toBe(0);
    expect(result.report).toMatchObject({ ok: true, version: "1.9.1", mode: "read-only" });
    expect(snapshot(fixture.root)).toEqual(before);
  });

  it("fails on installed version drift", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.installedRoot, "package.json"), JSON.stringify({ name: "memex-claude", version: "1.9.0" }));
    const result = run(fixture);
    expect(result.status).toBe(1);
    expect(result.report.failures.join("\n")).toContain("version alignment");
  });

  it("fails on installed source hash drift", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.installedRoot, "skills", "takeover", "SKILL.md"), "drift\n");
    const result = run(fixture);
    expect(result.status).toBe(1);
    expect(result.report.failures.join("\n")).toContain("source hash skills/takeover/SKILL.md");
  });

  it("fails on release checksum drift", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, "memex-linux-x64.tar.gz"), "tampered\n");
    const result = run(fixture);
    expect(result.status).toBe(1);
    expect(result.report.failures.join("\n")).toContain("release checksum memex-linux-x64.tar.gz");
  });

  it("fails on an undeclared hidden release artifact", () => {
    const fixture = createFixture();
    writeFileSync(join(fixture.releaseDir, ".undeclared"), "hostile metadata\n");
    const result = run(fixture);
    expect(result.status).toBe(1);
    expect(result.report).toMatchObject({ ok: false });
    expect(result.report.failures.join("\n")).toContain(
      "release artifact inventory: unexpected: .undeclared",
    );
  });

  it("fails on an absolute handoff contract regression even when source matches", () => {
    const fixture = createFixture();
    const relative = validHandoff
      .replaceAll("<absolute-written-handoff-path>", ".claude/handoffs/resume.md")
      .replace("resolve **that exact file** to an absolute path", "write the handoff");
    for (const root of [fixture.sourceRoot, fixture.installedRoot]) {
      writeFileSync(join(root, "skills", "handoff", "SKILL.md"), relative);
    }
    const result = run(fixture);
    expect(result.status).toBe(1);
    expect(result.report.failures.join("\n")).toContain("absolute handoff contract");
  });
});
