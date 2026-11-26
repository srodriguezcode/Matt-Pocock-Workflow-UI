import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  input,
  linkedSignal,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import type { SessionView } from '@contract/session';
import { I18nService } from '@app/i18n/i18n.service';
import { renderMarkdown } from '@app/panel/markdown';
import { AnswerNotes } from '@app/session/answer-notes';
import { SessionDialog } from '@app/session/session-dialog';
import { injectAnswerDeps } from './answer-deps';
import { replyKind } from './answers';
import { AskForm } from './ask-form';
import { DeliveryToggle } from './delivery-toggle';
import { heldAnswer } from './held-answer';
import { RoundForm } from './round-form';
import { replyKey } from './reply-key';
import { replyHint, turnsOf } from './turns';

@Component({
  selector: 'app-peek',
  imports: [AskForm, RoundForm, DeliveryToggle],
  templateUrl: './peek.html',
  styleUrl: './peek.scss',
})
export class Peek {
  protected readonly i18n = inject(I18nService);
  readonly session = input.required<SessionView>();
  /** The selected star. Selecting one whose Session is Asking opens the dialog over its panel. */
  readonly starId = input.required<string>();
  private readonly notes = inject(AnswerNotes);
  private readonly requests = inject(SessionDialog);
  private autoOpen = false;
  protected readonly open = signal(false);
  protected readonly reply = heldAnswer(injectAnswerDeps(), this.session, replyKind);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');
  private readonly history = viewChild<ElementRef<HTMLElement>>('history');

  protected readonly turns = computed(() =>
    turnsOf(this.session().peek).map((turn) => ({
      ...turn,
      html: turn.end ? renderMarkdown(turn.end.full ?? turn.end.text, null) : null,
    })),
  );
  protected readonly frozen = computed(() => {
    const { state } = this.session();
    return state === 'ended' || state === 'lost';
  });
  protected readonly gone = computed(() => this.notes.gone().has(this.session().sessionId));
  /** Holding a form, not a reply: the button lights and the dialog can grow to fit a long round. */
  protected readonly asking = computed(() => {
    const kind = this.session().question?.kind;
    return kind === 'ask' || kind === 'round';
  });
  protected readonly large = linkedSignal<string | undefined, boolean>({
    source: () => this.session().question?.id,
    computation: () => false,
  });
  protected readonly hint = computed(() => replyHint(this.session()));

  constructor() {
    effect(() => {
      this.starId();
      this.autoOpen = untracked(this.session).state === 'asking';
    });
    effect(() => {
      if (this.requests.requested() !== this.session().sessionId) return;
      this.autoOpen = true;
      untracked(() => this.requests.requested.set(null));
    });
    afterRenderEffect(() => {
      this.starId();
      if (!this.autoOpen) return;
      this.autoOpen = false;
      untracked(() => this.show());
    });
    afterRenderEffect(() => {
      this.turns();
      const el = this.history()?.nativeElement;
      if (this.open() && el) el.scrollTop = el.scrollHeight;
    });
  }

  protected show(): void {
    const dialog = this.dialog()?.nativeElement;
    if (!dialog || dialog.open) return;
    this.open.set(true);
    dialog.showModal();
  }

  protected close(): void {
    this.dialog()?.nativeElement.close();
  }

  protected closeOnBackdrop(event: MouseEvent): void {
    if (event.target === this.dialog()?.nativeElement) this.close();
  }

  protected time(at: string): string {
    return new Date(at).toTimeString().slice(0, 5);
  }

  protected onKey(event: KeyboardEvent): void {
    const key = replyKey(event, this.reply.ready());
    if (key === 'type') return;
    event.preventDefault();
    if (key === 'send') void this.reply.send();
    if (key === 'newline') this.newLine(event.target as HTMLTextAreaElement);
  }

  private newLine(box: HTMLTextAreaElement): void {
    box.setRangeText('\n', box.selectionStart, box.selectionEnd, 'end');
    this.reply.edit(box.value);
  }
}
