// Cross-adapter location-handle conformance guard (memex-core#32 freeze-SHA memo).
// Golden bytes vendored from memex-core test/fixtures at freeze tag memex-core-v0.5.0.

import { describe, expect, it } from "vitest";
import { resolve } from "node:path";
import {
  buildScanRoots,
  decodePortableLocation,
  encodePortableLocation,
  type ScanRootContext,
} from "@jim80net/memex-core";
import { LOCATION_ROUND_TRIP_GOLDEN } from "./fixtures/cross-adapter/location-round-trip-golden.ts";

const FIXTURE_CTX: ScanRootContext = {
  cwd: resolve("/home/user/project"),
  syncEnabled: true,
  syncRepoDir: resolve("/home/user/.memex/sync"),
  globalSkillsDirs: [
    resolve("/home/user/.grok/skills"),
    resolve("/home/user/.claude/skills"),
  ],
  globalRulesDirs: [resolve("/home/user/.grok/rules")],
  projectSkillsDir: resolve("/home/user/project/.grok/skills"),
  projectRulesDir: resolve("/home/user/project/.grok/rules"),
  harness: "grok",
};

function fixtureRegistry() {
  return buildScanRoots(FIXTURE_CTX, {
    skillDirs: [
      resolve("/home/user/.grok/skills"),
      resolve("/home/user/project/.grok/skills"),
      resolve("/home/user/.memex/sync/skills"),
      resolve("/opt/extra/skills"),
    ],
    memoryDirs: [resolve("/home/user/project/.grok/memories")],
    ruleDirs: [
      resolve("/home/user/.grok/rules"),
      resolve("/home/user/.memex/sync/rules"),
    ],
  });
}

describe("location round-trip golden (memex-core#32 conformance)", () => {
  it("round-trips golden vectors against pinned memex-core", () => {
    const registry = fixtureRegistry();
    for (const { absolute, handle } of LOCATION_ROUND_TRIP_GOLDEN) {
      const nativeAbsolute = resolve(absolute);
      expect(encodePortableLocation(registry, nativeAbsolute)).toBe(handle);
      expect(decodePortableLocation(registry, handle)).toBe(nativeAbsolute);
    }
  });
});
