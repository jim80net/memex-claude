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

// Deployment-neutral synthetic home for absolute-path conformance fixtures.
const TEST_HOME = "/test-home";

const FIXTURE_CTX: ScanRootContext = {
  cwd: resolve(`${TEST_HOME}/project`),
  syncEnabled: true,
  syncRepoDir: resolve(`${TEST_HOME}/.memex/sync`),
  globalSkillsDirs: [
    resolve(`${TEST_HOME}/.grok/skills`),
    resolve(`${TEST_HOME}/.claude/skills`),
  ],
  globalRulesDirs: [resolve(`${TEST_HOME}/.grok/rules`)],
  projectSkillsDir: resolve(`${TEST_HOME}/project/.grok/skills`),
  projectRulesDir: resolve(`${TEST_HOME}/project/.grok/rules`),
  harness: "grok",
};

function fixtureRegistry() {
  const registry = buildScanRoots(FIXTURE_CTX, {
    skillDirs: [
      resolve(`${TEST_HOME}/.grok/skills`),
      resolve(`${TEST_HOME}/project/.grok/skills`),
      resolve(`${TEST_HOME}/.memex/sync/skills`),
      resolve("/opt/extra/skills"),
    ],
    memoryDirs: [resolve(`${TEST_HOME}/project/.grok/memories`)],
    ruleDirs: [
      resolve(`${TEST_HOME}/.grok/rules`),
      resolve(`${TEST_HOME}/.memex/sync/rules`),
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
