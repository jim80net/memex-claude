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

`bin/memex` is a shell wrapper that:
1. Sets `LD_LIBRARY_PATH` / `DYLD_LIBRARY_PATH` so the ONNX shared lib is found
2. Execs the compiled binary (`bin/memex.bin`)
3. If no binary is found, runs `install.sh` **synchronously** (with a 12-second download timeout)
4. If the download succeeds, re-execs itself to run the newly installed binary
5. If the download fails, outputs `{}` with a one-liner install command on stderr

There is no tsx/node fallback — the binary is the only production runtime. `install.sh` verifies downloads against `checksums.txt` (SHA256) when available.

`bin/memex.cmd` is the Windows equivalent with inline PowerShell download logic (DLLs are found automatically from the same directory).

## Architecture

```
src/
├── core/           Claude-specific wrappers
│   ├── config.ts        Config loading and defaults (extends memex-core)
│   ├── paths.ts         Claude path configuration (~/.claude/...)
│   └── session.ts       File-based session persistence
├── hooks/          Hook handlers
│   ├── user-prompt.ts   UserPromptSubmit — semantic matching
│   ├── pre-tool-use.ts  PreToolUse — tool-specific guidance
│   ├── stop.ts          Stop — session learnings + behavioral rules
│   ├── pre-compact.ts   PreCompact — context compaction
│   └── session-start.ts SessionStart — sync pull
├── main.ts         Entry point — reads stdin JSON, dispatches by hook event
bin/
├── memex           Unix wrapper script
├── memex.cmd       Windows wrapper
└── install.sh      Downloads prebuilt binary from GitHub releases
build.ts            Build script for standalone binaries
```

## Testing conventions

- Tests mock `embedTexts` to avoid loading ONNX models
- Cache and session modules are mocked to avoid filesystem side effects
- All paths use `node:path` join + `node:os` homedir — no hardcoded absolute paths

## Releases

Releases are automated via [release-please](https://github.com/googleapis/release-please) on push to `main`. Use [conventional commits](https://www.conventionalcommits.org/):

- `feat:` — minor version bump, triggers binary builds
- `fix:` — patch version bump, triggers binary builds
- `chore:`, `docs:`, `test:` — no release

The CI workflow builds binaries for all supported platforms, generates `checksums.txt` (SHA256), and attaches everything to the GitHub release. The binary embeds the version at compile time via `--define process.env.SKILL_ROUTER_VERSION`.
