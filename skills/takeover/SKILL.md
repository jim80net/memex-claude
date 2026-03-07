---
name: takeover
description: "Pick up where a previous session left off by reading and executing a handoff document."
queries:
  - "take over from handoff"
  - "continue where we left off"
  - "pick up previous work"
  - "load handoff"
  - "what was I working on"
  - "takeover previous session"
  - "continue from last session"
---

# /takeover — Continue from a Handoff

Read a handoff document and orient the session to continue the work.

## Process

### 1. Find the handoff

List available handoff documents:

```bash
ls -1t .claude/handoffs/*.md 2>/dev/null
```

If the user specified a filename, use that. Otherwise show the list sorted by date (newest first) and ask which one to take over.

### 2. Read and internalize

Read the handoff file completely. Before proceeding, understand:

- **Objective** — what are we trying to accomplish?
- **Completed** — what's already done? Don't redo this.
- **Remaining** — what's the task list?
- **Current state** — what branch, what's uncommitted?
- **Key decisions** — what was decided and why? Honor these unless the user says otherwise.
- **Gotchas** — what to watch out for?

### 3. Verify current state

Confirm the working environment matches what the handoff expects:

```bash
git branch --show-current
git status
git log --oneline -5
```

If the branch or state doesn't match (e.g., switched branches since the handoff), flag it and ask the user how to proceed.

### 4. Understand the objective

Before presenting a plan, make sure you genuinely understand the goal. Ask clarifying questions if:

- The objective is ambiguous or could be interpreted multiple ways
- The remaining tasks seem disconnected from the stated objective
- Key decisions reference context you don't have (e.g., external specs, ticket numbers)
- The gotchas suggest complexity that isn't reflected in the remaining tasks

Do not proceed until you're confident you understand what success looks like.

### 5. Present the plan

Give the user a brief summary:

> **Taking over:** <title>
> **Branch:** <branch>
> **Next up:** <first remaining task>
>
> <N> items remaining. Shall I start with <first item>?

### 6. Begin work

Start executing the remaining tasks in order. Follow the suggested approaches noted in the handoff. Respect the key decisions unless the user overrides them.

$ARGUMENTS
