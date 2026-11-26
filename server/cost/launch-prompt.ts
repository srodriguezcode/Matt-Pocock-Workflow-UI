import { join } from 'node:path';
import type { AttributionContext } from './session.ts';

const MARKUP =
  /^<command-message>[^<]*<\/command-message>\s*<command-name>([^<]*)<\/command-name>\s*(?:<command-args>([^<]*)<\/command-args>)?\s*$/;

export function promptTarget(prompt: string, context: AttributionContext): string | null {
  const invocation = parseInvocation(prompt.trim());
  if (invocation?.name !== '/wayfinder') return null;
  const args = invocation.args.match(/'[^']*'|"[^"]*"|\S+/g)?.map(unquote) ?? [];
  const [map, ticket, ...rest] = args;
  if (map === undefined || rest.length > 0) return null;
  return context.tracker === 'github'
    ? githubTarget(map, ticket)
    : scratchTarget(map, ticket, context);
}

function parseInvocation(prompt: string): { name: string; args: string } | null {
  const markup = MARKUP.exec(prompt);
  if (markup) return { name: (markup[1] ?? '').trim(), args: (markup[2] ?? '').trim() };
  const raw = /^(\/\S+)(?:\s+([\s\S]*))?$/.exec(prompt);
  return raw ? { name: raw[1] ?? '', args: (raw[2] ?? '').trim() } : null;
}

function unquote(token: string): string {
  return /^(['"]).*\1$/.test(token) ? token.slice(1, -1) : token;
}

function githubTarget(map: string, ticket: string | undefined): string | null {
  const digits = /^\d+$/;
  if (!digits.test(map) || (ticket !== undefined && !digits.test(ticket))) return null;
  return ticket ?? map;
}

function scratchTarget(
  map: string,
  ticket: string | undefined,
  context: AttributionContext,
): string | null {
  const root = join(context.checkout, '.scratch');
  const effort = new RegExp(`^${escape(root)}/([^/]+)/map\\.md$`).exec(map)?.[1];
  if (effort === undefined) return null;
  if (ticket === undefined) return effort;
  const file = new RegExp(`^${escape(join(root, effort))}/issues/(\\d+)-[^/]*\\.md$`).exec(ticket);
  return file ? `${effort}/${file[1]}` : null;
}

function escape(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
