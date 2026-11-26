import { dirname } from 'node:path';
import type { DirEntry, FileSystem } from '#server/core/fs.ts';

/** In-memory files keyed by absolute path. Directories exist implicitly. */
export class FakeFs implements FileSystem {
  readonly files = new Map<string, string>();
  readonly denied = new Set<string>();
  private readonly dirs = new Set<string>();

  constructor(files: Record<string, string> = {}) {
    for (const [path, text] of Object.entries(files)) this.files.set(path, text);
  }

  async read(path: string): Promise<string | null> {
    this.refuse(path);
    return this.files.get(path) ?? null;
  }

  async readBytes(path: string): Promise<Uint8Array | null> {
    const text = this.files.get(path);
    return text === undefined ? null : new TextEncoder().encode(text);
  }

  async write(path: string, text: string): Promise<void> {
    if (!this.isDir(dirname(path))) throw new Error(`ENOENT: ${dirname(path)}`);
    this.files.set(path, text);
  }

  async rename(from: string, to: string): Promise<void> {
    const text = this.files.get(from);
    if (text === undefined) throw new Error(`ENOENT: ${from}`);
    this.files.delete(from);
    this.files.set(to, text);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async mkdir(path: string): Promise<void> {
    for (let dir = path; dir !== dirname(dir); dir = dirname(dir)) this.dirs.add(dir);
  }

  async list(dir: string): Promise<DirEntry[] | null> {
    this.refuse(dir);
    if (!this.isDir(dir)) return null;
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    const names = new Map<string, boolean>();
    for (const path of [...this.files.keys(), ...this.dirs]) {
      if (!path.startsWith(prefix)) continue;
      const [name, ...rest] = path.slice(prefix.length).split('/');
      if (name)
        names.set(name, (names.get(name) ?? false) || rest.length > 0 || this.dirs.has(path));
    }
    return [...names].sort().map(([name, isDir]) => ({ name, dir: isDir }));
  }

  private refuse(path: string): void {
    if (this.denied.has(path)) throw new Error(`EACCES: ${path}`);
  }

  private isDir(dir: string): boolean {
    const prefix = dir.endsWith('/') ? dir : `${dir}/`;
    return this.dirs.has(dir) || [...this.files.keys()].some((path) => path.startsWith(prefix));
  }
}
