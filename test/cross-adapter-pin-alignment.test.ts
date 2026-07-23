import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const CROSS_ADAPTER_TRANSFORMERS_RANGE = "^3.8.1";
const CROSS_ADAPTER_TRANSFORMERS_RESOLVED = "3.8.1";
const CROSS_ADAPTER_MEMEX_CORE_RANGE = "^0.7.1";
const CROSS_ADAPTER_MEMEX_CORE_RESOLVED = "0.7.1";
const APPLICATION_SHARP_OVERRIDE = "0.35.3";

function readJson(relFromRepoRoot: string): Record<string, unknown> {
  const url = new URL(`../${relFromRepoRoot}`, import.meta.url);
  return JSON.parse(readFileSync(fileURLToPath(url), "utf-8")) as Record<string, unknown>;
}

function depRange(pkg: Record<string, unknown>, name: string): string | undefined {
  for (const field of ["dependencies", "optionalDependencies", "peerDependencies"]) {
    const block = pkg[field];
    if (block && typeof block === "object") {
      const v = (block as Record<string, string>)[name];
      if (typeof v === "string") return v;
    }
  }
  return undefined;
}

describe("cross-adapter version-pin alignment (memex-core#32)", () => {
  const claudePkg = readJson("package.json");

  it("@jim80net/memex-core range", () => {
    expect(depRange(claudePkg, "@jim80net/memex-core")).toBe(CROSS_ADAPTER_MEMEX_CORE_RANGE);
  });

  it("the INSTALLED @jim80net/memex-core version equals the reference", () => {
    const installed = readJson("node_modules/@jim80net/memex-core/package.json");
    expect(installed.version).toBe(CROSS_ADAPTER_MEMEX_CORE_RESOLVED);
  });

  it("@huggingface/transformers range matches memex-core", () => {
    const corePkg = readJson("node_modules/@jim80net/memex-core/package.json");
    const coreRange = depRange(corePkg, "@huggingface/transformers");
    expect(coreRange).toBeDefined();
    expect(depRange(claudePkg, "@huggingface/transformers")).toBe(coreRange);
    expect(CROSS_ADAPTER_TRANSFORMERS_RANGE).toBe(coreRange);
    const installed = readJson("node_modules/@huggingface/transformers/package.json");
    expect(installed.version).toBe(CROSS_ADAPTER_TRANSFORMERS_RESOLVED);
  });

  it("the application owns one patched sharp runtime", () => {
    const pnpm = claudePkg.pnpm as
      | { overrides?: Record<string, string> }
      | undefined;
    expect(pnpm?.overrides?.sharp).toBe(APPLICATION_SHARP_OVERRIDE);

    const storeDir = fileURLToPath(new URL("../node_modules/.pnpm", import.meta.url));
    const sharpEntries = readdirSync(storeDir)
      .filter((entry) => entry.startsWith("sharp@"))
      .sort();
    expect(sharpEntries).toHaveLength(1);
    expect(sharpEntries[0]).toMatch(
      new RegExp(`^sharp@${APPLICATION_SHARP_OVERRIDE.replaceAll(".", "\\.")}(?:_|$)`),
    );

    const installed = JSON.parse(
      readFileSync(
        join(storeDir, sharpEntries[0]!, "node_modules", "sharp", "package.json"),
        "utf-8",
      ),
    ) as { version?: unknown };
    expect(installed.version).toBe(APPLICATION_SHARP_OVERRIDE);
  });
});
