import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const script = join(repoRoot, "scripts", "inspect-core-pin.mjs");
const cleanup: string[] = [];

function fixture(specifier = "^0.7.3") {
  const root = mkdtempSync(join(tmpdir(), "memex-core-pin-"));
  cleanup.push(root);
  mkdirSync(root, { recursive: true });
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ dependencies: { "@jim80net/memex-core": "^0.7.3" } }),
  );
  writeFileSync(
    join(root, "pnpm-lock.yaml"),
    `lockfileVersion: '9.0'\nimporters:\n  .:\n    dependencies:\n      '@jim80net/memex-core':\n        specifier: ${specifier}\n        version: 0.7.3(@types/node@22.0.0)\n`,
  );
  return root;
}

afterEach(() => {
  for (const path of cleanup.splice(0)) rmSync(path, { recursive: true, force: true });
});

describe("Core pin inspector", () => {
  it("derives declaration and exact resolution from manifest and lock", () => {
    const result = spawnSync(process.execPath, [script, "--root", fixture(), "--json"], {
      encoding: "utf8",
    });
    expect(result.status).toBe(0);
    expect(JSON.parse(result.stdout)).toMatchObject({
      package: "@jim80net/memex-core",
      declaration: "^0.7.3",
      resolvedVersion: "0.7.3",
    });
  });

  it("fails closed when manifest and lock declarations drift", () => {
    const result = spawnSync(process.execPath, [script, "--root", fixture("^0.8.0")], {
      encoding: "utf8",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("package.json declares ^0.7.3");
  });

  it("keeps the doctor skill free of a hard-coded Core expectation", () => {
    const doctor = readFileSync(join(repoRoot, "skills", "doctor", "SKILL.md"), "utf8");
    expect(doctor).toContain('inspect-core-pin.mjs" --root "$PLUGIN_ROOT"');
    expect(doctor).not.toMatch(/expect @jim80net\/memex-core/);
  });
});
