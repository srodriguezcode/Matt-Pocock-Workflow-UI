import type {
  LaunchTarget,
  LinkedTarget,
  SessionTarget,
  StarKind,
  StarTarget,
} from '@contract/launch';

export interface LinkTarget {
  repo: string;
  target: LinkedTarget;
}

const KINDS: StarKind[] = ['ticket', 'system', 'decision', 'map', 'split'];
/** Characters. The title rides in an env var and a header, so it stays short. */
const TITLE_MAX = 80;

export function isStarKind(value: unknown): value is StarKind {
  return KINDS.includes(value as StarKind);
}

export function isStarTarget(target: LinkedTarget): target is StarTarget {
  return target.kind !== 'session';
}

/** Two targets name the same star, or the same new session. */
export function sameTarget(a: LinkedTarget, b: LinkedTarget): boolean {
  if (a.kind === 'session' || b.kind === 'session') {
    return a.kind === b.kind && 'key' in a && 'key' in b && a.key === b.key;
  }
  return a.kind === b.kind && a.id === b.id;
}

/** The first line a new session opens with: `/<skill> <message>`, either part, or `''`. */
export function newSessionLine({ skill, prompt }: SessionTarget): string {
  return [skill ? `/${skill}` : '', prompt?.trim() ?? ''].filter(Boolean).join(' ');
}

/** `null` for the architecture review, which the board does not follow. */
export function linkedTarget(target: LaunchTarget): LinkedTarget | null {
  if (target.kind === 'architecture') return null;
  if (target.kind !== 'session') return target;
  const line = newSessionLine(target).replace(/\s+/g, ' ');
  const title = line.length > TITLE_MAX ? `${line.slice(0, TITLE_MAX - 1)}…` : line;
  return { kind: 'session', key: target.key, title };
}

/** Query-string form, so a repo path or a `.scratch/` id survives as an env var and a header. */
export function encodeTarget({ repo, target }: LinkTarget): string {
  const fields: Record<string, string> =
    target.kind === 'session'
      ? { kind: target.kind, key: target.key, title: target.title }
      : { kind: target.kind, id: target.id };
  return new URLSearchParams({ repo, ...fields }).toString();
}

export function decodeTarget(value: string | undefined): LinkTarget | null {
  if (!value) return null;
  const params = new URLSearchParams(value);
  const repo = params.get('repo');
  const kind = params.get('kind');
  if (!repo) return null;
  if (kind === 'session') {
    const key = params.get('key');
    return key ? { repo, target: { kind, key, title: params.get('title') ?? '' } } : null;
  }
  const id = params.get('id');
  if (!id || !isStarKind(kind)) return null;
  return { repo, target: { kind, id } };
}
