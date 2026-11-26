import ts from 'typescript';

export interface Violation {
  file: string;
  line: number;
  message: string;
}

const MESSAGE =
  'Use @app/... or #server/... for cross-folder imports instead of parent-relative imports.';

export function checkImports(file: string, text: string): Violation[] {
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const found: Violation[] = [];
  const visit = (node: ts.Node): void => {
    const spec = specifierOf(node);
    if (spec !== null && climbs(spec)) {
      found.push({ file, line: lineOf(text, node.getStart(source)), message: MESSAGE });
    }
    node.forEachChild(visit);
  };
  visit(source);
  return found;
}

function climbs(spec: string): boolean {
  return spec.split(/[\\/]/).includes('..');
}

const VI_MODULE_CALLS = new Set([
  'mock',
  'doMock',
  'unmock',
  'doUnmock',
  'importActual',
  'importMock',
]);

function specifierOf(node: ts.Node): string | null {
  if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
    return node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)
      ? node.moduleSpecifier.text
      : null;
  }
  if (ts.isImportEqualsDeclaration(node)) {
    const ref = node.moduleReference;
    return ts.isExternalModuleReference(ref) && ts.isStringLiteralLike(ref.expression)
      ? ref.expression.text
      : null;
  }
  if (ts.isCallExpression(node) && takesModule(node.expression)) {
    const arg = node.arguments[0];
    return arg && ts.isStringLiteralLike(arg) ? arg.text : null;
  }
  return null;
}

function takesModule(callee: ts.Expression): boolean {
  if (callee.kind === ts.SyntaxKind.ImportKeyword) return true;
  if (ts.isIdentifier(callee)) return callee.text === 'require';
  if (!ts.isPropertyAccessExpression(callee)) return false;
  const name = callee.name.text;
  const target = callee.expression;
  if (ts.isMetaProperty(target))
    return target.keywordToken === ts.SyntaxKind.ImportKeyword && name === 'resolve';
  return ts.isIdentifier(target) && target.text === 'vi' && VI_MODULE_CALLS.has(name);
}

function lineOf(text: string, pos: number): number {
  return text.slice(0, pos).split('\n').length;
}
