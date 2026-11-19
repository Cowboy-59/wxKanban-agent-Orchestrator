import { describe, it, expect, beforeAll } from "vitest";

/**
 * [SCOPE 063 / T011] Contract test for the per-project error ingest (Seam A) —
 * the cross-tenant isolation invariant (US3 / Success Criterion #1) and fail-open
 * behaviour of POST /api/projects/:id/errors.
 *
 * Self-skips unless a server is reachable AND a project ingest token is provided,
 * so it never red-fails in environments without a live DB/server:
 *   API_URL                (default http://localhost:3001)
 *   WXKANBAN_API_TOKEN      a valid project-scoped token
 *   INGEST_TEST_PROJECT_ID  the project that token belongs to
 */
const API_URL = process.env.API_URL || "http://localhost:3001";
const TOKEN = process.env.WXKANBAN_API_TOKEN || "";
const PROJECT_ID = process.env.INGEST_TEST_PROJECT_ID || process.env.PROJECT_ID || "";
const OTHER_PROJECT_ID = "00000000-0000-0000-0000-000000000999";

const BODY = {
  source: "client",
  kind: "windowError",
  name: "TypeError",
  message: "contract test 063",
  stack: "at x (a.js:1:1)",
  route: "/contract-test",
};

async function reachable(): Promise<boolean> {
  try {
    const res = await fetch(`${API_URL}/api/auth/me`);
    return res.status > 0;
  } catch {
    return false;
  }
}

function post(projectId: string, headers: Record<string, string>, body: unknown) {
  return fetch(`${API_URL}/api/projects/${projectId}/errors`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

describe("per-project error ingest — auth + isolation + fail-open", () => {
  let run = false;

  beforeAll(async () => {
    run = Boolean(TOKEN && PROJECT_ID) && (await reachable());
    if (!run) {
      // eslint-disable-next-line no-console
      console.warn("Skipping ingest contract test: set WXKANBAN_API_TOKEN + INGEST_TEST_PROJECT_ID and run the server.");
    }
  });

  it("rejects a request with no token (401)", async () => {
    if (!run) return;
    const res = await post(PROJECT_ID, {}, BODY);
    expect(res.status).toBe(401);
  });

  it("rejects an invalid token (401)", async () => {
    if (!run) return;
    const res = await post(PROJECT_ID, { Authorization: "Bearer not-a-real-token" }, BODY);
    expect(res.status).toBe(401);
  });

  it("rejects a valid token used against a DIFFERENT project (403) — isolation invariant", async () => {
    if (!run) return;
    const res = await post(OTHER_PROJECT_ID, { Authorization: `Bearer ${TOKEN}` }, BODY);
    expect(res.status).toBe(403);
  });

  it("accepts a valid token for its own project (202)", async () => {
    if (!run) return;
    const res = await post(PROJECT_ID, { Authorization: `Bearer ${TOKEN}` }, BODY);
    expect(res.status).toBe(202);
  });

  it("fails open on a malformed body — 202, never 5xx", async () => {
    if (!run) return;
    const res = await post(PROJECT_ID, { Authorization: `Bearer ${TOKEN}` }, { garbage: true });
    expect(res.status).toBe(202);
    expect(res.status).toBeLessThan(500);
  });
});
