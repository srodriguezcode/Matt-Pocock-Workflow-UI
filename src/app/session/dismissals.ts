import { computed, inject, Injectable, signal } from '@angular/core';
import type { SessionView } from '@contract/session';
import { SessionLink } from './session-link';

const STORAGE_KEY = 'uaw-dismissed';
/** Old keys beyond this are dropped: a Session that moved on never matches its old key again. */
const KEPT = 200;

/** `sessionId@since`, so a dismissal lasts only until the Session moves again. */
const keyOf = (session: Pick<SessionView, 'sessionId' | 'since'>) =>
  `${session.sessionId}@${session.since}`;

/** Notifications the user set aside, kept in this browser across reloads. */
@Injectable({ providedIn: 'root' })
export class Dismissals {
  private readonly link = inject(SessionLink);
  private readonly keys = signal<ReadonlySet<string>>(new Set(load()));

  /** The Sessions still worth a notification. */
  readonly pending = computed(() =>
    [...this.link.sessions().values()].filter((s) => !this.keys().has(keyOf(s))),
  );

  dismiss(session: Pick<SessionView, 'sessionId' | 'since'>): void {
    this.keys.update((keys) => new Set([...keys, keyOf(session)].slice(-KEPT)));
    save([...this.keys()]);
  }
}

function load(): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function save(keys: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(keys));
  } catch {}
}
