import { computed, inject, Injectable, signal } from '@angular/core';
import type { ApiError, ClosedRoute, SkyResponse } from '@contract/api';
import type { Gap } from '@contract/gap';
import type { NewSessionSkill } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import { Api, ApiFailure } from '@app/api/api';
import { I18nService } from '@app/i18n/i18n.service';
import { word } from '@app/i18n/word';
import { withRoute } from '@app/sky/engine/route';

export interface ReadFailure {
  message: string;
  gap: Gap | null;
}

/** The repos, the active repo's sky and its Gaps. Components read these. Only the methods write. */
@Injectable({ providedIn: 'root' })
export class Board {
  private readonly api = inject(Api);
  private readonly i18n = inject(I18nService);

  readonly repos = signal<RepoConfig[]>([]);
  readonly activePath = signal<string | null>(null);
  readonly active = computed(() => this.repos().find((r) => r.path === this.activePath()) ?? null);

  /** The last sky read successfully. Kept when a later read fails. */
  readonly skyResponse = signal<SkyResponse | null>(null);
  /** The closed route of the selected System, written by `ClosedRoutes`. */
  readonly route = signal<ClosedRoute | null>(null);
  readonly sky = computed(() => {
    const sky = this.skyResponse()?.sky;
    return sky ? withRoute(sky, this.route()) : null;
  });
  readonly starts = computed(() => this.skyResponse()?.starts ?? {});
  private readonly readError = signal<ApiError | null>(null);
  readonly readFailure = computed<ReadFailure | null>(() => {
    const body = this.readError();
    if (!body) return null;
    const codes = this.i18n.messages().board.codes;
    const message = body.reason
      ? word(codes.apiErrors, body.reason)
      : body.gap
        ? word(codes.gapTitles, body.gap.problem)
        : body.error;
    return { message, gap: body.gap ?? null };
  });
  readonly reading = signal(false);

  readonly gaps = signal<Gap[]>([]);
  /** The new-session skills installed for the active repo, read with its Gaps. */
  readonly sessionSkills = signal<NewSessionSkill[]>([]);
  readonly fatalGap = computed(
    () => this.gaps().find((g) => g.tier === 'fatal') ?? this.readFailure()?.gap ?? null,
  );

  private readSeq = 0;
  private reorderSeq = 0;

  async loadRepos(): Promise<void> {
    let repos: RepoConfig[];
    try {
      repos = await this.api.repos();
    } catch (error) {
      this.readError.set({ error: String(error) });
      return;
    }
    this.repos.set(repos);
    if (!this.activePath() && repos[0]) await this.switchTo(repos[0].path);
    else if (!repos[0]) await this.checkGaps();
  }

  async switchTo(path: string): Promise<void> {
    this.activePath.set(path);
    this.skyResponse.set(null);
    this.readError.set(null);
    await Promise.all([this.checkGaps(), this.readSky()]);
  }

  async added(repo: RepoConfig): Promise<void> {
    this.repos.update((repos) => [...repos.filter((r) => r.path !== repo.path), repo]);
    await this.switchTo(repo.path);
  }

  async updated(repo: RepoConfig): Promise<void> {
    this.repos.update((repos) => repos.map((r) => (r.path === repo.path ? repo : r)));
    if (this.activePath() !== repo.path) return;
    /** Fresh, because the cached sky was drawn with the old label remaps. */
    await Promise.all([this.checkGaps(), this.readSky({ fresh: true })]);
  }

  /** Drops a removed repo. When it was active, the one below it on the rail takes over, else the one above. */
  async removed(path: string): Promise<void> {
    const repos = this.repos();
    const index = repos.findIndex((r) => r.path === path);
    const rest = repos.filter((r) => r.path !== path);
    this.repos.set(rest);
    if (this.activePath() !== path) return;
    const next = rest[index] ?? rest[index - 1];
    if (next) {
      await this.switchTo(next.path);
      return;
    }
    this.activePath.set(null);
    this.skyResponse.set(null);
    this.route.set(null);
    this.readError.set(null);
    await this.checkGaps();
  }

  /**
   * Shows the new Rail order before the save. A failed save puts the old order back and rethrows,
   * unless a later reorder has replaced it.
   */
  async reorder(paths: string[]): Promise<void> {
    const previous = this.repos().map((r) => r.path);
    const seq = ++this.reorderSeq;
    this.repos.update((repos) => inOrder(repos, paths));
    try {
      await this.api.reorderRepos(paths);
    } catch (error) {
      if (seq === this.reorderSeq) this.repos.update((repos) => inOrder(repos, previous));
      throw error;
    }
  }

  /** Re-reads the sky. Resolves `false` and keeps the last sky when the read fails. */
  async readSky({ fresh = false }: { fresh?: boolean } = {}): Promise<boolean> {
    const path = this.activePath();
    if (!path) return false;
    const seq = ++this.readSeq;
    const current = () => seq === this.readSeq && this.activePath() === path;
    this.reading.set(true);
    try {
      const response = await this.api.sky(path, fresh);
      if (!current()) return false;
      this.skyResponse.set(response);
      this.readError.set(null);
      return true;
    } catch (error) {
      if (!current()) return false;
      this.readError.set(error instanceof ApiFailure ? error.body : { error: String(error) });
      return false;
    } finally {
      if (seq === this.readSeq) this.reading.set(false);
    }
  }

  async checkGaps(): Promise<void> {
    const path = this.activePath();
    try {
      const reply = await this.api.gaps(path);
      if (this.activePath() !== path) return;
      this.gaps.set(reply.gaps);
      this.sessionSkills.set(reply.sessionSkills);
    } catch {
      if (this.activePath() !== path) return;
      this.gaps.set([]);
      this.sessionSkills.set([]);
    }
  }
}

/** Repos not in `paths`, such as one added during a save, keep their place after the rest. */
function inOrder(repos: RepoConfig[], paths: string[]): RepoConfig[] {
  const rank = (repo: RepoConfig) => {
    const index = paths.indexOf(repo.path);
    return index === -1 ? paths.length : index;
  };
  return [...repos].sort((a, b) => rank(a) - rank(b));
}
