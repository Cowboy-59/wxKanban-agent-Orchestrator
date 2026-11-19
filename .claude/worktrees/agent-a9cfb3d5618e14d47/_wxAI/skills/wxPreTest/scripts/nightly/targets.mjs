// Nightly Testing: the non-production rule and the hard refusal (SCOPE-140 FR-002).
//
// A nightly run refuses, before touching anything, when its database or its app address could be
// production. The rule has no override, by design:
//
//   - the app address must be on the UAT list and not on the Production list (the lists SPEC-138
//     keeps in docs-workspace/config.json `environments`);
//   - the database host must be on the UAT database list and not on the Production database list;
//   - when the kit boots the app itself (appMode "local", wxKanban's own runs), the database must
//     not be the project's own DATABASE_URL (in wxKanban that is production), nor share its host
//     and port, so a disposable copy can never sit inside the live instance. On a UAT server the
//     app is already deployed (appMode "deployed") and its own configuration names the UAT database;
//     the lists still apply;
//   - an address that cannot be read counts as production.
//
// The check reads configuration and environment only. It opens no connection.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// [SCOPE 140 / T002] BEGIN — Hard refusal: production or unlisted targets stop the run (FR-002)
/** The DATABASE_URL in the project's env file, read without printing it. Null when absent. */
export function projectDatabaseUrl(root) {
  const file = join(root, '.env');
  if (!existsSync(file)) return null;
  const m = /^\s*DATABASE_URL\s*=\s*(.+?)\s*$/m.exec(readFileSync(file, 'utf8'));
  return m ? m[1].replace(/^["']|["']$/g, '') : null;
}

/** { host, port } of a database URL, or null when it cannot be read. Never returns credentials. */
export function databaseEndpoint(raw) {
  try {
    const u = new URL(String(raw));
    if (!u.hostname) return null;
    const defaults = { 'postgres:': '5432', 'postgresql:': '5432', 'mysql:': '3306', 'mariadb:': '3306', 'sqlserver:': '1433', 'mssql:': '1433', 'mongodb:': '27017' };
    return { host: u.hostname.toLowerCase(), port: u.port || defaults[u.protocol] || '' };
  } catch {
    return null;
  }
}

const endpointKey = (e) => (e ? `${e.host}:${e.port}` : null);

/** Database list entries are host or host:port; a bare host matches any port. */
function onDatabaseList(endpoint, list) {
  return (list ?? []).some((entry) => {
    const [host, port] = String(entry).toLowerCase().split(':');
    return host === endpoint.host && (!port || port === endpoint.port);
  });
}

function onAddressList(raw, list) {
  let u;
  try {
    u = new URL(String(raw));
  } catch {
    return false;
  }
  const at = `${u.origin}${u.pathname}`;
  return (list ?? []).some((a) => at === a || at.startsWith(a.endsWith('/') ? a : `${a}/`) || u.origin === a);
}

/**
 * The refusal check. Returns { ok: true, database, app } or { ok: false, reasons: [...] }. The
 * reasons name the rule broken and the host, never a password or the full connection string.
 */
export function checkTargets({ databaseUrl, appUrl, environments, root = null, productionDatabaseUrl = undefined, appMode = 'local' }) {
  const reasons = [];
  const env = environments ?? {};
  if (!env.production?.length) reasons.push('no Production address list is configured (docs-workspace/config.json environments.production)');
  if (!['local', 'deployed'].includes(appMode)) reasons.push('nightly.appMode must be "local" or "deployed"');
  if (!env.uat?.length) reasons.push('no UAT address list is configured (environments.uat)');

  if (!appUrl) {
    reasons.push('no app address is configured (nightly.appUrl)');
  } else if (onAddressList(appUrl, env.production)) {
    reasons.push(`the app address ${safeOrigin(appUrl)} is on the Production list`);
  } else if (!onAddressList(appUrl, env.uat)) {
    reasons.push(`the app address ${safeOrigin(appUrl)} is not on the UAT list`);
  }

  const db = databaseEndpoint(databaseUrl);
  if (!databaseUrl) {
    reasons.push('no database is configured for the run (nightly.database)');
  } else if (!db) {
    reasons.push('the database address cannot be read, so it counts as production');
  } else {
    if (onDatabaseList(db, env.productionDatabases)) reasons.push(`the database host ${endpointKey(db)} is on the Production database list`);
    else if (!onDatabaseList(db, env.uatDatabases)) reasons.push(`the database host ${endpointKey(db)} is not on the UAT database list (environments.uatDatabases)`);
    const live = appMode !== 'local' ? null : productionDatabaseUrl !== undefined ? productionDatabaseUrl : root ? projectDatabaseUrl(root) : null;
    const liveEndpoint = databaseEndpoint(live);
    if (live && String(live) === String(databaseUrl)) reasons.push('the database is the project\'s own DATABASE_URL, which is treated as production');
    else if (liveEndpoint && endpointKey(liveEndpoint) === endpointKey(db)) {
      reasons.push(`the database shares ${endpointKey(db)} with the project's DATABASE_URL: a separate instance is required, not a schema inside the live one`);
    }
  }
  return reasons.length ? { ok: false, reasons } : { ok: true, database: endpointKey(db), app: safeOrigin(appUrl) };
}

function safeOrigin(raw) {
  try {
    return new URL(String(raw)).origin;
  } catch {
    return '(unreadable address)';
  }
}

/** The refusal message: one line per broken rule, and that there is no override. */
export function refusalText(result) {
  return [
    'Nightly run REFUSED before touching anything:',
    ...result.reasons.map((r) => `  - ${r}`),
    'There is no override. Point the run at a separate, non-production instance on the UAT lists.',
  ].join('\n');
}
// [SCOPE 140 / T002] END

// [SCOPE 140 / T002] BEGIN — wxKanban's own runs: a local Docker PostgreSQL, never the env file's URL
export const DOCKER_DB = { image: 'postgres:16-alpine', port: 55432, user: 'nightly', database: 'nightly' };

/**
 * The docker commands for a run's own PostgreSQL. The container is labelled with the run id so
 * cleanup removes exactly what this run created. The password is generated per run and passed in
 * the environment, never on the command line.
 */
export function dockerDatabasePlan(runId, { port = DOCKER_DB.port, image = DOCKER_DB.image } = {}) {
  const name = `wxnightly-${String(runId).replace(/[^a-z0-9-]/gi, '').toLowerCase()}`;
  return {
    name,
    start: ['docker', ['run', '-d', '--rm', '--name', name, '--label', `wxkanban.nightly.run=${runId}`, '-e', 'POSTGRES_PASSWORD', '-e', `POSTGRES_USER=${DOCKER_DB.user}`, '-e', `POSTGRES_DB=${DOCKER_DB.database}`, '-p', `127.0.0.1:${port}:5432`, image]],
    ready: ['docker', ['exec', name, 'pg_isready', '-U', DOCKER_DB.user, '-d', DOCKER_DB.database]],
    stop: ['docker', ['rm', '-f', name]],
    leftovers: ['docker', ['ps', '-aq', '--filter', `label=wxkanban.nightly.run=${runId}`]],
    url: (password) => `postgresql://${DOCKER_DB.user}:${encodeURIComponent(password)}@127.0.0.1:${port}/${DOCKER_DB.database}`,
    endpoint: `127.0.0.1:${port}`,
  };
}
// [SCOPE 140 / T002] END
