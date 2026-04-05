import * as fs from 'fs';
import * as path from 'path';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ProjectContextResolution {
  projectId?: string;
  source: 'args' | 'env' | 'file' | 'none';
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
 * Resolve project context with priority:
 * 1) explicit tool args projectId
 * 2) WXKANBAN_PROJECT_ID env
 * 3) .wxkanban-project.json walking up from provided cwd (or process.cwd())
 */
export function resolveProjectContext(
  args: Record<string, unknown> | undefined,
  options?: { cwd?: string; env?: NodeJS.ProcessEnv }
): ProjectContextResolution {
  const env = options?.env ?? process.env;
  const cwd = options?.cwd ?? process.cwd();

  const fromArgs = args?.projectId;
  if (isValidUuid(fromArgs)) {
    return { projectId: fromArgs, source: 'args' };
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
