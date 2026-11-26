import {
  afterNextRender,
  Component,
  effect,
  ElementRef,
  inject,
  Injector,
  signal,
  viewChild,
} from '@angular/core';
import type { CanonicalLabel, LabelRemaps, RepoConfig, Tile } from '@contract/repo';
import { Api } from '@app/api/api';
import { failureText } from '@app/i18n/failure-text';
import { I18nService } from '@app/i18n/i18n.service';
import { Board } from '@app/state/board';
import { TileEditor } from '@app/rail/tile-editor';
import { folderName } from '@app/rail/tile-letters';

const CANONICAL: Record<CanonicalLabel, true> = {
  'ready-for-agent': true,
  'ready-for-human': true,
  'needs-triage': true,
  'needs-info': true,
  'to-be-confirmed': true,
  spec: true,
  'wayfinder:map': true,
  'wayfinder:': true,
};

interface PrefixRow {
  id: number;
  label: string;
  prefix: string;
}

@Component({
  selector: 'app-repo-settings',
  imports: [TileEditor],
  templateUrl: './repo-settings.html',
  styleUrls: ['./dialog-form.scss', './repo-settings.scss'],
})
export class RepoSettings {
  private readonly api = inject(Api);
  private readonly injector = inject(Injector);
  private readonly board = inject(Board);
  protected readonly i18n = inject(I18nService);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly keepButton = viewChild<ElementRef<HTMLButtonElement>>('keep');

  protected readonly canonical = Object.keys(CANONICAL) as CanonicalLabel[];
  protected readonly repo = signal<RepoConfig | null>(null);
  protected readonly letters = signal('');
  protected readonly useImage = signal(false);
  protected readonly image = signal<string | null>(null);
  protected readonly baseBranch = signal('');
  protected readonly rows = signal<PrefixRow[]>([]);
  protected readonly fallbackPrefix = signal('');
  protected readonly worktreeDir = signal('');
  protected readonly labels = signal<LabelRemaps>({});
  protected readonly confirming = signal(false);
  protected readonly error = signal<string | null>(null);
  protected readonly busy = signal(false);
  private nextRowId = 0;

  constructor() {
    effect(() => this.keepButton()?.nativeElement.focus());
  }

  open(repo: RepoConfig): void {
    this.repo.set(repo);
    this.letters.set('letters' in repo.tile ? repo.tile.letters : '');
    this.useImage.set('image' in repo.tile);
    this.image.set('image' in repo.tile ? repo.tile.image : null);
    this.baseBranch.set(repo.baseBranch ?? '');
    this.rows.set(repo.branchPrefixes.map((p) => ({ id: this.nextRowId++, ...p })));
    this.fallbackPrefix.set(repo.fallbackPrefix);
    this.worktreeDir.set(repo.worktreeDir ?? '');
    this.labels.set({ ...repo.labels });
    this.confirming.set(false);
    this.error.set(null);
    /** After render, so the modal's initial focus lands on the first field rather than the dialog. */
    afterNextRender(() => this.dialog().nativeElement.showModal(), { injector: this.injector });
  }

  protected close(): void {
    this.dialog().nativeElement.close();
  }

  protected reset(): void {
    this.repo.set(null);
    this.busy.set(false);
  }

  protected defaultWorktreeDir(repo: RepoConfig): string {
    return `../${folderName(repo.path)}.worktrees/`;
  }

  protected text(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected editRow(id: number, change: Partial<PrefixRow>): void {
    this.rows.update((rows) => rows.map((row) => (row.id === id ? { ...row, ...change } : row)));
  }

  protected addRow(): void {
    this.rows.update((rows) => [...rows, { id: this.nextRowId++, label: '', prefix: '' }]);
  }

  protected removeRow(id: number): void {
    this.rows.update((rows) => rows.filter((row) => row.id !== id));
  }

  protected moveRow(index: number, by: -1 | 1): void {
    this.rows.update((rows) => {
      const next = [...rows];
      [next[index], next[index + by]] = [next[index + by]!, next[index]!];
      return next;
    });
  }

  protected editLabel(label: CanonicalLabel, name: string): void {
    this.labels.update((labels) => ({ ...labels, [label]: name }));
  }

  protected async save(event: SubmitEvent): Promise<void> {
    event.preventDefault();
    const repo = this.repo();
    const image = this.image();
    if (!repo || (this.useImage() && !image)) return;
    const tile: Tile = this.useImage() ? { image: image! } : { letters: this.letters() };
    const baseBranch = this.baseBranch().trim();
    const worktreeDir = this.worktreeDir().trim();
    const edited: RepoConfig = {
      path: repo.path,
      owner: repo.owner,
      name: repo.name,
      ...(baseBranch ? { baseBranch } : {}),
      branchPrefixes: this.rows().map(({ label, prefix }) => ({
        label: label.trim(),
        prefix: prefix.trim(),
      })),
      fallbackPrefix: this.fallbackPrefix().trim(),
      ...(worktreeDir ? { worktreeDir } : {}),
      labels: Object.fromEntries(
        Object.entries(this.labels())
          .map(([label, name]) => [label, name.trim()])
          .filter(([, name]) => name),
      ),
      tile,
    };
    await this.run(async () => {
      const saved = await this.api.editRepo(edited);
      this.close();
      await this.board.updated(saved);
    });
  }

  protected async remove(): Promise<void> {
    const repo = this.repo();
    if (!repo) return;
    await this.run(async () => {
      await this.api.removeRepo(repo.path);
      this.close();
      await this.board.removed(repo.path);
    });
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await action();
    } catch (error) {
      this.error.set(failureText(error, this.i18n.messages().board.codes));
    } finally {
      this.busy.set(false);
    }
  }
}
