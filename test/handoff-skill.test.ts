import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const skill = readFileSync(
  join(repoRoot, "skills", "handoff", "SKILL.md"),
  "utf-8",
);
const absolutePathToken = "<absolute-written-handoff-path>";

function takeoverTemplate(): string {
  const stepNine = skill.split("### 9. Tell the user how to take over")[1];
  if (!stepNine) throw new Error("handoff step 9 is missing");

  const block = stepNine.match(/```(?:text)?\n([\s\S]*?)\n```/)?.[1];
  if (!block) throw new Error("handoff completion template is missing");
  return block;
}

describe("/handoff absolute path contract", () => {
  it("reports the exact written path and reuses it for /takeover", () => {
    expect(skill).toContain("resolve **that exact file** to an absolute path");
    expect(skill).toMatch(/current worktree's\s+actual path/);

    const template = takeoverTemplate();
    expect(template.match(new RegExp(absolutePathToken, "g"))).toHaveLength(2);
    expect(template).toContain(`/takeover ${absolutePathToken}`);
    expect(template).not.toContain("/takeover .claude/handoffs/");
  });

  it("renders a takeover command independent of the next session cwd", () => {
    const roots = [
      join(tmpdir(), "memex-handoff-contract", "main-checkout"),
      join(
        tmpdir(),
        "memex-handoff-contract",
        "main-checkout",
        ".claude",
        "worktrees",
        "topic",
      ),
    ];
    const unrelatedCwd = join(tmpdir(), "different-next-session-cwd");

    for (const root of roots) {
      const writtenPath = resolve(
        root,
        ".claude",
        "handoffs",
        "20260726-resume.md",
      );
      const rendered = takeoverTemplate().replaceAll(
        absolutePathToken,
        writtenPath,
      );
      const takeoverPath = rendered
        .split("\n")
        .find((line) => line.trimStart().startsWith("/takeover "))
        ?.trim()
        .slice("/takeover ".length);

      expect(takeoverPath).toBe(writtenPath);
      expect(isAbsolute(takeoverPath ?? "")).toBe(true);
      expect(resolve(unrelatedCwd, takeoverPath ?? "")).toBe(writtenPath);
    }
  });
});
