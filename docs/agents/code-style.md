# Code style

`npm run check` is the gate: Prettier, `ngc` over the app (templates included), `tsc` over specs and server, Vitest, and the comment, import and copy checks. The pre-commit hook runs it. There is no ESLint.

## Comments

- JSDoc form only: `/** … */`. `//` and `/* */` are banned. No comments at all in HTML or SCSS.
- At most two lines of text, and no semicolon-joined clauses. The check enforces form, length and semicolons.
- Only where the code can't say it: a non-obvious rule, a unit, a reason the obvious alternative is wrong. Never a restatement of the name, a section banner, or a note about the change you just made.
- Test each one: name the edit its absence would let through, one a reviewer would reject and the tests would not catch. If you can't, delete it.
- Every comment and every piece of UI copy passes `/deslop-text`.

## Shape

- Names come from `GLOSSARY.md`: Sky, Star, System, Ticket, Gate, Frontier, Ember, Fog, Lane, Hyperlane, Claim, Release, Base, Gap. Don't drift to the words it lists under _Avoid_.
- `contract/*.d.ts` is the wire. Import it with `import type` from `@contract/*`.
- Server: TypeScript that Node 24 runs by stripping types. Erasable syntax only (no enums, parameter properties or namespaces), imports of server code carry `.ts` (`./x.ts` in the same folder, `#server/…/x.ts` across folders), no runtime dependencies. Every outside command goes through `CommandRunner`, every file through `FileSystem`.
- Client: Angular standalone components, signals, `inject()`, OnPush (the default, so don't set it). Imports use `@app/*`. Everything under `src/app/sky/engine/` is plain TypeScript with no Angular import.
- No parent-relative (`../`) imports. Cross-folder: `@app/...` extensionless (client) or `#server/...` with `.ts` (server, scripts, specs). Same-folder `./x` stays either side. The check enforces it.
- Prefer small pure functions at a module's edge and plain data between modules.

## Copy

Manage user-facing plain text in i18n bundles. Do not hardcode user-facing copy in TypeScript or HTML templates.

Components consume translations through `I18nService`, never by importing a concrete locale bundle. English is the default bundle and `TranslationBundle` is derived from its shape rather than restated beside it, so a new key lands in `messages.en.ts` (or the `src/app/i18n/en/` feature file it composes) first. Every other locale must satisfy that contract and be registered in `src/app/i18n/messages.ts`.

- The server sends a code and its params, never a sentence: the client can't translate prose it didn't write. Commands, stderr, branch names, paths and issue titles travel verbatim as params.
- A union from the contract gets a `Record<Union, string>` group, and a code union gets a `CodeWording<Union>` group, both in `translation-name-groups.model.ts`, and `word(group, value)` picks the entry. A new member won't compile until every locale words it.
- Pure helpers take a typed slice of the bundle (`CodesBundle`), not the service. Tests import `englishMessages` and assert the English.

## Tests

Tests drive a public entry point with realistic input and assert on what comes out: a Sky, a plan, step events, Gaps, positions, the next star. No tests for HTTP routes, templates or real processes. Server tests use `FakeRunner`, `FakeFs` and `FakeTracker` from `server/testing/`.
