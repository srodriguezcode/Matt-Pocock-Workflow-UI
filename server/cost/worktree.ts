import type { AttributionContext } from './session.ts';

export function worktreeTarget(cwd: string, context: AttributionContext): string | null {
  const root = `${context.worktreeRoot.replace(/\/+$/, '')}/`;
  if (!cwd.startsWith(root)) return null;
  const [prefix, slug, ...deeper] = cwd.slice(root.length).split('/');
  if (!prefix || !slug || deeper.length > 0) return null;
  return issueOfSlug(slug, context);
}

/**
 * A scratch slug is `<effort>-<NN>` for a Ticket and the bare effort name for a System.
 * An effort may itself end in `-<NN>`, so a known System wins.
 */
function issueOfSlug(slug: string, context: AttributionContext): string | null {
  if (context.tracker === 'github') return /^\d+$/.test(slug) ? slug : null;
  if (context.systemIds.includes(slug)) return slug;
  const ticket = /^(.+)-(\d+)$/.exec(slug);
  return ticket ? `${ticket[1]}/${ticket[2]}` : slug;
}
