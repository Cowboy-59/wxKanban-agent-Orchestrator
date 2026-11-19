import { describe, it, expect, beforeAll } from "vitest";
import { signToken } from "../../src/server/lib/jwt.js";
import { db } from "../../src/db/client.js";
import { companyprojects, projectusers, userprofiles } from "../../src/db/schema/index.js";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Endpoint-level coverage for the consultant surface (SPEC-017 + SCOPE-119).
 *
 * WHY THIS EXISTS
 * ---------------
 * `GET /api/consultant/dashboard` shipped 2026-07-31 with a green build, a green
 * typecheck and a green 734-test suite, and contained TWO independent fatal bugs
 * in the same handler:
 *
 *   1. sql`= ANY(${jsArray})` — drizzle emits a parenthesised bind-param list, so
 *      Postgres received a scalar and tried array_in    -> 22P02
 *   2. raw Date objects interpolated into a `sql` template — no column type to
 *      encode against, so the driver got a Date         -> ERR_INVALID_ARG_TYPE
 *
 * Neither was reachable by a unit test, because nothing ever executed the
 * handler. Fixing (1) only revealed (2). One test that actually calls the route
 * collapses that serial hunt into a single run.
 *
 * The rule this encodes: every new or changed feature gets a test that exercises
 * the real endpoint, not only its parts.
 *
 * SAFETY: every request here is a GET. This suite creates no rows. It picks a
 * real consultant who already has at least one project, because the bugs above
 * only fire on a non-empty project list — a fixture-empty account would pass
 * while production burned.
 *
 * Requires the dev server on :3001 and a valid DATABASE_URL/JWT_SECRET. Skips
 * itself cleanly when either is absent rather than failing the suite.
 */

const API = "http://localhost:3001/api/consultant";

let token: string | null = null;
let subjectLabel = "";

// [SCOPE 017 / T150] BEGIN — is the dev server answering?
async function serverUp(): Promise<boolean> {
  try {
    const r = await fetch(`${API}/dashboard`, { signal: AbortSignal.timeout(3000) });
    return r.status === 401 || r.ok; // 401 = up and gating correctly
  } catch {
    return false;
  }
}
// [SCOPE 017 / T150] END

beforeAll(async () => {
  if (!(await serverUp())) return;

  // A user who owns or is an active member of >= 1 ACTIVE project. This is the
  // population the shipped bugs actually affected.
  const [subject] = await db
    .select({
      userid: userprofiles.id,
      email: userprofiles.emailaddr,
      usertype: userprofiles.usertype,
      companyid: companyprojects.companyid,
      projects: sql<number>`COUNT(DISTINCT ${companyprojects.id})::int`,
    })
    .from(userprofiles)
    .innerJoin(
      companyprojects,
      and(eq(companyprojects.companyid, userprofiles.companyid), eq(companyprojects.status, "ACTIVE")),
    )
    .leftJoin(
      projectusers,
      and(
        eq(projectusers.projectid, companyprojects.id),
        eq(projectusers.userid, userprofiles.id),
        isNull(projectusers.removedat),
      ),
    )
    .where(sql`(${companyprojects.userid} = ${userprofiles.id} OR ${projectusers.id} IS NOT NULL)`)
    .groupBy(userprofiles.id, userprofiles.emailaddr, userprofiles.usertype, companyprojects.companyid)
    .having(sql`COUNT(DISTINCT ${companyprojects.id}) > 0`)
    .limit(1);

  if (!subject) return;

  subjectLabel = `${subject.email} — ${subject.usertype}, ${subject.projects} project(s)`;
  // The subject's real usertype, not a hardcoded one: role affects what these
  // handlers return, and a test that silently promotes its subject to ADMIN
  // proves nothing about the account that actually hit the bug.
  token = signToken(subject.userid, subject.email, {
    companyid: subject.companyid,
    usertype: subject.usertype,
    billingplan: "CONSULTANT",
    subscriptionstatus: "ACTIVE",
    maxusers: 10,
  });
}, 30_000);

// [SCOPE 017 / T150] BEGIN — bearer header for the minted subject token
function auth() {
  return { headers: { Authorization: `Bearer ${token}` } };
}
// [SCOPE 017 / T150] END

describe("consultant surface — real endpoints, real data", () => {
  it("has a subject with at least one project (the case the bugs needed)", () => {
    if (!token) {
      console.warn("SKIP: server down, or no user with an active project");
      return;
    }
    expect(subjectLabel).not.toBe("");
  });

  it("GET /dashboard returns 200 and a fully-shaped payload", async () => {
    if (!token) return;
    const res = await fetch(`${API}/dashboard`, auth());
    const body = await res.json();

    // Surface the server's message rather than a bare "expected 200, got 500".
    expect(res.status, `dashboard failed: ${JSON.stringify(body)}`).toBe(200);

    // Every field the client reads. A missing key here is a client crash.
    for (const key of [
      "todayminutes",
      "todayentrycount",
      "weekminutes",
      "weekbillableminutes",
      "periodearnings",
      "unbilledminutes",
      "periodstart",
      "periodend",
      "projects",
      "alerts",
    ]) {
      expect(body, `missing "${key}"`).toHaveProperty(key);
    }
    expect(Array.isArray(body.projects)).toBe(true);
    expect(Array.isArray(body.alerts)).toBe(true);

    // The ledger aggregates must be numbers, not the strings a failed
    // COALESCE/cast would leave behind.
    expect(typeof body.todayminutes).toBe("number");
    expect(typeof body.weekminutes).toBe("number");
  });

  it("GET /dashboard/connection-health returns 200 and a counted roll-up", async () => {
    if (!token) return;
    const res = await fetch(`${API}/dashboard/connection-health`, auth());
    const body = await res.json();
    expect(res.status, `connection-health failed: ${JSON.stringify(body)}`).toBe(200);
    for (const key of ["total", "healthy", "warning", "error", "unknown"]) {
      expect(body, `missing "${key}"`).toHaveProperty(key);
    }
  });

  it("GET /customers returns 200 and a list", async () => {
    if (!token) return;
    const res = await fetch(`${API}/customers`, auth());
    const body = await res.json();
    expect(res.status, `customers failed: ${JSON.stringify(body)}`).toBe(200);
    expect(Array.isArray(body.customers)).toBe(true);
  });

  it("GET /customers/:id/connections returns 200 for a real customer", async () => {
    if (!token) return;
    const list = await (await fetch(`${API}/customers`, auth())).json();
    const first = list.customers?.[0];
    if (!first) {
      console.warn("SKIP: no customers for this consultant");
      return;
    }
    const res = await fetch(`${API}/customers/${first.id}/connections`, auth());
    const body = await res.json();
    expect(res.status, `connections failed: ${JSON.stringify(body)}`).toBe(200);
    expect(Array.isArray(body.connections)).toBe(true);
  });

  it("rejects an unauthenticated caller on every route", async () => {
    for (const path of ["/dashboard", "/dashboard/connection-health", "/customers"]) {
      const res = await fetch(`${API}${path}`);
      expect(res.status, `${path} should require auth`).toBe(401);
    }
  });
});
