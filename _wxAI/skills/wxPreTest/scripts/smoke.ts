// Smoke gate — boot the real application against a wxktest_ clone and prove the routes
// the scope touched respond without crashing.
//
//   npx tsx _wxAI/skills/wxPreTest/scripts/smoke.ts --schema wxktest_119_ab12 --scope 119
//
// WHY A REAL LISTENER AND NOT supertest
// supertest is not a dependency of this project — the test-plan skill assumed one that
// was never installed. Booting on an ephemeral port and driving it with built-in fetch
// adds nothing to package.json and exercises the actual HTTP stack rather than a
// synthetic request object.
//
// WHY THE ENV IS REWRITTEN BEFORE ANY IMPORT
// `src/db/client.ts` builds its Pool at module load from process.env.DATABASE_URL. By
// the time an import statement has run it is too late to redirect it. So the URL is
// rewritten first and the app is pulled in by dynamic import afterwards. This is the
// difference between the app talking to the clone and the app talking to PRODUCTION.
//
// Exit codes: 0 all routes healthy · 1 a route returned 5xx or the app failed to boot
//             · 2 refused (safety guard)

import "dotenv/config";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Server } from "node:http";

// [SCOPE 120 / T007] BEGIN — Guard the target schema and pin the app's pool to it
const PREFIX = "wxktest_";

const argv = process.argv.slice(2);
const arg = (f: string): string | null => {
  const i = argv.indexOf(`--${f}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
};

function refuse(msg: string): never {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

const schemaName = arg("schema");
const scope = arg("scope");

if (!schemaName) refuse("--schema is required");
if (!schemaName.startsWith(PREFIX)) {
  refuse(`"${schemaName}" does not start with "${PREFIX}" — the app is only ever pointed at a clone`);
}
if (!/^[a-z0-9_]+$/.test(schemaName)) refuse(`"${schemaName}" is not a safe identifier`);

/**
 * `options=-c search_path=…` is applied by the server to EVERY connection the pool
 * opens, unlike `SET search_path`, which only affects the one session that ran it. A
 * pool is precisely the case where `SET` is not enough.
 */
{
  const raw = process.env.DATABASE_URL;
  if (!raw) refuse("no DATABASE_URL in the environment");
  const u = new URL(raw);
  u.searchParams.set("options", `-c search_path=${schemaName},public`);
  process.env.DATABASE_URL = u.toString();
}
// [SCOPE 120 / T007] END

// [SCOPE 120 / T007] BEGIN — Discover the routes this scope touched, from its fences
interface Discovered {
  file: string;
  mount: string;
  method: string;
  path: string;
  full: string;
}

const ROUTES_DIR = "src/server/routes";

/**
 * Fences are the traceability spine (spec 026), so "which routes did this scope touch"
 * is answerable without guessing: the files carrying `[SCOPE NNN /` are exactly the ones
 * that scope authored or modified.
 */
function discoverRoutes(scopeNum: string): Discovered[] {
  const fence = new RegExp(`\\[SCOPE\\s+0*${Number(scopeNum)}\\s*/`, "i");
  const appSrc = readFileSync("src/server/app.ts", "utf8");

  const found: Discovered[] = [];
  for (const file of readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".ts"))) {
    const full = join(ROUTES_DIR, file);
    const src = readFileSync(full, "utf8");
    if (!fence.test(src)) continue;

    // `import consultantCustomersRoutes from "./routes/consultantCustomers.js";`
    const base = file.replace(/\.ts$/, "");
    const importMatch = appSrc.match(
      new RegExp(`import\\s+(\\w+)\\s+from\\s+["']\\./routes/${base}\\.js["']`),
    );
    if (!importMatch) continue;

    // `app.use("/api/consultant", consultantCustomersRoutes);`
    const mountMatch = appSrc.match(
      new RegExp(`app\\.use\\(\\s*["']([^"']+)["']\\s*,\\s*${importMatch[1]}\\b`),
    );
    if (!mountMatch) continue;
    const mount = mountMatch[1];

    for (const m of src.matchAll(/router\.(get|post|put|patch|delete)\(\s*["']([^"']+)["']/g)) {
      const [, method, path] = m;
      found.push({
        file: full,
        mount,
        method: method.toUpperCase(),
        path,
        full: (mount + path).replace(/\/+$/, "") || "/",
      });
    }
  }
  return found;
}
// [SCOPE 120 / T007] END

// [SCOPE 120 / T007] BEGIN — Drive the routes and report
async function main(): Promise<void> {
  const { createApp } = await import("../../../../src/server/app.js");
  const { signToken } = await import("../../../../src/server/lib/jwt.js");
  const { BASE_IDS } = await import("../../../../tests/seeds/_base/seed.js");

  const token = signToken(BASE_IDS.consultant, "consultant@pretest.invalid", {
    companyid: BASE_IDS.company,
    usertype: "TEAM_MANAGER",
    billingplan: "CONSULTANT",
    subscriptionstatus: "ACTIVE",
    maxusers: 25,
  });

  const app = createApp();
  const server: Server = await new Promise((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  const { port } = server.address() as { port: number };
  console.log(`[smoke] app booted on :${port}, pool pinned to ${schemaName}`);

  const all = scope ? discoverRoutes(scope) : [];
  if (scope && all.length === 0) {
    console.log(`[smoke] no fenced routes found for scope ${scope}`);
  }

  // Smoke is read-only by definition: it proves nothing crashes, not that writes work.
  // Mutating verbs and :param routes belong to gate 2, which has seeded ids to use.
  const targets = all.filter((r) => r.method === "GET" && !r.path.includes(":"));
  const deferred = all.filter((r) => !(r.method === "GET" && !r.path.includes(":")));

  const results: { route: string; status: number | string; ok: boolean }[] = [];
  for (const r of targets) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}${r.full}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      });
      // 4xx is a healthy answer here — the route responded. Only 5xx is a smoke failure.
      const ok = res.status < 500;
      results.push({ route: `${r.method} ${r.full}`, status: res.status, ok });
      console.log(`  ${ok ? "✅" : "❌"} ${res.status}  ${r.method} ${r.full}`);
    } catch (err) {
      results.push({ route: `${r.method} ${r.full}`, status: "ERR", ok: false });
      console.log(`  ❌ ERR  ${r.method} ${r.full} — ${(err as Error).message}`);
    }
  }

  await new Promise<void>((resolve) => server.close(() => resolve()));

  const failed = results.filter((r) => !r.ok);
  console.log("");
  console.log(
    `[smoke] ${results.length} route(s) driven, ${failed.length} failing, ` +
      `${deferred.length} deferred to gate 2 (mutating or parameterised)`,
  );
  console.log(JSON.stringify({ schema: schemaName, scope, driven: results.length, failed: failed.length, results }));

  // Closing the server is not enough to end the process: the application's own pg Pool
  // holds open sockets, and an idle pool keeps the event loop alive indefinitely. A gate
  // that finishes its work and then hangs forever is indistinguishable from a gate that
  // is still running — in CI it burns the job timeout and reports nothing.
  const { pool } = await import("../../../../src/db/client.js");
  await pool.end().catch(() => undefined);

  // Let libuv finish closing what pool.end() just released. Calling process.exit()
  // immediately races that teardown and trips an assertion in libuv's Windows async
  // handling ("!(handle->flags & UV_HANDLE_CLOSING)"), which aborts the process with a
  // native crash — turning a passing gate into a spurious failure.
  await new Promise<void>((resolve) => setTimeout(resolve, 100));

  // Anything still holding the loop open (schedulers, keep-alive agents) must not be
  // able to swallow the result now that it has been reported.
  process.exit(failed.length > 0 ? 1 : 0);
}

await main();
// [SCOPE 120 / T007] END
