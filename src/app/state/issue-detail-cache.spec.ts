import { describe, expect, it, vi } from 'vitest';
import type { IssueDetail } from '@contract/issue';
import { IssueDetailCache } from './issue-detail-cache';

const detail = (id: string): IssueDetail => ({
  id,
  handle: `#${id}`,
  number: 1,
  title: 't',
  url: null,
  path: null,
  labels: [],
  state: 'open',
  body: '',
  comments: [],
});

describe('IssueDetailCache', () => {
  it('fetches on a miss', async () => {
    const cache = new IssueDetailCache();
    const fetch = vi.fn().mockResolvedValue(detail('a'));
    await expect(cache.get('a', fetch)).resolves.toEqual(detail('a'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('returns the cached value on a hit without fetching again', async () => {
    const cache = new IssueDetailCache();
    const fetch = vi.fn().mockResolvedValue(detail('a'));
    await cache.get('a', fetch);
    await cache.get('a', fetch);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('shares one in-flight fetch across concurrent callers', async () => {
    const cache = new IssueDetailCache();
    let resolve!: (d: IssueDetail) => void;
    const fetch = vi.fn().mockReturnValue(new Promise<IssueDetail>((r) => (resolve = r)));
    const first = cache.get('a', fetch);
    const second = cache.get('a', fetch);
    resolve(detail('a'));
    await expect(first).resolves.toEqual(detail('a'));
    await expect(second).resolves.toEqual(detail('a'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('drops everything on clear', async () => {
    const cache = new IssueDetailCache();
    const fetch = vi.fn().mockResolvedValue(detail('a'));
    await cache.get('a', fetch);
    cache.clear();
    await cache.get('a', fetch);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('does not cache a failed fetch', async () => {
    const cache = new IssueDetailCache();
    const fetch = vi
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce(detail('a'));
    await expect(cache.get('a', fetch)).rejects.toThrow('boom');
    await expect(cache.get('a', fetch)).resolves.toEqual(detail('a'));
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
