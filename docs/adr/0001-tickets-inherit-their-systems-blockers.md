# Tickets inherit their Systems' blockers

A ticket with no blocker of its own still reads as Blocked on the sky when any System above it (its spec, or the map) has an open blocked-by edge — the System is Gated, and gating flows down. GitHub itself gates nothing this way: a spec←spec dependency only annotates the two parents, and every child looks free. We inherit anyway because that edge is how a spec author writes build order (the Scheduled Sweeps spec waits on the Podcast spec, and its tickets carry no edges of their own); a frontier that ignores it lights tickets the author sequenced away, and an agent would start them.

## Considered options

- Ticket-level only, spec edges drawn but not gating — truer to GitHub, but the frontier lies.
- Frontier with a warning — the star is lit either way, and Start on a lit star is the whole point.
