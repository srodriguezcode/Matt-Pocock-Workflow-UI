import type {
  AnswerRequest,
  AskAnswer,
  AskQuestion,
  Delivery,
  RoundAnswer,
  RoundQuestion,
  SessionQuestion,
} from '@contract/session';

export interface AskField {
  selected: string[];
  other: string;
}

export interface RoundField {
  key: string | null;
  text: string;
}

export function emptyAskFields(questions: AskQuestion[]): AskField[] {
  return questions.map(() => ({ selected: [], other: '' }));
}

export function pickOption(field: AskField, label: string, multiSelect: boolean): AskField {
  if (!multiSelect) return { selected: [label], other: '' };
  const selected = field.selected.includes(label)
    ? field.selected.filter((picked) => picked !== label)
    : [...field.selected, label];
  return { ...field, selected };
}

export function typeOther(field: AskField, other: string, multiSelect: boolean): AskField {
  return { selected: multiSelect ? field.selected : [], other };
}

export function askComplete(fields: AskField[]): boolean {
  return fields.every((field) => field.selected.length > 0 || field.other.trim() !== '');
}

export function askAnswers(questions: AskQuestion[], fields: AskField[]): AskAnswer[] {
  return questions.map((question, i) => ({
    question: question.question,
    selected: fields[i]!.selected,
    other: fields[i]!.other.trim() || null,
  }));
}

export function askRequest(
  sessionId: string,
  questionId: string,
  questions: AskQuestion[],
  fields: AskField[],
  delivery: Delivery = 'hook',
): AnswerRequest {
  return {
    kind: 'ask',
    sessionId,
    questionId,
    answers: askAnswers(questions, fields),
    delivery,
  };
}

export function roundDefaults(questions: RoundQuestion[]): RoundField[] {
  return questions.map((question) =>
    question.recommendedKey === null
      ? { key: null, text: question.recommendation }
      : { key: question.recommendedKey, text: '' },
  );
}

export function pickKey(key: string): RoundField {
  return { key, text: '' };
}

export function typeText(text: string): RoundField {
  return { key: null, text };
}

export function roundAnswers(questions: RoundQuestion[], fields: RoundField[]): RoundAnswer[] {
  return questions.map((question, i) => ({
    number: question.number,
    key: fields[i]!.key,
    text: fields[i]!.text.trim() || null,
  }));
}

export function roundComplete(fields: RoundField[]): boolean {
  return fields.every((field) => field.key !== null || field.text.trim() !== '');
}

export function roundRequest(
  sessionId: string,
  questionId: string,
  questions: RoundQuestion[],
  fields: RoundField[],
  delivery: Delivery = 'hook',
): AnswerRequest {
  return {
    kind: 'round',
    sessionId,
    questionId,
    answers: roundAnswers(questions, fields),
    delivery,
  };
}

export function replyRequest(
  sessionId: string,
  questionId: string,
  text: string,
  delivery: Delivery = 'hook',
): AnswerRequest {
  return { kind: 'reply', sessionId, questionId, text: text.trim(), delivery };
}

/** The saved Draft if it fits these questions, else an empty form. */
export function restoreAskFields(questions: AskQuestion[], draft: unknown): AskField[] {
  return fitsEach(draft, questions.length, isAskField) ? draft : emptyAskFields(questions);
}

/** The saved Draft if it fits these questions, else the recommendations. */
export function restoreRoundFields(questions: RoundQuestion[], draft: unknown): RoundField[] {
  return fitsEach(draft, questions.length, isRoundField) ? draft : roundDefaults(questions);
}

export function restoreReply(draft: unknown): string {
  return typeof draft === 'string' ? draft : '';
}

function fitsEach<T>(
  draft: unknown,
  length: number,
  fits: (item: unknown) => item is T,
): draft is T[] {
  return Array.isArray(draft) && draft.length === length && draft.every(fits);
}

function isAskField(item: unknown): item is AskField {
  const field = item as Partial<AskField> | null;
  return (
    typeof field?.other === 'string' &&
    Array.isArray(field.selected) &&
    field.selected.every((label) => typeof label === 'string')
  );
}

function isRoundField(item: unknown): item is RoundField {
  const field = item as Partial<RoundField> | null;
  return typeof field?.text === 'string' && (field.key === null || typeof field.key === 'string');
}

export type QuestionOf<K extends SessionQuestion['kind']> = Extract<SessionQuestion, { kind: K }>;

export interface AnswerKind<K extends SessionQuestion['kind'], V> {
  readonly kind: K;
  restore(question: QuestionOf<K> | null, draft: unknown): V;
  ready(value: V): boolean;
  request(sessionId: string, question: QuestionOf<K>, value: V, delivery: Delivery): AnswerRequest;
}

export const askKind: AnswerKind<'ask', AskField[]> = {
  kind: 'ask',
  restore: (question, draft) => restoreAskFields(question?.questions ?? [], draft),
  ready: askComplete,
  request: (sessionId, question, fields, delivery) =>
    askRequest(sessionId, question.id, question.questions, fields, delivery),
};

export const roundKind: AnswerKind<'round', RoundField[]> = {
  kind: 'round',
  restore: (question, draft) => restoreRoundFields(question?.questions ?? [], draft),
  ready: roundComplete,
  request: (sessionId, question, fields, delivery) =>
    roundRequest(sessionId, question.id, question.questions, fields, delivery),
};

export const replyKind: AnswerKind<'reply', string> = {
  kind: 'reply',
  restore: (_question, draft) => restoreReply(draft),
  ready: (text) => text.trim() !== '',
  request: (sessionId, question, text, delivery) =>
    replyRequest(sessionId, question.id, text, delivery),
};
