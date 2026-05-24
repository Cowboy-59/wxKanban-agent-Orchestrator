import { existsSync, readFileSync } from "fs";
import { join } from "path";
import {
  readRuntimeState,
  isPidAlive,
  ServiceName,
} from "../runtime/state-file";

export const DEFAULT_PORTS: Record<ServiceName, number> = {
  mcp: 3002,
  gateway: 3003,
};

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

export interface ResolveOptions {
  projectRoot?: string;
  env?: NodeJS.ProcessEnv;
}

// [SCOPE 027 / T005] BEGIN — core/context/runtime-state.ts — resolveServiceUrl
export function resolveServiceUrl(
  service: ServiceName,
  opts: ResolveOptions = {},
): string {
  const projectRoot = opts.projectRoot ?? process.cwd();
  const env = opts.env ?? process.env;

  const state = readRuntimeState(projectRoot);
  const entry = state?.services[service];
  if (entry && isPidAlive(entry.pid)) {
    return `http://localhost:${entry.port}`;
  }

  if (service === "mcp") {
    const explicit =
      env["MCP_BASE_URL"] ||
      env["MCP_HTTP_URL"] ||
      env["WXKANBAN_MCP_BASE_URL"];
    if (explicit && explicit.length > 0) return explicit;

    // Spec 028 / T019 — .wxai/project.json kit.mcpBaseUrl takes precedence
    // over the legacy port-derived default. Runtime-state (live local MCP)
    // and explicit env override it; everything else falls through to it.
    const kitUrl = readKitMcpBaseUrl(projectRoot);
    if (kitUrl) return kitUrl;

    // init.mjs writes the URL here too (separate from .wxai/project.json).
    // Final fallback before the legacy port-derived default.
    const projectFileUrl = readWxkanbanProjectMcpBaseUrl(projectRoot);
    if (projectFileUrl) return projectFileUrl;

    const portEnv = env["MCP_HTTP_PORT"];
    if (portEnv) {
      const parsed = parseInt(portEnv, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return `http://localhost:${parsed}`;
      }
    }
  }

  if (service === "gateway") {
    const portEnv = env["GATEWAY_HTTP_PORT"];
    if (portEnv) {
      const parsed = parseInt(portEnv, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        return `http://localhost:${parsed}`;
      }
    }
  }

  return `http://localhost:${DEFAULT_PORTS[service]}`;
}
// [SCOPE 027 / T005] END

// [SCOPE 027 / T005] BEGIN — core/context/runtime-state.ts — resolveServiceUrl
export function resolveServicePort(
  service: ServiceName,
  opts: ResolveOptions = {},
): number {
  const url = resolveServiceUrl(service, opts);
  const match = url.match(/:(\d+)(?:\/|$)/);
  if (match && match[1]) {
    const parsed = parseInt(match[1], 10);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return DEFAULT_PORTS[service];
}
// [SCOPE 027 / T005] END
