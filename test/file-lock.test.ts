import { describe, it, expect, afterEach } from "vitest";
import { mkdir, rmdir, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { acquireLock, withFileLock } from "../src/core/file-lock.ts";

describe("file-lock", () => {
  const testDir = join(tmpdir(), "file-lock-test");
  const testFile = join(testDir, "test.json");

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it("acquires and releases a lock", async () => {
    await mkdir(testDir, { recursive: true });

    const unlock = await acquireLock(testFile);
    // Lock directory should exist
    const lockDir = testFile + ".lock";
    const s = await stat(lockDir);
    expect(s.isDirectory()).toBe(true);

    await unlock();
    // Lock directory should be removed
    await expect(stat(lockDir)).rejects.toThrow();
  });

  it("withFileLock runs callback and releases lock", async () => {
    await mkdir(testDir, { recursive: true });

    let callbackRan = false;
    const result = await withFileLock(testFile, async () => {
      callbackRan = true;
      return 42;
    });

    expect(callbackRan).toBe(true);
    expect(result).toBe(42);

    // Lock should be released
    const lockDir = testFile + ".lock";
    await expect(stat(lockDir)).rejects.toThrow();
  });

  it("releases lock even when callback throws", async () => {
    await mkdir(testDir, { recursive: true });

    await expect(
      withFileLock(testFile, async () => {
        throw new Error("callback error");
      })
    ).rejects.toThrow("callback error");

    // Lock should be released
    const lockDir = testFile + ".lock";
    await expect(stat(lockDir)).rejects.toThrow();
  });

  it("waits for an existing lock to be released", async () => {
    await mkdir(testDir, { recursive: true });

    const unlock1 = await acquireLock(testFile);

    // Release after a short delay
    setTimeout(async () => {
      await unlock1();
    }, 100);

    // This should wait and succeed
    const unlock2 = await acquireLock(testFile);
    await unlock2();
  });
});
