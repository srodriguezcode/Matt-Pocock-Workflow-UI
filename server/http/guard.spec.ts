import { describe, expect, it } from 'vitest';
import { allowRequest } from './guard.ts';

const get = (host: string | undefined, origin?: string) => ({
  method: 'GET',
  path: '/api/sky',
  host,
  origin,
});
const post = (host: string | undefined, origin: string | undefined, path = '/api/start') => ({
  method: 'POST',
  path,
  host,
  origin,
});

describe('allowRequest', () => {
  it('allows a GET with a matching Host and no Origin', () => {
    expect(allowRequest(4200, false, get('localhost:4200'))).toBe(true);
    expect(allowRequest(4200, false, get('127.0.0.1:4200'))).toBe(true);
  });

  it('refuses a wrong Host', () => {
    expect(allowRequest(4200, false, get('localhost:4201'))).toBe(false);
    expect(allowRequest(4200, false, get('evil.example:4200'))).toBe(false);
    expect(allowRequest(4200, false, get(undefined))).toBe(false);
  });

  it('requires a matching Origin for non-GET', () => {
    expect(allowRequest(4200, false, post('localhost:4200', 'http://localhost:4200'))).toBe(true);
    expect(allowRequest(4200, false, post('localhost:4200', undefined))).toBe(false);
    expect(allowRequest(4200, false, post('localhost:4200', 'http://evil.example'))).toBe(false);
    expect(allowRequest(4200, false, post('localhost:4200', 'http://localhost:4201'))).toBe(false);
  });

  it('accepts port 4200 alongside the real port only in dev', () => {
    expect(allowRequest(8000, true, get('localhost:4200'))).toBe(true);
    expect(allowRequest(8000, false, get('localhost:4200'))).toBe(false);
    expect(allowRequest(8000, true, post('localhost:4200', 'http://localhost:4200'))).toBe(true);
  });

  it('lets a hook post without an Origin, but not a page with one', () => {
    expect(allowRequest(4200, false, post('127.0.0.1:4200', undefined, '/api/session/hook'))).toBe(
      true,
    );
    expect(
      allowRequest(4200, false, post('127.0.0.1:4200', undefined, '/api/session/rewake')),
    ).toBe(true);
    expect(
      allowRequest(4200, false, post('127.0.0.1:4200', 'http://evil.example', '/api/session/hook')),
    ).toBe(false);
    expect(allowRequest(4200, false, post('evil.example', undefined, '/api/session/hook'))).toBe(
      false,
    );
  });

  it('refuses a LAN host name such as board.local', () => {
    expect(allowRequest(4200, false, get('board.local:4200'))).toBe(false);
    expect(allowRequest(4200, false, post('localhost:4200', 'http://board.local:4200'))).toBe(
      false,
    );
  });
});
