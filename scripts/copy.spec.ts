import { describe, expect, it } from 'vitest';
import { checkCopy } from './copy.ts';

const messages = (file: string, text: string) => checkCopy(file, text).map((v) => v.message);

describe('checkCopy', () => {
  it('flags a plain text node', () => {
    expect(messages('a.html', '<p>Add a repo</p>')).toEqual(['copy belongs in the i18n bundle']);
  });

  it('passes a text node with no letters', () => {
    expect(messages('a.html', '<p>▸ ⊘ ● ◐ ✓ ✗ ↺ ☾ × ↗ · + / 123</p>')).toEqual([]);
  });

  it('ignores interpolation but flags text around it', () => {
    expect(messages('a.html', '<p>{{ x }}</p>')).toEqual([]);
    expect(messages('a.html', '<p>Fix: run {{ x }} in this repo.</p>')).toEqual([
      'copy belongs in the i18n bundle',
      'copy belongs in the i18n bundle',
    ]);
  });

  it('flags an unbound title, aria-label, placeholder or alt', () => {
    expect(messages('a.html', '<button title="Refresh"></button>')).toEqual([
      'copy belongs in the i18n bundle',
    ]);
    expect(messages('a.html', '<button aria-label="Filter systems"></button>')).toEqual([
      'copy belongs in the i18n bundle',
    ]);
    expect(messages('a.html', '<input placeholder="Search" />')).toEqual([
      'copy belongs in the i18n bundle',
    ]);
    expect(messages('a.html', '<img alt="A cover" />')).toEqual([
      'copy belongs in the i18n bundle',
    ]);
  });

  it('passes a bound attribute of the same name', () => {
    expect(messages('a.html', '<canvas [attr.aria-label]="words().ariaLabel"></canvas>')).toEqual(
      [],
    );
    expect(messages('a.html', '<a [title]="tooltip()"></a>')).toEqual([]);
  });

  it('ignores an attribute outside the tracked set', () => {
    expect(messages('a.html', '<div class="btn-primary" data-x="Hello"></div>')).toEqual([]);
  });

  it('passes an empty alt', () => {
    expect(messages('a.html', '<img alt="" />')).toEqual([]);
  });

  it('skips an @if / @else if / @else header, then reads its body as usual', () => {
    const text =
      '@if (board.repos().length === 0) {\n' +
      '  <p>Empty</p>\n' +
      '} @else if (board.fatalGap(); as fatal) {\n' +
      '  <p>Fatal</p>\n' +
      '} @else {\n' +
      '  <p>Sky</p>\n' +
      '}';
    expect(messages('a.html', text)).toEqual([
      'copy belongs in the i18n bundle',
      'copy belongs in the i18n bundle',
      'copy belongs in the i18n bundle',
    ]);
  });

  it('skips an @for header and a @let statement', () => {
    expect(
      messages('a.html', '@for (row of rows(); track row.key) {\n  <p>{{ row.name }}</p>\n}'),
    ).toEqual([]);
    expect(
      messages('a.html', '@let codes = i18n.messages().board.codes;\n<p>{{ codes.a }}</p>'),
    ).toEqual([]);
  });

  it('ignores an HTML comment', () => {
    expect(messages('a.html', '<!-- Add a repo --><p>{{ x }}</p>')).toEqual([]);
  });

  it('checks an inline template literal in a .ts file, at the right line', () => {
    const source = '@Component({\n  template: `\n    <p>Hello</p>\n  `,\n})\nclass A {}\n';
    const violations = checkCopy('a.ts', source);
    expect(violations).toHaveLength(1);
    expect(violations[0]!.line).toBe(3);
  });

  it('ignores a bound property carrying a computed string', () => {
    const text = `<button [attr.aria-label]="repo.owner + '/' + repo.name"></button>`;
    expect(messages('a.html', text)).toEqual([]);
  });

  it('flags a quoted string in an interpolation, but not a lowercase code', () => {
    expect(messages('a.html', "<b>{{ copied() ? 'Copied' : 'Copy' }}</b>")).toHaveLength(1);
    expect(messages('a.html', "<b>{{ done ? 'all set' : x }}</b>")).toHaveLength(1);
    expect(messages('a.html', "<b>{{ t.gate === 'in-flight' ? a : b }}</b>")).toEqual([]);
    expect(messages('a.html', "<b>{{ 'origin/' + branch }}</b>")).toEqual([]);
    expect(messages('a.html', "<b>{{ ' (' + note() + ')' }}</b>")).toEqual([]);
  });

  it('flags a literal bound to a labelled attribute', () => {
    for (const attr of [
      `[title]="'Refresh'"`,
      `[attr.aria-label]="'Close panel'"`,
      `[attr.title]="busy ? 'Reading' : ''"`,
    ]) {
      expect(messages('a.html', `<button ${attr}></button>`)).toHaveLength(1);
    }
    expect(messages('a.html', `<p [attr.aria-describedby]="x ? 'Some Id' : null"></p>`)).toEqual(
      [],
    );
  });

  it('reads attribute names in any case and with an attr. prefix', () => {
    expect(messages('a.html', '<img ALT="A cover" />')).toHaveLength(1);
    expect(messages('a.html', '<i attr.aria-label="Close"></i>')).toHaveLength(1);
    expect(messages('a.html', '<i aria-description="Opens the sheet"></i>')).toHaveLength(1);
  });

  it('flags the label of an option and no other element', () => {
    expect(messages('a.html', '<option label="Main"></option>')).toHaveLength(1);
    expect(messages('a.html', '<track label="Main" />')).toEqual([]);
  });

  it('passes HTML entities', () => {
    expect(messages('a.html', '<button title="&times;">&times;&nbsp;&#8594;</button>')).toEqual([]);
    expect(messages('a.html', '<p>&nbsp;Hello</p>')).toHaveLength(1);
  });

  it('reads a @let statement past a semicolon inside quotes', () => {
    expect(messages('a.html', "@let x = 'a;b';\n<p>{{ x }}</p>")).toEqual([]);
  });

  it('passes the text of pre and code, which is data', () => {
    expect(messages('a.html', '<pre>git fetch origin</pre><code>npm run check</code>')).toEqual([]);
    expect(messages('a.html', '<pre>{{ x }}</pre><p>Hello</p>')).toHaveLength(1);
  });
});
