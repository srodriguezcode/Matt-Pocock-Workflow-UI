import { computed, inject, Injectable, signal } from '@angular/core';
import type { SessionView } from '@contract/session';
import { noticeKey, unseen } from './notice-key';
import { SessionLink } from './session-link';

const STORAGE_KEY = 'uaw-dismissed';
const SEEN_KEY = 'uaw-seen';
/** Old keys beyond this are dropped: a Session that moved on never matches its old key again. */
const KEPT = 200;

const keyOf = noticeKey;

/** Notifications the user set aside or already opened, kept in this browser across reloads. */
@Injectable({ providedIn: 'root' })
export class Dismissals {
  private readonly link = inject(SessionLink);
  private readonly keys = signal<ReadonlySet<string>>(new Set(load(STORAGE_KEY)));
  /** Opened in Peek: listed but dimmed, and left out of every count. */
  readonly seen = signal<ReadonlySet<string>>(new Set(load(SEEN_KEY)));

  /** The Sessions still worth a notification. */
  readonly pending = computed(() =>
    [...this.link.sessions().values()].filter((s) => !this.keys().has(keyOf(s))),
  );

  readonly unseen = computed(() => unseen(this.pending(), this.seen()));

  dismiss(session: Pick<SessionView, 'sessionId' | 'since'>): void {
    this.keys.update((keys) => new Set([...keys, keyOf(session)].slice(-KEPT)));
    save(STORAGE_KEY, [...this.keys()]);
  }

  markSeen(session: Pick<SessionView, 'sessionId' | 'since'>): void {
    if (this.seen().has(keyOf(session))) return;
    this.seen.update((keys) => new Set([...keys, keyOf(session)].slice(-KEPT)));
    save(SEEN_KEY, [...this.seen()]);
  }
}

function load(storageKey: string): string[] {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]');
    return Array.isArray(stored) ? stored.filter((k): k is string => typeof k === 'string') : [];
  } catch {
    return [];
  }
}

function save(storageKey: string, keys: string[]): void {
  try {
    localStorage.setItem(storageKey, JSON.stringify(keys));
  } catch {}
}
