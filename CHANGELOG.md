# Changelog

## [1.7.0](https://github.com/jim80net/memex-claude/compare/v1.6.0...v1.7.0) (2026-04-02)


### Features

* add bundled /wrap-things-up end-of-session skill ([#43](https://github.com/jim80net/memex-claude/issues/43)) ([3a0f6a9](https://github.com/jim80net/memex-claude/commit/3a0f6a99926f72d076d5db98a1e7e3228e30e1b5))

## [1.6.0](https://github.com/jim80net/memex-claude/compare/v1.5.0...v1.6.0) (2026-04-02)


### Features

* upgrade /handoff skill for comprehensive detail ([#42](https://github.com/jim80net/memex-claude/issues/42)) ([49db35c](https://github.com/jim80net/memex-claude/commit/49db35c5ee21f9ea3e328e846ee2fae5754586fb))


### Bug Fixes

* **reflect:** add worktree awareness to scope determination ([#40](https://github.com/jim80net/memex-claude/issues/40)) ([4d9aec0](https://github.com/jim80net/memex-claude/commit/4d9aec028ca07f28b20414bc471e2e5544068f54))

## [1.5.0](https://github.com/jim80net/memex-claude/compare/v1.4.1...v1.5.0) (2026-03-17)


### Features

* GEPA sleep/deep-sleep + query attribution ([#34](https://github.com/jim80net/memex-claude/issues/34)) ([7761eb4](https://github.com/jim80net/memex-claude/commit/7761eb410c320a4b6a2de152faf38c7ebd7601aa))


### Bug Fixes

* use correct 'prompt' field name in doctor skill test commands ([#37](https://github.com/jim80net/memex-claude/issues/37)) ([f226595](https://github.com/jim80net/memex-claude/commit/f226595f992f25574845699122a8ff3826696cce))

## [1.4.1](https://github.com/jim80net/memex-claude/compare/v1.4.0...v1.4.1) (2026-03-16)


### Bug Fixes

* bump memex-core to 0.2.3 for frontmatter memory parsing ([#32](https://github.com/jim80net/memex-claude/issues/32)) ([999f330](https://github.com/jim80net/memex-claude/commit/999f3304b14828f4f67e1e9a0e45eb03a759e51f))

## [1.4.0](https://github.com/jim80net/memex-claude/compare/v1.3.2...v1.4.0) (2026-03-16)


### Features

* add /handoff skill for session continuation plans ([4d0fc2a](https://github.com/jim80net/memex-claude/commit/4d0fc2a5d2497f8359740f45e70c2b0cb112520a))
* add /takeover skill, fix handoff filenames and references ([2dc3890](https://github.com/jim80net/memex-claude/commit/2dc38905cb105c0eee7610f1f368d8f24026dfc0))
* add /troubleshoot skill for self-diagnosis ([04fd626](https://github.com/jim80net/memex-claude/commit/04fd6268ed52a489968b7bbcad3e9aca6e943fb5))
* knowledge lifecycle and match telemetry ([#13](https://github.com/jim80net/memex-claude/issues/13)) ([c66fd09](https://github.com/jim80net/memex-claude/commit/c66fd09ca71790dd60da1830c94240e4612641ee))
* rebrand to memex-claude ([#24](https://github.com/jim80net/memex-claude/issues/24)) ([9ea4e67](https://github.com/jim80net/memex-claude/commit/9ea4e67be0d6b243855a7eee474182255d72b94b))
* reliable binary installation with checksums, no tsx fallback ([#21](https://github.com/jim80net/memex-claude/issues/21)) ([a27e415](https://github.com/jim80net/memex-claude/commit/a27e415fd2337e027d0d631b1fb7795574555e44))
* switch from semantic-release to release-please ([#15](https://github.com/jim80net/memex-claude/issues/15)) ([8e173b8](https://github.com/jim80net/memex-claude/commit/8e173b8d5ef9b4a746d78fa9922918935487d532))
* switch to semantic-release for automated versioning ([bfd0c01](https://github.com/jim80net/memex-claude/commit/bfd0c0109011aa55581b79e4821e60fc87de319c))


### Bug Fixes

* address 9 code review findings ([#18](https://github.com/jim80net/memex-claude/issues/18)) ([7982ab1](https://github.com/jim80net/memex-claude/commit/7982ab1f9fc08f77f7148bf7de221dce5ee51d95))
* align release-please tags with release workflow ([#26](https://github.com/jim80net/memex-claude/issues/26)) ([f5deee8](https://github.com/jim80net/memex-claude/commit/f5deee840d1dd9c7c327c368b79d4a073c5a2ed2))
* chain binary build into release-please workflow ([#29](https://github.com/jim80net/memex-claude/issues/29)) ([a9ccfb2](https://github.com/jim80net/memex-claude/commit/a9ccfb2a3c02db26754f442d779021e4af37a948))
* grant code review workflow permissions to post PR comments ([#23](https://github.com/jim80net/memex-claude/issues/23)) ([2f55448](https://github.com/jim80net/memex-claude/commit/2f554489d9063f5e56d3b1e14430081d47d840f1))
* remove unsupported macos-13 runner from release build matrix ([#14](https://github.com/jim80net/memex-claude/issues/14)) ([45717a9](https://github.com/jim80net/memex-claude/commit/45717a90f4de08b4959f2ceb0506aad18f29c684))
* resolve tsx fallback errors and auto-download binary ([#17](https://github.com/jim80net/memex-claude/issues/17)) ([5b18882](https://github.com/jim80net/memex-claude/commit/5b18882c5ca1c9e886c34ff585d9a371bccd0cf2))
* trigger release workflow on release published event ([#27](https://github.com/jim80net/memex-claude/issues/27)) ([491b901](https://github.com/jim80net/memex-claude/commit/491b901205b5c14ccbd741923c0b3109f790bc83))
* use date-prefixed unique filenames for handoff documents ([8e80593](https://github.com/jim80net/memex-claude/commit/8e805936d4c4e424f9ff9f98d2a2f0f1c7a19fb4))

## [1.3.2](https://github.com/jim80net/memex-claude/compare/v1.3.1...v1.3.2) (2026-03-16)


### Bug Fixes

* chain binary build into release-please workflow ([#29](https://github.com/jim80net/memex-claude/issues/29)) ([a9ccfb2](https://github.com/jim80net/memex-claude/commit/a9ccfb2a3c02db26754f442d779021e4af37a948))

## [1.3.1](https://github.com/jim80net/memex-claude/compare/v1.3.0...v1.3.1) (2026-03-16)


### Bug Fixes

* trigger release workflow on release published event ([#27](https://github.com/jim80net/memex-claude/issues/27)) ([491b901](https://github.com/jim80net/memex-claude/commit/491b901205b5c14ccbd741923c0b3109f790bc83))

## [1.3.0](https://github.com/jim80net/memex-claude/compare/v1.2.0...v1.3.0) (2026-03-15)


### Features

* add /handoff skill for session continuation plans ([4d0fc2a](https://github.com/jim80net/memex-claude/commit/4d0fc2a5d2497f8359740f45e70c2b0cb112520a))
* add /takeover skill, fix handoff filenames and references ([2dc3890](https://github.com/jim80net/memex-claude/commit/2dc38905cb105c0eee7610f1f368d8f24026dfc0))
* add /troubleshoot skill for self-diagnosis ([04fd626](https://github.com/jim80net/memex-claude/commit/04fd6268ed52a489968b7bbcad3e9aca6e943fb5))
* knowledge lifecycle and match telemetry ([#13](https://github.com/jim80net/memex-claude/issues/13)) ([c66fd09](https://github.com/jim80net/memex-claude/commit/c66fd09ca71790dd60da1830c94240e4612641ee))
* rebrand to memex-claude ([#24](https://github.com/jim80net/memex-claude/issues/24)) ([9ea4e67](https://github.com/jim80net/memex-claude/commit/9ea4e67be0d6b243855a7eee474182255d72b94b))
* reliable binary installation with checksums, no tsx fallback ([#21](https://github.com/jim80net/memex-claude/issues/21)) ([a27e415](https://github.com/jim80net/memex-claude/commit/a27e415fd2337e027d0d631b1fb7795574555e44))
* switch from semantic-release to release-please ([#15](https://github.com/jim80net/memex-claude/issues/15)) ([8e173b8](https://github.com/jim80net/memex-claude/commit/8e173b8d5ef9b4a746d78fa9922918935487d532))
* switch to semantic-release for automated versioning ([bfd0c01](https://github.com/jim80net/memex-claude/commit/bfd0c0109011aa55581b79e4821e60fc87de319c))


### Bug Fixes

* address 9 code review findings ([#18](https://github.com/jim80net/memex-claude/issues/18)) ([7982ab1](https://github.com/jim80net/memex-claude/commit/7982ab1f9fc08f77f7148bf7de221dce5ee51d95))
* align release-please tags with release workflow ([#26](https://github.com/jim80net/memex-claude/issues/26)) ([f5deee8](https://github.com/jim80net/memex-claude/commit/f5deee840d1dd9c7c327c368b79d4a073c5a2ed2))
* grant code review workflow permissions to post PR comments ([#23](https://github.com/jim80net/memex-claude/issues/23)) ([2f55448](https://github.com/jim80net/memex-claude/commit/2f554489d9063f5e56d3b1e14430081d47d840f1))
* remove unsupported macos-13 runner from release build matrix ([#14](https://github.com/jim80net/memex-claude/issues/14)) ([45717a9](https://github.com/jim80net/memex-claude/commit/45717a90f4de08b4959f2ceb0506aad18f29c684))
* resolve tsx fallback errors and auto-download binary ([#17](https://github.com/jim80net/memex-claude/issues/17)) ([5b18882](https://github.com/jim80net/memex-claude/commit/5b18882c5ca1c9e886c34ff585d9a371bccd0cf2))
* use date-prefixed unique filenames for handoff documents ([8e80593](https://github.com/jim80net/memex-claude/commit/8e805936d4c4e424f9ff9f98d2a2f0f1c7a19fb4))

## [1.2.0](https://github.com/jim80net/claude-skill-router/compare/claude-skill-router-v1.1.1...claude-skill-router-v1.2.0) (2026-03-14)


### Features

* reliable binary installation with checksums, no tsx fallback ([#21](https://github.com/jim80net/claude-skill-router/issues/21)) ([a27e415](https://github.com/jim80net/claude-skill-router/commit/a27e415fd2337e027d0d631b1fb7795574555e44))


### Bug Fixes

* grant code review workflow permissions to post PR comments ([#23](https://github.com/jim80net/claude-skill-router/issues/23)) ([2f55448](https://github.com/jim80net/claude-skill-router/commit/2f554489d9063f5e56d3b1e14430081d47d840f1))

## [1.1.1](https://github.com/jim80net/claude-skill-router/compare/claude-skill-router-v1.1.0...claude-skill-router-v1.1.1) (2026-03-13)


### Bug Fixes

* address 9 code review findings ([#18](https://github.com/jim80net/claude-skill-router/issues/18)) ([7982ab1](https://github.com/jim80net/claude-skill-router/commit/7982ab1f9fc08f77f7148bf7de221dce5ee51d95))

## [1.1.0](https://github.com/jim80net/claude-skill-router/compare/claude-skill-router-v1.0.0...claude-skill-router-v1.1.0) (2026-03-13)


### Features

* add /handoff skill for session continuation plans ([4d0fc2a](https://github.com/jim80net/claude-skill-router/commit/4d0fc2a5d2497f8359740f45e70c2b0cb112520a))
* add /takeover skill, fix handoff filenames and references ([2dc3890](https://github.com/jim80net/claude-skill-router/commit/2dc38905cb105c0eee7610f1f368d8f24026dfc0))
* add /troubleshoot skill for self-diagnosis ([04fd626](https://github.com/jim80net/claude-skill-router/commit/04fd6268ed52a489968b7bbcad3e9aca6e943fb5))
* knowledge lifecycle and match telemetry ([#13](https://github.com/jim80net/claude-skill-router/issues/13)) ([c66fd09](https://github.com/jim80net/claude-skill-router/commit/c66fd09ca71790dd60da1830c94240e4612641ee))
* switch from semantic-release to release-please ([#15](https://github.com/jim80net/claude-skill-router/issues/15)) ([8e173b8](https://github.com/jim80net/claude-skill-router/commit/8e173b8d5ef9b4a746d78fa9922918935487d532))
* switch to semantic-release for automated versioning ([bfd0c01](https://github.com/jim80net/claude-skill-router/commit/bfd0c0109011aa55581b79e4821e60fc87de319c))


### Bug Fixes

* remove unsupported macos-13 runner from release build matrix ([#14](https://github.com/jim80net/claude-skill-router/issues/14)) ([45717a9](https://github.com/jim80net/claude-skill-router/commit/45717a90f4de08b4959f2ceb0506aad18f29c684))
* resolve tsx fallback errors and auto-download binary ([#17](https://github.com/jim80net/claude-skill-router/issues/17)) ([5b18882](https://github.com/jim80net/claude-skill-router/commit/5b18882c5ca1c9e886c34ff585d9a371bccd0cf2))
* use date-prefixed unique filenames for handoff documents ([8e80593](https://github.com/jim80net/claude-skill-router/commit/8e805936d4c4e424f9ff9f98d2a2f0f1c7a19fb4))
