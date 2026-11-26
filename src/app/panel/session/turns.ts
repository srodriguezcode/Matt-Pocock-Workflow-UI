import type { PeekLine, SessionView } from '@contract/session';

/** One turn of Peek: the prompt that opened it, its tool calls and the turn end that closed it. */
export interface Turn {
  prompt: PeekLine | null;
  tools: PeekLine[];
  end: PeekLine | null;
}

/** A turn opens on a prompt, or after a turn end when the next line isn't one: Peek may start mid-turn. */
export function turnsOf(peek: PeekLine[]): Turn[] {
  const turns: Turn[] = [];
  let current: Turn | null = null;
  for (const line of peek) {
    if (line.kind === 'prompt' || !current || current.end) {
      current = { prompt: null, tools: [], end: null };
      turns.push(current);
    }
    if (line.kind === 'prompt') current.prompt = line;
    else if (line.kind === 'tool') current.tools.push(line);
    else current.end = line;
  }
  return turns;
}

export type ReplyHint = 'form' | 'permission' | 'working' | 'none';

/** Why the Peek reply box is shut, or `null` when the Session is Waiting on a turn end it can answer. */
export function replyHint(session: SessionView): ReplyHint | null {
  const kind = session.question?.kind;
  if (kind === 'reply') return null;
  if (kind === 'ask' || kind === 'round') return 'form';
  if (session.waiting === 'permission-prompt') return 'permission';
  return session.state === 'working' ? 'working' : 'none';
}
