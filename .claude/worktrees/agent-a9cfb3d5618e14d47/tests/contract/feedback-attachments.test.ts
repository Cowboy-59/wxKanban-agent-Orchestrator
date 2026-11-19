// [SCOPE 043 / T029] Amendment E — the attachment download route, exercised as a
// ROUTE, not as a helper. Unit-testing the strip/summarize functions proves the
// data shape; it does not prove that the handler parses its params, sets its
// headers, or refuses an out-of-range index. Those are the ways this endpoint
// can actually fail in production, so they are what is asserted here.
//
// The real router is mounted; only the auth middlewares and the data service are
// substituted, so the code under test is the shipped handler.
import { describe, it, expect, beforeAll, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";

const FEEDBACK_ID = "018f3a10-0000-7000-8000-000000000001";

const ROW_WITH_ATTACHMENTS = {
  id: FEEDBACK_ID,
  title: "build fails on windows",
  details: {
    mode: "quick",
    paste: "see the attached log",
    attachments: [
      {
        name: "build.log",
        bytes: 5_000_000,
        truncated: true,
        redactions: 2,
        content: "line one\nFATAL: could not link\npassword=[redacted]\n",
      },
      // A name crafted to break out of the Content-Disposition header.
      {
        name: 'evil"; filename="passwd\r\nX-Injected: 1',
        bytes: 12,
        truncated: false,
        redactions: 0,
        content: "harmless",
      },
    ],
  },
};

const ROW_WITHOUT_ATTACHMENTS = {
  id: FEEDBACK_ID,
  title: "no attachments here",
  details: { mode: "guided", doing: "building" },
};

let currentRow: unknown = ROW_WITH_ATTACHMENTS;

vi.mock("../../src/server/middleware/auth.js", () => ({
  authenticateToken: (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as express.Request & { userid?: string }).userid = "admin-under-test";
    next();
  },
}));
vi.mock("../../src/server/middleware/requireSysAdmin.js", () => ({
  requireSysAdmin: (_req: express.Request, _res: express.Response, next: express.NextFunction) => next(),
}));
vi.mock("../../src/server/services/FeedbackTriageService.js", () => ({
  FEEDBACK_STATUSES: ["new", "triaged", "needsinfo", "inprogress", "resolved", "declined"],
  FEEDBACK_SOURCES: ["manual", "auto"],
  FEEDBACK_DISPOSITIONS: ["scope", "outofbandfix", "duplicate", "decline", "needsinfo"],
  getFeedback: vi.fn(async (id: string) => (id === FEEDBACK_ID ? currentRow : null)),
  listFeedback: vi.fn(async () => [currentRow]),
  getFeedbackMetrics: vi.fn(async () => ({})),
}));

let base: string;
let server: Server;

beforeAll(async () => {
  const { default: sysadminRoutes } = await import("../../src/server/routes/sysadmin.js");
  const app = express();
  app.use(express.json());
  app.use("/api/sysadmin", sysadminRoutes);
  server = app.listen(0);
  await new Promise<void>((r) => server.once("listening", () => r()));
  const addr = server.address();
  base = `http://127.0.0.1:${typeof addr === "object" && addr ? addr.port : 0}`;
  return () => {
    server?.close();
  };
  // Importing the sysadmin router pulls in the app's db/stripe config modules,
  // which are slow to evaluate — this is module load, not a live connection.
}, 60_000);

describe("GET /api/sysadmin/feedback/:id/attachments/:index (FR-025)", () => {
  it("serves the FULL content as a download", async () => {
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}/attachments/0`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/plain");
    expect(res.headers.get("content-disposition")).toContain('filename="build.log"');
    // nosniff matters: this body is submitter-supplied text being handed to a browser.
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toContain("FATAL: could not link");
  });

  it("neutralizes a filename crafted to inject a header", async () => {
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}/attachments/1`);
    expect(res.status).toBe(200);
    // The name came off a submitter's filesystem; it must not be able to add a header.
    expect(res.headers.get("x-injected")).toBeNull();
    const disposition = res.headers.get("content-disposition") ?? "";
    expect(disposition).not.toContain("\r");
    expect(disposition).not.toContain('filename="passwd');
    expect(await res.text()).toBe("harmless");
  });

  it("404s on an index past the end rather than throwing", async () => {
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}/attachments/9`);
    expect(res.status).toBe(404);
  });

  it("404s on a non-numeric index", async () => {
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}/attachments/abc`);
    expect(res.status).toBe(404);
  });

  it("404s for a report that has no attachments", async () => {
    currentRow = ROW_WITHOUT_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}/attachments/0`);
    expect(res.status).toBe(404);
  });

  it("404s for an unknown feedback id", async () => {
    const other = "018f3a10-0000-7000-8000-0000000000ff";
    const res = await fetch(`${base}/api/sysadmin/feedback/${other}/attachments/0`);
    expect(res.status).toBe(404);
  });

  it("does not shadow the existing GET /feedback/:id route", async () => {
    // Regression guard: the new path has more segments, so :id must still match
    // on its own. A route ordering mistake here would break the triage console.
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback/${FEEDBACK_ID}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { feedback: { id: string } };
    expect(body.feedback.id).toBe(FEEDBACK_ID);
  });
});

describe("GET /api/sysadmin/feedback (FR-025 — the queue must stay light)", () => {
  it("returns attachment metadata but never the content", async () => {
    currentRow = ROW_WITH_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      items: Array<{ details: { attachments: Array<Record<string, unknown>>; paste: string } }>;
    };
    const attachments = body.items[0].details.attachments;
    expect(attachments).toHaveLength(2);
    expect(attachments[0].content).toBeUndefined();
    expect(attachments[0]).toMatchObject({ name: "build.log", truncated: true, redactions: 2 });
    // A tail excerpt still travels, so the queue is readable without a fetch.
    expect(String(attachments[0].excerpt)).toContain("FATAL");
    // The persona answers are untouched.
    expect(body.items[0].details.paste).toBe("see the attached log");
    // And the full log text is nowhere in the list payload.
    expect(JSON.stringify(body)).not.toContain("could not link\npassword");
  });

  it("leaves a report without attachments unchanged", async () => {
    currentRow = ROW_WITHOUT_ATTACHMENTS;
    const res = await fetch(`${base}/api/sysadmin/feedback`);
    const body = (await res.json()) as { items: Array<{ details: Record<string, unknown> }> };
    expect(body.items[0].details).toEqual({ mode: "guided", doing: "building" });
  });
});
