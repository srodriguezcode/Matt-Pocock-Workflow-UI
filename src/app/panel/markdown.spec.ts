import { describe, expect, it } from 'vitest';
import { issueNumberOf, renderMarkdown } from './markdown';

const repo = { owner: 'acme', name: 'board' };

describe('renderMarkdown', () => {
  it('renders a javascript: link as its text, not a link', () => {
    const html = renderMarkdown('See [the fix](javascript:alert(1)) now.', repo);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('javascript');
    expect(html).toContain('See the fix now.');
  });

  it('shows raw HTML anchors as text', () => {
    const html = renderMarkdown('Click <a href="javascript:alert(1)">here</a>.', repo);
    expect(html).not.toContain('<a');
    expect(html).toContain('&lt;a href=&quot;javascript:alert(1)&quot;&gt;here&lt;/a&gt;');
  });

  it('drops a javascript: autolink and a data: image', () => {
    const html = renderMarkdown('<javascript:alert(1)> ![pic](data:image/png;base64,AAAA)', repo);
    expect(html).not.toContain('<a');
    expect(html).not.toContain('<img');
    expect(html).toContain('pic');
  });

  it('keeps bare tags and escapes tags with attributes', () => {
    const html = renderMarkdown(
      '<details>\n<summary>More</summary>\n<p onclick="x">hi</p>\n</details>',
      null,
    );
    expect(html).toContain('<details>');
    expect(html).toContain('<summary>More</summary>');
    expect(html).toContain('&lt;p onclick=&quot;x&quot;&gt;');
  });

  it('drops HTML comments', () => {
    expect(renderMarkdown('before <!-- template hint --> after', null)).not.toContain('hint');
  });

  it('opens http(s) links in a new tab', () => {
    const html = renderMarkdown('[docs](https://example.com/a?b=1&c=2)', repo);
    expect(html).toContain(
      '<a href="https://example.com/a?b=1&amp;c=2" target="_blank" rel="noopener noreferrer">docs</a>',
    );
  });

  it('links #refs to the repo issue', () => {
    const html = renderMarkdown('Blocked by #12, see also (#7).', repo);
    expect(html).toContain('<a href="https://github.com/acme/board/issues/12" class="ref"');
    expect(html).toContain('>#12</a>');
    expect(html).toContain('>#7</a>');
  });

  it('leaves #refs alone in code, inside words and without a repo', () => {
    expect(renderMarkdown('`#12` and abc#12 and #12abc', repo)).not.toContain('class="ref"');
    expect(renderMarkdown('Blocked by #12', null)).not.toContain('<a');
  });

  it('does not nest a #ref inside a link', () => {
    const html = renderMarkdown('[fixes #3](https://example.com)', repo);
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('>fixes #3</a>');
  });

  it('marks own-repo issue URLs as refs and shortens bare ones', () => {
    const html = renderMarkdown('https://github.com/acme/board/issues/40', repo);
    expect(html).toContain('class="ref"');
    expect(html).toContain('>#40</a>');
    const other = renderMarkdown('https://github.com/other/repo/issues/40', repo);
    expect(other).not.toContain('class="ref"');
  });
});

describe('issueNumberOf', () => {
  it('reads the number from an issue URL of the repo', () => {
    expect(issueNumberOf('https://github.com/Acme/Board/issues/9#issuecomment-1', repo)).toBe('9');
  });

  it('ignores other repos, pull requests and no repo', () => {
    expect(issueNumberOf('https://github.com/acme/other/issues/9', repo)).toBeNull();
    expect(issueNumberOf('https://github.com/acme/board/pull/9', repo)).toBeNull();
    expect(issueNumberOf('https://github.com/acme/board/issues/9', null)).toBeNull();
  });
});
