import ts from 'typescript';

export interface Violation {
  file: string;
  line: number;
  message: string;
}

const MAX_JSDOC_LINES = 2;

export function checkComments(file: string, text: string): Violation[] {
  if (/\.(html)$/.test(file)) return markupViolations(file, text);
  if (/\.(s?css)$/.test(file)) return styleViolations(file, text);
  if (/\.(m?[jt]s)$/.test(file)) return scriptViolations(file, text);
  return [];
}

function scriptViolations(file: string, text: string): Violation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const seen = new Set<number>();
  const found: Violation[] = [];
  const visit = (node: ts.Node): void => {
    const ranges = [
      ...(ts.getLeadingCommentRanges(text, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(text, node.getEnd()) ?? []),
    ];
    for (const range of ranges) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      const problem = judge(text.slice(range.pos, range.end), range.kind);
      if (problem) found.push({ file, line: lineOf(text, range.pos), message: problem });
    }
    node.getChildren(source).forEach(visit);
  };
  visit(source);
  for (const template of text.matchAll(/template:\s*`([^`]*)`/g)) {
    const offset = template.index + template[0].indexOf('`') + 1;
    for (const v of markupViolations(file, template[1]!)) {
      found.push({ ...v, line: v.line + lineOf(text, offset) - 1 });
    }
  }
  return found.sort((a, b) => a.line - b.line);
}

function judge(comment: string, kind: ts.CommentKind): string | null {
  if (kind === ts.SyntaxKind.SingleLineCommentTrivia) return '`//` comments are banned; use JSDoc';
  if (!comment.startsWith('/**') || comment === '/**/')
    return 'block comments must be JSDoc (`/** … */`)';
  if (comment.slice(3, -2).replace(/[\s*]/g, '') === '') return 'empty JSDoc';
  const lines = comment
    .slice(3, -2)
    .split('\n')
    .map((line) => line.replace(/^\s*\*?\s?/, '').trim())
    .filter((line) => line.length > 0);
  if (lines.some((line) => /;\s/.test(line.replace(/`[^`]*`/g, ''))))
    return 'split the clauses: no semicolons in JSDoc';
  if (lines.length > MAX_JSDOC_LINES)
    return `JSDoc is ${lines.length} lines; the limit is ${MAX_JSDOC_LINES}`;
  return null;
}

function markupViolations(file: string, text: string): Violation[] {
  return matches(text, /<!--/g).map((pos) => ({
    file,
    line: lineOf(text, pos),
    message: 'comments are banned in HTML',
  }));
}

function styleViolations(file: string, text: string): Violation[] {
  const withoutStrings = text.replace(/(["'])(?:\\.|(?!\1).)*\1/g, (s) => ' '.repeat(s.length));
  const withoutUrls = withoutStrings.replace(/url\([^)]*\)/g, (s) => ' '.repeat(s.length));
  return matches(withoutUrls, /\/\*|\/\//g).map((pos) => ({
    file,
    line: lineOf(text, pos),
    message: 'comments are banned in styles',
  }));
}

function matches(text: string, pattern: RegExp): number[] {
  return [...text.matchAll(pattern)].map((match) => match.index);
}

function lineOf(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}
