import { describe, expect, it } from 'vitest';
import { commandLine } from '#server/core/runner.ts';
import { BOARD_PROMPT, REPLY_FRAME, ROUND_FRAME } from '#server/session/constants.ts';
import { openTab, sessionCommand, typePrompt } from './commands.ts';

describe('openTab', () => {
  it('starts the tab with the command, run after the login shell loads its startup files', () => {
    const script = openTab('cd /w && claude "/implement #613"', '/bin/zsh').args.filter(
      (_, i) => i % 2 === 1,
    );
    const launch = `/bin/zsh -ilc 'cd /w && claude \\"/implement #613\\"; exec /bin/zsh -il'`;
    expect(script).toEqual([
      'tell application "iTerm2"',
      'if (count of windows) is 0 then',
      `set made to (create window with default profile command "${launch}")`,
      'else',
      `tell current window to set made to (create tab with default profile command "${launch}")`,
      'end if',
      'return id of current session of made',
      'end tell',
    ]);
  });

  it('never types into the tab', () => {
    expect(openTab('true', '/bin/zsh').args.join(' ')).not.toContain('write text');
  });
});

describe('sessionCommand', () => {
  it('keeps the plain line without a link', () => {
    expect(sessionCommand('/w', '/improve')).toBe('cd /w && claude "/improve"');
  });

  it('adds the target env var, the settings file and the board line when linked', () => {
    const target = 'repo=%2Fcode%2Fapp&kind=ticket&id=613';
    const prompt = commandLine('', [BOARD_PROMPT]).trimStart();
    expect(
      sessionCommand('/w', '/implement-ticket #613', { settingsPath: '/s.json', target }),
    ).toBe(
      `cd /w && UAW_TARGET='${target}' claude --settings /s.json --append-system-prompt ${prompt} "/implement-ticket #613"`,
    );
  });

  it('appends a Start prompt after the board line, or alone when unlinked', () => {
    const target = 'repo=%2Fcode%2Fapp&kind=split&id=700';
    const both = commandLine('', [`${BOARD_PROMPT} Link tickets.`]).trimStart();
    expect(
      sessionCommand(
        '/w',
        '/to-tickets #700',
        { settingsPath: '/s.json', target },
        'Link tickets.',
      ),
    ).toBe(
      `cd /w && UAW_TARGET='${target}' claude --settings /s.json --append-system-prompt ${both} "/to-tickets #700"`,
    );
    expect(sessionCommand('/w', '/to-tickets #700', null, 'Link tickets.')).toBe(
      `cd /w && claude --append-system-prompt 'Link tickets.' "/to-tickets #700"`,
    );
  });

  it('names both frames the board wakes a Session with', () => {
    expect(BOARD_PROMPT).toContain(`"${REPLY_FRAME.trim()}"`);
    expect(BOARD_PROMPT).toContain(`"${ROUND_FRAME.split('. ')[0]}"`);
  });
});

describe('typePrompt', () => {
  it('passes the tab and the answer as arguments, so no answer text is quoted into the script', () => {
    const answer = 'line one\n"two" \\ $x';
    const cmd = typePrompt('w0t1p0:ABC', answer);
    expect(cmd.args.slice(-2)).toEqual(['w0t1p0:ABC', answer]);
    expect(cmd.args.slice(0, -2).join(' ')).not.toContain('line one');
  });

  it('drops ESC, so an answer cannot close the bracketed paste itself', () => {
    expect(typePrompt('T', 'a\x1b[201~b').args.at(-1)).toBe('a[201~b');
  });
});
