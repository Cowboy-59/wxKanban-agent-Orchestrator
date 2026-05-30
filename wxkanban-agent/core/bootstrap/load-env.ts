// Shared bootstrap — load the project's .env files into process.env.
//
// The kit CLIs run as plain `node`/`tsx` with no dotenv preloaded, so
// WXKANBAN_API_TOKEN (and friends) would otherwise be missing and every hub
// call would be unauthenticated. Both the standalone `dbpush` runner AND the
// command gateway (`wxkanban-agent <cmd>`) need this, so it lives here rather
// than duplicated per entry point.
//
// Dependency-free (no `dotenv` import) and conservative: only fills keys that
// aren't already set, so a real environment variable always wins.
//
// Reported in Bug-reports/BUG-REPORT-kit-dbpush-tls-and-packaging.md (Issue 4).
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function applyEnvFile(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    if (process.env[key] !== undefined) continue;
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

export function loadProjectEnv(root: string = process.cwd()): void {
  applyEnvFile(path.resolve(root, '.env'));
  applyEnvFile(path.resolve(root, 'mcp-server', '.env'));
}
