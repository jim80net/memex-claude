import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { installSharpCompileShim } from "../build-support/sharp-compile-shim";

describe("Sharp compile shim", () => {
  const cleanup: string[] = [];

  afterEach(() => {
    for (const path of cleanup.splice(0)) {
      rmSync(path, { recursive: true, force: true });
    }
  });

  it("preserves and restores the original package link", () => {
    const root = mkdtempSync(join(tmpdir(), "memex-sharp-shim-"));
    cleanup.push(root);
    const target = join(root, "sharp-target");
    const packageLink = join(root, "sharp");
    mkdirSync(target);
    symlinkSync(
      target,
      packageLink,
      process.platform === "win32" ? "junction" : "dir",
    );
    const originalTarget = readlinkSync(packageLink);

    const restore = installSharpCompileShim(packageLink, "0.35.3");

    expect(
      JSON.parse(readFileSync(join(packageLink, "package.json"), "utf8")),
    ).toEqual({ name: "sharp", version: "0.35.3", main: "index.js" });
    expect(readFileSync(join(packageLink, "index.js"), "utf8")).toBe(
      "module.exports = {};",
    );

    restore();
    expect(readlinkSync(packageLink)).toBe(originalTarget);

    // Cleanup paths stay valid if a caller defensively restores twice.
    restore();
    expect(readlinkSync(packageLink)).toBe(originalTarget);
  });
});
