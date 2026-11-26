import type { IssueDetail } from '@contract/issue';

/** Caches a fetch result by key, sharing one in-flight promise across concurrent callers. */
export class IssueDetailCache {
  private readonly cache = new Map<string, IssueDetail>();
  private readonly pending = new Map<string, Promise<IssueDetail>>();

  get(key: string, fetch: () => Promise<IssueDetail>): Promise<IssueDetail> {
    const cached = this.cache.get(key);
    if (cached) return Promise.resolve(cached);
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    const promise = fetch().then(
      (detail) => {
        this.cache.set(key, detail);
        this.pending.delete(key);
        return detail;
      },
      (error: unknown) => {
        this.pending.delete(key);
        throw error;
      },
    );
    this.pending.set(key, promise);
    return promise;
  }

  clear(): void {
    this.cache.clear();
    this.pending.clear();
  }
}
