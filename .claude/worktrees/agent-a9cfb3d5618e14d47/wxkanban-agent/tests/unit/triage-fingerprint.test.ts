/**
 * [SCOPE 148 / T013] The no-change fingerprint.
 *
 * The expensive mistake this guards is a false "no change": a skipped run means a morning with
 * no report and nobody told. So the tests lean on the directions that could produce one — an
 * in-place edit, a truncated list, a status moving between buckets.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { beforeEach, describe, expect, it } from "vitest";
import { TRIAGE_DIR } from "../../apps/remote-bridge/src/triage-hook";
import {
  buildFingerprint,
  checkForChange,
  FEEDBACK_STATUSES,
  formatFingerprint,
  listFeedback,
  newestReport,
  parseFingerprint,
  sameFingerprint,
  type Fingerprint,
  type FingerprintSource,
} from "../../apps/remote-bridge/src/triage-fingerprint";

const SRC: FingerprintSource = {
  mcpUrl: "https://mcp.test",
  mcpToken: "tok",
  projectId: "ba924193-0335-4080-9fa6-33cd6b81300a",
};

let repoRoot: string;

beforeEach(() => {
  repoRoot = mkdtempSync(join(tmpdir(), "triage-fp-"));
  mkdirSync(join(repoRoot, TRIAGE_DIR), { recursive: true });
});

/** A fetch stub answering the MCP envelope shape, recording every call. */
function stubFetch(itemsFor: (status: string, incoming: boolean) => unknown[]) {
  const calls: Array<{ status: string; incoming: boolean; args: Record<string, unknown> }> = [];
  const fn = (async (_url: string, init: { body: string }) => {
    const req = JSON.parse(init.body) as { params: { arguments: Record<string, unknown> } };
    const args = req.params.arguments;
    const status = String(args.status);
    const incoming = args.incoming === true;
    calls.push({ status, incoming, args });
    return new Response(
      JSON.stringify({
        result: { content: [{ type: "text", text: JSON.stringify({ items: itemsFor(status, incoming) }) }] },
      }),
      { status: 200 },
    );
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe("listFeedback", () => {
  it("never sends maxItems, so the server's own 500 applies instead of the schema's 100 cap", async () => {
    const { fn, calls } = stubFetch(() => []);
    await listFeedback(SRC, "new", "my", fn);
    expect(calls[0].args).not.toHaveProperty("maxItems");
    expect(calls[0].args.projectId).toBe(SRC.projectId);
    expect(calls[0].args).not.toHaveProperty("incoming");
  });

  it("asks for the incoming queue only on the 'in' view", async () => {
    const { fn, calls } = stubFetch(() => []);
    await listFeedback(SRC, "new", "in", fn);
    expect(calls[0].args.incoming).toBe(true);
  });

  it("surfaces a non-OK response rather than reporting an empty queue", async () => {
    const fn = (async () => new Response("nope", { status: 503 })) as unknown as typeof fetch;
    await expect(listFeedback(SRC, "new", "my", fn)).rejects.toThrow(/503/);
  });
});

describe("buildFingerprint", () => {
  it("covers every status in both views", async () => {
    const { fn, calls } = stubFetch(() => []);
    await buildFingerprint(SRC, fn);
    expect(calls).toHaveLength(FEEDBACK_STATUSES.length * 2);
    expect(new Set(calls.map((c) => c.status)).size).toBe(FEEDBACK_STATUSES.length);
    expect(calls.filter((c) => c.incoming)).toHaveLength(FEEDBACK_STATUSES.length);
  });

  it("takes the latest updatedAt, not the first or the newest createdAt", async () => {
    const { fn } = stubFetch((status) =>
      status === "new"
        ? [
            { createdAt: "2026-10-20T00:00:00Z", updatedAt: "2026-10-26T08:00:00Z" },
            { createdAt: "2026-10-25T00:00:00Z", updatedAt: "2026-10-25T09:00:00Z" },
          ]
        : [],
    );
    const fp = await buildFingerprint(SRC, fn);
    expect(fp["my:new"]).toEqual({ count: 2, latest: "2026-10-26T08:00:00Z" });
  });

  it("falls back to createdAt against a server that does not send updatedAt yet", async () => {
    const { fn } = stubFetch((status) => (status === "new" ? [{ createdAt: "2026-10-26T07:00:00Z" }] : []));
    const fp = await buildFingerprint(SRC, fn);
    expect(fp["my:new"]).toEqual({ count: 1, latest: "2026-10-26T07:00:00Z" });
  });
});

describe("format and parse", () => {
  it("round-trips", async () => {
    const { fn } = stubFetch((status, incoming) =>
      status === "new" && !incoming ? [{ updatedAt: "2026-10-26T08:00:00Z" }] : [],
    );
    const fp = await buildFingerprint(SRC, fn);
    const line = formatFingerprint(fp);
    expect(line).toMatch(/^Fingerprint: /);
    expect(parseFingerprint(line)).toEqual(fp);
  });

  it("renders an empty bucket as - and reads it back as null", () => {
    const fp: Fingerprint = { "my:new": { count: 0, latest: null } };
    const parsed = parseFingerprint(formatFingerprint(fp));
    expect(parsed?.["my:new"]).toEqual({ count: 0, latest: null });
  });

  it("is null for a report with no fingerprint line", () => {
    expect(parseFingerprint("# Feedback Triage\n\nsome prose\n")).toBeNull();
  });

  it("finds the line when it sits under the title, as finalizeReport writes it", () => {
    const report = `# Feedback Triage — 2026-10-26\n\nFingerprint: my:new=1@2026-10-26T08:00:00Z\n\nbody\n`;
    expect(parseFingerprint(report)?.["my:new"]).toEqual({ count: 1, latest: "2026-10-26T08:00:00Z" });
  });
});

describe("sameFingerprint", () => {
  const base: Fingerprint = {
    "my:new": { count: 2, latest: "2026-10-26T08:00:00Z" },
    "my:triaged": { count: 5, latest: "2026-10-26T07:00:00Z" },
  };

  it("is true for an identical queue", () => {
    expect(sameFingerprint(base, { ...base })).toBe(true);
  });

  it("sees an in-place edit — the case createdAt alone would miss", () => {
    const edited: Fingerprint = { ...base, "my:new": { count: 2, latest: "2026-10-26T09:30:00Z" } };
    expect(sameFingerprint(base, edited)).toBe(false);
  });

  it("sees a status transition, where one count falls and another rises", () => {
    const moved: Fingerprint = {
      "my:new": { count: 1, latest: "2026-10-26T08:00:00Z" },
      "my:triaged": { count: 6, latest: "2026-10-26T09:00:00Z" },
    };
    expect(sameFingerprint(base, moved)).toBe(false);
  });

  it("is false when one side is missing a bucket entirely", () => {
    expect(sameFingerprint(base, { "my:new": base["my:new"] })).toBe(false);
  });
});

describe("newestReport", () => {
  const write = (name: string, body: string) => writeFileSync(join(repoRoot, TRIAGE_DIR, name), body, "utf8");

  it("is null on an empty folder", () => {
    expect(newestReport(repoRoot)).toBeNull();
  });

  it("picks the latest date, not the first file read", () => {
    write("BUG-Triage-2026-10-24.md", "# Feedback Triage\nFingerprint: my:new=1@a\n");
    write("BUG-Triage-2026-10-26.md", "# Feedback Triage\nFingerprint: my:new=9@z\n");
    write("BUG-Triage-2026-10-25.md", "# Feedback Triage\nFingerprint: my:new=5@m\n");
    const r = newestReport(repoRoot);
    expect(r?.date).toBe("2026-10-26");
    expect(r?.fingerprint?.["my:new"].count).toBe(9);
  });

  it("prefers a same-day second run over the first", () => {
    write("BUG-Triage-2026-10-26.md", "# Feedback Triage\nFingerprint: my:new=1@a\n");
    write("BUG-Triage-2026-10-26-2.md", "# Feedback Triage\nFingerprint: my:new=2@b\n");
    expect(newestReport(repoRoot)?.fingerprint?.["my:new"].count).toBe(2);
  });

  it("ignores files that are not reports", () => {
    write("notes.md", "# Feedback Triage\nFingerprint: my:new=7@x\n");
    expect(newestReport(repoRoot)).toBeNull();
  });
});

describe("checkForChange", () => {
  const emptyFetch = stubFetch(() => []).fn;

  it("runs when there is no previous report at all", async () => {
    const v = await checkForChange(repoRoot, SRC, emptyFetch);
    expect(v.run).toBe(true);
    if (v.run) expect(v.reason).toBe("no-previous-report");
  });

  it("runs when the previous report carries no readable fingerprint", async () => {
    writeFileSync(join(repoRoot, TRIAGE_DIR, "BUG-Triage-2026-10-25.md"), "# Feedback Triage\nno line\n", "utf8");
    const v = await checkForChange(repoRoot, SRC, emptyFetch);
    expect(v.run).toBe(true);
    if (v.run) expect(v.reason).toBe("no-previous-report");
  });

  it("skips when the queue matches the newest report, naming that report's date", async () => {
    const fp = await buildFingerprint(SRC, emptyFetch);
    writeFileSync(
      join(repoRoot, TRIAGE_DIR, "BUG-Triage-2026-10-25.md"),
      `# Feedback Triage\n${formatFingerprint(fp)}\n`,
      "utf8",
    );
    const v = await checkForChange(repoRoot, SRC, emptyFetch);
    expect(v.run).toBe(false);
    if (!v.run) expect(v.since).toBe("2026-10-25");
  });

  it("runs when a single report has been edited since the last sweep", async () => {
    const before = stubFetch((s) => (s === "new" ? [{ updatedAt: "2026-10-25T10:00:00Z" }] : [])).fn;
    const after = stubFetch((s) => (s === "new" ? [{ updatedAt: "2026-10-26T06:30:00Z" }] : [])).fn;
    const fp = await buildFingerprint(SRC, before);
    writeFileSync(
      join(repoRoot, TRIAGE_DIR, "BUG-Triage-2026-10-25.md"),
      `# Feedback Triage\n${formatFingerprint(fp)}\n`,
      "utf8",
    );
    const v = await checkForChange(repoRoot, SRC, after);
    expect(v.run).toBe(true);
    if (v.run) expect(v.reason).toBe("changed");
  });
});
