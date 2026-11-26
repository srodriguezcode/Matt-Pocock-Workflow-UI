import { inject, Injectable } from '@angular/core';
import type {
  AddRepoRequest,
  BranchesResponse,
  ClosedRoute,
  FlagRequest,
  GapsResponse,
  PlanRequest,
  ReleaseResponse,
  RuntimeResponse,
  Settings,
  SkyResponse,
  StartRequest,
} from '@contract/api';
import type { CostReading } from '@contract/cost';
import type { IssueDetail } from '@contract/issue';
import type { LaunchEvent, PlanResult } from '@contract/launch';
import type { RepoConfig } from '@contract/repo';
import type { AnswerRequest, AnswerResponse, SessionView } from '@contract/session';
import { ApiFailure, type Api } from '@app/api/api';
import { demoCost } from './demo-cost';
import { DemoSessionStream } from './demo-session-stream';
import { DemoStore, loadSnapshot } from './demo-store';
import { SNAPSHOT_URL } from './mock';

/**
 * `implements Api` would also ask for its private fields. A method `Api` gains still fails the
 * check until `DemoApi` has it.
 */
type ApiSurface = { [K in keyof Api]: Api[K] };

const notBuilt = (method: string) => Promise.reject(new Error(`DemoApi.${method}: not built`));

function found<T>(value: T | null, what: string): T {
  if (value === null) throw new ApiFailure(404, { error: `Demo: no ${what}` });
  return value;
}

/** The board's `/api`, served from the build-time snapshot and kept in memory until reload. */
@Injectable({ providedIn: 'root' })
export class DemoApi implements ApiSurface {
  private readonly session = inject(DemoSessionStream);
  private store: Promise<DemoStore> | null = null;
  private theme: Settings['theme'] =
    document.documentElement.dataset['theme'] === 'light' ? 'light' : 'dark';

  async repos(): Promise<RepoConfig[]> {
    return (await this.loaded()).repos();
  }

  addRepo(_request: AddRepoRequest): Promise<RepoConfig> {
    return notBuilt('addRepo');
  }

  editRepo(_repo: RepoConfig): Promise<RepoConfig> {
    return notBuilt('editRepo');
  }

  removeRepo(_path: string): Promise<RepoConfig[]> {
    return notBuilt('removeRepo');
  }

  async reorderRepos(paths: string[]): Promise<RepoConfig[]> {
    const repos = (await this.loaded()).reorder(paths);
    if (repos === null)
      throw new ApiFailure(400, {
        error: 'paths must name every repo once',
        reason: { code: 'bad-repo-order' },
      });
    return repos;
  }

  async sky(repo: string, _fresh = false): Promise<SkyResponse> {
    return found((await this.loaded()).sky(repo), `repo ${repo}`);
  }

  async issue(repo: string, id: string): Promise<IssueDetail> {
    return found((await this.loaded()).issue(repo, id), `issue ${id}`);
  }

  async route(repo: string, id: string): Promise<ClosedRoute> {
    return found((await this.loaded()).route(repo, id), `System ${id}`);
  }

  cost(repo: string, id: string): Promise<CostReading> {
    return Promise.resolve(demoCost(repo, id));
  }

  async branches(repo: string): Promise<BranchesResponse> {
    return found((await this.loaded()).branches(repo), `repo ${repo}`);
  }

  async gaps(repo: string | null): Promise<GapsResponse> {
    return found((await this.loaded()).gaps(repo), `repo ${repo}`);
  }

  settings(): Promise<Settings> {
    return Promise.resolve({ theme: this.theme });
  }

  saveSettings(settings: Settings): Promise<Settings> {
    this.theme = settings.theme;
    return Promise.resolve(settings);
  }

  async plan(request: PlanRequest): Promise<PlanResult> {
    return found((await this.loaded()).plan(request), `repo ${request.repo}`);
  }

  async release(repo: string, ids: string[]): Promise<ReleaseResponse> {
    return found((await this.loaded()).release(repo, ids), `repo ${repo}`);
  }

  async flag(request: FlagRequest): Promise<void> {
    const store = await this.loaded();
    if (!store.flag(request.repo, request.id, request.flagged))
      throw new ApiFailure(404, { error: `Demo: no issue ${request.id}` });
  }

  runtime(): Promise<RuntimeResponse> {
    return Promise.resolve({ runtime: 'mac' });
  }

  sessions(): Promise<SessionView[]> {
    return Promise.resolve([]);
  }

  answer(request: AnswerRequest): Promise<AnswerResponse> {
    return this.session.answer(request);
  }

  async *start(_request: StartRequest): AsyncGenerator<LaunchEvent> {
    throw new Error('DemoApi.start: the Demo starts no Sessions');
  }

  private loaded(): Promise<DemoStore> {
    this.store ??= loadSnapshot(SNAPSHOT_URL).then((snapshot) => {
      if (snapshot) return new DemoStore(snapshot);
      /** Forgets a failed load, so the next call fetches again. */
      this.store = null;
      throw new ApiFailure(404, { error: `${SNAPSHOT_URL}: missing` });
    });
    return this.store;
  }
}
