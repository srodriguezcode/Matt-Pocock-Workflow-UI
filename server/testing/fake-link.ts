import type { LinkConfig } from '#server/http/types.ts';
import { SessionHub, type HubDeps } from '#server/session/hub.ts';

export const TEST_LINK: LinkConfig = {
  hookBase: 'http://127.0.0.1:4200',
  settingsPath: '/home/me/.config/ui-agent-workflow/session-settings.json',
  agents: { command: 'claude', args: ['agents', '--json'] },
};

/** A hub with no Sessions and an empty `agents --json`, for Deps that never touch the link. */
export function testHub(deps: Partial<HubDeps> = {}): SessionHub {
  return new SessionHub({
    now: () => new Date('2026-09-30T10:00:00Z'),
    readAgents: async () => [],
    identifyByCwd: async () => null,
    typeInto: async () => null,
    launchStore: { load: async () => [], save: async () => {} },
    ...deps,
  });
}

export const linked = () => ({
  link: TEST_LINK,
  sessions: testHub(),
  runtime: 'mac' as const,
  claudeConfigDir: null,
});
