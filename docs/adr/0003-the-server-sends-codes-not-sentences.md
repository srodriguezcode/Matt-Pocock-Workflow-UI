# The server sends codes, not sentences

Everything the server says to the user travels as a code with params: why a Start is disabled, the steps of a plan, a Gap, a Taken or end message, a refused Add. The client words it through the i18n bundle. An i18n'd front end can't translate a sentence the server invented, and the board's copy is meant to live in one place. Commands, stderr, branch names, paths and issue titles stay verbatim, because they are data, not copy. This follows an ADR from an earlier private project, and we use its bundle as-is.

## Considered options

- Server sentences with the client passing them through: one language forever, and copy split across two codebases.
- Server sentences keyed by a message id the client may override: two sources of truth for every string.
