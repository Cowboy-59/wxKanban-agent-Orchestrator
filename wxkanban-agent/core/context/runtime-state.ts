import {
  readRuntimeState,
  isPidAlive,
  ServiceName,
} from "../runtime/state-file";

export const DEFAULT_PORTS: Record<ServiceName, number> = {
  mcp: 3002,
  gateway: 3003,
};

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
    const explicit = env["MCP_BASE_URL"] || env["MCP_HTTP_URL"];
    if (explicit && explicit.length > 0) return explicit;
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
