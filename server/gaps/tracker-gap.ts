import type { Gap } from '@contract/gap';
import { TRACKER_FILE } from '#server/tracker/detect.ts';

export function trackerGap(detected: 'missing' | 'unsupported'): Gap {
  const missing = detected === 'missing';
  return {
    id: `tracker-${detected}`,
    scope: 'repo',
    tier: 'fatal',
    problem: missing
      ? { code: 'tracker-missing', file: TRACKER_FILE }
      : { code: 'tracker-unsupported' },
    fix: missing ? { skill: '/setup-matt-pocock-skills' } : null,
    blocks: [],
    searched: [],
    ids: [],
  };
}
