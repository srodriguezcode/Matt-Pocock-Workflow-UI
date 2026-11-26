export const ROOT = '/code/app';
export const SCRATCH = `${ROOT}/.scratch`;

const buildTicket = (title: string, blockedBy: string | null, status = 'ready-for-agent') =>
  [
    `# ${title}`,
    '',
    '**What to build:** A short description.',
    '',
    ...(blockedBy ? [`**Blocked by:** ${blockedBy}`, ''] : []),
    `**Status:** ${status}`,
    '',
    '- [ ] It works',
    '',
  ].join('\n');

/** The shape of awwg's `ci-hooks`: six Build tickets, bold lines, one free-text blocker, no map. */
export const ciHooks: Record<string, string> = {
  [`${SCRATCH}/ci-hooks/issues/01-config-contract.md`]: [
    '# 01 — Config contract in the hooks repo',
    '',
    '**What to build:** A config set that every other ticket reads.',
    '',
    '**Blocked by:** Dana. Two things must exist first,',
    'and neither is yours to create:',
    '',
    '- a read-only deploy key',
    '- write access to the config branch',
    '',
    '**Start by asking Dana for both.**',
    '',
    '**Status:** ready-for-agent',
    '',
    '- [ ] The config folder exists',
    '',
  ].join('\n'),
  [`${SCRATCH}/ci-hooks/issues/02-check-changed-files.md`]: buildTicket(
    '02 — A pull request is checked',
    '01',
  ),
  [`${SCRATCH}/ci-hooks/issues/03-violations-on-diff.md`]: buildTicket(
    '03 — Violations appear on the diff',
    '02',
  ),
  [`${SCRATCH}/ci-hooks/issues/04-draft-on-failure.md`]: buildTicket(
    '04 — A failing check drafts the pull request',
    '02',
  ),
  [`${SCRATCH}/ci-hooks/issues/05-restore-on-pass.md`]: buildTicket(
    '05 — Fixing the violations restores it',
    '04',
  ),
  [`${SCRATCH}/ci-hooks/issues/06-prove-red-path.md`]: buildTicket(
    '06 — Prove the failure path',
    '05',
  ),
  [`${SCRATCH}/notes/diagnosis.md`]: '# Not an effort\n',
};

export const mixed: Record<string, string> = {
  [`${SCRATCH}/route/map.md`]: [
    '# Route planner',
    '',
    '## Destination',
    '',
    'Plan a trip end to end.',
    '',
    '## Not yet specified',
    '',
    '- **Offline maps** and how they sync.',
    '',
    '## Out of scope',
    '',
    '- Hotel booking',
    '',
  ].join('\n'),
  [`${SCRATCH}/route/issues/01-pick-provider.md`]: [
    '# 01 — Pick a map provider',
    '',
    'Type: research',
    'Status: resolved',
    '',
    '## Answer',
    '',
    'The first one.',
    '',
  ].join('\n'),
  [`${SCRATCH}/route/issues/02-tile-cache.md`]: [
    '# 02 — How big is the tile cache',
    '',
    'Type: grilling',
    'Blocked by: 01',
    '',
    'Question text.',
    '',
  ].join('\n'),
  [`${SCRATCH}/route/issues/03-dropped.md`]: [
    '# 03 — Dropped idea',
    '',
    'Type: task',
    'Status: wontfix',
    '',
  ].join('\n'),
  [`${SCRATCH}/export/spec.md`]: '# Spec: Export\n\nExport a trip as a file.\n',
  [`${SCRATCH}/export/issues/01-csv.md`]: [
    '# 01 — CSV export',
    '',
    'Status: ready-for-agent',
    '',
  ].join('\n'),
  [`${SCRATCH}/export/issues/02-pdf.md`]: [
    '# 02 — PDF export',
    '',
    'Blocked by: 1, legal sign-off, 09',
    'Status: ready-for-human',
    '',
  ].join('\n'),
  [`${SCRATCH}/export/issues/03-share.md`]: ['# 03 — Share link', '', 'Status: claimed', ''].join(
    '\n',
  ),
  [`${SCRATCH}/export/issues/04-done.md`]: '# 04 — Done already\n\nStatus: done\n',
  [`${SCRATCH}/export/issues/05-zip.md`]: '# 05 — Zip bundle\n\nBlocked by: 04\nStatus: done\n',
  [`${SCRATCH}/cleanup/issues/01-tidy.md`]: '# 01 — Tidy up\n\nStatus: needs-triage\n',
  [`${SCRATCH}/cleanup/issues/README.txt`]: 'not a ticket\n',
};
