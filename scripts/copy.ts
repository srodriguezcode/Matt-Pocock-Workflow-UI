export interface Violation {
  file: string;
  line: number;
  message: string;
}

const MESSAGE = 'copy belongs in the i18n bundle';
const ATTRS = new Set([
  'title',
  'aria-label',
  'aria-description',
  'arialabel',
  'ariadescription',
  'placeholder',
  'alt',
]);
const RAW_TEXT = new Set(['pre', 'code']);
const ENTITY = /^&(#\d+|#x[\da-f]+|[a-z][a-z\d]*);/i;
const CODE_LIKE = /^[\p{Ll}\d]+([-_./:][\p{Ll}\d]*)*$/u;
const CONTROL_KEYWORDS = new Set([
  'if',
  'else',
  'for',
  'switch',
  'case',
  'default',
  'empty',
  'let',
  'defer',
  'placeholder',
  'error',
  'loading',
]);

export function checkCopy(file: string, text: string): Violation[] {
  if (/\.html$/.test(file)) return htmlViolations(file, text);
  if (/\.ts$/.test(file)) {
    const found: Violation[] = [];
    for (const template of text.matchAll(/template:\s*`([^`]*)`/g)) {
      const offset = template.index + template[0].indexOf('`') + 1;
      for (const v of htmlViolations(file, template[1]!)) {
        found.push({ ...v, line: v.line + lineOf(text, offset) - 1 });
      }
    }
    return found;
  }
  return [];
}

function htmlViolations(file: string, html: string): Violation[] {
  const found: Violation[] = [];
  const n = html.length;
  let raw = 0;
  let i = 0;
  while (i < n) {
    if (html.startsWith('<!--', i)) {
      const end = html.indexOf('-->', i + 4);
      i = end === -1 ? n : end + 3;
      continue;
    }
    if (html[i] === '<') {
      const end = tagEnd(html, i);
      const tag = /^<(\/?)([a-zA-Z][\w-]*)/.exec(html.slice(i, end));
      if (tag && RAW_TEXT.has(tag[2]!.toLowerCase()) && !html.slice(i, end).endsWith('/>')) {
        raw = Math.max(0, raw + (tag[1] ? -1 : 1));
      }
      found.push(...attributeViolations(file, html, i, end));
      i = end;
      continue;
    }
    if (html.startsWith('{{', i)) {
      const end = interpolationEnd(html, i + 2);
      const offset = literalOffset(html.slice(i + 2, end));
      if (offset !== null)
        found.push({ file, line: lineOf(html, i + 2 + offset), message: MESSAGE });
      i = Math.min(n, end + 2);
      continue;
    }
    const entity = ENTITY.exec(html.slice(i, i + 12));
    if (entity) {
      i += entity[0].length;
      continue;
    }
    if (html[i] === '@') {
      const after = controlFlowEnd(html, i);
      if (after !== null) {
        i = after;
        continue;
      }
    }
    if (isLetter(html[i]!)) {
      if (raw === 0) found.push({ file, line: lineOf(html, i), message: MESSAGE });
      i = skipTextRun(html, i);
      continue;
    }
    i++;
  }
  return found;
}

function attributeViolations(file: string, html: string, start: number, end: number): Violation[] {
  const tag = html.slice(start, end);
  if (tag.startsWith('</')) return [];
  const nameMatch = /^<([a-zA-Z][\w-]*)/.exec(tag);
  if (!nameMatch) return [];
  const tagName = nameMatch[1]!.toLowerCase();
  const body = tag.slice(nameMatch[0].length, tag.endsWith('/>') ? -2 : -1);
  const bodyStart = start + nameMatch[0].length;
  const found: Violation[] = [];
  const attrRe = /([^\s="']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'))?/g;
  for (const m of body.matchAll(attrRe)) {
    const value = m[2] ?? m[3];
    if (value === undefined) continue;
    const bound = /^\[(.+)\]$/.exec(m[1]!);
    const name = (bound ? bound[1]! : m[1]!).toLowerCase().replace(/^attr\./, '');
    const labelled = ATTRS.has(name) || (name === 'label' && tagName === 'option');
    if (!labelled) continue;
    const offset = bound ? literalOffset(value) : valueViolationOffset(value);
    if (offset === null) continue;
    const matchStart = bodyStart + m.index!;
    const valueStart = matchStart + m[0].length - 1 - value.length;
    found.push({ file, line: lineOf(html, valueStart + offset), message: MESSAGE });
  }
  return found;
}

function valueViolationOffset(value: string): number | null {
  let i = 0;
  while (i < value.length) {
    if (value.startsWith('{{', i)) {
      const end = interpolationEnd(value, i + 2);
      const offset = literalOffset(value.slice(i + 2, end));
      if (offset !== null) return i + 2 + offset;
      i = end + 2;
      continue;
    }
    const entity = ENTITY.exec(value.slice(i, i + 12));
    if (entity) {
      i += entity[0].length;
      continue;
    }
    if (isLetter(value[i]!)) return i;
    i++;
  }
  return null;
}

function literalOffset(expr: string): number | null {
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i]!;
    if (ch === '"' || ch === "'") {
      const end = quoteEnd(expr, i);
      const content = expr.slice(i + 1, end);
      if (/\p{L}/u.test(content) && !CODE_LIKE.test(content)) return i + 1;
      i = end + 1;
      continue;
    }
    i++;
  }
  return null;
}

function quoteEnd(text: string, i: number): number {
  let j = i + 1;
  while (j < text.length && text[j] !== text[i]) j += text[j] === '\\' ? 2 : 1;
  return Math.min(j, text.length);
}

function interpolationEnd(html: string, i: number): number {
  let j = i;
  while (j < html.length && !html.startsWith('}}', j)) {
    j = html[j] === '"' || html[j] === "'" ? quoteEnd(html, j) + 1 : j + 1;
  }
  return Math.min(j, html.length);
}

function controlFlowEnd(html: string, i: number): number | null {
  const m = /^@([a-zA-Z]+)/.exec(html.slice(i));
  if (!m || !CONTROL_KEYWORDS.has(m[1]!)) return null;
  let j = i + m[0].length;
  if (m[1] === 'else') {
    const rest = /^\s*if\b/.exec(html.slice(j));
    if (rest) j += rest[0].length;
  }
  j = skipSpaces(html, j);
  if (m[1] === 'let') {
    while (j < html.length && html[j] !== ';') {
      j = html[j] === '"' || html[j] === "'" ? quoteEnd(html, j) + 1 : j + 1;
    }
    return Math.min(j + 1, html.length);
  }
  if (html[j] === '(') return skipParens(html, j);
  return j;
}

function skipParens(html: string, i: number): number {
  const n = html.length;
  let depth = 0;
  let quote: string | null = null;
  let j = i;
  while (j < n) {
    const ch = html[j]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '(') {
      depth++;
    } else if (ch === ')') {
      depth--;
      if (depth === 0) return j + 1;
    }
    j++;
  }
  return n;
}

function skipSpaces(html: string, i: number): number {
  let j = i;
  while (j < html.length && /\s/.test(html[j]!)) j++;
  return j;
}

function skipTextRun(html: string, i: number): number {
  const n = html.length;
  let j = i;
  while (j < n) {
    if (html[j] === '<' || html.startsWith('{{', j)) return j;
    if (html[j] === '@' && controlFlowEnd(html, j) !== null) return j;
    j++;
  }
  return j;
}

function tagEnd(html: string, i: number): number {
  const n = html.length;
  let quote: string | null = null;
  let j = i + 1;
  while (j < n) {
    const ch = html[j]!;
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return j + 1;
    }
    j++;
  }
  return n;
}

function isLetter(ch: string): boolean {
  return /\p{L}/u.test(ch);
}

function lineOf(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}
