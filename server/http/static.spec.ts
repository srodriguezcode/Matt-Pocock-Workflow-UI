import { describe, expect, it } from 'vitest';
import { FakeFs } from '#server/testing/fake-fs.ts';
import { contentType, serveStatic, staticCandidate } from './static.ts';

describe('contentType', () => {
  it('maps known extensions and falls back for unknown ones', () => {
    expect(contentType('/dist/main.js')).toBe('text/javascript; charset=utf-8');
    expect(contentType('/dist/index.html')).toBe('text/html; charset=utf-8');
    expect(contentType('/dist/font.woff2')).toBe('font/woff2');
    expect(contentType('/dist/data.bin')).toBe('application/octet-stream');
  });
});

describe('staticCandidate', () => {
  const root = '/dist';

  it('joins a plain request path onto root', () => {
    expect(staticCandidate(root, '/main.js')).toBe('/dist/main.js');
    expect(staticCandidate(root, '/assets/logo.svg')).toBe('/dist/assets/logo.svg');
  });

  it('strips query strings and fragments', () => {
    expect(staticCandidate(root, '/main.js?v=2#x')).toBe('/dist/main.js');
  });

  it('refuses a path that escapes root', () => {
    expect(staticCandidate(root, '/../secret.txt')).toBeNull();
    expect(staticCandidate(root, '/%2e%2e/secret.txt')).toBeNull();
    expect(staticCandidate(root, '/a/../../secret.txt')).toBeNull();
  });
});

describe('serveStatic', () => {
  const root = '/dist';
  const text = (file: { body: Uint8Array } | null) => file && new TextDecoder().decode(file.body);
  const fs = () =>
    new FakeFs({
      '/dist/index.html': '<html>spa</html>',
      '/dist/assets/logo.svg': '<svg></svg>',
      '/secret.txt': 'secret',
    });

  it('serves an existing file with its content type and bytes', async () => {
    const file = await serveStatic(fs(), root, '/assets/logo.svg');
    expect(file).toMatchObject({ path: '/dist/assets/logo.svg', contentType: 'image/svg+xml' });
    expect(text(file)).toBe('<svg></svg>');
  });

  it('falls back to index.html for an unknown path or the root (SPA routing)', async () => {
    for (const url of ['/systems/42', '/']) {
      const file = await serveStatic(fs(), root, url);
      expect(file).toMatchObject({
        path: '/dist/index.html',
        contentType: 'text/html; charset=utf-8',
      });
      expect(text(file)).toBe('<html>spa</html>');
    }
  });

  it('falls back to index.html for a path that escapes root', async () => {
    const file = await serveStatic(fs(), root, '/../secret.txt');
    expect(text(file)).toBe('<html>spa</html>');
  });

  it('returns null when even index.html is missing', async () => {
    expect(await serveStatic(new FakeFs(), root, '/anything')).toBeNull();
  });
});
