import {
  existsSync,
  mkdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Temporarily replace pnpm's Sharp symlink/junction with the text-only package
 * Bun needs while compiling. Renaming preserves the original filesystem object
 * verbatim and avoids Bun's Windows EFAULT when deleting directory junctions.
 */
export function installSharpCompileShim(
  packageLink: string,
  version: string,
): () => void {
  readlinkSync(packageLink);

  const backupLink = `${packageLink}.memex-build-backup`;
  if (existsSync(backupLink)) {
    throw new Error(`Refusing to overwrite Sharp build backup: ${backupLink}`);
  }

  renameSync(packageLink, backupLink);
  try {
    mkdirSync(packageLink, { recursive: true });
    writeFileSync(
      join(packageLink, "package.json"),
      JSON.stringify({ name: "sharp", version, main: "index.js" }),
    );
    writeFileSync(join(packageLink, "index.js"), "module.exports = {};");
  } catch (error) {
    rmSync(packageLink, { recursive: true, force: true });
    renameSync(backupLink, packageLink);
    throw error;
  }

  let restored = false;
  return () => {
    if (restored) return;
    rmSync(packageLink, { recursive: true, force: true });
    renameSync(backupLink, packageLink);
    restored = true;
  };
}
