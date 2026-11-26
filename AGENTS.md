# UI Agent Workflow

A standalone board over a repo's issue graph — map, specs, tickets, blockers — that shows the frontier and launches an agent session on a ticket. Angular front, Node back; the repo's tracker (GitHub through `gh`, or local markdown in `.scratch/`) is the only store.

## Code style

Read `docs/agents/code-style.md` before writing code. The comment rules there are strict.

## User-facing copy

Manage user-facing plain text in i18n bundles. Do not hardcode user-facing copy in TypeScript or HTML templates.

Components consume translations through `I18nService`, never by importing a concrete locale bundle. English is the default bundle and `TranslationBundle` is derived from its shape rather than restated beside it, so a new key lands in `messages.en.ts` (or the `src/app/i18n/en/` feature file it composes) first. Every other locale must satisfy that contract and be registered in `src/app/i18n/messages.ts`.

## Agent skills

### Issue tracker

Issues live as GitHub issues on `srodriguezcode/Matt-Pocock-Workflow-UI`, managed via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical triage roles map 1:1 to same-named GitHub labels. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` + `docs/adr/`, created lazily by `/domain-modeling`. See `docs/agents/domain.md`.

### Human prose

Tickets from `/to-tickets` open with `## Summary`: 2–4 sentences of human prose — what changes for the user, and why. `/grilling` questions (title, body, recommended answer) are human prose too, technical detail on a nested line after. Human prose = ASD-STE100 Simplified Technical English, terms from `GLOSSARY.md`, passed through `/deslop-text` silently: apply its fixes, keep its report out of the reply.

### Bundled skills

`skills/` holds skills that no installer provides. Today that's `/implement-ticket` and `/implement-parallel` (customizations of `/implement` that the board launches) and `/deslop-text` (every comment and piece of UI copy must pass it). Tracked on purpose; `.claude/`, `.agents/`, `.scratch/` and `.env*` stay ignored. Install by linking: `ln -s "$PWD/skills/<name>" ~/.claude/skills/<name>`.
