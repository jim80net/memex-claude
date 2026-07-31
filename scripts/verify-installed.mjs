#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  closeSync,
  existsSync,
  openSync,
  readFileSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
} from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, isAbsolute, join, resolve } from "node:path";

const PLUGIN_ID = "memex-claude@jim80net-plugins";
const COMPARED_FILES = [
  "package.json",
  ".claude-plugin/plugin.json",
  "skills/handoff/SKILL.md",
  "skills/takeover/SKILL.md",
  "test/handoff-skill.test.ts",
];
const HANDOFF_TOKEN = "<absolute-written-handoff-path>";

function parseArgs(argv) {
  const options = {
    claudeHome: join(homedir(), ".claude"),
    sourceRoot: undefined,
    releaseDir: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--claude-home") {
      options.claudeHome = requireValue(argv, ++index, argument);
    } else if (argument === "--source-root") {
      options.sourceRoot = requireValue(argv, ++index, argument);
    } else if (argument === "--release-dir") {
      options.releaseDir = requireValue(argv, ++index, argument);
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  if (!options.sourceRoot) {
    throw new Error("--source-root is required (use an immutable release-tag checkout)");
  }
  return options;
}

function requireValue(argv, index, argument) {
  const value = argv[index];
  if (!value) throw new Error(`${argument} requires a path`);
  return value;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function sha256(path) {
  const hash = createHash("sha256");
  const descriptor = openSync(path, "r");
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  try {
    let bytesRead = 0;
    do {
      bytesRead = readSync(descriptor, buffer, 0, buffer.length, null);
      if (bytesRead > 0) hash.update(buffer.subarray(0, bytesRead));
    } while (bytesRead > 0);
  } finally {
    closeSync(descriptor);
  }
  return hash.digest("hex");
}

function check(report, name, ok, detail) {
  report.checks.push({ name, ok, detail });
  if (!ok) report.failures.push(`${name}: ${detail}`);
}

function discoverInstalled(claudeHome, report) {
  const settings = readJson(join(claudeHome, "settings.json"));
  check(
    report,
    "plugin enabled",
    settings.enabledPlugins?.[PLUGIN_ID] === true,
    `settings enabledPlugins[${PLUGIN_ID}] must be true`,
  );

  const registry = readJson(join(claudeHome, "plugins", "installed_plugins.json"));
  const userRecords = (registry.plugins?.[PLUGIN_ID] ?? []).filter(
    (record) => record.scope === "user",
  );
  check(
    report,
    "single user-scope installation",
    userRecords.length === 1,
    `found ${userRecords.length} user-scope records`,
  );
  if (userRecords.length !== 1) return undefined;

  const record = userRecords[0];
  const root = realpathSync(record.installPath);
  check(
    report,
    "registry install path",
    isAbsolute(record.installPath) && statSync(root).isDirectory(),
    record.installPath,
  );
  return { record, root };
}

function verifyVersions(installed, sourceRoot, report) {
  const installedPackage = readJson(join(installed.root, "package.json"));
  const installedPlugin = readJson(join(installed.root, ".claude-plugin", "plugin.json"));
  const sourcePackage = readJson(join(sourceRoot, "package.json"));
  const sourcePlugin = readJson(join(sourceRoot, ".claude-plugin", "plugin.json"));
  const versions = {
    registry: installed.record.version,
    installedPackage: installedPackage.version,
    installedPlugin: installedPlugin.version,
    sourcePackage: sourcePackage.version,
    sourcePlugin: sourcePlugin.version,
  };
  const unique = new Set(Object.values(versions));
  check(report, "version alignment", unique.size === 1, JSON.stringify(versions));
  report.version = sourcePackage.version;
}

function verifySourceHashes(installedRoot, sourceRoot, report) {
  report.files = [];
  for (const relativePath of COMPARED_FILES) {
    const installedPath = join(installedRoot, relativePath);
    const sourcePath = join(sourceRoot, relativePath);
    const present = existsSync(installedPath) && existsSync(sourcePath);
    if (!present) {
      check(report, `source hash ${relativePath}`, false, "file missing from installed or source root");
      continue;
    }
    const installedHash = sha256(installedPath);
    const sourceHash = sha256(sourcePath);
    report.files.push({ path: relativePath, sha256: installedHash });
    check(
      report,
      `source hash ${relativePath}`,
      installedHash === sourceHash,
      `${installedHash} installed; ${sourceHash} source`,
    );
  }
}

function completionTemplate(skill) {
  const stepNine = skill.split("### 9. Tell the user how to take over")[1];
  if (!stepNine) throw new Error("handoff step 9 is missing");
  const block = stepNine.match(/```(?:text)?\r?\n([\s\S]*?)\r?\n```/)?.[1];
  if (!block) throw new Error("handoff completion template is missing");
  return block;
}

function verifyHandoff(installedRoot, report) {
  try {
    const skill = readFileSync(join(installedRoot, "skills", "handoff", "SKILL.md"), "utf8");
    const template = completionTemplate(skill);
    const tokenCount = template.split(HANDOFF_TOKEN).length - 1;
    const contractPresent =
      skill.includes("resolve **that exact file** to an absolute path") &&
      tokenCount === 2 &&
      template.includes(`/takeover ${HANDOFF_TOKEN}`) &&
      !template.includes("/takeover .claude/handoffs/");
    check(report, "absolute handoff contract", contractPresent, `token occurrences: ${tokenCount}`);

    const unrelatedCwd = join(tmpdir(), "memex-unrelated-next-session-cwd");
    for (const root of [
      join(tmpdir(), "memex-handoff", "main"),
      join(tmpdir(), "memex-handoff", "main", ".claude", "worktrees", "topic"),
    ]) {
      const writtenPath = resolve(root, ".claude", "handoffs", "resume.md");
      const rendered = template.replaceAll(HANDOFF_TOKEN, writtenPath);
      const takeoverPath = rendered
        .split(/\r?\n/)
        .find((line) => line.trimStart().startsWith("/takeover "))
        ?.trim()
        .slice("/takeover ".length);
      check(
        report,
        `unrelated-cwd handoff ${basename(root)}`,
        takeoverPath === writtenPath && isAbsolute(takeoverPath ?? "") &&
          resolve(unrelatedCwd, takeoverPath ?? "") === writtenPath,
        takeoverPath ?? "missing /takeover command",
      );
    }
  } catch (error) {
    check(
      report,
      "absolute handoff contract",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function parseChecksums(path) {
  const entries = new Map();
  for (const [index, line] of readFileSync(path, "utf8").split(/\r?\n/).entries()) {
    if (!line.trim()) continue;
    const match = line.match(/^([a-fA-F0-9]{64})\s+\*?(.+)$/);
    if (!match) throw new Error(`invalid checksums.txt line ${index + 1}`);
    const name = match[2];
    if (basename(name) !== name || name === "." || name === "..") {
      throw new Error(`unsafe checksum asset name: ${name}`);
    }
    if (entries.has(name)) throw new Error(`duplicate checksum asset: ${name}`);
    entries.set(name, match[1].toLowerCase());
  }
  if (entries.size === 0) throw new Error("checksums.txt contains no assets");
  return entries;
}

function verifyRelease(releaseDir, report) {
  try {
    const checksumsPath = join(releaseDir, "checksums.txt");
    const entries = parseChecksums(checksumsPath);
    for (const [name, expected] of entries) {
      const assetPath = join(releaseDir, name);
      const actual = existsSync(assetPath) ? sha256(assetPath) : "missing";
      check(report, `release checksum ${name}`, actual === expected, `${actual}; expected ${expected}`);
    }
    const extras = readdirSync(releaseDir)
      .filter((name) => name !== "checksums.txt" && !name.startsWith("."))
      .filter((name) => !entries.has(name));
    check(report, "release artifact inventory", extras.length === 0, `unexpected: ${extras.join(", ") || "none"}`);
    report.release = {
      directory: realpathSync(releaseDir),
      checksumsSha256: sha256(checksumsPath),
      artifacts: [...entries.keys()],
    };
  } catch (error) {
    check(
      report,
      "release checksums",
      false,
      error instanceof Error ? error.message : String(error),
    );
  }
}

function main() {
  const report = {
    ok: false,
    pluginId: PLUGIN_ID,
    mode: "read-only",
    checks: [],
    failures: [],
  };

  try {
    const options = parseArgs(process.argv.slice(2));
    const sourceRoot = realpathSync(options.sourceRoot);
    const installed = discoverInstalled(resolve(options.claudeHome), report);
    if (installed) {
      report.installPath = installed.root;
      verifyVersions(installed, sourceRoot, report);
      verifySourceHashes(installed.root, sourceRoot, report);
      verifyHandoff(installed.root, report);
    }
    if (options.releaseDir) verifyRelease(realpathSync(options.releaseDir), report);
  } catch (error) {
    report.failures.push(error instanceof Error ? error.message : String(error));
  }

  report.ok = report.failures.length === 0;
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  if (!report.ok) process.exitCode = 1;
}

main();
