import { promptTarget } from './launch-prompt.ts';
import type { AttributionContext, Session } from './session.ts';
import { worktreeTarget } from './worktree.ts';

/** Decision and Map Starts open in the main checkout, so only there does the prompt decide. */
export function attribute(session: Session, context: AttributionContext): string | null {
  const byWorktree = worktreeTarget(session.cwd, context);
  if (byWorktree !== null) return byWorktree;
  if (session.cwd !== context.checkout || session.prompt === null) return null;
  return promptTarget(session.prompt, context);
}
