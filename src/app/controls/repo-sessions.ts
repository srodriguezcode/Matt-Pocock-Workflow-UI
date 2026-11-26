import { Component, computed, ElementRef, HostListener, inject, signal } from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { Peek } from '@app/panel/session/peek';
import { Dismissals } from '@app/session/dismissals';
import { noticeKey } from '@app/session/notice-key';
import type { RepoSession } from '@app/session/repo-session-list';
import { RepoSessions } from '@app/session/repo-sessions';

/** The list hides while the active repo has no live new session. The open Peek outlives it. */
@Component({
  selector: 'app-repo-sessions',
  imports: [Peek],
  templateUrl: './repo-sessions/repo-sessions.html',
  styleUrl: './repo-sessions/repo-sessions.scss',
})
export class RepoSessionList {
  private readonly sessions = inject(RepoSessions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly i18n = inject(I18nService);
  protected readonly list = this.sessions.list;
  protected readonly opened = this.sessions.opened;
  protected readonly open = signal(false);
  private readonly seen = inject(Dismissals).seen;
  /** The bell leaves new sessions out, so this button lights for them until each is opened. */
  protected readonly waiting = computed(() => this.list().some((s) => this.calls(s)));

  protected calls(session: RepoSession): boolean {
    const waits = session.state === 'asking' || session.state === 'waiting';
    return waits && !this.seen().has(noticeKey(session));
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  protected go(sessionId: string): void {
    this.open.set(false);
    this.sessions.open(sessionId);
  }

  protected closePeek(): void {
    this.sessions.close();
  }

  @HostListener('document:click', ['$event'])
  protected outside(event: MouseEvent): void {
    if (!this.host.nativeElement.contains(event.target as Node)) this.open.set(false);
  }

  @HostListener('document:keydown.escape')
  protected escape(): void {
    this.open.set(false);
  }
}
