import { describe, expect, it } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { checkMachine } from './machine.ts';

const withIterm = new FakeFs({ '/Applications/iTerm.app/Contents/Info.plist': '' });
const ok = () =>
  new FakeRunner()
    .on(['which', 'gh'], { code: 0 })
    .on(['gh', 'auth', 'status'], { code: 0 })
    .on(['which', 'git'], { code: 0 })
    .on(['which', 'claude'], { code: 0 });

describe('checkMachine', () => {
  it('finds nothing when every tool and app is present', async () => {
    expect(await checkMachine(ok(), withIterm, '/home/dev')).toEqual([]);
  });

  it('flags a missing gh as fatal, without also checking auth', async () => {
    const runner = ok().on(['which', 'gh'], { code: 127 });
    const gaps = await checkMachine(runner, withIterm, '/home/dev');
    expect(gaps).toEqual([
      expect.objectContaining({ id: 'gh-missing', scope: 'machine', tier: 'fatal' }),
    ]);
    expect(runner.calls.some((c) => c.args.includes('auth'))).toBe(false);
  });

  it('flags an unauthed gh as fatal', async () => {
    const runner = ok().on(['gh', 'auth', 'status'], { code: 1 });
    const gaps = await checkMachine(runner, withIterm, '/home/dev');
    expect(gaps).toEqual([
      expect.objectContaining({ id: 'gh-unauthed', scope: 'machine', tier: 'fatal' }),
    ]);
  });

  it('flags a missing git as fatal', async () => {
    const runner = ok().on(['which', 'git'], { code: 127 });
    const gaps = await checkMachine(runner, withIterm, '/home/dev');
    expect(gaps).toEqual([
      expect.objectContaining({ id: 'git-missing', scope: 'machine', tier: 'fatal' }),
    ]);
  });

  it('flags a missing claude as start-blocking for every kind', async () => {
    const runner = ok().on(['which', 'claude'], { code: 127 });
    const gaps = await checkMachine(runner, withIterm, '/home/dev');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'claude-missing',
        problem: { code: 'claude-missing' },
        tier: 'start',
        blocks: ['ticket', 'system', 'decision', 'map', 'split', 'architecture', 'session'],
      }),
    ]);
  });

  it('flags a missing iTerm2 as start-blocking for every kind', async () => {
    const gaps = await checkMachine(ok(), new FakeFs(), '/home/dev');
    expect(gaps).toEqual([
      expect.objectContaining({
        id: 'iterm-missing',
        tier: 'start',
        blocks: ['ticket', 'system', 'decision', 'map', 'split', 'architecture', 'session'],
      }),
    ]);
  });

  it('raises no iTerm2 Gap in the container runtime', async () => {
    expect(await checkMachine(ok(), new FakeFs(), '/home/dev', 'container')).toEqual([]);
  });
});
