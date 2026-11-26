import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { expect, it } from 'vitest';
import type { SkyResponse } from '@contract/api';
import { withDefaults } from '#server/config/store.ts';
import { FakeRunner } from '#server/testing/fake-runner.ts';
import { githubTracker } from '#server/tracker/github/adapter.ts';
import { buildSky } from './model.ts';

const NOW = new Date('2026-09-25T20:00:00Z');
const repo = withDefaults({ path: '/code/harbor', owner: 'ana-reyes', name: 'harbor' });
const FIXTURE = '../../src/app/sky/testing/harbor-sky-response.json';

it('records the Harbor Sky response the client specs load', async () => {
  const stdout = readFileSync(new URL('./fixtures/harbor-graphql.json', import.meta.url), 'utf8');
  const runner = new FakeRunner().on(['gh', 'api', 'graphql'], { stdout });
  const graph = await githubTracker(runner, repo).read();
  const response: SkyResponse = { ...buildSky(graph, {}, NOW), readAt: NOW.toISOString() };
  const filepath = fileURLToPath(new URL(FIXTURE, import.meta.url));
  const options = { ...(await resolveConfig(filepath)), filepath };
  await expect(await format(JSON.stringify(response), options)).toMatchFileSnapshot(FIXTURE);
});
