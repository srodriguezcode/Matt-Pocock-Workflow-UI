---
name: implement-parallel
description: "Implement a spec or set of tickets with maximum subagent parallelism, landing one branch and one PR."
disable-model-invocation: true
---

# Implement in Parallel

Read `implement`'s `SKILL.md` and follow it. The Skill tool can't load it (it sets
`disable-model-invocation`). Use the first copy that exists. The board's Gap check uses this order:

1. `<repo>/.claude/skills/implement/`
2. `~/.claude/skills/implement/`, or `$CLAUDE_CONFIG_DIR/skills/implement/`
3. `<repo>/.agents/skills/implement/`
4. The `mattpocock-skills` plugin. `installed_plugins.json` in the Claude config folder gives its
   `installPath`. The skill is at `skills/engineering/implement/` in that folder.

That skill says what building the work looks like. This one says how it is **split**: across as
many subagents, in as many worktrees, as the work's own import graph allows. Everything lands in
**one branch**. The run ends with a PR into the **base branch**, every ticket it implements
closed, and zero worktree leftovers.

## Process

### 1. Map the work, on the base branch

Resolve the base branch first, before anything is pushed: the one the prompt names; else the
current branch's upstream, when it is a different branch (a feature branch cut from
`origin/feat/x` tracks it); else the repo's default branch. Never assume `develop` or `main`. If
the session starts on the base itself, cut the feature branch from it.

Then fetch, and make sure the feature branch is level with the base's tip. A map drawn from a stale
feature branch describes verticals that do not exist, and the error only surfaces when an agent
implements against them.

Read the spec or tickets in full, then produce, per unit of work, **the files it imports**. That is
the real blocking edge — a declared `blocked-by` graph routinely understates it, and one shared
module can pin an entire wave behind one agent. Derive API and endpoint lists from the acceptance
criteria, not the design prose; prose drops the call some later slice needs, and an agent barred
from adding endpoints will invent a workaround instead.

Fan the mapping out too: one read-only agent per vertical, in parallel.

### 2. Write the shared surface yourself, before launching anyone

This is horizontal on purpose, and it is the highest-leverage step in the run. Write, and commit:

- the wire contract and every shared type
- the **whole** i18n surface — interface and bundle, every key any unit will need
- config constants
- every pure module more than one unit imports
- a stub of every shared component
- shell, routing and registration files stay reserved for you throughout

Then fence the agents off it: an agent that needs a missing key or a stub method **reports** it and
you write it. Skimping here is what turns two waves into three, and it puts a defect underneath
every agent that follows.

### 3. Fence by disjoint path

Give each agent a path set no other agent can write. Fence by **path, not by ticket** — tickets
that chain seven deep often split cleanly across directories. Where two agents would otherwise edit
one file, have each add its own file instead.

Keep a ticket whole unless the decision it turns on is settled up front and written into both
briefs. Splitting one ticket across two agents reliably costs a mid-flight relay, because each half
assumes something about the other.

### 4. Size each agent to its work

Use the cheapest agent that can do the job. Mechanical, fully-specified work — a scaffolded
component, a mapper, a rename batch — goes to a small model at low effort. Spend the strong model
on the seam, the contested design calls, and the reviews.

### 5. Give each agent a worktree

`git worktree add` per agent, branched off the feature branch. Share the installed dependencies by
symlinking them from the main checkout rather than installing per tree, and copy in any gitignored
material the agents need (agent docs, design prototypes — `git archive` a prototype to a stable
scratchpad path so every UI agent reads the same one).

Agents commit inside their own tree, normally, so the repo's pre-commit gates run per ticket. Give
them the quick gate only: the heavy audit runs a production build, and concurrent runs fight over
one output directory.

**When the session is already worktree-isolated, skip the trees.** Every subagent is pinned to the
session's worktree, so per-agent trees fail on writes and on git alike. Fall back to path fencing
in the one tree, bar agents from committing, and commit yourself with precise staging.

### 6. Run the waves

Launch a wave, wait for it, merge every branch back into the one feature branch, launch the next.

**Review immediately after the seam wave**, not only at the end. A defect in the shared surface is
a two-line fix at wave 1 and a cross-cutting rewrite at wave 3. Run the repo's health/ratchet
checks at the same point, for the same reason.

Give the **comment criterion its own reviewer** over the merged diff, separate from the standards
pass. A reviewer covering everything finds the worst two files and stops; a reviewer whose only
job is comments enumerates them and is exhaustive, which is what the criterion needs. No gate
judges whether a comment earns its place, so if nobody is asked the question nobody answers it.

Relay between agents rather than restarting them when one needs something from another's fence.

### 7. Land it

Full test suite, typecheck, and the heavy audit — once, from the main checkout, after the last
merge. Then call the Skill tool with "code-review" over the whole branch, and fix what it finds
yourself rather than leaving the tail serial-and-manual: the post-review fixes are agent-shaped,
so fan them out.

### 8. Tear down

Remove every worktree and every temporary branch. The check is objective: `git worktree list` shows
only the main checkout, and no per-ticket branch survives.

### 9. Open the PR, close its tickets

Push the feature branch and open one PR into the base branch for the whole set. Note in it anything
deliberate that a reviewer would otherwise flag.

Once the PR is open, close every ticket it implements through the repo's tracker
(`docs/agents/issue-tracker.md` says how), each with a comment linking the PR. The spec or System
issue stays open. In local markdown, where that file names no close word, set `Status: resolved` and
append the comment under `## Comments`. Done when every ticket in the set is closed and carries the PR
link.

<brief-template>

**Read first:** the exact files, with a line on the current state of each. A brief that names its
files runs roughly a third of the exploration of one that describes scope.

**Build:** the end-to-end behaviour, plus the acceptance criteria verbatim from the ticket.

**Your fence:** the paths you may write. Everything else is read-only — report what you need there,
do not add it.

**Gates:** the quick ones, green before you finish.

**Comments:** before committing, list every comment you added and beside each name the edit its
absence permits — a change someone would make, a reviewer would reject, and **the tests would not
catch**. Delete the ones where you cannot, and put the list in your report.

**Finish:** commit in your worktree, report the paths you touched and anything you had to assume.

</brief-template>
