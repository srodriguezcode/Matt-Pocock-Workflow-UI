import { describe, expect, it } from 'vitest';
import { parseRound } from './round.ts';

const skill =
  '❓ **Q1** - **Scope**: What goes in?\n\n(a) all\n(b) some\n\n➡️ (b) because\n\n❓ **Q2** - **Name**: free text\n\n➡️ call it X';
const drift =
  '❓ **Q1 - Vibe**: What?\n\n(a) Playful\n(b) Calm\n\n➡️ (a) — fun\n\n---\n\n❓ **Q2 - Gender**: What?\n(a) M\n(b) F\n➡️ (b) ok\n\n---\n\nYour answers?';

const summary = (message: string) =>
  parseRound(message).map((q) => [q.number, q.title, q.options.length, q.recommendedKey]);

describe('parseRound', () => {
  it('reads the skill format', () => {
    expect(summary(skill)).toEqual([
      ['1', 'Scope', 2, 'b'],
      ['2', 'Name', 0, null],
    ]);
    expect(parseRound(skill)[0]).toMatchObject({
      body: 'What goes in?\n\n(a) all\n(b) some',
      options: [
        { key: 'a', label: 'all', details: [] },
        { key: 'b', label: 'some', details: [] },
      ],
      recommendation: '(b) because',
    });
  });

  it('reads the drifted format and stops at the rule', () => {
    expect(summary(drift)).toEqual([
      ['1', 'Vibe', 2, 'a'],
      ['2', 'Gender', 2, 'b'],
    ]);
    expect(parseRound(drift)[1]?.recommendation).toBe('(b) ok');
  });

  it('reads a header without the emoji, bullets and a bare key', () => {
    const message = '**Q1 - Mode**: Which?\n- a) fast\n- b) slow\n➡️ b) safer';
    expect(summary(message)).toEqual([['1', 'Mode', 2, 'b']]);
  });

  it('reads a sub-numbered header', () => {
    const message =
      '❓ **Q15b - Cloud on a local markdown repo: who closes the ticket?**\n\n(a) you\n\n(b) the board\n\n➡️ (a). The board writes only when you act.';
    expect(summary(message)).toEqual([
      ['15b', 'Cloud on a local markdown repo: who closes the ticket?', 2, 'a'],
    ]);
  });

  it('picks a key named inside the recommendation', () => {
    const message = "❓ **Q3 - Pick**: Which?\n(a) x\n(b) y\n(c) z\n➡️ I'd guess (c)";
    expect(summary(message)).toEqual([['3', 'Pick', 3, 'c']]);
  });

  it('leaves the key null when the recommendation names no option', () => {
    const message = '❓ **Q1 - Pick**: Which?\n(a) x\n(b) y\n➡️ (z) or maybe neither';
    const [question] = parseRound(message);
    expect(question?.recommendedKey).toBeNull();
    expect(question?.recommendation).toBe('(z) or maybe neither');
  });

  it('reads a joint header and takes its options from the table before it', () => {
    const message = [
      'Built it.',
      '',
      '| Key | Star | Label |',
      '|---|---|---|',
      '| **A** Spikes | thin lines | filled ✦ |',
      '| **B** Pennant | small flag | `[ ]` flag |',
      '',
      '❓ **Q8 + Q10** - **Which variant, or which mix?** For example, "star from A".',
      '',
      "➡️ I recommend B, but I haven't seen it.",
    ].join('\n');
    expect(parseRound(message)).toEqual([
      {
        number: '8 + 10',
        title: 'Which variant, or which mix?',
        body: 'For example, "star from A".',
        options: [
          {
            key: 'A',
            label: 'Spikes',
            details: [
              { column: 'Star', text: 'thin lines' },
              { column: 'Label', text: 'filled ✦' },
            ],
          },
          {
            key: 'B',
            label: 'Pennant',
            details: [
              { column: 'Star', text: 'small flag' },
              { column: 'Label', text: '[ ] flag' },
            ],
          },
        ],
        recommendation: "I recommend B, but I haven't seen it.",
        recommendedKey: 'B',
      },
    ]);
  });

  it('reads a table inside the question and a leading capital key', () => {
    const message = '❓ **Q2 - Pick**: Which?\n\n| A | x |\n| B | y |\n\n➡️ A — simpler';
    const [question] = parseRound(message);
    expect(question).toMatchObject({ body: 'Which?', recommendedKey: 'A' });
    expect(question?.options).toEqual([
      { key: 'A', label: 'x', details: [] },
      { key: 'B', label: 'y', details: [] },
    ]);
  });

  it('does not take a sentence-opening capital as a key', () => {
    const message = '❓ **Q1 - Pick**: Which?\n\n| A | x |\n| B | y |\n\n➡️ A mix. I like both';
    expect(parseRound(message)[0]?.recommendedKey).toBeNull();
  });

  it('is empty for a message that is not a round', () => {
    expect(parseRound('Done, summary here.')).toEqual([]);
    expect(parseRound('')).toEqual([]);
  });
});
