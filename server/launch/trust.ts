import { randomUUID } from 'node:crypto';
import type { FileSystem } from '#server/core/fs.ts';

const REREAD_DELAY_MS = 200;

/**
 * Marks `path` trusted in Claude's `.claude.json`, so the Session opens with no trust dialog.
 * A file that stays unreadable JSON is left as it is: the Session then asks for trust itself.
 */
export async function trustWorktree(
  fs: FileSystem,
  claudeJson: string,
  path: string,
): Promise<void> {
  let root = await readRoot(fs, claudeJson);
  if (root === null) {
    await new Promise((resolve) => setTimeout(resolve, REREAD_DELAY_MS));
    root = await readRoot(fs, claudeJson);
  }
  if (root === null) {
    console.error(`trust: ${claudeJson} is not valid JSON, so ${path} is not marked trusted`);
    return;
  }
  const projects = (root['projects'] ?? {}) as Record<string, Record<string, unknown>>;
  projects[path] = { ...projects[path], hasTrustDialogAccepted: true };
  root['projects'] = projects;
  const temp = `${claudeJson}.${randomUUID()}.tmp`;
  await fs.write(temp, `${JSON.stringify(root, null, 2)}\n`);
  await fs.rename(temp, claudeJson);
}

/** `null` when the text is not a JSON object, as when Claude is halfway through its own write. */
async function readRoot(fs: FileSystem, file: string): Promise<Record<string, unknown> | null> {
  const text = await fs.read(file);
  if (text === null) return {};
  try {
    const root: unknown = JSON.parse(text);
    return typeof root === 'object' && root !== null && !Array.isArray(root)
      ? (root as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
