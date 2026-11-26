import { describe, expect, it } from 'vitest';
import { checkComments } from './comments.ts';

const messages = (file: string, text: string) => checkComments(file, text).map((v) => v.message);

describe('checkComments', () => {
  it('accepts one- and two-line JSDoc', () => {
    expect(messages('a.ts', '/** One line. */\nconst a = 1;\n')).toEqual([]);
    expect(messages('a.ts', '/**\n * First.\n * Second.\n */\nconst a = 1;\n')).toEqual([]);
  });

  it('rejects a three-line JSDoc', () => {
    expect(messages('a.ts', '/**\n * One.\n * Two.\n * Three.\n */\nconst a = 1;\n')).toEqual([
      'JSDoc is 3 lines; the limit is 2',
    ]);
  });

  it('rejects `//` comments, leading or trailing', () => {
    expect(messages('a.ts', '// note\nconst a = 1;\n')).toHaveLength(1);
    expect(messages('a.ts', 'const a = 1; // note\n')).toHaveLength(1);
  });

  it('rejects semicolon-joined clauses outside code spans', () => {
    expect(messages('a.ts', '/** One; two. */\nconst a = 1;\n')).toEqual([
      'split the clauses: no semicolons in JSDoc',
    ]);
    expect(messages('a.ts', '/** Runs `a; b` once. */\nconst a = 1;\n')).toEqual([]);
  });

  it('rejects plain block comments', () => {
    expect(messages('a.ts', '/* note */\nconst a = 1;\n')).toEqual([
      'block comments must be JSDoc (`/** … */`)',
    ]);
  });

  it('ignores `//` inside strings, templates and regexes', () => {
    const text = "const u = 'http://x';\nconst t = `//${u}`;\nconst r = /\\/\\//;\n";
    expect(messages('a.ts', text)).toEqual([]);
  });

  it('rejects empty JSDoc and HTML comments in inline templates', () => {
    expect(messages('a.ts', '/***/\nconst a = 1;\n')).toEqual(['empty JSDoc']);
    const open = '<!' + '--';
    const component = `@Component({ template: \`<b>${open} x --></b>\` })\nclass A {}\n`;
    expect(messages('a.ts', component)).toEqual(['comments are banned in HTML']);
  });

  it('reports the line of the offending comment', () => {
    expect(checkComments('a.ts', 'const a = 1;\n\n// late\n')[0]?.line).toBe(3);
  });

  it('bans comments in HTML and styles', () => {
    expect(messages('a.html', '<div><!-- note --></div>')).toHaveLength(1);
    expect(messages('a.scss', '.a { color: red; } // note\n')).toHaveLength(1);
    expect(messages('a.scss', '/* note */\n.a {}\n')).toHaveLength(1);
    expect(messages('a.scss', ".a { background: url(http://x/y.png); content: '//'; }\n")).toEqual(
      [],
    );
  });
});
