# Contributing

## Prerequisites

- Node.js 20+
- pnpm
- Bun (for building standalone binaries)

## Development

```bash
pnpm install      # install dependencies
pnpm test         # run vitest
pnpm tsc --noEmit # type check
```

## Building standalone binaries

```bash
bun run build.ts                         # build for current platform
bun run build.ts --target bun-linux-x64  # cross-compile
```

### Supported targets

| Target | Platform |
|--------|----------|
| `bun-linux-x64` | Linux x86_64 |
| `bun-linux-arm64` | Linux ARM64 |
| `bun-darwin-x64` | macOS Intel |
| `bun-darwin-arm64` | macOS Apple Silicon |
| `bun-windows-x64` | Windows x86_64 |

Output goes to `dist/<platform>/` with the binary and ONNX runtime shared libraries.

### How the build works

1. Stubs out `sharp` in `node_modules` (image processing dep from `@huggingface/transformers` — unused, we only do text embeddings)
2. Compiles via `bun build --compile` which embeds the bun runtime, bundled JS, and the ONNX native `.node` addon
3. Copies the ONNX shared library (`libonnxruntime.so`, `.dylib`, or `.dll`) alongside the binary
4. Restores the `sharp` symlink in `node_modules`

### Runtime wrapper

`bin/skill-router` is a shell wrapper that:
1. Sets `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH` so the ONNX shared lib is found
2. Execs the compiled binary (`bin/skill-router.bin`)
3. If no binary is found, triggers `install.sh` in the background to download it for the next invocation
4. Falls back to `node --import tsx src/main.ts` (resolving tsx from the plugin's own `node_modules`)
5. Outputs `{}` with a stderr warning if neither is available

`bin/skill-router.cmd` is the Windows equivalent (DLLs are found automatically from the same directory).

## Architecture

```
src/
├── core/           Shared engine
│   ├── embeddings.ts    Local ONNX embeddings via @huggingface/transformers
│   ├── skill-index.ts   Scan, index, and search skills/rules/memories
│   ├── cache.ts         Mtime-gated skill embedding cache
│   ├── config.ts        Config loading and defaults
│   ├── session.ts       Per-session state (rule tracking)
│   ├── sync.ts          Cross-machine git sync
│   ├── project-mapping.ts  Git remote → canonical project ID
│   └── types.ts         All type definitions
├── hooks/          Hook handlers
│   ├── user-prompt.ts   UserPromptSubmit — semantic matching
│   ├── pre-tool-use.ts  PreToolUse — tool-specific guidance
│   ├── stop.ts          Stop — session learnings + behavioral rules
│   ├── pre-compact.ts   PreCompact — context compaction
│   └── session-start.ts SessionStart — sync pull
├── main.ts         Entry point — reads stdin JSON, dispatches by hook event
bin/
├── skill-router    Unix wrapper script
├── skill-router.cmd Windows wrapper
└── install.sh      Downloads prebuilt binary from GitHub releases
build.ts            Build script for standalone binaries
```

## Testing conventions

- Tests mock `embedTexts` to avoid loading ONNX models
- Cache and session modules are mocked to avoid filesystem side effects
- All paths use `node:path` join + `node:os` homedir — no hardcoded absolute paths

## Releases

Releases are automated via [semantic-release](https://github.com/semantic-release/semantic-release) on push to `main`. Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — minor version bump, triggers binary builds
- `fix:` — patch version bump, triggers binary builds
- `chore:`, `docs:`, `test:` — no release

The CI workflow builds binaries for all 5 supported platforms and attaches them to the GitHub release.
