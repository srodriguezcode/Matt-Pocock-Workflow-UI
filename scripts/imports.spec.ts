import { describe, expect, it } from 'vitest';
import { checkImports } from './imports.ts';

const messages = (text: string) => checkImports('a.ts', text).map((v) => v.message);

describe('checkImports', () => {
  it('accepts alias and same-folder imports', () => {
    expect(messages("import { a } from '@app/sky/model';\n")).toEqual([]);
    expect(messages("import { a } from '#server/core/runner.ts';\n")).toEqual([]);
    expect(messages("import { a } from './helper.ts';\n")).toEqual([]);
  });

  it('rejects a parent-relative static import', () => {
    expect(messages("import { a } from '../core/runner.ts';\n")).toEqual([
      'Use @app/... or #server/... for cross-folder imports instead of parent-relative imports.',
    ]);
  });

  it('rejects a parent-relative re-export', () => {
    expect(messages("export { a } from '../core/runner.ts';\n")).toHaveLength(1);
  });

  it('rejects a parent-relative dynamic import', () => {
    expect(messages("const m = await import('../core/runner.ts');\n")).toHaveLength(1);
  });

  it('rejects a `..` segment anywhere in the specifier', () => {
    for (const spec of ['..', './..', './../x.ts', './a/../../b.ts', '../../x.ts']) {
      expect(messages(`import { a } from '${spec}';\n`)).toHaveLength(1);
    }
    expect(messages("import { a } from './..x.ts';\n")).toEqual([]);
  });

  it('rejects a parent-relative import-equals require', () => {
    expect(messages("import x = require('../x');\n")).toHaveLength(1);
    expect(messages("const x = require('../x');\n")).toHaveLength(1);
  });

  it('rejects parent-relative module strings passed to vitest and import.meta.resolve', () => {
    const calls = [
      "vi.mock('../x.ts');",
      "vi.doMock('./../x.ts', () => ({}));",
      "await vi.importActual('../x.ts');",
      "import.meta.resolve('../x.ts');",
    ];
    for (const call of calls) expect(messages(`${call}\n`)).toHaveLength(1);
    expect(messages("vi.mock('#server/core/runner.ts');\n")).toEqual([]);
  });

  it('allows a parent-relative URL, which names a file on disk rather than a module', () => {
    expect(messages("const dir = new URL('../dist/', import.meta.url);\n")).toEqual([]);
  });

  it('reports one violation per offending line', () => {
    const text = "import { a } from '../a.ts';\nimport { b } from '../b.ts';\n";
    const violations = checkImports('a.ts', text);
    expect(violations.map((v) => v.line)).toEqual([1, 2]);
  });
});
