import { Marked, type Token, type Tokens } from 'marked';

export interface RepoSlug {
  owner: string;
  name: string;
}

const WEB_URL = /^https?:\/\//i;
const TAG = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
const KEPT_TAG =
  /^<\/?(details|summary|br|hr|p|b|i|em|strong|code|pre|sub|sup|kbd|ul|ol|li|blockquote)\s*\/?>$/i;
const REF_START = /(^|[^\w&/])#\d/;
const REF = /^#(\d{1,7})(?![\w-])/;

interface RefToken extends Tokens.Generic {
  type: 'issueRef';
  raw: string;
  number: string;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function issueUrl(repo: RepoSlug, number: string): string {
  return `https://github.com/${repo.owner}/${repo.name}/issues/${number}`;
}

export function issueNumberOf(href: string, repo: RepoSlug | null): string | null {
  if (!repo) return null;
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+)\/issues\/(\d+)(?:[/?#].*)?$/i.exec(href);
  if (!match) return null;
  const [, owner, name, number] = match;
  const same =
    owner!.toLowerCase() === repo.owner.toLowerCase() &&
    name!.toLowerCase() === repo.name.toLowerCase();
  return same ? number! : null;
}

function cleanHtml(raw: string): string {
  const angles = (text: string) => text.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  let out = '';
  let last = 0;
  for (const match of raw.matchAll(TAG)) {
    const tag = match[0];
    out += angles(raw.slice(last, match.index));
    if (!tag.startsWith('<!--')) out += KEPT_TAG.test(tag) ? tag : escapeHtml(tag);
    last = match.index + tag.length;
  }
  return out + angles(raw.slice(last));
}

function plainRefs(tokens: Token[]): Token[] {
  return tokens.map((token) =>
    token.type === 'issueRef' ? { type: 'text', raw: token.raw, text: token.raw } : token,
  );
}

export function renderMarkdown(src: string, repo: RepoSlug | null): string {
  const marked = new Marked({ gfm: true, breaks: false });
  marked.use({
    renderer: {
      html: ({ text }) => cleanHtml(text),
      link({ href, title, tokens, text }) {
        const number = issueNumberOf(href, repo);
        const inner =
          number && text === href ? `#${number}` : this.parser.parseInline(plainRefs(tokens));
        if (!WEB_URL.test(href)) return inner;
        const titled = title ? ` title="${escapeHtml(title)}"` : '';
        const ref = number ? ' class="ref"' : '';
        return `<a href="${escapeHtml(href)}"${ref}${titled} target="_blank" rel="noopener noreferrer">${inner}</a>`;
      },
      image({ href, text }) {
        if (!WEB_URL.test(href)) return escapeHtml(text);
        return `<img src="${escapeHtml(href)}" alt="${escapeHtml(text)}">`;
      },
    },
  });
  if (repo) {
    marked.use({
      extensions: [
        {
          name: 'issueRef',
          level: 'inline',
          start(text) {
            const match = REF_START.exec(text);
            return match ? match.index + match[1]!.length : undefined;
          },
          tokenizer(text): RefToken | undefined {
            const match = REF.exec(text);
            return match ? { type: 'issueRef', raw: match[0], number: match[1]! } : undefined;
          },
          renderer(token) {
            const number = (token as RefToken).number;
            return `<a href="${issueUrl(repo, number)}" class="ref" target="_blank" rel="noopener noreferrer">#${number}</a>`;
          },
        },
      ],
    });
  }
  return marked.parse(src, { async: false });
}
