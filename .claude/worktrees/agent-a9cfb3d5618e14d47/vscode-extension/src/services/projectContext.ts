import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Hosted MCP (spec 028) is the only MCP — no local server, no localhost fallback.
const HOSTED_MCP_BASE_URL = 'https://mcp.wxperts.com';

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
    | { projectId?: unknown; mcpBaseUrl?: unknown }
    | null;
  if (!wxk) return null;

  const projectId = typeof wxk.projectId === 'string' ? wxk.projectId : '';
  if (!UUID_RE.test(projectId)) return null; // rejects non-UUID + the test-project-123 fixture

  // Hosted MCP (spec 028) is the ONLY MCP — there is no local fallback.
  // Resolution: WXKANBAN_MCP_BASE_URL env override (staging) → project file
  // `mcpBaseUrl` → the hosted default. The legacy local-transport keys
  // (mcpHttpUrl/mcpHttpPort) are gone.
  const mcpBaseUrl =
    (typeof process.env.WXKANBAN_MCP_BASE_URL === 'string' && process.env.WXKANBAN_MCP_BASE_URL) ||
    (typeof wxk.mcpBaseUrl === 'string' && wxk.mcpBaseUrl) ||
    HOSTED_MCP_BASE_URL;

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
