---
name: implement-ticket
description: "Implement one ticket and land it: one PR into the base branch, the ticket closed."
disable-model-invocation: true
---

# Implement a Ticket

Read `implement`'s `SKILL.md` and follow it. The Skill tool can't load it (it sets
`disable-model-invocation`). Use the first copy that exists. The board's Gap check uses this order:

1. `<repo>/.claude/skills/implement/`
2. `~/.claude/skills/implement/`, or `$CLAUDE_CONFIG_DIR/skills/implement/`
3. `<repo>/.agents/skills/implement/`
4. The `mattpocock-skills` plugin. `installed_plugins.json` in the Claude config folder gives its
   `installPath`. The skill is at `skills/engineering/implement/` in that folder.

That skill says what building the ticket looks like. This one says how it **lands**: one PR into
the **base branch**, and the ticket closed once the PR is open.

## Process

### 1. Resolve the base branch

Resolve it first, before anything is pushed, since `push -u` rewrites the upstream: the one the
prompt names; else the current branch's upstream, when it is a different branch (the board cuts
the ticket's branch from `origin/<base>`, so it tracks the base); else the repo's default branch.
Never assume `develop` or `main`.

### 2. Build

Follow `implement` on the ticket in the current checkout, through its review and its commit. Done
when the work is committed and every finding the review raised is fixed or answered.

### 3. Open the PR

Push the branch and open one PR into the base branch. Link the ticket in the body, and note
anything deliberate that a reviewer would otherwise flag.

### 4. Close the ticket

Once the PR is open, close the ticket through the repo's tracker (`docs/agents/issue-tracker.md`
says how), with a comment linking the PR. In local markdown, where that file names no close word,
set `Status: resolved` and append the comment under `## Comments`. Done when the ticket is closed
and carries the PR link.
