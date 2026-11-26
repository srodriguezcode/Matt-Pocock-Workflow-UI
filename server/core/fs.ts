import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface DirEntry {
  name: string;
  dir: boolean;
}

/** The filesystem calls config and `.scratch/` need, so tests can fake them. `list` follows symlinks. */
export interface FileSystem {
  read(path: string): Promise<string | null>;
  /** `null` for a missing path or a directory. */
  readBytes(path: string): Promise<Uint8Array | null>;
  write(path: string, text: string): Promise<void>;
  /** Replaces `to` in one step when both are on the same disk. */
  rename(from: string, to: string): Promise<void>;
  /** A missing file is not an error. */
  remove(path: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  list(dir: string): Promise<DirEntry[] | null>;
}

export const nodeFs: FileSystem = {
  async read(path) {
    try {
      return await readFile(path, 'utf8');
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
  async readBytes(path) {
    try {
      return await readFile(path);
    } catch (error) {
      if (isMissing(error) || (error as { code?: string }).code === 'EISDIR') return null;
      throw error;
    }
  },
  async write(path, text) {
    await writeFile(path, text, 'utf8');
  },
  async rename(from, to) {
    await rename(from, to);
  },
  async remove(path) {
    await rm(path, { force: true });
  },
  async mkdir(path) {
    await mkdir(path, { recursive: true });
  },
  async list(dir) {
    try {
      const entries = await readdir(dir, { withFileTypes: true });
      return Promise.all(
        entries.map(async (entry) => ({
          name: entry.name,
          dir: entry.isSymbolicLink()
            ? await isDirectory(join(dir, entry.name))
            : entry.isDirectory(),
        })),
      );
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  },
};

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function isMissing(error: unknown): boolean {
  const code = (error as { code?: string }).code;
  return code === 'ENOENT' || code === 'ENOTDIR';
}
