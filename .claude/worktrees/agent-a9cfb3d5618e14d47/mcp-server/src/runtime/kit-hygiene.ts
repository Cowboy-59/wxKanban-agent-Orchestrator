import { createServer, Server as NetServer } from 'net';
import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';

export const RUNTIME_STATE_SCHEMA_VERSION = 1;
export const RUNTIME_STATE_PATH = '.wxai/kit-runtime.json';
export const DEFAULT_PORT_SCAN_RANGE = 50;
export const DEFAULT_WATCHER_INTERVAL_MS = 2000;
export const MISS_THRESHOLD_FOR_FIRE = 2;

export type ServiceName = 'mcp' | 'gateway';

export interface ServiceEntry {
  port: number;
  pid: number;
  parentpid: number;
  startedAt: string;
  cmd: string;
}

export interface RuntimeState {
  schemaVersion: number;
  services: Partial<Record<ServiceName, ServiceEntry>>;
}

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function readRuntimeState(projectRoot: string = process.cwd()): RuntimeState | null {
  const absPath = join(projectRoot, RUNTIME_STATE_PATH);
  if (!existsSync(absPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(absPath, 'utf-8');
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== 'object') return null;
  const rec = parsed as Record<string, unknown>;
  if (rec['schemaVersion'] !== RUNTIME_STATE_SCHEMA_VERSION) return null;
  const services = (rec['services'] as RuntimeState['services']) ?? {};
  return { schemaVersion: RUNTIME_STATE_SCHEMA_VERSION, services };
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function writeServiceEntry(
  name: ServiceName,
  entry: ServiceEntry,
  projectRoot: string = process.cwd(),
): void {
  const absPath = join(projectRoot, RUNTIME_STATE_PATH);
  const dir = dirname(absPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const current = readRuntimeState(projectRoot) ?? {
    schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
    services: {},
  };
  current.services[name] = entry;
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(current, null, 2));
  renameSync(tmp, absPath);
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function removeServiceEntry(
  name: ServiceName,
  projectRoot: string = process.cwd(),
): void {
  const absPath = join(projectRoot, RUNTIME_STATE_PATH);
  if (!existsSync(absPath)) return;
  const current = readRuntimeState(projectRoot);
  if (!current) return;
  delete current.services[name];
  if (Object.keys(current.services).length === 0) {
    try { unlinkSync(absPath); } catch { /* best effort */ }
    return;
  }
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(current, null, 2));
  renameSync(tmp, absPath);
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === 'ESRCH') return false;
    if (code === 'EPERM') return true;
    return false;
  }
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export class PortRangeExhaustedError extends Error {
  constructor(
    public readonly preferredPort: number,
    public readonly scanRange: number,
  ) {
    super(`Cannot find a free port in range ${preferredPort}–${preferredPort + scanRange - 1}.`);
    this.name = 'PortRangeExhaustedError';
  }
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export async function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const probe: NetServer = createServer();
    probe.once('error', () => resolve(false));
    probe.once('listening', () => probe.close(() => resolve(true)));
    probe.listen(port, '127.0.0.1');
  });
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export async function findFreePort(
  preferredPort: number,
  scanRange: number = DEFAULT_PORT_SCAN_RANGE,
): Promise<number> {
  for (let offset = 0; offset < scanRange; offset++) {
    const candidate = preferredPort + offset;
    if (await isPortFree(candidate)) return candidate;
  }
  throw new PortRangeExhaustedError(preferredPort, scanRange);
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function resolveParentPid(): number {
  const env = process.env['KIT_PARENT_PID'];
  if (env) {
    const parsed = parseInt(env, 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return process.ppid;
}
// [SCOPE 027 / T008] END

// [SCOPE 027 / T008] BEGIN — mcp-server kit hygiene helpers
export function startParentWatcher(
  parentpid: number,
  onParentGone: () => void,
  opts: { intervalMs?: number; missThreshold?: number } = {},
): { stop(): void } {
  // Container/server deployments (App Runner, ECS, Fargate, etc.) run the Node
  // process as PID 1, which makes process.ppid return 0. The watcher would fire
  // immediately and kill the production service. Skip when MCP_SKIP_PARENT_WATCHER
  // is set, or when running as PID 1 with no real parent.
  const skipEnv = process.env['MCP_SKIP_PARENT_WATCHER'];
  if (skipEnv === 'true' || skipEnv === '1') {
    return { stop(): void { /* no-op */ } };
  }
  if (process.pid === 1 && (parentpid === 0 || parentpid === 1)) {
    return { stop(): void { /* no-op */ } };
  }
  const intervalMs = opts.intervalMs ?? DEFAULT_WATCHER_INTERVAL_MS;
  const missThreshold = opts.missThreshold ?? MISS_THRESHOLD_FOR_FIRE;
  let misses = 0;
  let stopped = false;

  const handle = setInterval(() => {
    if (stopped) return;
    if (isPidAlive(parentpid)) {
      misses = 0;
      return;
    }
    misses += 1;
    if (misses >= missThreshold) {
      stopped = true;
      clearInterval(handle);
      try { onParentGone(); } catch { /* swallow */ }
    }
  }, intervalMs);

  if (typeof handle.unref === 'function') handle.unref();

  return {
    stop(): void {
      if (stopped) return;
      stopped = true;
      clearInterval(handle);
    },
  };
}
// [SCOPE 027 / T008] END
