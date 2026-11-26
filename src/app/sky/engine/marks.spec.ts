import { describe, expect, it } from 'vitest';
import type { SessionState, SessionView } from '@contract/session';
import type { System } from '@contract/sky';
import type { Placed } from '@app/session/place';
import { markOf, markRadius, systemShine } from './marks';

const placed = (state: SessionState, sharedFrom: string | null = null): Placed => ({
  session: { state } as SessionView,
  sharedFrom,
});

describe('markOf', () => {
  it('gives an In flight star one glyph per live or Lost state', () => {
    const states: SessionState[] = ['working', 'asking', 'waiting', 'lost'];
    expect(states.map((s) => markOf(true, placed(s)))).toEqual(states);
  });

  it('gives an Ended Session none', () => {
    expect(markOf(true, placed('ended'))).toBeNull();
  });

  it('gives a star that is not In flight none', () => {
    expect(markOf(false, placed('working'))).toBeNull();
  });

  it('gives a child sharing its System Session none', () => {
    expect(markOf(true, placed('working', 'S'))).toBeNull();
  });

  it('gives a star with no Session none', () => {
    expect(markOf(true, undefined)).toBeNull();
  });
});

describe('markRadius', () => {
  it('keeps a plain body at its own radius', () => {
    expect(markRadius(6, 6, null)).toBe(6);
    expect(markRadius(11, 8.8, null)).toBe(11);
  });

  it("moves a flagged Ticket's marks out to the sparkle's points", () => {
    expect(markRadius(6, 6, 'flagged')).toBeCloseTo(13.2);
  });

  it("moves a flagged System's marks out to the points of its core's sparkle", () => {
    expect(markRadius(11, 8.8, 'flagged')).toBeCloseTo(19.36);
  });

  it("moves an echoing System's marks out to the outline's points", () => {
    expect(markRadius(11, 8.8, 'echo')).toBeCloseTo(25.41);
  });
});

const system = (fields: Partial<Pick<System, 'closed' | 'flagged' | 'flaggedTickets'>> = {}) => ({
  closed: false,
  flagged: false,
  flaggedTickets: 0,
  ...fields,
});

describe('systemShine', () => {
  it('shines a flagged System, whatever its count', () => {
    expect(systemShine(system({ flagged: true, flaggedTickets: 2 }))).toBe('flagged');
  });

  it('echoes a System holding a flagged Ticket', () => {
    expect(systemShine(system({ flaggedTickets: 1 }))).toBe('echo');
  });

  it('leaves a plain System and a closed one dark', () => {
    expect(systemShine(system())).toBeNull();
    expect(systemShine(system({ closed: true, flagged: true, flaggedTickets: 1 }))).toBeNull();
  });
});
