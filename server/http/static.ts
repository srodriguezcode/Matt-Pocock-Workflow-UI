import { extname, join, normalize, sep } from 'node:path';
import type { FileSystem } from '#server/core/fs.ts';

export interface StaticFile {
  path: string;
  contentType: string;
  body: Uint8Array;
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

export function contentType(path: string): string {
  return CONTENT_TYPES[extname(path).toLowerCase()] ?? 'application/octet-stream';
}

/**
 * The absolute file path a request for `urlPath` resolves to under `root`,
 * or `null` when it would escape `root` (`..`, an encoded slash, a `\0`).
 */
export function staticCandidate(root: string, urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath.split('?')[0]!.split('#')[0]!);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) return null;
  const joined = normalize(join(root, decoded));
  if (joined !== root && !joined.startsWith(root + sep)) return null;
  return joined;
}

/** Serves the requested file under `root`, falling back to `index.html` for the SPA. */
export async function serveStatic(
  fs: FileSystem,
  root: string,
  urlPath: string,
): Promise<StaticFile | null> {
  const candidate = staticCandidate(root, urlPath);
  const found = candidate === null ? null : await fs.readBytes(candidate);
  const path = found && candidate ? candidate : join(root, 'index.html');
  const body = found ?? (await fs.readBytes(path));
  if (!body) return null;
  return { path, contentType: contentType(path), body };
}
