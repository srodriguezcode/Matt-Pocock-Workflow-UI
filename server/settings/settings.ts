import type { ApiErrorReason, Settings } from '@contract/api';
import type { Config } from '@contract/repo';
import { isTheme, readConfig, writeConfig } from '#server/config/store.ts';
import type { FileSystem } from '#server/core/fs.ts';
import { HttpError } from '#server/http/types.ts';

export interface SettingsDeps {
  fs: FileSystem;
  home: string;
}

export function settingsOf(config: Config): Settings {
  return { theme: config.theme };
}

export function planSettings(config: Config, body: unknown): Config {
  const { theme } = (body ?? {}) as Record<string, unknown>;
  if (!isTheme(theme)) {
    const reason: ApiErrorReason = { code: 'bad-theme' };
    throw new HttpError(400, 'theme must be dark or light', { reason });
  }
  return { ...config, theme };
}

export async function readSettings(deps: SettingsDeps): Promise<Settings> {
  return settingsOf(await readConfig(deps.fs, deps.home));
}

export async function writeSettings(deps: SettingsDeps, body: unknown): Promise<Settings> {
  const config = planSettings(await readConfig(deps.fs, deps.home), body);
  await writeConfig(deps.fs, deps.home, config);
  return settingsOf(config);
}
