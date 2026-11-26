import { ok, type Handler } from '#server/http/types.ts';
import { readSettings, writeSettings } from './settings.ts';

export const settingsRoute: Handler = async (deps) => ok(await readSettings(deps));

/** `PUT /api/settings` `Settings` → the saved `Settings`. */
export const saveSettingsRoute: Handler = async (deps, req) =>
  ok(await writeSettings(deps, req.body));
