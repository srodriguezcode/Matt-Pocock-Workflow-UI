# Contributing

Thanks for looking. This board is built with the same workflow it draws, so most of what follows is how that workflow runs here.

## Set up

```sh
git clone git@github.com:srodriguezcode/Matt-Pocock-Workflow-UI.git
cd Matt-Pocock-Workflow-UI
nvm use          # Node 24, from .nvmrc
npm ci           # also points git at the pre-commit hook
```

`npm run dev` runs the API on port 8000 under `node --watch` and `ng serve` on 4200, which proxies `/api` to it. Both reload on change.

## Where work comes from

Work lives as GitHub issues in this repo, shaped by [Matt Pocock's skills](https://github.com/mattpocock/skills). A Spec issue holds the user stories. Its sub-issues are Build tickets with blocked-by edges and a triage label. A ticket labelled `ready-for-agent` is fully specified and can be picked up by you or by an agent session.

- Pick a ticket on the Frontier: open, unassigned, nothing blocking it, labelled `ready-for-agent`. The board itself shows you which ones those are.
- Assign it to yourself before you start, so nobody else does.
- If a ticket turns out underspecified, say so on the issue instead of guessing.

Bugs and ideas go in as new issues. Someone triages them with the labels in `docs/agents/triage-labels.md`.

## Before you write code

Read these once. They're short, and the checks enforce most of them.

- [`GLOSSARY.md`](GLOSSARY.md): the domain words (Sky, System, Frontier, Gate, Claim, Base, Gap…) and the words to avoid. Names in code and UI copy use them.
- [`docs/agents/code-style.md`](docs/agents/code-style.md): comments, copy, imports and the shape of server and client code.
- [`docs/adr/`](docs/adr/): decisions already made, and why.

A few rules people trip on:

- Comments are JSDoc only, two lines at most, and only where the code can't say it. `//` comments fail the check.
- User-facing copy lives in the i18n bundle under `src/app/i18n/`. The server sends codes, not sentences ([ADR 0003](docs/adr/0003-the-server-sends-codes-not-sentences.md)).
- Imports across folders use `@app/…` in the client and `#server/….ts` on the server. `../` fails the check.
- The server runs as TypeScript that Node strips at load time, so no enums, namespaces or parameter properties there. Every outside command goes through `CommandRunner`, every file through `FileSystem`.
- Every comment and every piece of UI copy passes `/deslop-text` (bundled in `skills/deslop-text`).

## Checks

```sh
npm run check
```

That runs Prettier, the Angular compiler over the app, `tsc` over specs and server, Vitest, and the comment, import and copy checks. The pre-commit hook runs it too, so a red check blocks the commit.

Tests drive a public entry point with realistic input and assert on what comes out: a Sky, a plan, step events, Gaps, positions, the next star. Server tests use the fakes in `server/testing/`. HTTP routes, templates and real processes get no tests.

## Pull requests

- One PR per ticket, or one per Spec when the tickets ship together. Branch from `main`.
- Say which issue it closes, and note anything deliberate a reviewer would otherwise flag.
- Keep `npm run check` green. Don't commit with the hook skipped.

## Code of Conduct

This project follows the [Contributor Covenant](CODE_OF_CONDUCT.md). By taking part you agree to uphold it.
