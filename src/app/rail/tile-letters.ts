/**
 * Mirrors `tileLetters` in `server/config/store.ts`: duplicated because the client only
 * has the checkout folder name, not the repo name from `origin`, until Add succeeds.
 */
export function tileLetters(name: string): string {
  const words = name.split(/[-_\s]+/).filter(Boolean);
  const letters =
    words.length >= 2 ? `${words[0]![0]}${words[1]![0]}` : (words[0] ?? '').slice(0, 2);
  return letters.toUpperCase();
}

export function folderName(path: string): string {
  return (
    path
      .replace(/[\\/]+$/, '')
      .split(/[\\/]/)
      .pop() ?? ''
  );
}
