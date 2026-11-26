# Local markdown is a second Tracker in v1

v1 reads a repo's tickets from local markdown (`.scratch/<effort>/issues/NN-slug.md`) as well as from GitHub, because some repos keep its build tickets there. The repo's `docs/agents/issue-tracker.md` names the Tracker. If that file is missing or names another tracker, the board shows no sky. The format has one `Status:` line, so a Claim overwrites it with `claimed` and Release writes back what Start found (`ready-for-agent`, or no line for a decision ticket). `.scratch/` is gitignored, so the worktree Start makes can't see it: the agent gets the absolute path of the ticket in the main checkout.

## Considered options

- GitHub only, with the door left open — cheaper, but repos that keep tickets in markdown wait.
- Guess the Tracker from what's on disk — a repo can have both a GitHub remote and `.scratch/`.
- A separate `Claimed by:` line — cleaner, but a convention no skill writes.
- Symlink `.scratch` into the worktree — git sees the symlink as an untracked file and it can get committed.
- `.plan/` (wayfinder-maps) as well — a second local format for no repo we use.
