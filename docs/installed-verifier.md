# Read-only installed verifier

`verify:installed` replaces the repeated manual installed-plugin audit with one
fail-closed command. It does not invoke Claude, authenticate, update the plugin,
download assets, or write to the plugin cache.

```bash
pnpm verify:installed -- \
  --source-root /path/to/immutable/v1.9.1-checkout \
  --release-dir /path/to/downloaded/v1.9.1-assets
```

The source root is required and must be an immutable release-tag checkout. The
release directory is optional; when supplied it must contain `checksums.txt`
and the complete artifact set named by that file.

The verifier discovers the single enabled user-scope
`memex-claude@jim80net-plugins` record below `~/.claude` and checks:

- registry, installed package, plugin manifest, and immutable-source versions;
- SHA-256 equality for package/plugin metadata, handoff/takeover skills, and
  the handoff regression;
- every release artifact against `checksums.txt`, with no undeclared files;
- the installed `/handoff` completion template's exact absolute path reuse from
  unrelated normal-checkout and worktree-shaped current directories.

Use `--claude-home <path>` for an isolated fixture or non-default Claude home.
The command writes a JSON report to stdout and exits nonzero on any drift.
