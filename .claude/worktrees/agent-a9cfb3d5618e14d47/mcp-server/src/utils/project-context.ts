import * as fs from 'fs';
import * as path from 'path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectContextResolution {
  projectId?: string;
  source: 'args' | 'token' | 'env' | 'file' | 'none';
  projectFilePath?: string;
}

function isValidUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_REGEX.test(value);
}

function findProjectFile(startDir: string): string | undefined {
  let currentDir = startDir;
  const root = path.parse(currentDir).root;

  while (true) {
    const candidate = path.join(currentDir, '.wxkanban-project.json');
    if (fs.existsSync(candidate)) {
      return candidate;
    }

    if (currentDir === root) {
      break;
    }

    currentDir = path.dirname(currentDir);
  }

  return undefined;
}

function readProjectIdFromFile(filePath: string): string | undefined {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as { projectId?: unknown };
    if (isValidUuid(parsed.projectId)) {
      return parsed.projectId;
    }
  } catch {
    // Ignore parse/read failures and return undefined
  }

  return undefined;
}

/**
 * Resolve project context with priority (SCOPE-097 / FR-001, FR-004):
 * 1) explicit tool args projectId
 * 2) the authenticated token's project (`tokenProjectId`) — the caller's real
 *    project, resolved by the auth middleware. This is the authoritative default
 *    for hosted, token-authenticated calls; it MUST rank above env + file so a
 *    token-only call never inherits the server container's own project.
 * 3) WXKANBAN_PROJECT_ID env
 * 4) .wxkanban-project.json walking up from provided cwd (or process.cwd())
 *
 * `tokenProjectId` is undefined under dev-bypass / no-token (local) runs, so the
 * env → file fallback is preserved unchanged for that path.
 */
export function resolveProjectContext(
  args: Record<string, unknown> | undefined,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv; tokenProjectId?: string }
): ProjectContextResolution {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();

  const fromArgs = args?.projectId;
  if (isValidUuid(fromArgs)) {
    return { projectId: fromArgs, source: 'args' };
  }

  const fromToken = options?.tokenProjectId;
  if (isValidUuid(fromToken)) {
    return { projectId: fromToken, source: 'token' };
  }

  const fromEnv = env.WXKANBAN_PROJECT_ID;
  if (isValidUuid(fromEnv)) {
    return { projectId: fromEnv, source: 'env' };
  }

  const projectFilePath = findProjectFile(cwd);
  if (projectFilePath) {
    const projectId = readProjectIdFromFile(projectFilePath);
    if (projectId) {
      return { projectId, source: 'file', projectFilePath };
    }
  }

  return { source: 'none' };
}
