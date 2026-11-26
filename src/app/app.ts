import { Component, DestroyRef, inject, type OnInit } from '@angular/core';
import { Architecture } from '@app/controls/architecture';
import { EmptyBoard } from '@app/controls/empty-board';
import { Filter } from '@app/controls/filter';
import { Gaps } from '@app/controls/gaps';
import { Keys } from '@app/controls/keys';
import { Notifications } from '@app/controls/notifications';
import { Refresh } from '@app/controls/refresh';
import { Panel } from '@app/panel/panel';
import { Rail } from '@app/rail/rail';
import { Sky } from '@app/sky/sky';
import { Pill } from '@app/start/pill';
import { StartSheet } from '@app/start/sheet';
import { SessionLink } from '@app/session/session-link';
import { Board } from '@app/state/board';
import { RuntimeInfo } from '@app/state/runtime';
import { ThemeSwitch } from '@app/theme/theme-switch';

@Component({
  selector: 'app-root',
  imports: [
    Rail,
    Sky,
    EmptyBoard,
    Filter,
    Refresh,
    Gaps,
    Architecture,
    Notifications,
    Keys,
    Pill,
    StartSheet,
    Panel,
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  protected readonly board = inject(Board);
  private readonly themeSwitch = inject(ThemeSwitch);
  private readonly sessionLink = inject(SessionLink);
  private readonly destroyRef = inject(DestroyRef);
  private readonly runtime = inject(RuntimeInfo);

  ngOnInit(): void {
    void this.runtime.load();
    void this.board.loadRepos();
    void this.themeSwitch.load();
    this.destroyRef.onDestroy(this.sessionLink.connect());
  }
}
