---
name: troubleshoot
description: "Diagnose and fix skill-router installation, setup, or runtime problems. Run checks on the binary, config, hooks, cache, model, and scan paths."
queries:
  - "skill-router is not working"
  - "hooks are not firing"
  - "no skills are being injected"
  - "troubleshoot skill router"
  - "diagnose skill-router problems"
  - "skill-router setup issues"
  - "fix skill router installation"
  - "why is skill-router silent"
---

# /troubleshoot — Diagnose Skill-Router Issues

Run through a diagnostic checklist to identify why the skill-router isn't working. Execute each step in order and stop at the first failure found.

## Diagnostic Steps

### 1. Locate the plugin

Find where the skill-router is installed:

```bash
# Check if installed as a plugin
cat ~/.claude/settings.json | grep -A5 skill-router

# Or find it by searching for hooks.json
find ~/.claude -name hooks.json -path '*skill-router*' 2>/dev/null
find ~/projects -name hooks.json -path '*skill-router*' 2>/dev/null
```

Record the plugin root path (referred to as `$PLUGIN_ROOT` below).

### 2. Check the hook registration

Verify the hook is registered in Claude Code settings:

```bash
cat ~/.claude/settings.json
```

Look for a `UserPromptSubmit` hook entry that references `skill-router`. If missing, the router won't run at all.

### 3. Check the binary / runtime

Test if the entry point works:

```bash
# Try the wrapper script
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"test","session_id":"diag","cwd":"/tmp"}' | $PLUGIN_ROOT/bin/skill-router
```

Expected output: `{}` (empty JSON — no skills at `/tmp` is normal).

If it fails, check each layer:

```bash
# Is the prebuilt binary installed?
ls -la $PLUGIN_ROOT/bin/skill-router.bin    # Unix
ls -la $PLUGIN_ROOT/bin/skill-router.exe    # Windows

# Are the ONNX shared libraries present?
ls -la $PLUGIN_ROOT/bin/libonnxruntime*     # Linux
ls -la $PLUGIN_ROOT/bin/libonnxruntime*     # macOS (.dylib)
ls -la $PLUGIN_ROOT/bin/onnxruntime.dll     # Windows

# If no binary, is node available as fallback?
which node && node --version

# If node is available, are dependencies installed?
ls $PLUGIN_ROOT/node_modules/.package-lock.json 2>/dev/null && echo "deps installed" || echo "deps missing"
```

**Fixes:**
- No binary → run `$PLUGIN_ROOT/bin/install.sh` to download it
- No ONNX libs → re-run `$PLUGIN_ROOT/bin/install.sh`
- Node not found → install the binary via `install.sh`, or install Node.js 20+
- Deps missing → `cd $PLUGIN_ROOT && pnpm install`

### 4. Check config

```bash
cat ~/.claude/skill-router.json 2>/dev/null || echo "No config file (using defaults)"
```

Verify:
- `enabled` is not `false`
- `hooks.UserPromptSubmit.enabled` is not `false`
- JSON is valid (no trailing commas, etc.)

Test config loading:

```bash
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"test","session_id":"diag","cwd":"/tmp"}' | $PLUGIN_ROOT/bin/skill-router 2>&1
```

If stderr shows `skill-router: invalid JSON` or config errors, fix the config file.

### 5. Check scan paths

Verify skills, rules, and memories exist where the router looks:

```bash
# Global skills
ls ~/.claude/skills/*/SKILL.md 2>/dev/null

# Project skills (from current working directory)
ls .claude/skills/*/SKILL.md 2>/dev/null

# Global rules
ls ~/.claude/rules/*.md 2>/dev/null

# Project rules
ls .claude/rules/*.md 2>/dev/null

# Memories
ls ~/.claude/projects/*/memory/*.md 2>/dev/null
```

If no files are found in any location, the router has nothing to inject. Create a test skill:

```bash
mkdir -p ~/.claude/skills/test-skill
cat > ~/.claude/skills/test-skill/SKILL.md << 'EOF'
---
name: test-skill
description: "Test skill to verify the router works"
type: memory
queries:
  - "is the skill router working"
  - "test skill router"
---
If you can see this, the skill-router is working correctly.
EOF
```

Then test: type "is the skill router working" in your next prompt.

### 6. Check the embedding model cache

```bash
# Model cache location
ls ~/.claude/cache/models/ 2>/dev/null

# Skill index cache
ls ~/.claude/cache/skill-router.json 2>/dev/null
```

If the model cache is empty, the first run will download ~23MB. This requires internet access. If behind a proxy or firewall, the model download may fail silently.

To force a cache rebuild, delete the skill index cache:

```bash
rm ~/.claude/cache/skill-router.json 2>/dev/null
```

### 7. Test end-to-end with verbose output

Run the router manually and inspect stderr for diagnostics:

```bash
echo '{"hook_event_name":"UserPromptSubmit","user_prompt":"install dependencies","session_id":"diag-test","cwd":"'$(pwd)'"}' | $PLUGIN_ROOT/bin/skill-router 2>/tmp/skill-router-debug.log
cat /tmp/skill-router-debug.log
```

Stderr messages prefixed with `skill-router:` indicate specific failures:
- `invalid JSON input` — stdin isn't valid JSON
- `index build failed` — problem scanning or embedding skills
- `handler error` — runtime error in the hook handler

## Common Issues

| Symptom | Likely cause | Fix |
|---------|-------------|-----|
| No output at all | Hook not registered | Add hook to `~/.claude/settings.json` |
| `{}` on every prompt | No skills/rules/memories found | Create content in scan paths (step 5) |
| `{}` on every prompt | Threshold too high | Lower `hooks.UserPromptSubmit.threshold` in config |
| Binary crashes | Missing ONNX shared library | Run `bin/install.sh` |
| `node: not found` | No binary and no Node.js | Run `bin/install.sh` to get the binary |
| Slow first run | Model downloading | Wait for download (~23MB), ensure internet access |
| Stale results | Cache not rebuilding | Delete `~/.claude/cache/skill-router.json` |

$ARGUMENTS
