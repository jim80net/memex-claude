#!/usr/bin/env bun
/**
 * Build script for memex-claude standalone binaries.
 *
 * Compiles the TypeScript source into a self-contained executable using
 * `bun build --compile`. The exact application-owned Sharp version is injected
 * for Core's pre-import guard. The ONNX runtime shared library is copied
 * alongside the binary.
 *
 * Usage:
 *   bun run build.ts                    # build for current platform
 *   bun run build.ts --target bun-linux-x64   # cross-compile
 */

import {
  mkdirSync,
  cpSync,
  rmSync,
  symlinkSync,
  readlinkSync,
  existsSync,
  readdirSync,
  readFileSync,
} from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform, arch } from "node:os";
import { createRequire } from "node:module";

/** Resolve the ONNX runtime base path dynamically from node_modules. */
function resolveOnnxBase(): string {
  // Try the pnpm store first (versioned directory)
  const pnpmBase = "node_modules/.pnpm";
  if (existsSync(pnpmBase)) {
    const entries = readdirSync(pnpmBase);
    const onnxDir = entries.find((e) => e.startsWith("onnxruntime-node@"));
    if (onnxDir) {
      return join(pnpmBase, onnxDir, "node_modules/onnxruntime-node/bin/napi-v3");
    }
  }
  // Fallback: direct node_modules path (npm/yarn)
  return "node_modules/onnxruntime-node/bin/napi-v3";
}

const ONNX_BASE = resolveOnnxBase();

function resolveSharpRuntime(): { version: string; packageLink: string } {
  const require = createRequire(import.meta.url);
  const transformersEntry = require.resolve("@huggingface/transformers");
  const requireFromTransformers = createRequire(transformersEntry);
  const sharpEntry = requireFromTransformers.resolve("sharp");
  const manifest = JSON.parse(
    readFileSync(join(dirname(sharpEntry), "..", "package.json"), "utf-8"),
  ) as { name?: unknown; version?: unknown };
  if (manifest.name !== "sharp" || typeof manifest.version !== "string") {
    throw new Error("Unable to verify the application-owned Sharp package");
  }
  const transformersRoot = dirname(dirname(transformersEntry));
  return {
    version: manifest.version,
    packageLink: join(dirname(dirname(transformersRoot)), "sharp"),
  };
}

interface PlatformFiles {
  onnxDir: string;
  sharedLibs: string[];
  binaryName: string;
}

const PLATFORMS: Record<string, PlatformFiles> = {
  "linux-x64": {
    onnxDir: join(ONNX_BASE, "linux/x64"),
    sharedLibs: ["libonnxruntime.so.1", "libonnxruntime_providers_shared.so"],
    binaryName: "memex",
  },
  "linux-arm64": {
    onnxDir: join(ONNX_BASE, "linux/arm64"),
    sharedLibs: ["libonnxruntime.so.1"],
    binaryName: "memex",
  },
  "darwin-x64": {
    onnxDir: join(ONNX_BASE, "darwin/x64"),
    sharedLibs: ["libonnxruntime.1.21.0.dylib"],
    binaryName: "memex",
  },
  "darwin-arm64": {
    onnxDir: join(ONNX_BASE, "darwin/arm64"),
    sharedLibs: ["libonnxruntime.1.21.0.dylib"],
    binaryName: "memex",
  },
  "win32-x64": {
    onnxDir: join(ONNX_BASE, "win32/x64"),
    sharedLibs: ["onnxruntime.dll", "DirectML.dll"],
    binaryName: "memex.exe",
  },
  "win32-arm64": {
    onnxDir: join(ONNX_BASE, "win32/arm64"),
    sharedLibs: ["onnxruntime.dll", "DirectML.dll"],
    binaryName: "memex.exe",
  },
};

function detectPlatformKey(): string {
  const p = platform();
  const a = arch();
  const key = `${p}-${a}`;
  if (!(key in PLATFORMS)) {
    console.error(`Unsupported platform: ${key}`);
    process.exit(1);
  }
  return key;
}

function parseBunTarget(target: string): string {
  // e.g. "bun-linux-x64" → "linux-x64"
  const match = target.match(/^bun-(linux|darwin|win(?:dows|32))-(x64|arm64)$/);
  if (!match) {
    console.error(`Invalid target: ${target}. Expected bun-{linux,darwin,windows}-{x64,arm64}`);
    process.exit(1);
  }
  const os = match[1] === "windows" ? "win32" : match[1];
  return `${os}-${match[2]}`;
}

// Parse args
const targetArg = process.argv.find((a) => a.startsWith("--target"));
let targetFlag: string | undefined;
let platformKey: string;

if (targetArg) {
  const idx = process.argv.indexOf(targetArg);
  targetFlag = targetArg.includes("=")
    ? targetArg.split("=")[1]
    : process.argv[idx + 1];
  platformKey = parseBunTarget(targetFlag);
} else {
  platformKey = detectPlatformKey();
}

const platConfig = PLATFORMS[platformKey];
const outDir = join("dist", platformKey);

console.log(`Building for ${platformKey}...`);

// Resolve the real application-owned Sharp before replacing the Transformers
// link with a text-only compile shim. Core receives and verifies this exact
// version before it invokes the bundled Transformers loader.
const pkgVersion = JSON.parse(readFileSync("package.json", "utf-8")).version;
const { version: sharpVersion, packageLink: sharpPackageLink } = resolveSharpRuntime();
if (!existsSync(sharpPackageLink)) {
  throw new Error(`Transformers Sharp link is missing: ${sharpPackageLink}`);
}
let sharpOrigTarget: string;
try {
  sharpOrigTarget = readlinkSync(sharpPackageLink);
} catch {
  throw new Error(`Refusing to replace non-symlink Sharp path: ${sharpPackageLink}`);
}
rmSync(sharpPackageLink);
mkdirSync(sharpPackageLink, { recursive: true });
Bun.write(
  join(sharpPackageLink, "package.json"),
  JSON.stringify({ name: "sharp", version: sharpVersion, main: "index.js" }),
);
Bun.write(join(sharpPackageLink, "index.js"), "module.exports = {};");

try {
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, platConfig.binaryName);
  const args = [
    "build", "--compile", "src/main.ts", "--outfile", outFile,
    "--define", `process.env.SKILL_ROUTER_VERSION='"${pkgVersion}"'`,
    "--define", `MEMEX_BUNDLED_SHARP_VERSION='"${sharpVersion}"'`,
  ];
  if (targetFlag) {
    args.push("--target", targetFlag);
  }

  execSync(`bun ${args.join(" ")}`, { stdio: "inherit" });

  // Copy ONNX shared libraries alongside binary.
  for (const lib of platConfig.sharedLibs) {
    const src = join(platConfig.onnxDir, lib);
    const dest = join(outDir, lib);
    if (existsSync(src)) {
      cpSync(src, dest);
      console.log(`  Copied ${lib}`);
    } else {
      console.warn(`  Warning: ${src} not found, skipping`);
    }
  }

  console.log(`\nBuild complete: ${outDir}/`);
} finally {
  rmSync(sharpPackageLink, { recursive: true, force: true });
  symlinkSync(sharpOrigTarget, sharpPackageLink);
  console.log("Restored sharp symlink");
}
