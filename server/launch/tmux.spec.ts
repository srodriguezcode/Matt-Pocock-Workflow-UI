import { describe, expect, it } from 'vitest';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { sessionCommand } from './commands.ts';
import { tmuxName, tmuxOpen, typeIntoTmux } from './tmux.ts';

describe('tmuxName', () => {
  it('is tmux-safe for a .scratch id and a dotted repo folder', () => {
    expect(tmuxName('/code/app', { kind: 'ticket', id: 'maps/a.b:c' })).toBe(
      'uaw-app-3258da-ticket-maps_a_b_c',
    );
    expect(tmuxName('/code/my.app', { kind: 'system', id: '613' })).toMatch(
      /^uaw-my_app-[0-9a-f]{6}-system-613$/,
    );
  });

  it('differs for the same ticket in two repos, even with the same folder name', () => {
    const twelve = { kind: 'ticket', id: '12' } as const;
    expect(tmuxName('/repos/me/app', twelve)).toBe('uaw-app-c5cf46-ticket-12');
    expect(tmuxName('/repos/you/app', twelve)).toBe('uaw-app-360ae5-ticket-12');
  });
});

describe('tmuxOpen', () => {
  it('carries --settings and the target env var, and keeps a shell after claude', () => {
    const line = sessionCommand('/w', '/implement-ticket #613', {
      settingsPath: '/s.json',
      target: 'kind=ticket&id=613',
    });
    const cmd = tmuxOpen('uaw-ticket-613', line, '/bin/bash');
    const script = cmd.args[1]!;
    expect(cmd.command).toBe('sh');
    expect(script).toContain(
      'tmux kill-session -t =uaw-ticket-613 2>/dev/null; tmux new-session -d -s uaw-ticket-613',
    );
    expect(script).toContain('--settings /s.json');
    expect(script).toContain('UAW_TARGET=');
    expect(script).not.toContain('--remote-control');
    expect(script).toContain('exec /bin/bash -il');
  });
});

describe('typeIntoTmux', () => {
  const reply = () => new FakeRunner().on(['tmux'], {});

  it('loads the text, pastes it bracketed, then sends Enter once', async () => {
    const runner = reply();
    expect(await typeIntoTmux(runner, 'uaw-ticket-1', 'one\ntwo\x1b[201~')).toBeNull();
    expect(runner.lines()).toEqual([
      'tmux has-session -t =uaw-ticket-1',
      'tmux load-buffer -b uaw-uaw-ticket-1 -',
      'tmux paste-buffer -p -d -b uaw-uaw-ticket-1 -t =uaw-ticket-1:',
      'tmux send-keys -t =uaw-ticket-1: Enter',
    ]);
    expect(runner.calls[1]!.options.input).toBe('one\ntwo[201~');
  });

  it('gives tab-closed when the session is gone', async () => {
    const runner = new FakeRunner().on(['tmux', 'has-session'], {
      code: 1,
      stderr: "can't find session",
    });
    expect(await typeIntoTmux(runner, 'x', 'hi')).toEqual({ code: 'tab-closed' });
    expect(runner.calls).toHaveLength(1);
  });

  it('gives type-failed with stderr for any other failure', async () => {
    const runner = reply().on(['tmux', 'paste-buffer'], { code: 1, stderr: 'boom\n' });
    expect(await typeIntoTmux(runner, 'x', 'hi')).toEqual({ code: 'type-failed', stderr: 'boom' });
    expect(runner.lines().some((l) => l.includes('send-keys'))).toBe(false);
  });
});
