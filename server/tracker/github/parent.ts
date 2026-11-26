/** The issue a body's `## Parent` section names, as `#N` or as this repo's issue URL. */
export function parentSection(body: string, nameWithOwner: string): string | null {
  const section = /^##[ \t]+Parent\b(.*(?:\n(?!##[ \t]).*)*)/im.exec(body)?.[1];
  if (section === undefined) return null;
  const repo = nameWithOwner.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const url = new RegExp(`github\\.com/${repo}/issues/(\\d+)`, 'i').exec(section);
  return (url ?? /(?<![\w/])#(\d+)\b/.exec(section))?.[1] ?? null;
}
