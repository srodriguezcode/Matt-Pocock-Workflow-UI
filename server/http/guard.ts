import { HOOK_PATH, REWAKE_PATH } from '#server/session/constants.ts';

export interface GuardRequest {
  method: string;
  path: string;
  host: string | undefined;
  origin: string | undefined;
}

/** Paths a Session's hooks post to. A hook sends no Origin, and a browser's POST always does. */
const HOOK_PATHS = [HOOK_PATH, REWAKE_PATH];

/** True when `req` may reach `/api`. Under `dev`, port 4200 is also allowed: `ng serve` proxies `/api` with the browser's own Host/Origin. */
export function allowRequest(port: number, dev: boolean, req: GuardRequest): boolean {
  const ports = dev ? [port, 4200] : [port];
  const names = ['localhost', '127.0.0.1'];
  if (!hostAllowed(req.host, names, ports)) return false;
  if (req.method === 'GET' || req.method === 'HEAD') return true;
  if (HOOK_PATHS.includes(req.path) && req.origin === undefined) return true;
  return originAllowed(req.origin, names, ports);
}

function hostAllowed(host: string | undefined, names: string[], ports: number[]): boolean {
  if (!host) return false;
  const lower = host.toLowerCase();
  return names.some((name) => ports.some((port) => lower === `${name}:${port}`));
}

function originAllowed(origin: string | undefined, names: string[], ports: number[]): boolean {
  if (!origin) return false;
  const lower = origin.toLowerCase();
  return names.some((name) => ports.some((port) => lower === `http://${name}:${port}`));
}
