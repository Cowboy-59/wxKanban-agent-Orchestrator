// SPEC-143 / FR-002, FR-017 — agent-runs route contract. The db layer, auth middleware, the
// billable-project check and the API-token service are mocked; nothing here opens a connection
// (the local .env points at production).
import { describe, it, expect, vi, beforeEach } from "vitest";

const queue: unknown[][] = [];
const upserts: Record<string, unknown>[] = [];
const conflicts: { setWhere: unknown }[] = [];
const whereArgs: unknown[] = [];
/** Projects each company may bill, by company id. */
const billable = new Map<string, Set<string>>();
/** Token string → token record (the ApiTokenService compat shape). */
const tokens = new Map<string, Record<string, unknown>>();
/** Run ids already stored, by id → owning project + company (for the replay test). */
const stored = new Map<string, { projectid: string; companyid: string }>();

vi.mock("../../src/server/db/client.js", () => {
  const chain = (): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "limit", "orderBy"]) c[m] = () => c;
    c.where = (w: unknown) => {
      whereArgs.push(w);
      return c;
    };
    c.then = (resolve: (v: unknown[]) => void) => resolve(queue.shift() ?? []);
    return c;
  };
  return {
    db: {
      select: () => chain(),
      insert: () => ({
        values: (v: Record<string, unknown>) => ({
          onConflictDoUpdate: (o: { setWhere: unknown }) => {
            conflicts.push(o);
            const prior = stored.get(String(v.id));
            // Mirror ON CONFLICT … DO UPDATE … WHERE projectid AND companyid match.
            if (prior && (prior.projectid !== v.projectid || prior.companyid !== v.companyid)) {
              return { returning: () => Promise.resolve([]) };
            }
            upserts.push(v);
            stored.set(String(v.id), { projectid: String(v.projectid), companyid: String(v.companyid) });
            return { returning: () => Promise.resolve([{ id: v.id }]) };
          },
        }),
      }),
    },
  };
});

vi.mock("../../src/server/middleware/auth.js", () => ({
  authenticateToken: (req: Record<string, unknown>, res: { status(n: number): { json(b: unknown): void } }, next: () => void) => {
    // Stand-in for the JWT path: a bearer of "jwt:<company>" signs in as an ADMIN of <company>.
    const header = (req.headers as Record<string, string> | undefined)?.authorization ?? "";
    const m = /^Bearer jwt:(.+)$/.exec(header);
    if (m) {
      req.userid = "u-jwt";
      req.companyid = m[1];
      req.usertype = "ADMIN";
      next();
      return;
    }
    res.status(401).json({ error: "Authentication required" });
  },
  requireAuth: (_q: unknown, _s: unknown, next: () => void) => next(),
}));

vi.mock("../../src/server/lib/jwt.js", () => ({
  extractToken: (h: string | undefined) => (h && h.startsWith("Bearer ") ? h.slice(7) : null),
  verifyToken: (t: string) => {
    if (!t.startsWith("jwt:")) throw new Error("not a jwt");
    return { userid: "u-jwt" };
  },
}));

vi.mock("../../src/server/services/ApiTokenService.js", () => ({
  apiTokenService: { validateToken: (t: string) => Promise.resolve(tokens.get(t) ?? null) },
}));

vi.mock("../../src/server/services/TimeBillingProjectAccess.js", async () => {
  const { NotFoundError } = await import("../../src/server/lib/errors.js");
  return {
    TimeBillingProjectAccess: {
      resolve: (companyid: string, projectid: string) =>
        billable.get(companyid)?.has(projectid)
          ? Promise.resolve({ id: projectid })
          : Promise.reject(new NotFoundError("Project not found")),
    },
  };
});

import router, { authenticateRunSender, TOKEN_PROJECT } from "../../src/server/routes/agentRuns.js";

interface FakeRes {
  statusCode: number;
  body: unknown;
  locals: Record<string, unknown>;
  status(code: number): FakeRes;
  json(b: unknown): FakeRes;
}
type Handler = (req: unknown, res: FakeRes, next: () => void) => unknown;

function layersFor(method: "get" | "post"): Handler[] {
  const layer = (router as unknown as {
    stack: { route?: { path: string; methods: Record<string, boolean>; stack: { handle: Handler }[] } }[];
  }).stack.find((l) => l.route?.path === "/" && l.route.methods[method]);
  if (!layer?.route) throw new Error(`no ${method} handler`);
  return layer.route.stack.map((s) => s.handle);
}

/** The route's final handler alone, with the caller already authenticated. */
function handlerFor(method: "get" | "post"): Handler {
  const layers = layersFor(method);
  return layers[layers.length - 1];
}

/** The whole middleware chain, as Express would run it. */
async function runChain(method: "get" | "post", req: Record<string, unknown>, res: FakeRes): Promise<void> {
  const layers = layersFor(method);
  for (const layer of layers) {
    let advanced = false;
    await layer(req, res, () => {
      advanced = true;
    });
    if (!advanced) return;
  }
}

function makeRes(): FakeRes {
  const res: FakeRes = {
    statusCode: 200,
    body: undefined,
    locals: {},
    status(code) {
      res.statusCode = code;
      return res;
    },
    json(b) {
      res.body = b;
      return res;
    },
  };
  return res;
}

const PROJECT = "0192f0a8-1111-7000-8000-000000000001";
const OTHER_PROJECT = "0192f0a8-1111-7000-8000-000000000009";
const CLIENT_PROJECT = "0192f0a8-1111-7000-8000-000000000005";
const RUN_ID = "0192f0a8-2222-7000-8000-000000000002";

const validRun = {
  id: RUN_ID,
  projectid: PROJECT,
  command: "dbpush",
  kind: "command",
  difficulty: "easy",
  model: "claude-haiku-5-5",
  provider: "anthropic-subscription",
  route: "official",
  inputtokens: 100,
  outputtokens: 50,
  activeseconds: 720,
  waitingseconds: 180,
  escalated: false,
  starttime: "2026-10-23T17:00:00.000Z",
  endtime: "2026-10-23T17:12:00.000Z",
};

const auth = (usertype: string, companyid = "c1") => ({ userid: "u1", companyid, usertype });

beforeEach(() => {
  queue.length = 0;
  upserts.length = 0;
  conflicts.length = 0;
  whereArgs.length = 0;
  stored.clear();
  tokens.clear();
  billable.clear();
  billable.set("c1", new Set([PROJECT, CLIENT_PROJECT])); // own project + an engaged client project
  billable.set("c2", new Set([OTHER_PROJECT]));
});

// [SCOPE 143 / T024] BEGIN — agent-runs route tests (FR-002, FR-017, D3)
describe("POST /agent-runs", () => {
  it("accepts a valid record and stores the caller's company on it", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("TEAM_MEMBER"), body: validRun }, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(upserts).toHaveLength(1);
    expect(upserts[0].companyid).toBe("c1");
  });

  it("ignores a companyid in the body: the credential decides who bills (FR-017)", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, companyid: "c2" } }, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(upserts[0].companyid).toBe("c1");
  });

  it("accepts a run on an engaged client project and bills it to the consultant's company", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, projectid: CLIENT_PROJECT } }, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect(upserts[0]).toMatchObject({ projectid: CLIENT_PROJECT, companyid: "c1" });
  });

  it("returns 404 for a project the company may not bill, and stores nothing", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, projectid: OTHER_PROJECT } }, res, () => undefined);
    expect(res.statusCode).toBe(404);
    expect(upserts).toHaveLength(0);
  });

  it("a replayed run is stored once; the same id from another company is refused, not overwritten", async () => {
    const first = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: validRun }, first, () => undefined);
    const again = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: validRun }, again, () => undefined);
    expect(again.statusCode).toBe(200);
    expect(stored.size).toBe(1);

    billable.get("c2")?.add(PROJECT);
    const foreign = makeRes();
    await handlerFor("post")({ ...auth("ADMIN", "c2"), body: validRun }, foreign, () => undefined);
    expect(foreign.statusCode).toBe(409);
    expect(stored.get(RUN_ID)?.companyid).toBe("c1");
  });

  it("rejects an unknown field (e.g. prompt text)", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, prompt: "write me a thing" } }, res, () => undefined);
    expect(res.statusCode).toBe(400);
    expect(upserts).toHaveLength(0);
  });

  it("refuses a non-official route (Anthropic only, Amendment A)", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, route: "omniroute" } }, res, () => undefined);
    expect(res.statusCode).toBe(400);
  });

  it("accepts comparison fields and rejects a bad variant", async () => {
    const ok = makeRes();
    await handlerFor("post")(
      { ...auth("ADMIN"), body: { ...validRun, variant: "candidate", firstpass: true, neverbilled: true } },
      ok,
      () => undefined,
    );
    expect(ok.statusCode).toBe(200);
    const bad = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, variant: "other" } }, bad, () => undefined);
    expect(bad.statusCode).toBe(400);
  });

  it("accepts a record with difficulty null (unclassified capture)", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("ADMIN"), body: { ...validRun, difficulty: null } }, res, () => undefined);
    expect(res.statusCode).toBe(200);
  });

  it("rejects free text in a label field", async () => {
    const res = makeRes();
    await handlerFor("post")(
      { ...auth("ADMIN"), body: { ...validRun, command: "please refactor the auth module now" } },
      res,
      () => undefined,
    );
    expect(res.statusCode).toBe(400);
  });

  it("rejects an unauthenticated caller", async () => {
    const res = makeRes();
    await handlerFor("post")({ body: validRun }, res, () => undefined);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an unknown role", async () => {
    const res = makeRes();
    await handlerFor("post")({ ...auth("GUEST"), body: validRun }, res, () => undefined);
    expect(res.statusCode).toBe(403);
  });
});

describe("POST /agent-runs with a project API token (D3)", () => {
  const token = (over: Record<string, unknown> = {}) => ({
    userid: "u-tok",
    companyid: "c1",
    projectid: PROJECT,
    expiresat: null,
    ...over,
  });

  it("a token for project A records a run for project A, billed to the token's company", async () => {
    tokens.set("tok-a", token());
    queue.push([{ usertype: "TEAM_MEMBER", emailaddr: "m@example.com", companyid: "c1" }]);
    const res = makeRes();
    await runChain("post", { headers: { authorization: "Bearer tok-a" }, body: validRun }, res);
    expect(res.statusCode).toBe(200);
    expect(res.locals[TOKEN_PROJECT]).toBe(PROJECT);
    expect(upserts[0].companyid).toBe("c1");
  });

  it("a token for project A is refused on project B", async () => {
    tokens.set("tok-a", token());
    queue.push([{ usertype: "ADMIN", emailaddr: "m@example.com", companyid: "c1" }]);
    const res = makeRes();
    await runChain("post", { headers: { authorization: "Bearer tok-a" }, body: { ...validRun, projectid: CLIENT_PROJECT } }, res);
    expect(res.statusCode).toBe(403);
    expect(upserts).toHaveLength(0);
  });

  it("an unknown or expired token is 401", async () => {
    const unknown = makeRes();
    await runChain("post", { headers: { authorization: "Bearer nope" }, body: validRun }, unknown);
    expect(unknown.statusCode).toBe(401);

    tokens.set("tok-old", token({ expiresat: new Date(Date.now() - 1000) }));
    const expired = makeRes();
    await runChain("post", { headers: { authorization: "Bearer tok-old" }, body: validRun }, expired);
    expect(expired.statusCode).toBe(401);
    expect(upserts).toHaveLength(0);
  });

  it("a token whose issuer has left the issuing company is 401", async () => {
    tokens.set("tok-a", token());
    queue.push([{ usertype: "ADMIN", emailaddr: "m@example.com", companyid: "c2" }]);
    const res = makeRes();
    await runChain("post", { headers: { authorization: "Bearer tok-a" }, body: validRun }, res);
    expect(res.statusCode).toBe(401);
  });

  it("a JWT bearer still takes the web-session path", async () => {
    const res = makeRes();
    const req: Record<string, unknown> = { headers: { authorization: "Bearer jwt:c1" }, body: validRun };
    let advanced = false;
    await authenticateRunSender(req as never, res as never, () => {
      advanced = true;
    });
    expect(advanced).toBe(true);
    expect(req.companyid).toBe("c1");
    expect(res.locals[TOKEN_PROJECT]).toBeUndefined();
  });
});

describe("GET /agent-runs", () => {
  it("requires a management role: TEAM_MEMBER is forbidden", async () => {
    const res = makeRes();
    await handlerFor("get")({ ...auth("TEAM_MEMBER"), query: { projectid: PROJECT } }, res, () => undefined);
    expect(res.statusCode).toBe(403);
  });

  it("returns the caller company's runs for an ADMIN, filtered by company", async () => {
    queue.push([
      {
        id: RUN_ID,
        projectid: PROJECT,
        starttime: new Date("2026-10-23T17:00:00.000Z"),
        endtime: null,
        createdat: new Date("2026-10-23T17:01:00.000Z"),
      },
    ]);
    const res = makeRes();
    await handlerFor("get")({ ...auth("ADMIN"), query: { projectid: PROJECT } }, res, () => undefined);
    expect(res.statusCode).toBe(200);
    expect((res.body as { runs: unknown[] }).runs).toHaveLength(1);
    // The where clause names both projectid and companyid.
    const where = JSON.stringify(whereArgs[0], (_k, v: unknown) => (typeof v === "object" && v !== null && "name" in v && typeof (v as { name: unknown }).name === "string" ? `col:${(v as { name: string }).name}` : v));
    expect(where).toContain("col:projectid");
    expect(where).toContain("col:companyid");
  });

  it("returns 404 for a project the company may not bill", async () => {
    const res = makeRes();
    await handlerFor("get")({ ...auth("ADMIN"), query: { projectid: OTHER_PROJECT } }, res, () => undefined);
    expect(res.statusCode).toBe(404);
  });

  it("requires a valid projectid", async () => {
    const res = makeRes();
    await handlerFor("get")({ ...auth("ADMIN"), query: {} }, res, () => undefined);
    expect(res.statusCode).toBe(400);
  });
});
// [SCOPE 143 / T024] END
