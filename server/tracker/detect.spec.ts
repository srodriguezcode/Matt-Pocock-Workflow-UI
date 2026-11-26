import { describe, expect, it } from 'vitest';
import { classify } from './detect.ts';

describe('classify', () => {
  it('reads the heading the setup skill writes', () => {
    expect(classify('# Issue tracker: GitHub\n\nIssues live as GitHub issues.')).toBe('github');
    expect(classify('# Issue tracker: Local Markdown\n\nIn `.scratch/`.')).toBe('scratch');
  });

  it('tells a missing file from an unsupported tracker', () => {
    expect(classify(null)).toBe('missing');
    expect(classify('# Issue tracker: GitLab\n')).toBe('unsupported');
    expect(classify('Some notes.')).toBe('unsupported');
  });
});
