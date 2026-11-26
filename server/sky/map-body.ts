import type { Fog } from '@contract/sky';

export interface MapBody {
  fog: Fog[];
  destination: string | null;
  outOfScope: string[];
}

export function parseMapBody(body: string): MapBody {
  const fog = bullets(section(body, 'Not yet specified')).map((bullet, i) => ({
    id: `fog-${i + 1}`,
    head: lead(bullet),
    text: plain(bullet),
  }));
  const destination = section(body, 'Destination');
  return {
    fog,
    destination: destination ? plain(destination) : null,
    outOfScope: bullets(section(body, 'Out of scope')).map(plain),
  };
}

function section(body: string, heading: string): string | null {
  const wanted = heading.toLowerCase();
  const part = body
    .split(/^## /m)
    .slice(1)
    .find((s) => s.split('\n', 1)[0]!.trim().toLowerCase() === wanted);
  if (part === undefined) return null;
  const text = part.slice(part.indexOf('\n') + 1).trim();
  return text || null;
}

function bullets(text: string | null): string[] {
  if (!text) return [];
  return text
    .split('\n')
    .filter((line) => /^[-*] /.test(line))
    .map((line) => line.slice(2).trim());
}

function lead(bullet: string): string {
  const bold = /^\*\*(.+?)\*\*/.exec(bullet);
  const head = bold ? bold[1]! : bullet.split(/(?<=\.)\s/)[0]!;
  return plain(head).replace(/[.:]$/, '');
}

function plain(markdown: string): string {
  return markdown
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*]/g, '')
    .trim();
}
