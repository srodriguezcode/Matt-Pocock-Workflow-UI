import { Injectable } from '@angular/core';
import type { SessionStatus } from '@contract/session';

const STORAGE_KEY = 'uaw-drafts';
/** Older Drafts beyond this are dropped, as a fallback when pruning never sees their Session. */
const KEPT = 50;

/** Draft values by `draftKey`, oldest saved first. Each form checks the shape of its own value. */
export type StoredDrafts = Readonly<Record<string, unknown>>;

/** A Session with the question it holds, the part pruning reads. */
export type Holding = Pick<SessionStatus, 'sessionId' | 'question'>;

export type DraftStore = Pick<Drafts, 'load' | 'save' | 'clear'>;

export const draftKey = (sessionId: string, questionId: string) => `${sessionId}@${questionId}`;

export function putDraft(
  drafts: StoredDrafts,
  key: string,
  value: unknown,
  kept = KEPT,
): StoredDrafts {
  const entries = Object.entries(drafts).filter(([k]) => k !== key);
  return Object.fromEntries([...entries, [key, value]].slice(-kept));
}

export function dropDraft(drafts: StoredDrafts, key: string): StoredDrafts {
  return Object.fromEntries(Object.entries(drafts).filter(([k]) => k !== key));
}

/** Keeps only the Drafts whose Session still holds that question. */
export function pruneDrafts(drafts: StoredDrafts, sessions: Iterable<Holding>): StoredDrafts {
  const open = new Set<string>();
  for (const { sessionId, question } of sessions) {
    if (question) open.add(draftKey(sessionId, question.id));
  }
  const kept = Object.entries(drafts).filter(([k]) => open.has(k));
  return kept.length === Object.keys(drafts).length ? drafts : Object.fromEntries(kept);
}

export function parseDrafts(raw: string | null): StoredDrafts {
  try {
    const stored: unknown = JSON.parse(raw ?? '{}');
    return typeof stored === 'object' && stored !== null && !Array.isArray(stored)
      ? (stored as StoredDrafts)
      : {};
  } catch {
    return {};
  }
}

/**
 * The Drafts in this browser. Each change reads storage first, so two tabs do not drop each
 * other's Drafts. The in-memory copy serves only when storage throws.
 */
@Injectable({ providedIn: 'root' })
export class Drafts {
  private fallback: StoredDrafts = {};

  load(sessionId: string, questionId: string): unknown {
    return this.stored()[draftKey(sessionId, questionId)];
  }

  save(sessionId: string, questionId: string, value: unknown): void {
    this.store(putDraft(this.stored(), draftKey(sessionId, questionId), value));
  }

  clear(sessionId: string, questionId: string): void {
    this.store(dropDraft(this.stored(), draftKey(sessionId, questionId)));
  }

  prune(sessions: Iterable<Holding>): void {
    const stored = this.stored();
    const next = pruneDrafts(stored, sessions);
    if (next !== stored) this.store(next);
  }

  private stored(): StoredDrafts {
    try {
      return parseDrafts(localStorage.getItem(STORAGE_KEY));
    } catch {
      return this.fallback;
    }
  }

  private store(drafts: StoredDrafts): void {
    this.fallback = drafts;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(drafts));
    } catch {}
  }
}
