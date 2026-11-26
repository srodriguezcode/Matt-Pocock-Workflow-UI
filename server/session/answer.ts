import type {
  AnswerRequest,
  AskAnswer,
  AskQuestion,
  Delivery,
  RoundAnswer,
} from '@contract/session';
import { REPLY_FRAME, ROUND_FRAME } from './constants.ts';

/** The questions of an `AskUserQuestion` tool input, or `null` when it is not one. */
export function readAskQuestions(toolInput: unknown): AskQuestion[] | null {
  const raw = (toolInput as { questions?: unknown } | null)?.questions;
  if (!Array.isArray(raw) || raw.length === 0) return null;
  const questions: AskQuestion[] = [];
  for (const item of raw) {
    const q = item as Partial<AskQuestion> | null;
    if (typeof q?.question !== 'string' || !Array.isArray(q.options)) return null;
    const options: AskQuestion['options'] = [];
    for (const option of q.options) {
      const o = option as Partial<AskQuestion['options'][number]> | null;
      if (typeof o?.label !== 'string') return null;
      options.push({
        label: o.label,
        description: typeof o.description === 'string' ? o.description : '',
      });
    }
    questions.push({
      question: q.question,
      header: typeof q.header === 'string' ? q.header : '',
      options,
      multiSelect: q.multiSelect === true,
    });
  }
  return questions;
}

export function askDecision(toolInput: unknown, answers: AskAnswer[]): unknown {
  const given: Record<string, string> = {};
  for (const { question, selected, other } of answers) {
    const parts = [...selected, ...(other?.trim() ? [other.trim()] : [])];
    if (parts.length > 0) given[question] = parts.join(', ');
  }
  return {
    hookSpecificOutput: {
      hookEventName: 'PermissionRequest',
      decision: {
        behavior: 'allow',
        updatedInput: { ...(toolInput as object), answers: given },
      },
    },
  };
}

/** The framed text the rewake hook wakes the Session with, or `null` for an answer it cannot carry. */
export function rewakeText(answer: AnswerRequest): string | null {
  if (answer.kind === 'ask') return null;
  const text = answerText(answer);
  if (!text) return null;
  return (answer.kind === 'reply' ? REPLY_FRAME : ROUND_FRAME) + text;
}

/** What the user sent from the board, unframed: the line Peek shows in place of the wake prompt. */
export function answerText(answer: AnswerRequest): string | null {
  if (answer.kind === 'reply') return answer.text.trim() || null;
  const parts =
    answer.kind === 'round'
      ? answer.answers.map(({ number, key, text }) => {
          const value = text?.trim() || key;
          return value ? `${number} ${value}` : '';
        })
      : answer.answers.map(({ selected, other }) =>
          [...selected, ...(other?.trim() ? [other.trim()] : [])].join(', '),
        );
  const kept = parts.filter(Boolean);
  return kept.length > 0 ? kept.join(' / ') : null;
}

/** The answer body, or `null` when any field is missing or of the wrong type for its kind. */
export function readAnswerRequest(body: unknown): AnswerRequest | null {
  const b = body as Partial<
    Record<'sessionId' | 'questionId' | 'kind' | 'text' | 'answers' | 'delivery', unknown>
  > | null;
  if (typeof b?.sessionId !== 'string' || typeof b.questionId !== 'string') return null;
  const ids = { sessionId: b.sessionId, questionId: b.questionId };
  const delivery = b.delivery === undefined ? {} : readDelivery(b.delivery);
  if (!delivery) return null;
  if (b.kind === 'reply') {
    return typeof b.text === 'string' ? { ...ids, kind: 'reply', text: b.text, ...delivery } : null;
  }
  if (!Array.isArray(b.answers)) return null;
  if (b.kind === 'ask') {
    const answers = readAll(b.answers, readAskAnswer);
    return answers && { ...ids, kind: 'ask', answers, ...delivery };
  }
  if (b.kind === 'round') {
    const answers = readAll(b.answers, readRoundAnswer);
    return answers && { ...ids, kind: 'round', answers, ...delivery };
  }
  return null;
}

function readDelivery(value: unknown): { delivery: Delivery } | null {
  return value === 'hook' || value === 'typed' ? { delivery: value } : null;
}

function readAll<T>(items: unknown[], read: (item: unknown) => T | null): T[] | null {
  const out: T[] = [];
  for (const item of items) {
    const value = read(item);
    if (!value) return null;
    out.push(value);
  }
  return out;
}

function readAskAnswer(item: unknown): AskAnswer | null {
  const a = item as Partial<Record<keyof AskAnswer, unknown>> | null;
  if (typeof a?.question !== 'string' || !isNullableString(a.other)) return null;
  const selected = a.selected;
  if (!Array.isArray(selected) || !selected.every((s) => typeof s === 'string')) return null;
  return { question: a.question, selected, other: a.other };
}

function readRoundAnswer(item: unknown): RoundAnswer | null {
  const a = item as Partial<Record<keyof RoundAnswer, unknown>> | null;
  if (typeof a?.number !== 'string' || !isNullableString(a.key) || !isNullableString(a.text)) {
    return null;
  }
  return { number: a.number, key: a.key, text: a.text };
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}
