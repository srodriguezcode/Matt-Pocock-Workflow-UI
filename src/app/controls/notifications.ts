import {
  Component,
  computed,
  ElementRef,
  HostListener,
  inject,
  signal,
  type Signal,
} from '@angular/core';
import { I18nService } from '@app/i18n/i18n.service';
import { Dismissals } from '@app/session/dismissals';
import { noticeKey, unseen } from '@app/session/notice-key';
import { notificationsOf, type Notification } from '@app/session/notifications';
import { SessionDialog } from '@app/session/session-dialog';
import { RepoSessions } from '@app/session/repo-sessions';
import { SessionLink } from '@app/session/session-link';
import { SkyView } from '@app/sky/sky-view';
import { Board } from '@app/state/board';

/** Call in an injection context. */
export function notificationItems(): Signal<Notification[]> {
  const link = inject(SessionLink);
  const board = inject(Board);
  const dismissals = inject(Dismissals);
  return computed(() => {
    const path = board.activePath();
    const sky = board.sky();
    const active = path && sky ? { path, sky, placed: link.placed() } : null;
    return notificationsOf(dismissals.pending(), board.repos(), active);
  });
}

@Component({
  selector: 'app-notifications',
  templateUrl: './notifications/notifications.html',
  styleUrl: './notifications/notifications.scss',
})
export class Notifications {
  private readonly board = inject(Board);
  private readonly skyView = inject(SkyView);
  private readonly dismissals = inject(Dismissals);
  private readonly dialog = inject(SessionDialog);
  private readonly repoSessions = inject(RepoSessions);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly i18n = inject(I18nService);
  protected readonly open = signal(false);

  protected readonly items = notificationItems();
  /** Opened in Peek, so listed but no longer counted. */
  protected readonly seen = this.dismissals.seen;
  protected readonly count = computed(() => unseen(this.items(), this.seen()).length);

  protected isSeen(item: Notification): boolean {
    return this.seen().has(noticeKey(item));
  }

  protected toggle(): void {
    this.open.update((open) => !open);
  }

  /**
   * Clears the selection first so reselecting the same star still opens an Asking dialog.
   * A repo switch redraws the sky, so the flight waits two frames for it.
   */
  protected async go(item: Notification): Promise<void> {
    this.open.set(false);
    this.skyView.select(null);
    if (this.board.activePath() !== item.repo) await this.board.switchTo(item.repo);
    await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    if (item.starId === null) {
      this.repoSessions.open(item.sessionId);
      return;
    }
    this.skyView.flyTo(item.starId);
    if (item.reason !== 'permission') this.dialog.open(item.sessionId);
  }

  protected dismiss(item: Notification, event: MouseEvent): void {
    event.stopPropagation();
    this.dismissals.dismiss(item);
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
