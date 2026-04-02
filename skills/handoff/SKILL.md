---
name: handoff
description: "Create a comprehensive continuation plan so a fresh session can pick up exactly where this one left off — with full operational detail, not summaries."
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

# /handoff — Create a Comprehensive Continuation Plan

Capture the **full operational state** of the current work so a completely fresh session can resume without losing any context. The next session has zero memory of this one — every detail that matters must be in the document.

**Budget: Spare no necessary detail.** A handoff that's too short forces the next session to re-discover context, wasting hours. A handoff that's comprehensive saves the user from repeating themselves. Err on the side of completeness.

## When to Use

- Context window is getting long and performance is degrading
- Switching to a different machine or environment
- Pausing work to resume later
- Handing off to a colleague or a different agent

## Process

### 1. Summarize the objective

Write a clear statement of what the user is trying to accomplish, with enough context that someone unfamiliar could understand the goal. Include:
- The high-level goal
- Why it matters (business/technical motivation)
- How this session fits into the larger picture

### 2. Document what's been done — IN DETAIL

For each PR merged or significant piece of work:

- **PR number, title, and what it actually changed** (not just the title — describe the mechanics)
- **Files modified** with the specific changes and why
- **The problem it solved** with the root cause, not just the symptom
- **Verification**: what tests were run, what CI status was, what review found
- **Operational impact**: what needs to happen after merge (deploy commands, service restarts, etc.)

For decisions made during the session:
- **What was decided** and the specific rationale
- **What alternatives were considered** and why they were rejected
- **Supporting data** (benchmark numbers, cost analysis, error messages)

For investigations/research:
- **What was checked** and the specific findings
- **File paths and line numbers** for key code examined
- **Conclusions** with evidence, not just assertions

### 3. Document current system state

Capture the actual state of every system touched, with verification commands. **Include the actual output**, not just the commands. The next session should be able to verify state without re-running.

```bash
# Git state
git branch --show-current
git log --oneline -15
git status
git worktree list

# Open PRs
gh pr list --author @me --state open

# Service health (if applicable)
# Include actual JSON responses, not just "it's healthy"
```

### 4. Document what's left — with full context per item

For each remaining item, provide:

- **What needs to happen** — concrete, actionable steps (not "fix the thing")
- **Where in the codebase** — specific file paths, function names, line numbers
- **Why it matters** — what breaks or is blocked without it
- **Blocked by** — dependencies on other items
- **Suggested approach** — if one was discussed or is obvious from the session
- **Known pitfalls** — things the next session should watch out for
- **Verification** — how to confirm the item is done correctly

Order items by priority or logical sequence.

### 5. Document failed approaches and dead ends

For each approach that was tried and abandoned:
- **What was tried** and the specific error or problem
- **Why it failed** — root cause, not just "it didn't work"
- **What was learned** that should prevent the next session from retrying

This section prevents the most expensive waste: a fresh session re-discovering the same dead ends.

### 6. Capture operational knowledge and gotchas

Everything that would be lost with the context window:
- Environment quirks with exact workaround commands
- Non-obvious dependencies between components
- Things that look like bugs but aren't (and why)
- Service state that affects behavior (what's deployed where, what version)
- Credentials/access patterns (not the secrets — the patterns for using them)
- User preferences observed during the session that aren't yet saved as rules

### 7. Write the handoff file

Write to: `<cwd>/.claude/handoffs/<YYYYMMDD>-<kebab-case-title>.md`

Use this structure:

```markdown
# Handoff: <descriptive title>

**Date:** <ISO date>
**Branch:** <current branch>
**Working directory:** <cwd>

## Objective

<What we're trying to accomplish and why. 2-3 paragraphs of context.>

## Session Summary

<One paragraph narrative of what happened this session — the arc from start to finish.>

## Completed Work

### <PR or work item title>

**PR:** #NNN — <url>
**Problem:** <what was broken and why>
**Root cause:** <the actual bug/gap, with file:line references>
**Fix:** <what was changed, mechanically>
**Files:** <list of files changed with one-line description each>
**Tests:** <what tests were added/run>
**Review:** <findings and resolution>
**Deploy:** <operational commands needed after merge>

<Repeat for each significant work item>

### Key Decisions

| Decision | Rationale | Alternatives Rejected |
|----------|-----------|----------------------|
| <decision 1> | <why> | <what else was considered> |

### Investigations & Research

<For each research item: what was checked, findings with file:line refs, conclusion>

## Current State

### Git
\```
<actual git log output>
<actual git status output>
\```

### Services
\```
<actual health check output>
<actual registry/job/deployment state>
\```

### Deployed Versions
- <service 1>: <git hash>, <what's running>
- <service 2>: <git hash>, <what's running>

## Remaining Work

### 1. <Item title> [priority]

**What:** <concrete description>
**Where:** <file paths, function names, line numbers>
**Why:** <what breaks without it, what it unblocks>
**Blocked by:** <dependencies>
**Approach:** <suggested implementation>
**Pitfalls:** <things to watch out for>
**Verify:** <how to confirm it's done>

<Repeat for each item, ordered by priority>

## Failed Approaches & Dead Ends

### <What was tried>
**Error/Problem:** <exact error message or behavior>
**Root cause:** <why it failed>
**Lesson:** <what to do instead>

## Gotchas & Environment Notes

- <gotcha 1 with exact workaround command>
- <gotcha 2>

## To Resume

1. Read this file: `cat .claude/handoffs/<filename>.md`
2. <Verify state command>
3. <First concrete action>
```

### 8. Confirm with the user

Show the handoff document and ask:
- Is anything missing?
- Should any items be reprioritized?
- Are there preferences or context to add?

Update the file with any corrections.

### 9. Tell the user how to take over

```
To continue, start a new session and say:

  /takeover .claude/handoffs/<YYYYMMDD>-<title>.md
```

## Guidelines

- **Spare no necessary detail.** The next session has zero context. Everything that matters must be written down. A long handoff that prevents hours of re-discovery is worth it.
- **Be specific, not generic.** File paths, branch names, commit hashes, PR URLs, exact error messages, benchmark values, cost figures — anything the next session would need to look up, include directly.
- **Explain the why.** Decisions without rationale will be re-evaluated from scratch.
- **Include failed approaches.** The most expensive waste is a fresh session re-discovering the same dead ends.
- **Include actual command output.** Don't say "check the service health" — run the command and include the output.
- **Include operational commands.** Every "after merge, do X" should have the exact command, not a description.
- **Include the data.** Tables of results, cost comparisons, benchmark numbers — these belong in the handoff, not just references to them.
- **Keep it scannable.** Use headers, bullet points, tables, and checkboxes — but don't sacrifice detail for brevity.

$ARGUMENTS
