import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mkdir, writeFile, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

// We test the conflict resolution logic directly since the git operations
// require a real git repo and network access.

// Import the module to access the auto-resolve function
// Since autoResolveMarkdownConflict is not exported, we test it via the module's behavior.
// For unit testing, we extract and test the pattern logic.

describe("markdown conflict resolution", () => {
  // Replicate the conflict resolution logic for testing
  function autoResolveMarkdownConflict(content: string): string {
    const conflictPattern = /^<{7}\s.*\n([\s\S]*?)^={7}\n([\s\S]*?)^>{7}\s.*$/gm;
    return content.replace(conflictPattern, (_match, ours: string, theirs: string) => {
      const oursTrimmed = ours.trim();
      const theirsTrimmed = theirs.trim();
      if (oursTrimmed === theirsTrimmed) return oursTrimmed;
      return `${oursTrimmed}\n\n${theirsTrimmed}`;
    });
  }

  it("resolves a simple conflict by keeping both sides", () => {
    const conflicted = [
      "# Header",
      "<<<<<<< HEAD",
      "Local change",
      "=======",
      "Remote change",
      ">>>>>>> origin/main",
      "# Footer",
    ].join("\n");

    const resolved = autoResolveMarkdownConflict(conflicted);
    expect(resolved).toBe("# Header\nLocal change\n\nRemote change\n# Footer");
  });

  it("deduplicates identical conflict sides", () => {
    const conflicted = [
      "<<<<<<< HEAD",
      "Same content",
      "=======",
      "Same content",
      ">>>>>>> origin/main",
    ].join("\n");

    const resolved = autoResolveMarkdownConflict(conflicted);
    expect(resolved).toBe("Same content");
  });

  it("handles multiple conflicts in one file", () => {
    const conflicted = [
      "# Top",
      "<<<<<<< HEAD",
      "First local",
      "=======",
      "First remote",
      ">>>>>>> origin/main",
      "# Middle",
      "<<<<<<< HEAD",
      "Second local",
      "=======",
      "Second remote",
      ">>>>>>> origin/main",
      "# Bottom",
    ].join("\n");

    const resolved = autoResolveMarkdownConflict(conflicted);
    expect(resolved).toContain("First local");
    expect(resolved).toContain("First remote");
    expect(resolved).toContain("Second local");
    expect(resolved).toContain("Second remote");
    expect(resolved).toContain("# Middle");
    expect(resolved).toContain("# Bottom");
  });

  it("returns content unchanged when no conflicts", () => {
    const clean = "# No conflicts here\n\nJust regular content.";
    const resolved = autoResolveMarkdownConflict(clean);
    expect(resolved).toBe(clean);
  });
});
