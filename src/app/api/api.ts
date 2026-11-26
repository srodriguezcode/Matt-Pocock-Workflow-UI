import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { firstValueFrom, type Observable } from 'rxjs';
import type {
  AddRepoRequest,
  ApiError,
  BranchesResponse,
  ClosedRoute,
  FlagRequest,
  GapsResponse,
  PlanRequest,
  ReleaseResponse,
  ReorderReposRequest,
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

/** A failed `/api` call, carrying the server's message and any Gap behind it. */
export class ApiFailure extends Error {
  constructor(
    readonly status: number,
    readonly body: ApiError,
  ) {
    super(body.error);
  }
}

@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);

  repos(): Promise<RepoConfig[]> {
    return this.call(this.http.get<RepoConfig[]>('/api/repos'));
  }

  addRepo(request: AddRepoRequest): Promise<RepoConfig> {
    return this.call(this.http.post<RepoConfig>('/api/repos', request));
  }

  editRepo(repo: RepoConfig): Promise<RepoConfig> {
    return this.call(this.http.put<RepoConfig>('/api/repos', repo));
  }

  removeRepo(path: string): Promise<RepoConfig[]> {
    return this.call(this.http.delete<RepoConfig[]>('/api/repos', { params: { path } }));
  }

  reorderRepos(paths: string[]): Promise<RepoConfig[]> {
    const request: ReorderReposRequest = { paths };
    return this.call(this.http.put<RepoConfig[]>('/api/repos/order', request));
  }

  /** `fresh` skips joining a read already in flight, which may predate the caller's own write. */
  sky(repo: string, fresh = false): Promise<SkyResponse> {
    const params: Record<string, string> = fresh ? { repo, fresh: '1' } : { repo };
    return this.call(this.http.get<SkyResponse>('/api/sky', { params }));
  }

  issue(repo: string, id: string): Promise<IssueDetail> {
    return this.call(this.http.get<IssueDetail>('/api/issue', { params: { repo, id } }));
  }

  route(repo: string, id: string): Promise<ClosedRoute> {
    return this.call(this.http.get<ClosedRoute>('/api/route', { params: { repo, id } }));
  }

  cost(repo: string, id: string): Promise<CostReading> {
    return this.call(this.http.get<CostReading>('/api/cost', { params: { repo, id } }));
  }

  branches(repo: string): Promise<BranchesResponse> {
    return this.call(this.http.get<BranchesResponse>('/api/branches', { params: { repo } }));
  }

  gaps(repo: string | null): Promise<GapsResponse> {
    const params: Record<string, string> = repo ? { repo } : {};
    return this.call(this.http.get<GapsResponse>('/api/gaps', { params }));
  }

  settings(): Promise<Settings> {
    return this.call(this.http.get<Settings>('/api/settings'));
  }

  saveSettings(settings: Settings): Promise<Settings> {
    return this.call(this.http.put<Settings>('/api/settings', settings));
  }

  plan(request: PlanRequest): Promise<PlanResult> {
    return this.call(this.http.post<PlanResult>('/api/plan', request));
  }

  release(repo: string, ids: string[]): Promise<ReleaseResponse> {
    return this.call(this.http.post<ReleaseResponse>('/api/release', { repo, ids }));
  }

  flag(request: FlagRequest): Promise<void> {
    return this.call(this.http.post<void>('/api/flag', request));
  }

  runtime(): Promise<RuntimeResponse> {
    return this.call(this.http.get<RuntimeResponse>('/api/runtime'));
  }

  sessions(): Promise<SessionView[]> {
    return this.call(this.http.get<SessionView[]>('/api/sessions'));
  }

  answer(request: AnswerRequest): Promise<AnswerResponse> {
    return this.call(this.http.post<AnswerResponse>('/api/session/answer', request));
  }

  /** Uses `fetch`: HttpClient buffers the whole body, so no event would arrive before the last. */
  async *start(request: StartRequest): AsyncGenerator<LaunchEvent> {
    const response = await fetch('/api/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(request),
    });
    if (!response.ok || !response.body) {
      const text = await response.text();
      let body: ApiError = { error: text || response.statusText };
      try {
        body = JSON.parse(text) as ApiError;
      } catch {}
      throw new ApiFailure(response.status, body);
    }
    const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
    let buffered = '';
    for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
      buffered += chunk.value;
      const lines = buffered.split('\n');
      buffered = lines.pop() ?? '';
      for (const line of lines) if (line.trim()) yield JSON.parse(line) as LaunchEvent;
    }
  }

  private async call<T>(request: Observable<T>): Promise<T> {
    try {
      return await firstValueFrom(request);
    } catch (error) {
      if (error instanceof HttpErrorResponse) {
        const body = (error.error as ApiError | null)?.error
          ? (error.error as ApiError)
          : { error: error.message };
        throw new ApiFailure(error.status, body);
      }
      throw error;
    }
  }
}
