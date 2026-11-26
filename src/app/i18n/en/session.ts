import type {
  DeliveryNames,
  NotificationReasonNames,
  PeekKindNames,
  ReplyHintNames,
  SessionNoteWording,
  SessionStateNames,
} from '@app/i18n/translation-name-groups.model';

const states: SessionStateNames = {
  working: 'Working',
  asking: 'Asking',
  waiting: 'Waiting',
  ended: 'Ended',
  lost: 'Lost',
};

const notes: SessionNoteWording = {
  'timed-out': () => 'The question waited too long for the board. Answer it in the terminal.',
};

const peekKinds: PeekKindNames = {
  prompt: 'Prompt',
  tool: 'Tool',
  'turn-end': 'Turn end',
};

/** Whole minutes, so the line counts up once a minute rather than every second. */
const held = (ms: number) => {
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours} h ${minutes % 60} min` : `${minutes} min`;
};

export const session = {
  heading: 'Session',
  states,
  held,
  line: (state: string, time: string) => `${state} · ${time}`,
  noLinkedSession: 'No linked session',
  lostNote: 'Its process is gone. Release the claim, or pick the work up in the terminal.',
  permissionPrompt: 'Waiting on a permission prompt. Answer in the terminal.',
  alreadyAnswered: 'Already answered, on another screen or in the terminal.',
  notes,
  sharedSession: (handle: string) => `Shares the session started on ${handle}`,
  notifications: {
    label: (count: number) =>
      count === 0 ? 'Notifications' : `Notifications: ${count} waiting on you`,
    heading: 'Waiting on you',
    empty: 'Nothing waits on you.',
    dismiss: 'Dismiss until the session moves again',
    reasons: {
      ask: 'Asks a question',
      round: 'Grilling round to answer',
      reply: 'Waiting on your reply',
      permission: 'Permission prompt, in the terminal',
      finished: 'Closed, its session still open',
    } satisfies NotificationReasonNames,
  },
  tabTitle: (count: number, base: string) => (count > 0 ? `(${count}) ${base}` : base),

  peek: {
    heading: 'Peek',
    empty: 'Nothing yet.',
    frozen: 'The session stopped. This is where it left off.',
    close: 'Close Peek',
    enlarge: 'Enlarge the questions',
    shrink: 'Shrink the questions',
    turn: (n: number) => `Turn ${n}`,
    hints: {
      form: 'Answer the form in the panel',
      permission: 'Answer the permission prompt in the terminal',
      working: 'You can reply when the turn ends',
      none: 'Nothing to reply to',
    } satisfies ReplyHintNames,
  },

  form: {
    send: 'Send',
    sending: 'Sending…',
    sendFailed: (reason: string) => `Couldn't send: ${reason}`,
    other: 'Other',
    otherPlaceholder: 'Write your own answer',
    recommended: (text: string) => `Recommended: ${text}`,
    askHeading: 'The session asks',
    roundHeading: (count: number) =>
      `Grilling round · ${count} ${count === 1 ? 'question' : 'questions'}`,
    replyPlaceholder: 'Reply to the session',
    delivery: {
      label: 'Type the answer in the terminal',
      tips: {
        hook: 'Goes to the session as hook feedback. Click to type it in the terminal as you.',
        typed: 'Typed in the terminal as you. Click to send it as hook feedback.',
      } satisfies DeliveryNames,
    },
  },
};
