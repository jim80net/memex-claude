#!/usr/bin/env bun
/**
 * Build script for claude-skill-router standalone binaries.
 *
 * Compiles the TypeScript source into a self-contained executable using
 * `bun build --compile`. Sharp is stubbed out (we only use text embeddings).
 * The ONNX runtime shared library is copied alongside the binary.
 *
 * Usage:
 *   bun run build.ts                    # build for current platform
 *   bun run build.ts --target bun-linux-x64   # cross-compile
 */

import { mkdirSync, cpSync, rmSync, symlinkSync, readlinkSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { execSync } from "node:child_process";
import { platform, arch } from "node:os";

const ONNX_BASE = "node_modules/.pnpm/onnxruntime-node@1.21.0/node_modules/onnxruntime-node/bin/napi-v3";
const SHARP_SYMLINK = "node_modules/.pnpm/@huggingface+transformers@3.8.1/node_modules/sharp";

interface PlatformFiles {
  onnxDir: string;
  sharedLibs: string[];
  binaryName: string;
}

const PLATFORMS: Record<string, PlatformFiles> = {
  "linux-x64": {
    onnxDir: join(ONNX_BASE, "linux/x64"),
    sharedLibs: ["libonnxruntime.so.1", "libonnxruntime_providers_shared.so"],
    binaryName: "skill-router",
  },
  "linux-arm64": {
    onnxDir: join(ONNX_BASE, "linux/arm64"),
    sharedLibs: ["libonnxruntime.so.1"],
    binaryName: "skill-router",
  },
  "darwin-x64": {
    onnxDir: join(ONNX_BASE, "darwin/x64"),
    sharedLibs: ["libonnxruntime.1.21.0.dylib"],
    binaryName: "skill-router",
  },
  "darwin-arm64": {
    onnxDir: join(ONNX_BASE, "darwin/arm64"),
    sharedLibs: ["libonnxruntime.1.21.0.dylib"],
    binaryName: "skill-router",
  },
  "win32-x64": {
    onnxDir: join(ONNX_BASE, "win32/x64"),
    sharedLibs: ["onnxruntime.dll", "DirectML.dll"],
    binaryName: "skill-router.exe",
  },
  "win32-arm64": {
    onnxDir: join(ONNX_BASE, "win32/arm64"),
    sharedLibs: ["onnxruntime.dll", "DirectML.dll"],
    binaryName: "skill-router.exe",
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

// 1. Stub sharp in node_modules so bun doesn't bundle native sharp
let sharpOrigTarget: string | null = null;
if (existsSync(SHARP_SYMLINK)) {
  try {
    sharpOrigTarget = readlinkSync(SHARP_SYMLINK);
  } catch {
    // not a symlink, might already be stubbed
  }
  rmSync(SHARP_SYMLINK, { recursive: true, force: true });
}
mkdirSync(SHARP_SYMLINK, { recursive: true });
Bun.write(join(SHARP_SYMLINK, "package.json"), JSON.stringify({ name: "sharp", version: "0.0.0", main: "index.js" }));
Bun.write(join(SHARP_SYMLINK, "index.js"), "module.exports = {};");

try {
  // 2. Compile
  mkdirSync(outDir, { recursive: true });
  const outFile = join(outDir, platConfig.binaryName);
  const args = ["build", "--compile", "src/main.ts", "--outfile", outFile];
  if (targetFlag) {
    args.push("--target", targetFlag);
  }

  execSync(`bun ${args.join(" ")}`, { stdio: "inherit" });

  // 3. Copy ONNX shared libraries alongside binary
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
  // 4. Restore sharp symlink
  rmSync(SHARP_SYMLINK, { recursive: true, force: true });
  if (sharpOrigTarget) {
    symlinkSync(sharpOrigTarget, SHARP_SYMLINK);
    console.log("Restored sharp symlink");
  }
}
