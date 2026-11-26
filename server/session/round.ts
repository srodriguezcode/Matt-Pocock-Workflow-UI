import type { RoundOption, RoundQuestion } from '@contract/session';

const HEADER =
  /^\s*(?:❓\s*)?\*\*Q(\d+[a-z]?(?:\s*[+&,/]\s*Q?\d+[a-z]?)*)\s*(?:\*\*\s*)?[-–—:]\s*(?:\*\*)?\s*(.+?)\*\*:?[ \t]*(.*)$/;
const OPTION = /^\s*(?:[-*]\s*)?\(?([a-z])\)\s*(.+)$/;
const RULE = /^\s*-{3,}\s*$/;
const TABLE_ROW = /^\s*\|(.*)\|\s*$/;
const SEPARATOR = /^:?-{3,}:?$/;
const TABLE_KEY = /^\(?([A-Za-z])\)?(?:\s+(.*))?$/;
const LEADING_KEY = /^\(?([a-z])\)(?=[\s.:,;\-–—]|$)/;
const LEADING_CAPITAL = /^(?:\*\*)?([A-Z])(?:\*\*)?(?=\s*[.:,;\-–—)]|$)/;
const INLINE_KEY = /\(([a-z])\)/g;
/** Mid-sentence only: a capital opening a sentence is the article `A` or the pronoun `I`. */
const INLINE_CAPITAL = /(?<![.!?:]\s*|^\s*|[\w'’])([A-Z])(?![\w'’])/g;

interface Block {
  number: string;
  title: string;
  lines: string[];
  /** The text since the previous round or rule, where a table of options may precede the question. */
  lead: string[];
}

/** The grilling round `message` ends on. Empty when the message is not one. */
export function parseRound(message: string): RoundQuestion[] {
  const blocks: Block[] = [];
  let open: Block | undefined;
  let loose: string[] = [];
  for (const line of message.split('\n')) {
    const header = HEADER.exec(line);
    if (header) {
      open = {
        number: (header[1] ?? '').replace(/Q/g, '').replace(/\s*([+&,/])\s*/g, ' $1 '),
        title: (header[2] ?? '').trim(),
        lines: [header[3] ?? ''],
        lead: loose,
      };
      blocks.push(open);
      loose = [];
    } else if (RULE.test(line)) {
      open = undefined;
    } else if (open) {
      open.lines.push(line);
    } else {
      loose.push(line);
    }
  }
  return blocks.map(toQuestion);
}

function toQuestion({ number, title, lines, lead }: Block): RoundQuestion {
  const text = lines.join('\n');
  const arrow = text.indexOf('➡️');
  const own = arrow < 0 ? text : text.slice(0, arrow);
  const body = own
    .split('\n')
    .filter((line) => !TABLE_ROW.test(line))
    .join('\n')
    .trim();
  const recommendation = arrow < 0 ? '' : firstParagraph(text.slice(arrow + '➡️'.length));
  const listed = listOptions(own);
  const tabled = tableOptions(own.split('\n'));
  const options = listed.length > 0 ? listed : tabled.length > 0 ? tabled : tableOptions(lead);
  return {
    number,
    title,
    body,
    options,
    recommendation,
    recommendedKey: pickKey(recommendation, options),
  };
}

function listOptions(text: string): RoundOption[] {
  const options: RoundOption[] = [];
  for (const line of text.split('\n')) {
    const match = OPTION.exec(line);
    if (match?.[1] && match[2])
      options.push({ key: match[1], label: match[2].trim(), details: [] });
  }
  return options;
}

/** Rows of the last table in `lines` whose first cell starts with a single letter, such as `**A** Spikes`. */
function tableOptions(lines: string[]): RoundOption[] {
  let options: RoundOption[] = [];
  let columns: string[] = [];
  let previous: string[] | undefined;
  for (const line of lines) {
    const row = TABLE_ROW.exec(line);
    if (!row) {
      previous = undefined;
      continue;
    }
    const cells = (row[1] ?? '').split('|').map(plain);
    if (!previous) {
      options = [];
      columns = [];
    }
    if (cells.every((cell) => SEPARATOR.test(cell))) {
      columns = previous ?? [];
      options = [];
    } else {
      const option = tableOption(cells, columns);
      if (option) options.push(option);
    }
    previous = cells;
  }
  return options;
}

function tableOption([first, ...rest]: string[], columns: string[]): RoundOption | null {
  const key = TABLE_KEY.exec(first ?? '');
  if (!key?.[1]) return null;
  const details = rest.map((text, i) => ({ column: columns[i + 1] ?? '', text }));
  const name = key[2]?.trim();
  if (name) return { key: key[1], label: name, details };
  const [head, ...tail] = details;
  return { key: key[1], label: head?.text ?? '', details: tail };
}

function plain(cell: string): string {
  return cell.replace(/\*\*|`/g, '').trim();
}

function firstParagraph(text: string): string {
  const paragraph = text.trim().split(/\n\s*\n/)[0] ?? '';
  return paragraph.replace(/\s*\n\s*/g, ' ').trim();
}

function pickKey(recommendation: string, options: RoundOption[]): string | null {
  const offered = (key: string | undefined): key is string => options.some((o) => o.key === key);
  const leading =
    LEADING_KEY.exec(recommendation)?.[1] ?? LEADING_CAPITAL.exec(recommendation)?.[1];
  if (offered(leading)) return leading;
  for (const match of recommendation.matchAll(INLINE_KEY)) {
    if (offered(match[1])) return match[1];
  }
  for (const match of recommendation.matchAll(INLINE_CAPITAL)) {
    if (offered(match[1])) return match[1];
  }
  return null;
}
