import type { PeekLine, RoundQuestion, SessionQuestion } from '@contract/session';
import { SHELF_PATH } from './mock';

export type ScriptLine = Omit<PeekLine, 'at'>;

export interface Step {
  /** Milliseconds after the line before it. */
  after: number;
  line: ScriptLine;
}

const TICKET_FILE = `${SHELF_PATH}/.scratch/lend-books/issues/03-late-loan.md`;

const tool = (name: string, detail: string): ScriptLine => ({
  kind: 'tool',
  tool: name,
  text: `${name}: ${detail}`,
  full: null,
  human: false,
});

const turnEnd = (full: string): ScriptLine => ({
  kind: 'turn-end',
  tool: null,
  text: full.split('\n')[0] ?? '',
  full,
  human: false,
});

const PROMPT = `/wayfinder ${SHELF_PATH}/.scratch/lend-books/map.md ${TICKET_FILE}`;

export const BEFORE_ROUND: Step[] = [
  {
    after: 0,
    line: { kind: 'prompt', tool: null, text: PROMPT, full: PROMPT, human: false },
  },
  { after: 3000, line: tool('Read', `${SHELF_PATH}/GLOSSARY.md`) },
  { after: 3000, line: tool('Read', TICKET_FILE) },
  { after: 3000, line: tool('Grep', 'loan') },
  { after: 3000, line: tool('Read', `${SHELF_PATH}/src/loans/loan.ts`) },
  {
    after: 3000,
    line: turnEnd(
      'I read the ticket and the loan code.\nI have two questions about late loans.\nPlease answer them in the form.',
    ),
  },
];

export const AFTER_ROUND: Step[] = [
  { after: 3000, line: tool('Edit', TICKET_FILE) },
  { after: 3000, line: tool('Bash', 'git commit -m "Decide the rules for a late loan"') },
  {
    after: 3000,
    line: turnEnd(
      'I wrote the rules in the ticket.\nA loan is late on the due date that you set.\nThe app shows a mark on the book.',
    ),
  },
];

/** Milliseconds from the last line to Ended, and from Ended to `drop`. */
export const ENDED_AFTER = 1000;
export const DROP_AFTER = 5000;

const questions: RoundQuestion[] = [
  {
    number: '1',
    title: 'When is a loan late?',
    body: 'A loan needs a rule for the day it becomes late.\nThe ticket gives no number of days.',
    options: [
      { key: 'a', label: 'After 30 days', details: [] },
      { key: 'b', label: 'On a due date that you set', details: [] },
      { key: 'c', label: 'Never', details: [] },
    ],
    recommendation:
      'b) A due date that you set fits each friend. A fixed number of days does not fit a short loan.',
    recommendedKey: 'b',
  },
  {
    number: '2',
    title: 'What does the app do when a loan is late?',
    body: 'The app can only show the state, or it can also act.',
    options: [
      { key: 'a', label: 'It shows a mark on the book', details: [] },
      { key: 'b', label: 'It shows a mark and reminds you', details: [] },
      { key: 'c', label: 'It sends a message to your friend', details: [] },
    ],
    recommendation:
      'a) A mark is enough for the first version. A reminder needs a way to reach you.',
    recommendedKey: 'a',
  },
];

const MESSAGE = `**Q1 - When is a loan late?**

A loan needs a rule for the day it becomes late.
The ticket gives no number of days.

a) After 30 days
b) On a due date that you set
c) Never

➡️ b) A due date that you set fits each friend. A fixed number of days does not fit a short loan.

---

**Q2 - What does the app do when a loan is late?**

The app can only show the state, or it can also act.

a) It shows a mark on the book
b) It shows a mark and reminds you
c) It sends a message to your friend

➡️ a) A mark is enough for the first version. A reminder needs a way to reach you.`;

export const roundQuestion = (id: string): SessionQuestion => ({
  kind: 'round',
  id,
  message: MESSAGE,
  questions,
});
