# UI Agent Workflow Client

A board over one repo's issue graph, drawn as a star-map: it shows which tickets can start now and launches an agent session on one of them. The repo's Tracker is the only store; the board reads it and writes only a claim, a release or a flag.

## Language

### The sky

**Sky**:
Everything drawn for one repo: every open issue, the closed ones an open issue still points at, and the fog. One repo, one sky.
_Avoid_: board (that is the app), graph (that is the data), canvas, map (spent — see Map)

**Star**:
One issue as it appears on the sky. Its look is set by its Gate and Readiness; its kind rides in the label.
_Avoid_: node, dot, card

**Ember**:
A closed issue kept on the sky because an open one still points at it — a closed blocker, or a closed System with an open child still inside it. Dim, never lit.
_Avoid_: ghost, tombstone, archived

**Fog**:
The Map's *Not yet specified* bullets, drawn as nebulae at the map's rim. The only thing on the sky that is not an issue.
_Avoid_: to-be-confirmed (that is Undecided, a star), unknowns, backlog

### Shape

**Root**:
An open issue with no parent. Every System and every Loose ticket is one.
_Avoid_: top-level, epic

**System**:
An issue that holds tickets: the Map, a Spec (even before it has tickets), or any issue with children. Drawn as one constellation; never on the Frontier itself, though it can be a Frontier system.
_Avoid_: constellation (the drawing, not the thing), cluster, epic, parent (GitHub's word for the edge)

**Map**:
The wayfinder map issue, labelled `wayfinder:map`. A System whose children are Decision tickets and whose body carries the Destination and the Fog.

**Spec**:
An issue titled `Spec: …`, labelled `spec`, or with 3 or more of the `/to-spec` template headings in its body. A System whether or not `/to-tickets` has run on it yet; sitting under the Map does not fold it into the map's system.
_Avoid_: epic, feature, parent issue

**Loose ticket**:
A Root with no children that is not a Spec — a bug, a request, a one-off.
_Avoid_: orphan, standalone, unparented

**Ticket**:
Any issue that is not a System: a child of one, or a Loose ticket. The only thing that can be on a frontier.

**Decision ticket**:
A Ticket carrying a `wayfinder:*` label, or a `Type:` line in local markdown — resolved by a decision, not a build. Kind comes from the label, not from sitting under the Map.
_Avoid_: wayfinder ticket, map ticket, question

**Build ticket**:
Any Ticket that is not a Decision ticket. What `/implement` runs on.
_Avoid_: task, story, issue (GitHub's word for all of them)

### Gate — read from the graph

**Gate**:
What the graph says about whether a Ticket can start: Done or Ruled out (both closed), In flight, Blocked, Clear. First match wins, in that order.
_Avoid_: status (GitHub's word for open/closed), state (Readiness is a state too)

**Done**:
Closed. A done Decision ticket is a decision; a done Build ticket is shipped. Drawn as an Ember while still referenced.
_Avoid_: decided (only true of decision tickets), resolved, completed (GitHub's close reason)

**Ruled out**:
Closed with GitHub's reason *not planned* or *duplicate*. A husk, not an Ember; still satisfies every Dependency on it, because GitHub treats it as closed.
_Avoid_: out of scope (the map's word for work past the destination), wontfix (a label, unused here), cancelled

**In flight**:
Open with any assignee. Whose it is does not change the gate.
_Avoid_: claimed (that is the act of taking it), assigned, WIP

**Blocked**:
Open, unassigned, with at least one open blocker — its own, or inherited from any Gated System above it.
_Avoid_: waiting, dependent, pending

**Clear**:
Open, unassigned, nothing blocking it. Whether it lights up is Readiness's call.
_Avoid_: open (GitHub's word, and every non-Done gate is open), ready (that is readiness), available, free

### Readiness — read from the triage label

**Readiness**:
What the triage label says about who may take a Ticket: ready-for-agent, ready-for-human, Undecided, or none. When labels conflict the most cautious wins: Undecided over ready-for-human over ready-for-agent. A Decision ticket carries none; its `wayfinder:*` label stands in.

**Frontier**:
A Build ticket at gate Clear with `ready-for-agent`. The lit star; the only thing Start acts on.
_Avoid_: ready, actionable, next up, todo

**Yours**:
A Build ticket at gate Clear with `ready-for-human`. Lit for the human, no Start.
_Avoid_: waiting on you, manual, human frontier

**Decision frontier**:
A Decision ticket at gate Clear. The next decision on the Map.
_Avoid_: frontier (that is build tickets), map frontier

**Split frontier**:
A Spec in Needs tickets with no Undecided label, Gated or not. Lit on its own constellation; Start on it splits it into tickets.
_Avoid_: spec frontier, decision frontier (that is tickets)

**Undecided**:
A Ticket labelled `to-be-confirmed`, `needs-triage` or `needs-info`. A real issue, so a Star, never Fog; on no frontier whatever its gate.
_Avoid_: fog, parked, unclear, triage

### Age

**Age**:
Whole days since an issue was created. Every open issue has one; nothing resets it.
_Avoid_: wait, idle time, last activity

**Old**:
A Ticket at gate Clear with an Age of 30 days or more, whatever its Readiness; or a System in Needs tickets that old; or a System holding an Old ticket. The Map is Old only through its tickets. In flight has Stale claim instead; Blocked is waiting, not forgotten.
_Avoid_: stale (that is a claim), dusty, forgotten, neglected

### Flagged

**Flagged**:
An open issue the human marked to find again: the `flagged` label on GitHub, a `Flagged: yes` line in local markdown. It means "find this", not "do this first": no order, frontier or Start changes. A System holding a Flagged ticket echoes it; the Map never does.
_Avoid_: important, priority, pinned, starred

**Flag**:
Marking an issue Flagged from the board; Unflag undoes it. One of the board's three writes.
_Avoid_: mark, pin, star

### System states

**Needs tickets**:
A System with no children yet — a Spec before `/to-tickets`.
_Avoid_: empty, unsplit

**Live**:
A System with at least one open child.
_Avoid_: active, in progress, open

**Spent**:
A System still open whose children are all closed — a spec that wants closing, or a Map whose route is clear.
_Avoid_: done (that is the closed system), complete, finished

**Gated**:
A System with an open blocker of its own. Every Ticket under it is Blocked, whatever its own edges say.
_Avoid_: blocked (that is the ticket's state), locked, held

**Frontier system**:
A Live System that can be started whole: not Gated, no child System, nothing In flight, every open Ticket a `ready-for-agent` Build ticket, and no open blocker reaching in from outside it (only Lanes). The Map never is one.
_Avoid_: wave (the parallel skill's word for its own batches), fleet, batch

### Edges

**Dependency**:
A native GitHub blocked-by edge, or a ticket named on a local `Blocked by:` line. A `Blocked by:` line that names no ticket is an outside blocker: it gates until the line is edited, and draws no line. Always gates; always drawn. Parent→child is not a dependency: it places a ticket in its System and draws no line.
_Avoid_: blocker (that is the issue at the far end), link, relation

**Lane**:
A Dependency between two Tickets of one System.

**Hyperlane**:
A Dependency that crosses Systems: ticket to ticket across systems, or system to system.
_Avoid_: cross-link, external dependency

### Launching

**Start**:
The one launching act: claim, prepare, open a Session. Acts on a Frontier ticket, a Frontier system, a Decision frontier ticket, a Split frontier Spec, or the Map while it has a Decision frontier. Also acts on the repo itself for `/improve-codebase-architecture`: no star, no Claim, run in the main checkout. A new session also acts on the repo itself: no star, no Claim, run in the main checkout, with an optional skill and first message.
_Avoid_: run, launch button, dispatch

**Claim**:
Marking a Ticket as the dev's in the Tracker so no one else starts it — an assignee on GitHub, `Status: claimed` in local markdown; what turns it In flight. One of the board's three writes.
_Avoid_: take, lock, reserve

**Release**:
Undoing a Claim — unassigning, or putting back the `Status:` Start found. The work on disk stays.
_Avoid_: cancel, abort, unclaim

**Stale claim**:
A Claim held a week or more, unless its Session is Working, Asking or Waiting. Flagged, never released for you; only the holder can Release it. "Stale" means this and nothing else — a sky that failed to refresh is shown by its last-read time.
_Avoid_: abandoned, expired, dead claim

**Base**:
The branch a Start builds from: the nearest System's declared base, else the repo's, else the default branch. Overridable per Start; the override is never written back.
_Avoid_: target branch, parent branch, trunk

### Sessions

**Session**:
One agent process a Start opened: an iTerm2 tab on the Mac, or a worktree and a tmux window in the container. A session started by hand is not one; the board never sees it. A board starts Sessions only on its own machine; boards never talk to each other.
_Avoid_: agent, run, tab, Docker session

**Session link**:
The board's live line to a Session: it reads the Session's state, answers the question it is asking, and replies when it is Waiting on a turn end. The terminal stays usable the whole time, and the first answer wins.
_Avoid_: bridge, channel, connection

**Peek**:
A linked Session's recent activity as the Session link saw it: one line per prompt, tool call or turn end. Read-only, and not the transcript.
_Avoid_: transcript, log, tail, output

**Delivery**:
How the Session link puts a reply or a grilling-round answer into the Session: by hook (the default), or typed into the Session's terminal as the human. The human picks it for each answer. An answer to a held question has no Delivery choice.
_Avoid_: channel, path, transport, mode

**Human prompt**:
A prompt the Session takes as the human's own input: typed in the terminal, by hand or by typed Delivery. Peek shows it apart from an answer that came by hook.
_Avoid_: user message, real prompt

**Draft**:
An answer the human started on the board and did not send yet. Kept in this browser until it is sent or its question closes.
_Avoid_: unsent, pending, cache

**Working**:
A Session in the middle of a turn, however long the turn runs.
_Avoid_: busy, running, active

**Asking**:
A Session waiting on an answer the board gives through a form: a question it holds, or a grilling round its last turn ended on.
_Avoid_: blocked (that is a Gate), pending, waiting

**Waiting**:
A Session with nothing running, waiting on the human: a turn ended on anything but a grilling round, which the board can reply to in free text; or a permission prompt only the terminal answers.
_Avoid_: idle, paused

**Ended**:
A Session whose process exited cleanly.
_Avoid_: done (that is a Gate), finished, closed

**Lost**:
A Session whose process is gone without a clean exit. Never inferred from silence: a slow Session is still Working.
_Avoid_: crashed, dead, stuck, stale (that is a Claim)

**Cost**:
The tokens and API-equivalent dollars of every Session a Start opened on a Ticket or System, read from its transcripts. Nothing is billed on a subscription.
_Avoid_: spend, price, usage (the plan's word)

**Working time**:
The summed length of a Session's turns.
_Avoid_: duration, elapsed, time spent

### Setup

**Tracker**:
Where a repo keeps its issues, as its `docs/agents/issue-tracker.md` declares: GitHub, read through `gh`, or local markdown under `.scratch/`. One per repo, never mixed. In local markdown, each `.scratch/<effort>/` with an `issues/` folder is a System, whatever else it holds.
_Avoid_: source, backend, store

**Gap**:
A convention or dependency the board expects that a repo or machine lacks. Either it blocks Start, or it only thins the sky; a missing or unauthed `gh`, or a missing or unsupported Tracker, shows no sky at all. Cleared only by fixing it, never dismissed.
_Avoid_: error, warning (that is the icon), missing config

**Rail**:
The column of repo tiles at the board's edge; a click on a tile shows that repo's sky. Its order is the user's: a tile goes where it is dragged, a new repo goes to the bottom, and the order is kept between runs.
_Avoid_: repo selector, sidebar, repo list

**Demo**:
The board on GitHub Pages, over mocked repos. It reads nothing from GitHub and cannot start a Session; its writes live in the browser until reload.
_Avoid_: preview, sandbox, playground
