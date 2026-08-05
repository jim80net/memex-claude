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
  const registry = buildScanRoots(FIXTURE_CTX, {
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

  // Unclassified roots are host-local: core hashes their native absolute path,
  // so /opt/... and D:\\opt\\... intentionally produce different fallback keys.
  // This cross-adapter golden fixes one logical key; bind that byte-stable key
  // to the native fixture root while keeping native decode behavior.
  const unclassifiedGolden = LOCATION_ROUND_TRIP_GOLDEN.find(({ handle }) =>
    handle.startsWith("memex://skill-unclassified-"),
  )!;
  const canonicalKey = unclassifiedGolden.handle
    .slice("memex://".length)
    .split("/", 1)[0]!;
  const nativeUnclassifiedRoot = resolve("/opt/extra/skills");
  return registry.map((root) =>
    root.rootPath === nativeUnclassifiedRoot ? { ...root, key: canonicalKey } : root,
  );
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
