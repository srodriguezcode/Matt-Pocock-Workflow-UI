import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, inject, linkedSignal, resource, signal } from '@angular/core';
import type { Label } from '@contract/sky';
import { Api, ApiFailure } from '@app/api/api';
import { word } from '@app/i18n/word';
import { I18nService } from '@app/i18n/i18n.service';
import { apiFailureText } from '@app/i18n/api-failure';
import { SessionLink } from '@app/session/session-link';
import { SkyView } from '@app/sky/sky-view';
import { Board } from '@app/state/board';
import { IssueDetails } from '@app/state/issue-details';
import { issueNumberOf, renderMarkdown, type RepoSlug } from './markdown';
import { chipColours } from './chip';
import { Cost } from './cost/cost';
import { handleIn, readSelection } from './reading';
import { SessionPanel } from './session/session';

@Component({
  selector: 'app-panel',
  imports: [NgTemplateOutlet, Cost, SessionPanel],
  templateUrl: './panel.html',
  styleUrl: './panel.scss',
  host: { '[class.open]': 'open()' },
})
export class Panel {
  private readonly api = inject(Api);
  private readonly board = inject(Board);
  private readonly issueDetails = inject(IssueDetails);
  private readonly skyView = inject(SkyView);
  private readonly sessionLink = inject(SessionLink);
  protected readonly i18n = inject(I18nService);

  private readonly sky = this.board.sky;
  private readonly selection = this.skyView.selection;
  /** An issue opened from a `#ref` that isn't on the sky. Any new selection clears it. */
  protected readonly offsky = linkedSignal<unknown, string | null>({
    source: this.selection,
    computation: () => null,
  });

  protected readonly reading = computed(() =>
    readSelection({
      sky: this.sky(),
      selection: this.selection(),
      offsky: this.offsky(),
      starts: this.board.starts(),
      sessions: this.sessionLink.placed(),
      text: this.panelText(),
      codes: this.codes(),
    }),
  );
  /** An Ember arrives without labels on GitHub, so its chips wait for the body. */
  protected readonly labels = computed(() => {
    const reading = this.reading();
    if (!('issue' in reading)) return [];
    const { issue } = reading;
    if (reading.kind === 'ticket' || reading.kind === 'system' || issue.labels.length > 0) {
      return issue.labels;
    }
    const detail = this.detail.hasValue() ? this.detail.value() : null;
    return detail?.id === issue.id ? detail.labels : null;
  });
  protected readonly open = computed(() => this.reading().kind !== 'none');
  protected readonly goneClosed = computed(
    () =>
      this.reading().kind === 'gone' &&
      this.detail.hasValue() &&
      this.detail.value().state === 'closed',
  );

  private readonly slug = computed<RepoSlug | null>(() => {
    const repo = this.board.active();
    return repo && this.sky()?.tracker === 'github' ? { owner: repo.owner, name: repo.name } : null;
  });

  protected readonly detail = resource({
    params: () => {
      const repo = this.board.activePath();
      const offsky = this.offsky();
      const selection = this.selection();
      if (!repo) return undefined;
      if (offsky) return { repo, id: offsky };
      return selection?.kind === 'star' ? { repo, id: selection.id } : undefined;
    },
    loader: ({ params }) => this.issueDetails.fetch(params.repo, params.id),
  });
  protected readonly body = computed(() => {
    if (!this.detail.hasValue()) return null;
    const detail = this.detail.value();
    return {
      detail,
      html: this.markdown(detail.body.trim() || '_No description._'),
      comments: detail.comments.map((c) => ({
        author: c.author,
        date: c.createdAt.slice(0, 10),
        html: this.markdown(c.body),
      })),
    };
  });
  protected readonly detailError = computed(() => {
    const error = this.detail.error();
    return error ? this.panelText().issueLoadFailed(this.apiErrorText(error)) : null;
  });

  protected readonly destination = computed(() => {
    const sky = this.sky();
    return sky?.destination ? this.markdown(sky.destination) : null;
  });
  protected readonly fogHtml = computed(() => {
    const reading = this.reading();
    return reading.kind === 'fog' ? this.markdown(reading.fog.text) : '';
  });
  protected readonly outOfScope = computed(() => {
    const bullets = this.sky()?.outOfScope ?? [];
    return bullets.length > 0 ? this.markdown(bullets.map((b) => `- ${b}`).join('\n')) : null;
  });

  protected readonly releasing = signal(false);
  protected readonly releaseError = linkedSignal<unknown, string | null>({
    source: this.selection,
    computation: () => null,
  });

  protected readonly flagging = signal(false);
  protected readonly flagError = linkedSignal<unknown, string | null>({
    source: this.selection,
    computation: () => null,
  });

  protected chip(label: Label) {
    return chipColours(label.color);
  }

  protected close(): void {
    this.offsky.set(null);
    this.skyView.select(null);
  }

  protected fly(id: string): void {
    this.skyView.flyTo(id);
  }

  protected openRef(id: string): void {
    const sky = this.sky();
    if (sky?.index.has(id)) this.skyView.flyTo(id);
    else this.offsky.set(id);
  }

  protected follow(event: MouseEvent): void {
    if (event.metaKey || event.ctrlKey || event.shiftKey) return;
    const link = (event.target as Element | null)?.closest('a');
    const number = issueNumberOf(link?.getAttribute('href') ?? '', this.slug());
    if (!number) return;
    event.preventDefault();
    this.openRef(number);
  }

  protected async release(ids: string[]): Promise<void> {
    const repo = this.board.activePath();
    if (!repo || this.releasing() || ids.length === 0) return;
    this.releasing.set(true);
    this.releaseError.set(null);
    try {
      const { failed } = await this.api.release(repo, ids);
      if (failed.length > 0) {
        const t = this.panelText();
        const sky = this.sky();
        const lines = failed.map((f) =>
          t.releaseItemFailed(
            handleIn(sky, f.id),
            f.reason ? word(this.codes().releaseRefusals, f.reason) : f.error,
          ),
        );
        this.releaseError.set(lines.join('\n'));
      }
    } catch (error) {
      this.releaseError.set(this.panelText().releaseFailed(this.apiErrorText(error)));
    } finally {
      this.releasing.set(false);
    }
    await this.board.readSky({ fresh: true });
  }

  /** Spins until the refresh lands, so the toggle never shows the old word after a good write. */
  protected async flag(id: string, flagged: boolean): Promise<void> {
    const repo = this.board.activePath();
    if (!repo || this.flagging()) return;
    this.flagging.set(true);
    this.flagError.set(null);
    try {
      await this.api.flag({ repo, id, flagged });
    } catch {
      this.flagError.set(this.panelText().flag.failed);
    }
    try {
      await this.board.readSky({ fresh: true });
    } finally {
      this.flagging.set(false);
    }
  }

  private markdown(src: string): string {
    return renderMarkdown(src, this.slug());
  }

  private panelText() {
    return this.i18n.messages().board.panel;
  }

  private codes() {
    return this.i18n.messages().board.codes;
  }

  private apiErrorText(error: unknown): string {
    if (error instanceof ApiFailure) return apiFailureText(error.body, this.codes());
    return error instanceof Error ? error.message : String(error);
  }
}
