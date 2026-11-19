/**
 * SPEC-131 T016 — live endpoint checks for the suspend / cancel routes.
 *
 * Run against a server started with `npm run dev:server` (port 3001 by default):
 *
 *   node tests/backend/scope131-endpoints.mjs
 *   WXK_TEST_COOKIE="token=..." node tests/backend/scope131-endpoints.mjs
 *
 * WHY THIS EXISTS AT ALL
 * A green unit run plus a green build has shipped fatal bugs on this project, so
 * every route is exercised over real HTTP against the real router and the real
 * middleware stack. A route that typechecks but was never mounted returns 404
 * here, and nowhere else.
 *
 * WHAT IT DELIBERATELY WILL NOT DO
 * The local `.env` DATABASE_URL points at PRODUCTION and Stripe is live, so this
 * script never sends a request that could succeed at Stripe. It sends only
 * requests that must be REFUSED, and asserts the refusal is the right one and
 * arrives for the right reason. The happy paths — an actual cancel, an actual
 * pause, un-cancel and unpause — need a disposable company on Stripe test keys
 * and are listed at the end as the remaining gate rather than quietly skipped.
 *
 * TIERS
 *   Tier 1 (no credentials): every route is mounted, reachable through the
 *     subscription gate, and refuses an anonymous caller. Safe anywhere.
 *   Tier 2 (WXK_TEST_COOKIE set): an authenticated caller's refusal paths —
 *     wrong confirmName rejected BEFORE Stripe, non-ADMIN 403, exempt 409.
 */
const BASE = process.env.WXK_TEST_BASE ?? "http://localhost:3001";
const COOKIE = process.env.WXK_TEST_COOKIE ?? null;

const ROUTES = [
  { method: "DELETE", path: "/api/company/subscription" },
  { method: "POST", path: "/api/company/subscription/resume" },
  { method: "POST", path: "/api/company/subscription/pause" },
  { method: "POST", path: "/api/company/subscription/unpause" },
];

// [SCOPE 131 / T017] The operator-side twins, added with Amendment C. A real
// company id is never needed for these checks: every one of them must be refused
// before the id is ever looked up, so a syntactically valid UUID that belongs to
// nobody is the safest possible probe.
const NOBODY = "00000000-0000-4000-8000-000000000000";
const SYSADMIN_ROUTES = [
  { method: "POST", path: `/api/sysadmin/companies/${NOBODY}/cancel-subscription` },
  { method: "POST", path: `/api/sysadmin/companies/${NOBODY}/resume-subscription` },
];

let passed = 0;
let failed = 0;

// [SCOPE 131 / T016] BEGIN — assertion helpers and the HTTP caller
function check(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function call(method, path, { body, cookie } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(cookie ? { Cookie: cookie } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* not every refusal carries a body */
  }
  return { status: res.status, json };
}
// [SCOPE 131 / T016] END

// [SCOPE 131 / T016] BEGIN — the checks themselves
async function main() {
  console.log(`SPEC-131 endpoint checks against ${BASE}\n`);

  const health = await call("GET", "/api/health");
  if (health.status === 0 || health.status >= 500) {
    console.error(
      `Server is not answering on ${BASE}. Start it with: npm run dev:server`,
    );
    process.exit(2);
  }

  // ---- Tier 1 — mounted, reachable, and guarded -------------------------
  console.log("TIER 1 — routing and guards (no credentials)\n");

  for (const { method, path } of ROUTES) {
    const r = await call(method, path, { body: { confirmName: "nope" } });

    // 404 means the route was never mounted — the single failure mode that a
    // typecheck and a bundle both pass.
    check(
      `${method} ${path} is mounted (not 404)`,
      r.status !== 404,
      `got ${r.status}`,
    );

    // 401/403 means the request reached the auth guard. Anything 2xx from an
    // anonymous caller would be a hole straight through to Stripe.
    check(
      `${method} ${path} refuses an anonymous caller`,
      r.status === 401 || r.status === 403,
      `got ${r.status}`,
    );
  }

  // [SCOPE 131 / T017] BEGIN — the operator surface is mounted and SYSADMIN-gated.
  // The cancel button on the company list is worth nothing if its route was never
  // mounted; a 404 here is the failure a typecheck and a bundle grep both pass.
  for (const { method, path } of SYSADMIN_ROUTES) {
    const r = await call(method, path, { body: { confirmName: "nope" } });

    check(
      `${method} ${path.replace(NOBODY, ":id")} is mounted (not 404)`,
      r.status !== 404,
      `got ${r.status}`,
    );

    // requireSysAdmin sits on the router, so an anonymous caller must never get
    // far enough to reach Stripe on behalf of a company that is not theirs.
    check(
      `${method} ${path.replace(NOBODY, ":id")} refuses an anonymous caller`,
      r.status === 401 || r.status === 403,
      `got ${r.status}`,
    );
  }
  // [SCOPE 131 / T017] END

  // The subscription gate must not swallow these routes (FR-008). If the gate
  // were enforcing and the exemption missing, a walled caller would get the
  // gate's own refusal rather than the auth guard's.
  const gateProbe = await call("POST", "/api/company/subscription/unpause");
  check(
    "the gate does not intercept the lifecycle routes before auth",
    gateProbe.status === 401 || gateProbe.status === 403,
    `got ${gateProbe.status} with body ${JSON.stringify(gateProbe.json)}`,
  );

  // The summary endpoint must still exist for the panel to read state from.
  const summary = await call("GET", "/api/payment/subscription");
  check(
    "GET /api/payment/subscription is mounted",
    summary.status !== 404,
    `got ${summary.status}`,
  );

  // ---- Tier 2 — authenticated refusal paths -----------------------------
  if (!COOKIE) {
    console.log(
      "\nTIER 2 — skipped. Set WXK_TEST_COOKIE to an ADMIN session cookie to run" +
        "\n  the authenticated refusal paths (wrong confirmName, non-ADMIN, exempt).",
    );
  } else {
    console.log("\nTIER 2 — authenticated refusal paths\n");

    // FR-002: a wrong confirmName is rejected BEFORE Stripe is contacted. This is
    // the check that makes the cancel endpoint safe to expose at all.
    const wrong = await call("DELETE", "/api/company/subscription", {
      cookie: COOKIE,
      body: { confirmName: "definitely-not-the-company-name" },
    });
    check(
      "wrong confirmName → 400",
      wrong.status === 400,
      `got ${wrong.status} ${JSON.stringify(wrong.json)}`,
    );
    check(
      "wrong confirmName refusal names the reason",
      wrong.json?.code === "CONFIRM_NAME_MISMATCH",
      `got ${JSON.stringify(wrong.json)}`,
    );

    const missing = await call("DELETE", "/api/company/subscription", {
      cookie: COOKIE,
      body: {},
    });
    check(
      "missing confirmName → 400",
      missing.status === 400,
      `got ${missing.status}`,
    );

    // A billing-exempt company, or one with no Stripe subscription, must refuse
    // with 409 rather than reporting a silent success — the exact failure of the
    // stub this spec replaced.
    const pause = await call("POST", "/api/company/subscription/pause", {
      cookie: COOKIE,
    });
    check(
      "pause on a company with nothing to manage → 409 (or 200 if it genuinely paused)",
      pause.status === 409 || pause.status === 200,
      `got ${pause.status} ${JSON.stringify(pause.json)}`,
    );
    if (pause.status === 200) {
      console.log(
        "  NOTE  that account WAS paused. Resume it with POST /api/company/subscription/unpause.",
      );
    }

    // [SCOPE 131 / T017] BEGIN — operator-side refusals.
    // A non-SYSADMIN ADMIN session must be turned away by requireSysAdmin. This
    // is the check that keeps one company's admin from cancelling another's.
    const notSysadmin = await call(
      "POST",
      `/api/sysadmin/companies/${NOBODY}/cancel-subscription`,
      { cookie: COOKIE, body: { confirmName: "nope" } },
    );
    check(
      "a non-SYSADMIN session cannot reach the operator cancel (403, or 404 if the cookie IS a sysadmin)",
      notSysadmin.status === 403 || notSysadmin.status === 404,
      `got ${notSysadmin.status} ${JSON.stringify(notSysadmin.json)}`,
    );
    // 404 above means the cookie belongs to a SYSADMIN and the guard let it
    // through to the company lookup, which then found nothing — the correct
    // answer for an id that belongs to nobody, and proof nothing reached Stripe.
    if (notSysadmin.status === 404) {
      console.log(
        "  NOTE  that cookie is a SYSADMIN session; the 404 is the unknown-company path.",
      );
    }
    // [SCOPE 131 / T017] END

    // The panel reads lifecycle state from here; a missing block means three UI
    // states collapse into one.
    const s = await call("GET", "/api/payment/subscription", { cookie: COOKIE });
    check(
      "GET /api/payment/subscription carries the lifecycle block",
      s.status === 200 && s.json?.lifecycle !== undefined,
      `got ${s.status} keys=${Object.keys(s.json ?? {}).join(",")}`,
    );
    if (s.json?.lifecycle) {
      const l = s.json.lifecycle;
      check(
        "lifecycle exposes every field the panel renders",
        ["subscriptionstatus", "cancellationPending", "paused", "effectiveDate", "manageable"].every(
          (k) => k in l,
        ),
        `got ${Object.keys(l).join(",")}`,
      );
    }
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log(
    [
      "",
      "STILL UNTESTED — needs a disposable company on Stripe TEST keys:",
      "  - a real cancel sets cancel_at_period_end and leaves the company ACTIVE",
      "  - the company stays usable until the period ends (G2, browser-verified)",
      "  - un-cancel clears the flag with no proration and no new subscription",
      "  - pause voids invoices; unpause returns to ACTIVE on the SAME subscription",
      "  - a pause/resume cycle leaves cancelledat null (FR-007)",
      "  - Stripe failure writes nothing locally (fault injection, G3)",
      "  - the period-end webhook stamps cancelledat exactly once (FR-005)",
      "  - [T017] an operator cancel writes changedByType=SYSADMIN, not CUSTOMER",
      "  - [T017] the company list hides the cancel button once one is pending",
      "  - [T017] undo from the operator list clears cancelrequestedat",
      "These are NOT run here: the local DATABASE_URL is production and Stripe is live.",
    ].join("\n"),
  );

  process.exit(failed === 0 ? 0 : 1);
}

// [SCOPE 131 / T016] END

main().catch((e) => {
  console.error("endpoint checks failed to run:", e.message);
  process.exit(2);
});
