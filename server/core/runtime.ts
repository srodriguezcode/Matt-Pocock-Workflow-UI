import type { Runtime } from '@contract/runtime';

export function runtimeOf(env: Record<string, string | undefined>): Runtime {
  return env['UAW_RUNTIME'] === 'container' ? 'container' : 'mac';
}

export const REPOS_ROOT = '/repos';
