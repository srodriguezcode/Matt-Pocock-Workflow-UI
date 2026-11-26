import type { StarTarget, StarKind } from '@contract/launch';

export interface LinkTarget {
  repo: string;
  target: StarTarget;
}

const KINDS: StarKind[] = ['ticket', 'system', 'decision', 'map', 'split'];

export function isStarKind(value: unknown): value is StarKind {
  return KINDS.includes(value as StarKind);
}

/** Query-string form, so a repo path or a `.scratch/` id survives as an env var and a header. */
export function encodeTarget({ repo, target }: LinkTarget): string {
  return new URLSearchParams({ repo, kind: target.kind, id: target.id }).toString();
}

export function decodeTarget(value: string | undefined): LinkTarget | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const repo = params.get('repo');
  const kind = params.get('kind');
  const id = params.get('id');
  if (!repo || !id || !isStarKind(kind)) return null;
  return { repo, target: { kind, id } };
}
