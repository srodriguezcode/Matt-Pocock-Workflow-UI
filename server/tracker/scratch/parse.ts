import type { CloseReason } from '#server/tracker/tracker.ts';

export interface Field {
  start: number;
  end: number;
  valueStart: number;
  value: string;
  bold: boolean;
}

export interface TicketText {
  title: string | null;
  status: string | null;
  typeLine: string | null;
  blockedBy: string | null;
  flagged: boolean;
}

export interface StatusMeaning {
  state: 'open' | 'closed';
  closeReason: CloseReason | null;
  claimed: boolean;
  label: string | null;
}

/** A blocker may carry its title after the number: `01 (schema)`, `01: schema`, `01 — schema`. */
const NUMBER = /^#?(\d+)(?:\s*\(.*\)|\s*:.*|\s+[—–-]\s.*)?$/;
/** Any text after `None` keeps it a no-blocker: upstream writes `None (can start immediately)`. */
const NO_BLOCKER = /^(none\b.*|n\/a|-|—)?$/i;

function headerBlock(text: string): string {
  const end = /^(##|```|~~~)/m.exec(text)?.index;
  return end === undefined ? text : text.slice(0, end);
}

export function findField(text: string, name: string): Field | null {
  const re = new RegExp(
    `^(\\*\\*${name}:\\*\\*|${name}:)([ \\t]*)([^\\r\\n]*?)[ \\t]*(?=\\r?$)`,
    'm',
  );
  const match = re.exec(headerBlock(text));
  if (!match) return null;
  const valueStart = match.index + match[1]!.length + match[2]!.length;
  return {
    start: match.index,
    end: valueStart + match[3]!.length,
    valueStart,
    value: match[3]!,
    bold: match[1]!.startsWith('**'),
  };
}

export function readTicketText(text: string): TicketText {
  return {
    title: firstHeading(text),
    status: findField(text, 'Status')?.value ?? null,
    typeLine: findField(text, 'Type')?.value ?? null,
    blockedBy: blockedByParagraph(text),
    flagged: findField(text, 'Flagged')?.value.toLowerCase() === 'yes',
  };
}

export function firstHeading(text: string): string | null {
  return /^# +(.+?)\s*$/m.exec(text)?.[1] ?? null;
}

export function statusMeaning(status: string | null): StatusMeaning {
  const word = (status ?? '').replace(/`/g, '').trim();
  const open = { state: 'open', closeReason: null, claimed: false, label: null } as const;
  switch (word.toLowerCase()) {
    case '':
      return open;
    case 'resolved':
    case 'done':
    case 'closed':
    case 'complete':
    case 'completed':
      return { ...open, state: 'closed', closeReason: 'completed' };
    case 'wontfix':
      return { ...open, state: 'closed', closeReason: 'not-planned' };
    case 'claimed':
      return { ...open, claimed: true };
    default:
      return { ...open, label: word };
  }
}

export function splitBlockers(value: string | null): { numbers: number[]; outside: string | null } {
  if (value === null) return { numbers: [], outside: null };
  const parts = value
    .split(/[,\n]/)
    .map((part) => part.trim().replace(/^[-*]\s+/, ''))
    .filter((part) => !NO_BLOCKER.test(part));
  const numbers = parts.flatMap((part) => {
    const match = NUMBER.exec(part);
    return match ? [Number(match[1])] : [];
  });
  const rest = parts.filter((part) => !NUMBER.test(part)).join(', ');
  return { numbers, outside: rest || null };
}

function blockedByParagraph(text: string): string | null {
  const field = findField(text, 'Blocked by');
  if (!field) return null;
  const lines = [field.value];
  const after = headerBlock(text).slice(field.end).split(/\r?\n/).slice(1);
  for (const line of after) {
    if (!line.trim() || /^(#|\*\*[^*]+:\*\*|[A-Z][\w ]*:\s)/.test(line)) break;
    lines.push(line.trim());
  }
  return lines.join('\n');
}

export function withStatus(text: string, status: string | null): string {
  return withField(text, 'Status', status, 'Type');
}

export function withFlag(text: string, flagged: boolean): string {
  return withField(text, 'Flagged', flagged ? 'yes' : null, 'Status');
}

/** A new line goes under `after`, else under the title. `null` drops the line. */
function withField(text: string, name: string, value: string | null, after: string): string {
  const field = findField(text, name);
  if (field) {
    if (value !== null) return text.slice(0, field.valueStart) + value + text.slice(field.end);
    return withoutLine(text, field.start);
  }
  if (value === null) return text;
  const bold = /^\*\*[^*\n]+:\*\*/m.test(text);
  const line = `${bold ? `**${name}:**` : `${name}:`} ${value}`;
  const anchor = findField(text, after)?.start ?? /^# /m.exec(text)?.index ?? null;
  if (anchor === null) return `${line}\n${text}`;
  const lineEnd = text.indexOf('\n', anchor);
  if (lineEnd === -1) return `${text}\n${line}`;
  return `${text.slice(0, lineEnd + 1)}${line}\n${text.slice(lineEnd + 1)}`;
}

function withoutLine(text: string, start: number): string {
  const lineEnd = text.indexOf('\n', start);
  if (lineEnd !== -1) return text.slice(0, start) + text.slice(lineEnd + 1);
  return text.slice(0, Math.max(0, start - 1));
}
