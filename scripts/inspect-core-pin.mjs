#!/usr/bin/env node

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const CORE_PACKAGE = "@jim80net/memex-core";

function parseArgs(argv) {
  let root = process.cwd();
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value) throw new Error("--root requires a path");
      root = value;
      index += 1;
    } else if (argument === "--json") {
      json = true;
    } else {
      throw new Error(`unknown argument: ${argument}`);
    }
  }

  return { root: resolve(root), json };
}

export function inspectCorePin(root) {
  const packageJson = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
  const declaration = packageJson.dependencies?.[CORE_PACKAGE];
  if (typeof declaration !== "string" || declaration.length === 0) {
    throw new Error(`${CORE_PACKAGE} is missing from package.json dependencies`);
  }

  const lockLines = readFileSync(resolve(root, "pnpm-lock.yaml"), "utf8").split(/\r?\n/);
  const dependencyLine = lockLines.findIndex(
    (line) => line.trim() === `'${CORE_PACKAGE}':`,
  );
  if (dependencyLine < 0) {
    throw new Error(`${CORE_PACKAGE} is missing from the pnpm lock importer`);
  }

  const importerLines = lockLines.slice(dependencyLine + 1, dependencyLine + 5);
  const specifier = importerLines
    .find((line) => line.trimStart().startsWith("specifier:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();
  const lockValue = importerLines
    .find((line) => line.trimStart().startsWith("version:"))
    ?.split(":")
    .slice(1)
    .join(":")
    .trim();

  if (!specifier || !lockValue) {
    throw new Error(`cannot read ${CORE_PACKAGE} specifier/version from the pnpm lock importer`);
  }
  if (specifier !== declaration) {
    throw new Error(
      `${CORE_PACKAGE} drift: package.json declares ${declaration}, lock importer declares ${specifier}`,
    );
  }

  return {
    package: CORE_PACKAGE,
    declaration,
    resolvedVersion: lockValue.replace(/\(.*/, ""),
    lockValue,
  };
}

function main() {
  try {
    const { root, json } = parseArgs(process.argv.slice(2));
    const result = inspectCorePin(root);
    if (json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      process.stdout.write(
        `${result.package}: declaration ${result.declaration}; lock resolution ${result.resolvedVersion}\n`,
      );
    }
  } catch (error) {
    process.stderr.write(`memex core pin check failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
