import { readFileSync, writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from "fs";
import { join, dirname } from "path";

export const RUNTIME_STATE_SCHEMA_VERSION = 1;
export const RUNTIME_STATE_PATH = ".wxai/kit-runtime.json";

export type ServiceName = "mcp" | "gateway";

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

// [SCOPE 027 / T001] BEGIN — core/runtime/state-file.ts — atomic read/write
export function readRuntimeState(projectRoot: string = process.cwd()): RuntimeState | null {
  const absPath = join(projectRoot, RUNTIME_STATE_PATH);
  if (!existsSync(absPath)) return null;
  let raw: string;
  try {
    raw = readFileSync(absPath, "utf-8");
  } catch {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const rec = parsed as Record<string, unknown>;
  if (rec["schemaVersion"] !== RUNTIME_STATE_SCHEMA_VERSION) return null;
  const services = (rec["services"] as RuntimeState["services"]) ?? {};
  return { schemaVersion: RUNTIME_STATE_SCHEMA_VERSION, services };
}
// [SCOPE 027 / T001] END

// [SCOPE 027 / T001] BEGIN — core/runtime/state-file.ts — atomic read/write
export function writeServiceEntry(
  name: ServiceName,
  entry: ServiceEntry,
  projectRoot: string = process.cwd(),
): void {
  const absPath = join(projectRoot, RUNTIME_STATE_PATH);
  const dir = dirname(absPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  const current = readRuntimeState(projectRoot) ?? {
    schemaVersion: RUNTIME_STATE_SCHEMA_VERSION,
    services: {},
  };
  current.services[name] = entry;
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(current, null, 2));
  renameSync(tmp, absPath);
}
// [SCOPE 027 / T001] END

// [SCOPE 027 / T001] BEGIN — core/runtime/state-file.ts — atomic read/write
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
    try {
      unlinkSync(absPath);
    } catch {
      // best effort
    }
    return;
  }
  const tmp = `${absPath}.tmp.${process.pid}`;
  writeFileSync(tmp, JSON.stringify(current, null, 2));
  renameSync(tmp, absPath);
}
// [SCOPE 027 / T001] END

// [SCOPE 027 / T001] BEGIN — core/runtime/state-file.ts — atomic read/write
export function isPidAlive(pid: number): boolean {
  if (!Number.isFinite(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ESRCH") return false;
    if (code === "EPERM") return true;
    return false;
  }
}
// [SCOPE 027 / T001] END
