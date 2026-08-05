/** Golden vectors for cross-adapter location-handle conformance guards (memex-core#32). */
// /test-home is a deployment-neutral synthetic home used only by fixtures.
export const LOCATION_ROUND_TRIP_GOLDEN = [
  {
    label: "grok-global skill",
    absolute: "/test-home/.grok/skills/weather/SKILL.md",
    handle: "memex://grok-global/weather/SKILL.md",
  },
  {
    label: "grok-project skill",
    absolute: "/test-home/project/.grok/skills/deploy/SKILL.md",
    handle: "memex://grok-project/deploy/SKILL.md",
  },
  {
    label: "sync-skills copy",
    absolute: "/test-home/.memex/sync/skills/weather/SKILL.md",
    handle: "memex://sync-skills/weather/SKILL.md",
  },
  {
    label: "unclassified extra dir (path-hash stable)",
    absolute: "/opt/extra/skills/custom/SKILL.md",
    handle: "memex://skill-unclassified-067ae16e/custom/SKILL.md",
  },
] as const;
