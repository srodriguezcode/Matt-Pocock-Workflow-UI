import type { LinkedTarget } from './launch.d.ts';

export type SessionState = 'working' | 'asking' | 'waiting' | 'ended' | 'lost';

/** A turn end the board can reply to, or a permission prompt only the terminal answers. */
export type WaitingKind = 'turn-end' | 'permission-prompt';

export type PeekKind = 'prompt' | 'tool' | 'turn-end';

/** One line of Peek. `text` is already cut to one short line: a tool's short input, never the full one. */
export interface PeekLine {
  at: string;
  kind: PeekKind;
  /** The tool's name on a `tool` line, else `null`. */
  tool: string | null;
  text: string;
  /** The whole prompt or turn-end message, as markdown. `null` on a tool line. */
  full: string | null;
  /** A Human prompt: typed in the terminal, by hand or by typed Delivery. `false` on every other line. */
  human: boolean;
}

export interface AskOption {
  label: string;
  description: string;
}

export interface AskQuestion {
  question: string;
  header: string;
  options: AskOption[];
  multiSelect: boolean;
}

export interface RoundOption {
  /** The option's letter, `a` for `a)` or `(a)`, `A` for a table row starting `**A**`. */
  key: string;
  label: string;
  /** The row's other cells, each under its column header. Empty for a listed option. */
  details: RoundDetail[];
}

export interface RoundDetail {
  /** Empty when the table has no header row. */
  column: string;
  text: string;
}

export interface RoundQuestion {
  /** `8`, or `8 + 10` for one question that answers several at once. */
  number: string;
  title: string;
  body: string;
  options: RoundOption[];
  recommendation: string;
  /** The option the recommendation picks. `null` prefills the free-text field with `recommendation`. */
  recommendedKey: string | null;
}

/** What an Asking or Waiting Session holds open for the board. `id` names this one question. */
export type SessionQuestion =
  | { kind: 'ask'; id: string; questions: AskQuestion[] }
  | { kind: 'round'; id: string; message: string; questions: RoundQuestion[] }
  | { kind: 'reply'; id: string; message: string };

/** The board's hold ran out before an answer came, so only the terminal can answer now. */
export type SessionNote = { code: 'timed-out' };

/** One linked Session, without its Peek. `since` is when `state` began. */
export interface SessionStatus {
  sessionId: string;
  repo: string;
  target: LinkedTarget;
  state: SessionState;
  /** Set only while `state` is `waiting`. */
  waiting: WaitingKind | null;
  since: string;
  startedAt: string;
  question: SessionQuestion | null;
  note: SessionNote | null;
  /** The board knows the Session's iTerm tab, so a reply or round can go by typed Delivery. */
  typeable: boolean;
}

export interface SessionView extends SessionStatus {
  /** Oldest first, at most `PEEK_LINES`. */
  peek: PeekLine[];
}

/** `GET /api/session/events`, one per SSE `data:` line: a snapshot on connect, then deltas. */
export type SessionEvent =
  | { type: 'snapshot'; sessions: SessionView[] }
  | { type: 'status'; session: SessionStatus }
  | { type: 'peek'; sessionId: string; line: PeekLine }
  | { type: 'drop'; sessionId: string };

/** One `AskUserQuestion` question answered: option labels picked, plus the Other text. */
export interface AskAnswer {
  question: string;
  selected: string[];
  other: string | null;
}

/** One grilling question answered: an option's key, or free text that wins over it. */
export interface RoundAnswer {
  number: string;
  key: string | null;
  text: string | null;
}

/** How an answer reaches the Session: as hook feedback, or typed into its terminal as the human. */
export type Delivery = 'hook' | 'typed';

/**
 * `POST /api/session/answer`. `questionId` is the `SessionQuestion.id` the form was drawn from.
 * An absent `delivery` is `hook`.
 */
export type AnswerRequest =
  | {
      sessionId: string;
      questionId: string;
      kind: 'ask';
      answers: AskAnswer[];
      delivery?: Delivery;
    }
  | {
      sessionId: string;
      questionId: string;
      kind: 'round';
      answers: RoundAnswer[];
      delivery?: Delivery;
    }
  | { sessionId: string; questionId: string; kind: 'reply'; text: string; delivery?: Delivery };

/** `gone`: another screen or the terminal answered first, or the hold ended. */
export type AnswerResponse = { code: 'sent' } | { code: 'gone' };
