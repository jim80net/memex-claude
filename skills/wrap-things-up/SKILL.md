---
name: wrap-things-up
description: "End-of-session workflow: extract learnings, create handoff, persist project-scoped assets. Run after code work is done, right before exiting."
type: workflow
queries:
  - "wrap things up"
  - "wrap up this session"
  - "end of session cleanup"
  - "closing time"
  - "session wrap up"
  - "finish up and exit"
  - "done for now"
---

# /wrap-things-up — End-of-Session Workflow

Orchestrate end-of-session housekeeping: extract learnings, create a handoff, then persist project-scoped generated assets.

**Precondition:** Code work is done (PR merged or no code changes this session). This runs right before exiting Claude.

**Announce at start:** "Wrapping up this session."

## Phase 1 — Deep Reflection (SEQUENTIAL, not parallel)

**`/reflect` runs FIRST, alone, and must be thorough.** Do not run it in parallel with `/handoff` — reflection requires reviewing the full conversation and producing concrete artifacts (rules, skills, memories). Rushing it in parallel leads to skimming and "nothing to save" conclusions that waste the session's learnings.

### What "thorough" means

Before concluding that existing entries cover a learning, verify:
- Does the existing entry capture the **specific nuance** from this session? ("Use named type aliases" is a different nuance than "don't use Any" even though both live under typing conventions.)
- Was the user's correction about **the same thing as before** or a **new facet**? Update the existing entry with the new facet rather than skipping it.
- Count corrections: 1 correction = memory. 2+ on the same topic (this session or cumulative) = rule. Don't under-classify.

### Reflection checklist

Scan for each of these explicitly — don't rely on "I'll notice them as I go":
- [ ] Explicit corrections ("no, do X instead")
- [ ] Repeated nudges (same feedback 2+ times)
- [ ] Confirmed non-obvious approaches (user said "yes, that's right" to something surprising)
- [ ] Pitfalls hit and recovered from (failed approaches, rebases gone wrong)
- [ ] Rules that need updating with new nuance from this session

Then invoke `/reflect` with the results of that scan.

### After reflection completes

Invoke `/handoff` to create a continuation plan for the next session.

**Optional — if `claude-gatekeeper` is installed:** Also invoke `/claude-gatekeeper:learn-approvals` in parallel with `/handoff` to promote manually-approved commands to gatekeeper rules. To detect availability, check whether `claude-gatekeeper:learn-approvals` appears in the available skills list in the system prompt. If it does not appear, skip it silently — do not error or warn.

Wait for all invoked skills to complete before proceeding to Phase 2.

## Phase 2 — Persist Project-Scoped Assets

After phase 1 completes:

### 1. Determine persistence method

Check for a memory describing the user's preferred persistence method for session assets (e.g., "commit to branch and PR", "commit to current branch", "leave uncommitted", etc.).

- **If a preference memory exists:** follow it.
- **If no preference is found:** ask the user how they'd like session assets persisted. Present options such as:
  - Create a branch and open a PR
  - Commit directly to the current branch
  - Leave files uncommitted on disk
  - Once they answer, save their preference as a memory so future sessions don't ask again.

### 2. Inventory generated files

Run `git status --short` to see what was generated during this session.

Use your judgment about what belongs in a commit — session artifacts like handoffs, rules, skills, plans, and specs that live inside the repo are fair game. Respect `.gitignore` — if a file is ignored, do not stage it. Skip global files that live outside the repo (e.g., `~/.claude/` entries) since those are already persisted on disk.

If there are no project-scoped files to persist, report "No project assets to commit" and stop.

### 3. Persist according to preference

Follow the user's persistence method from step 1. If creating a PR, use a descriptive title and body summarizing what was generated. Do not merge the PR.

### 4. Report and stop

Report what was persisted (or that nothing needed persisting). **Do not merge PRs.** Do not remove worktrees.

## What This Skill Does NOT Do

- Remove worktrees
- Merge PRs
- Commit global-scoped files (gatekeeper config, global memex entries)
- Create a code PR (that should already be merged)

## Error Handling

- If a phase 1 skill fails, log the error and continue with the others. A failed `/reflect` should not block `/handoff`.
- If persistence fails (e.g., `gh pr create` auth error), report the error and leave files on disk.
