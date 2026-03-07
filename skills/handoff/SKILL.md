---
name: handoff
description: "Create a continuation plan so a fresh session can pick up exactly where this one left off. Writes the plan to disk."
queries:
  - "hand off this work"
  - "create a handoff"
  - "continue in a new session"
  - "save progress for next session"
  - "context window getting long"
  - "pick this up later"
  - "pass this to a new context"
  - "write a continuation plan"
---

# /handoff — Create a Continuation Plan

Capture the full state of the current work so a completely fresh session can resume without losing context. The plan is written to disk and can be pasted or read at the start of the next session.

## When to Use

- Context window is getting long and performance is degrading
- Switching to a different machine or environment
- Pausing work to resume later
- Handing off to a colleague or a different agent

## Process

### 1. Summarize the objective

Write a clear, concise statement of what the user is trying to accomplish. This is the "north star" for the next session. Include enough context that someone unfamiliar could understand the goal.

### 2. Document what's been done

List completed work with enough detail to avoid re-doing it:

- Commits made (with hashes and one-line descriptions)
- PRs created (with URLs and status)
- Files created or modified
- Key decisions made and their rationale
- Approaches that were tried and rejected (and why — so the next session doesn't retry them)

### 3. Document what's left

List remaining work as concrete, actionable items. For each item:

- What needs to happen
- Where in the codebase it applies
- Any known blockers or dependencies between items
- Suggested approach if one was discussed

Order items by priority or logical sequence.

### 4. Capture current state

Record the working state so the next session can orient immediately:

```bash
# Current branch and recent commits
git branch --show-current
git log --oneline -10

# Uncommitted changes
git status
git diff --stat

# Any worktrees
git worktree list

# Open PRs from this work
gh pr list --author @me --state open
```

Include the output in the handoff document.

### 5. Note gotchas and context

Capture anything that would be lost with the context window:

- Environment quirks (e.g., "bun 0.1.5 is installed but too old, use ~/.bun/bin/bun after updating")
- Non-obvious dependencies between components
- Things that look like bugs but aren't
- User preferences observed during the session that aren't yet saved as memories/rules

### 6. Write the handoff file

Write the plan to a uniquely named file:

```
<cwd>/.claude/handoffs/<YYYYMMDD>-<kebab-case-title>.md
```

For example: `.claude/handoffs/20260307-prebuilt-binary-support.md`

Use this structure:

```markdown
# Handoff: <brief title>

**Date:** <ISO date>
**Branch:** <current branch>
**Working directory:** <cwd>

## Objective

<What we're trying to accomplish>

## Completed

- <done item 1>
- <done item 2>

## Remaining

- [ ] <todo item 1>
- [ ] <todo item 2>

## Current State

<git status, branch, uncommitted changes, open PRs>

## Key Decisions

- <decision 1 and rationale>
- <decision 2 and rationale>

## Gotchas

- <non-obvious thing 1>
- <non-obvious thing 2>

## To Resume

<Exact instructions for the next session to get started, e.g.:>
1. Read this file: `cat .claude/handoffs/<filename>.md`
2. Check out branch: `git checkout <branch>`
3. Start with: <first remaining task>
```

### 7. Confirm with the user

Show the handoff document and ask:
- Is anything missing?
- Should any items be reprioritized?
- Are there preferences or context to add?

Update the file with any corrections.

### 8. Tell the user how to take over

Print the exact command or prompt to start the next session, including the full filename:

```
To continue, start a new session and say:

  /takeover .claude/handoffs/<YYYYMMDD>-<title>.md
```

## Guidelines

- **Be specific, not generic.** File paths, branch names, commit hashes, PR URLs — anything the next session would need to look up, include it directly.
- **Explain the why.** Decisions without rationale will be re-evaluated from scratch. Save the next session that work.
- **Include failed approaches.** "We tried X but it didn't work because Y" prevents the next session from going in circles.
- **Keep it scannable.** Use headers, bullet points, and checkboxes. The next session should be able to skim the structure and dive into the relevant section.

$ARGUMENTS
