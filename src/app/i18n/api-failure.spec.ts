import { describe, expect, it } from 'vitest';
import type { Gap } from '@contract/gap';
import { apiFailureText } from './api-failure';
import { englishMessages } from './messages.en';

const codes = englishMessages.board.codes;

const trackerGap: Gap = {
  id: 'tracker-missing',
  scope: 'repo',
  tier: 'fatal',
  problem: { code: 'tracker-missing', file: 'docs/agents/issue-tracker.md' },
  fix: { skill: 'setup-matt-pocock-skills' },
  blocks: [],
  ids: [],
  searched: [],
};

describe('the text of a failed API call', () => {
  it('words the reason, else the Gap, else shows the raw error', () => {
    expect([
      apiFailureText(
        {
          error: 'not-a-checkout',
          reason: { code: 'not-a-checkout', path: '/code/nope' },
          gap: trackerGap,
        },
        codes,
      ),
      apiFailureText({ error: 'tracker-missing', gap: trackerGap }, codes),
      apiFailureText({ error: 'socket hang up' }, codes),
    ]).toEqual([
      '/code/nope is not a git checkout',
      'docs/agents/issue-tracker.md is missing',
      'socket hang up',
    ]);
  });
});
