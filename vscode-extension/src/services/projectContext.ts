import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectContext {
  projectRoot: string;
  projectId: string;
  mcpBaseUrl: string;
  lifecycleStage?: string;
  activeScope?: string;
}

// [SCOPE 042 / T011] BEGIN — resolveProjectContext (mirrors server precedence; multi-root aware)
// T011 + T015 — walk the workspace folders and return the first that carries a
// valid .wxkanban-project.json. Mirrors mcp-server's resolveProjectContext
// precedence (file projectId), validates the UUID, and rejects the stale
// tools/ test fixture (projectId 'test-project-123', which fails UUID_RE).
export function resolveProjectContext(folderPaths: string[]): ProjectContext | null {
  for (const root of folderPaths) {
    const ctx = readProjectAt(root);
    if (ctx) return ctx;
  }
  return null;
}
// [SCOPE 042 / T011] END

// [SCOPE 042 / T011] BEGIN — readProjectAt (single-folder resolver + T012 lifecycle read)
function readProjectAt(root: string): ProjectContext | null {
  const wxk = readJson(join(root, '.wxkanban-project.json')) as
    | { projectId?: unknown; mcpBaseUrl?: unknown; mcpHttpUrl?: unknown; mcpHttpPort?: unknown }
    | null;
  if (!wxk) return null;

  const projectId = typeof wxk.projectId === 'string' ? wxk.projectId : '';
  if (!UUID_RE.test(projectId)) return null; // rejects non-UUID + the test-project-123 fixture

  // Hosted MCP (spec 028): init.mjs + kit core write the endpoint under
  // `mcpBaseUrl` (e.g. https://mcp.wxperts.com). Prefer it. `mcpHttpUrl` /
  // `mcpHttpPort` are the legacy local-transport keys (pre-028); keep them as
  // fallbacks for old project files. localhost:3004 is the last-ditch dev
  // default — there is no local MCP in the hosted model.
  const mcpBaseUrl =
    typeof wxk.mcpBaseUrl === 'string'
      ? wxk.mcpBaseUrl
      : typeof wxk.mcpHttpUrl === 'string'
        ? wxk.mcpHttpUrl
        : typeof wxk.mcpHttpPort === 'number'
          ? `http://localhost:${wxk.mcpHttpPort}`
          : 'http://localhost:3004';

  // T012 — lifecycle stage + active scope live in .wxai/project.json (optional).
  const wxai = readJson(join(root, '.wxai', 'project.json')) as
    | { lifecycleStage?: string; activeScope?: string }
    | null;

  return {
    projectRoot: root,
    projectId,
    mcpBaseUrl,
    lifecycleStage: wxai?.lifecycleStage,
    activeScope: wxai?.activeScope,
  };
}
// [SCOPE 042 / T011] END

// [SCOPE 042 / T011] BEGIN — readJson (safe JSON file reader)
function readJson(path: string): unknown {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return null;
  }
}
// [SCOPE 042 / T011] END
