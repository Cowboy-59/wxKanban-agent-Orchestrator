/**
 * release-secret-gate.mjs — which files must never reach a kit release.
 *
 * sync-to-orchestrator.mjs mirrors the FILESYSTEM into a PUBLIC release, so a file that is
 * gitignored here still ships if it sits inside a mirrored directory. v1.7.83 and v1.7.84
 * shipped `wxkanban-agent/.wxai/.entitlement` (a signed per-developer token) that way.
 *
 * Two layers use this module, so one miss is loud rather than silent:
 *   1. copyFilter skips every secret-shaped name while mirroring (isSecretName).
 *   2. assertNoSecretPaths re-scans what was actually staged and fails the release.
 *
 * The rule is by NAME, matching what .gitignore already treats as secret. It is a denylist
 * on purpose: the question here is "what is dangerous", and the kit holds no legitimate file
 * with any of these names.
 */
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const EXACT_NAMES = new Set([
  '.entitlement',
  '.auth_token',
  '.mcp.json',
  'agent-room.json',
  'remote-session.lock',
  'cookies.txt',
  'login.json',
  'login-test.json',
  'token_response.json',
  // [SCOPE 143 / T026] agent-run metering: the per-machine token store, and a project's run log and
  // sent marker (usage data of the developer who built the kit, never the kit's to ship).
  'agentrun-tokens.json',
  'agentrun-log.jsonl',
  'agentrun-forwarded.txt',
  'agentrun-forward.lock',
]);

const SECRET_EXTENSIONS = ['.pem', '.key', '.p12', '.pfx'];
const ENV_EXAMPLES = new Set(['.env.example', '.env.sample', '.env.template']);

/** True when a file or folder with this base name must never be mirrored into a release. */
export function isSecretName(name) {
  const n = String(name).toLowerCase();
  if (EXACT_NAMES.has(n)) return true;
  if (n === '.env' || (n.startsWith('.env.') && !ENV_EXAMPLES.has(n))) return true;
  if (SECRET_EXTENSIONS.some((ext) => n.endsWith(ext))) return true;
  if (n.endsWith('.csv') && (n.includes('credentials') || n.includes('accesskeys'))) return true;
  return false;
}

/**
 * Every secret-shaped path under `dirs` (absolute), as paths relative to `base`.
 * Does not descend into node_modules or .git.
 */
export function findSecretPaths(dirs, base) {
  const found = [];
  const walk = (dir) => {
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name === 'node_modules' || e.name === '.git') continue;
      const p = join(dir, e.name);
      if (isSecretName(e.name)) { found.push(relative(base, p).split('\\').join('/')); continue; }
      if (e.isDirectory()) walk(p);
    }
  };
  for (const d of dirs) walk(d);
  return found.sort();
}
