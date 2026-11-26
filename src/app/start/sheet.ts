import {
  afterRenderEffect,
  Component,
  computed,
  effect,
  ElementRef,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import type { LaunchPlan, NewSessionSkill } from '@contract/launch';
import { ApiFailure } from '@app/api/api';
import { copyText } from '@app/controls/clipboard';
import { Tip } from '@app/controls/tip';
import { InstallNote } from '@app/install-note/install-note';
import { apiFailureText } from '@app/i18n/api-failure';
import { I18nService } from '@app/i18n/i18n.service';
import { word } from '@app/i18n/word';
import { handleOf } from '@app/sky/engine/route';
import { SkyView } from '@app/sky/sky-view';
import { Board } from '@app/state/board';
import { baseNote, sheetTitle } from '@app/start/face';
import { measureStage, placeCornerSheet, placeSheet } from '@app/start/place';
import { attachCommand, outcome, rollbackIcon, stepIcon } from '@app/start/progress';
import { isRepoStart, SESSION, START, Start, type Planned } from '@app/start/start';

const COPIED_MS = 1200;

const FOCUSABLE = 'button:not([disabled]), select:not([disabled]), textarea, a[href]';

@Component({
  selector: 'app-sheet',
  imports: [Tip, InstallNote],
  templateUrl: './sheet.html',
  styleUrl: './sheet.scss',
  host: { '(document:keydown)': 'trapTab($event)' },
})
export class StartSheet {
  protected readonly start = inject(Start);
  private readonly board = inject(Board);
  private readonly view = inject(SkyView);
  protected readonly i18n = inject(I18nService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly sheet = viewChild<ElementRef<HTMLElement>>('sheet');
  private readonly goButton = viewChild<ElementRef<HTMLButtonElement>>('go');
  private readonly noteCancel = viewChild<ElementRef<HTMLButtonElement>>('noteCancel');
  private readonly promptBox = viewChild<ElementRef<HTMLTextAreaElement>>('prompt');

  protected readonly stepIcon = stepIcon;
  protected readonly rollbackIcon = rollbackIcon;
  protected readonly outcome = outcome;
  protected readonly attachCommand = attachCommand;
  protected readonly word = word;

  protected readonly id = this.start.sheet;
  private readonly cornered = computed(() => {
    const id = this.id();
    return id !== null && isRepoStart(id);
  });
  protected readonly session = computed(() => this.id() === SESSION);
  protected readonly sessionTarget = this.start.sessionTarget;
  protected readonly sessionSkills = this.board.sessionSkills;
  protected readonly shown = computed(
    () => this.id() !== null && (this.cornered() || this.view.anchor() !== null),
  );
  protected readonly option = computed(() => {
    const id = this.id();
    return id ? this.start.optionFor(id) : null;
  });
  protected readonly launch = computed(() => {
    const id = this.id();
    return id ? this.start.launchFor(id) : null;
  });

  protected readonly plan = this.start.plan;
  protected readonly resolved = this.start.resolved;
  protected readonly chosen = this.start.chosen;
  protected readonly copied = signal(false);

  protected readonly title = computed(() => {
    const launch = this.launch();
    const option = this.option();
    const target = launch?.target ?? option?.target;
    if (!target) return '';
    const label = launch?.label ?? (option?.enabled ? option.label : START);
    const codes = this.i18n.messages().board.codes;
    const handle = 'id' in target ? this.handleOf(target.id) : null;
    return sheetTitle(target.kind, word(codes.startLabels, label), handle, codes);
  });
  protected readonly label = computed(() =>
    word(this.i18n.messages().board.codes.startLabels, this.start.labelFor(this.id())),
  );
  protected readonly skill = computed(() => {
    const plan = this.plan();
    return this.launch()?.plan.skill ?? (plan?.ok ? plan.plan.skill : '');
  });
  protected readonly selectedBase = computed(() => this.chosen() ?? this.resolved()?.branch ?? '');
  protected readonly baseNote = computed(() => {
    const base = this.resolved();
    if (!base) return '';
    const messages = this.i18n.messages().board;
    return baseNote(
      base.source,
      base.systemId ? this.handleOf(base.systemId) : null,
      messages.sheet,
      messages.codes,
    );
  });
  protected readonly baseOptions = computed(() => {
    const extra = [this.resolved()?.branch, this.chosen()].filter((b): b is string => !!b);
    return [...new Set([...extra, ...this.start.branches()])].sort();
  });

  private focusPending = false;
  private copyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    effect(() => {
      if (this.id() !== null) this.focusPending = true;
    });
    afterRenderEffect(() => {
      const first = (this.promptBox() ?? this.goButton() ?? this.noteCancel())?.nativeElement;
      if (!first || !this.focusPending) return;
      this.focusPending = false;
      first.focus();
    });
    afterRenderEffect(() => {
      this.plan();
      this.launch();
      const anchor = this.view.anchor();
      const el = this.sheet()?.nativeElement;
      const bounds = measureStage(this.host.nativeElement);
      if (!el || !bounds) return;
      const size = { w: el.offsetWidth, h: el.offsetHeight };
      if (!this.cornered() && !anchor) return;
      const at =
        anchor && !this.cornered()
          ? placeSheet(anchor, size, bounds)
          : placeCornerSheet(size, bounds);
      el.style.transform = `translate(${at.x}px, ${at.y}px)`;
    });
  }

  protected typePrompt(prompt: string): void {
    this.start.editSession({ prompt });
  }

  /** The `<select>` gives `''` for the "No skill" option. */
  protected pickSkill(skill: string): void {
    this.start.editSession({ skill: (skill || null) as NewSessionSkill | null });
  }

  protected pickBase(branch: string): void {
    this.start.pickBase(branch);
  }

  protected async copy(text: string): Promise<void> {
    if (!(await copyText(text))) return;
    this.copied.set(true);
    clearTimeout(this.copyTimer);
    this.copyTimer = setTimeout(() => this.copied.set(false), COPIED_MS);
  }

  protected confirm(plan: LaunchPlan): void {
    const id = this.id();
    if (id) void this.start.start(id, plan);
  }

  protected refusal(planned: Planned & { ok: false }): string {
    const codes = this.i18n.messages().board.codes;
    if (!('error' in planned)) return word(codes.planRefusals, planned.reason);
    const { error } = planned;
    if (error instanceof ApiFailure) return apiFailureText(error.body, codes);
    return error instanceof Error ? error.message : String(error);
  }

  protected cancel(): void {
    this.start.close();
  }

  protected dismiss(): void {
    const id = this.id();
    if (id) this.start.dismiss(id);
  }

  protected trapTab(event: KeyboardEvent): void {
    const sheet = this.sheet()?.nativeElement;
    if (event.key !== 'Tab' || !sheet) return;
    const items = [...sheet.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const at = document.activeElement;
    const inside = at instanceof HTMLElement && sheet.contains(at);
    if (!inside || (event.shiftKey ? at === first : at === last)) {
      event.preventDefault();
      (event.shiftKey ? last : first).focus();
    }
  }

  private handleOf(id: string): string | null {
    const sky = this.board.sky();
    return sky ? handleOf(sky, id) : null;
  }
}
