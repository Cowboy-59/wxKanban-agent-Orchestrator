import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  readRuntimeState,
  reapDeadEntries,
  isPidAlive,
  ServiceName,
} from "../runtime/state-file";

export const DEFAULT_PORTS: Record<ServiceName, number> = {
  gateway: 3003,
};

// [SCOPE 068 / FR-005] BEGIN — deterministic per-project preferred port
// Two projects on one machine must not prefer the same port. Derive a stable
// per-project port from the projectId (FNV-1a hash) within a band above the
// base, so collisions are deterministic and rare; bindWithAutoselect still
// scans on an actual collision, and GATEWAY_HTTP_PORT still overrides.
const GATEWAY_PORT_RANGE = 1000;
export function derivePreferredPort(
  projectId: string | null | undefined,
  base: number = DEFAULT_PORTS.gateway,
  range: number = GATEWAY_PORT_RANGE,
): number {
  if (!projectId) return base;
  let h = 0x811c9dc5;
  for (let i = 0; i < projectId.length; i++) {
    h ^= projectId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return base + (Math.abs(h) % range);
}
// [SCOPE 068 / FR-005] END

// Hosted MCP (spec 028) is the ONLY MCP. There is no local MCP — the kit and
// extension always talk to this endpoint unless a staging override is set.
export const HOSTED_MCP_BASE_URL = "https://mcp.wxperts.com";

// [SCOPE 042 / T035] BEGIN — resolveMcpBaseUrl (hosted-only, no localhost)
// MCP is never a locally-tracked service. Resolution: explicit env override
// (staging) → kit.mcpBaseUrl (.wxai/project.json) → .wxkanban-project.json
// mcpBaseUrl → hosted default. Never falls back to a local port.
export function resolveMcpBaseUrl(opts: ResolveOptions = {}): string {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const env = opts.env ?? process.env;

  const explicit =
    env["WXKANBAN_MCP_BASE_URL"] || env["MCP_BASE_URL"] || env["MCP_HTTP_URL"];
  if (explicit && explicit.length > 0) return explicit;

  const kitUrl = readKitMcpBaseUrl(projectRoot);
  if (kitUrl) return kitUrl;

  const projectFileUrl = readWxkanbanProjectMcpBaseUrl(projectRoot);
  if (projectFileUrl) return projectFileUrl;

  return HOSTED_MCP_BASE_URL;
}
// [SCOPE 042 / T035] END

// [SCOPE 028 / T019] BEGIN — Read `.wxai/project.json` kit block for hosted-MCP base URL
function readKitMcpBaseUrl(projectRoot: string): string | null {
  const path = join(projectRoot, ".wxai", "project.json");
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf-8")) as {
      kit?: { mcpBaseUrl?: unknown };
    };
    const v = json?.kit?.mcpBaseUrl;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
// [SCOPE 028 / T019] END

// [SCOPE 028 / T019] BEGIN — readWxkanbanProjectMcpBaseUrl (hosted-MCP URL fallback)
// init.mjs (v1.2.x) writes the hosted-MCP URL to `.wxkanban-project.json`
// at the project root rather than `.wxai/project.json`. Honour that file
// as an additional fallback so dbpush and friends pick up the hosted
// endpoint without requiring MCP_BASE_URL to be exported in every shell.
function readWxkanbanProjectMcpBaseUrl(projectRoot: string): string | null {
  const path = join(projectRoot, ".wxkanban-project.json");
  if (!existsSync(path)) return null;
  try {
    const json = JSON.parse(readFileSync(path, "utf-8")) as {
      mcpBaseUrl?: unknown;
    };
    const v = json?.mcpBaseUrl;
    return typeof v === "string" && v.length > 0 ? v : null;
  } catch {
    return null;
  }
}
// [SCOPE 028 / T019] END

export interface ResolveOptions {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
}

// [SCOPE 027 / T005] BEGIN — core/context/runtime-state.ts — resolveServiceUrl
// MODIFIED-BY: [SCOPE 068 / FR-001] — fail closed (null) instead of falling
// back to a shared default port; reap dead entries on read.
/**
 * Resolve the URL of a locally-started service (the gateway) for THIS project.
 * Returns null when no gateway is running for `projectRoot` (and no explicit
 * GATEWAY_HTTP_PORT override) — callers must treat null as "no gateway running
 * — start one" and MUST NOT fall back to a shared default port, which on a
 * multi-project machine belongs to an unrelated project (SCOPE-068 D1).
 */
export function resolveServiceUrl(
  service: ServiceName,
  opts: ResolveOptions = {},
): string | null {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const env = opts.env ?? process.env;

  // [SCOPE 068 / FR-004] reap dead entries on read so a crashed gateway is
  // never trusted as running.
  const state = reapDeadEntries(projectRoot);
  const entry = state?.services[service];
  if (entry && isPidAlive(entry.pid)) {
    return `http://localhost:${entry.port}`;
  }

  // Explicit override remains an escape hatch (e.g. a manually-started gateway).
  if (service === "gateway") {
    const portEnv = env["GATEWAY_HTTP_PORT"];
    if (portEnv) {
      const parsed = parseInt(portEnv, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return `http://localhost:${parsed}`;
      }
    }
  }

  // [SCOPE 068 / FR-001] fail closed — no shared-default-port fallback.
  return null;
}
// [SCOPE 027 / T005] END

// [SCOPE 027 / T005] BEGIN — core/context/runtime-state.ts — resolveServicePort
// MODIFIED-BY: [SCOPE 068 / FR-001] — returns null when no gateway is running.
export function resolveServicePort(
  service: ServiceName,
  opts: ResolveOptions = {},
): number | null {
  const url = resolveServiceUrl(service, opts);
  if (!url) return null;
  const match = url.match(/:(\d+)(?:\/|$)/);
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}
// [SCOPE 027 / T005] END
