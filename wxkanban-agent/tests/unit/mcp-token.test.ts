// [SCOPE 148 / T012] BEGIN — the shared MCP token holder: expiry renewal and renew-on-401 (SPEC-148 FR-016)
/**
 * The holder is what keeps the room gate and the triage runs on ONE live token. Two ways a
 * token dies, and both are covered: the clock (renew within 15 minutes of expiry, or 3 hours
 * before a run), and the server (a 401 — revoked by hand, or replaced by a mint elsewhere),
 * which renews once and retries once.
 */
import { mkdtempSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  isUnauthorizedError,
  McpTokenHolder,
  RENEW_MARGIN_MS,
  TRIAGE_MIN_VALID_MS,
  type HeldToken,
} from "../../apps/remote-bridge/src/mcp-token";
import { TriageSchedule } from "../../apps/remote-bridge/src/triage-schedule";
import { TRIAGE_DIR } from "../../apps/remote-bridge/src/triage-hook";
import type { TriageRunOptions } from "../../apps/remote-bridge/src/triage-run";
import type { FingerprintSource } from "../../apps/remote-bridge/src/triage-fingerprint";

const NOW = Date.parse("2026-10-27T12:00:00Z");
const inMs = (ms: number): string => new Date(NOW + ms).toISOString();

/** A holder whose renewals mint tok-1, tok-2, … and are counted. */
function holder(initial: HeldToken, opts: { fail?: boolean } = {}) {
  let mints = 0;
  const failures: string[] = [];
  const h = new McpTokenHolder({
    initial,
    now: () => NOW,
    renew: async () => {
      if (opts.fail) throw new Error("project agent room refused (403): remote_not_allowed");
      mints += 1;
      return { token: `tok-${mints}`, expiresAt: inMs(12 * 60 * 60 * 1000) };
    },
    onRenewFailed: (r) => failures.push(r),
  });
  return { h, mints: () => mints, failures };
}

describe("expiry (FR-016)", () => {
  it("hands back the held token while it has more than the margin left", async () => {
    const { h, mints } = holder({ token: "tok-0", expiresAt: inMs(RENEW_MARGIN_MS + 60_000) });
    expect(await h.get()).toBe("tok-0");
    expect(mints()).toBe(0);
  });

  it("renews within 15 minutes of expiry, and concurrent callers share one mint", async () => {
    const { h, mints } = holder({ token: "tok-0", expiresAt: inMs(RENEW_MARGIN_MS - 60_000) });
    const [a, b] = await Promise.all([h.get(), h.get()]);
    expect([a, b]).toEqual(["tok-1", "tok-1"]);
    expect(mints()).toBe(1);
  });

  it("renews before a triage run when fewer than 3 hours are left", async () => {
    const { h } = holder({ token: "tok-0", expiresAt: inMs(TRIAGE_MIN_VALID_MS - 60_000) });
    expect(await h.get()).toBe("tok-0");
    expect(await h.get(TRIAGE_MIN_VALID_MS)).toBe("tok-1");
  });

  it("an unreadable expiry renews on first use", async () => {
    const { h } = holder({ token: "tok-0", expiresAt: "" });
    expect(await h.get()).toBe("tok-1");
  });

  it("a failed renewal keeps the old token and is reported once per streak", async () => {
    const { h, failures } = holder({ token: "tok-0", expiresAt: inMs(0) }, { fail: true });
    expect(await h.get()).toBe("tok-0");
    expect(await h.get()).toBe("tok-0");
    expect(failures).toHaveLength(1);
    expect(failures[0]).toContain("remote_not_allowed");
    expect(failures[0]).not.toContain("tok-0");
  });
});

describe("renew on a 401 (FR-016)", () => {
  const LIVE = { token: "tok-0", expiresAt: inMs(10 * 60 * 60 * 1000) };

  it("a returned 401 renews and retries once with the new token", async () => {
    const { h, mints } = holder(LIVE);
    const seen: string[] = [];
    const r = await h.withToken(
      async (t) => {
        seen.push(t);
        return { status: t === "tok-0" ? 401 : 200 };
      },
      { isRejected: (x) => x.status === 401 },
    );
    expect(r.status).toBe(200);
    expect(seen).toEqual(["tok-0", "tok-1"]);
    expect(mints()).toBe(1);
  });

  it("a thrown 401 renews and retries once", async () => {
    const { h } = holder(LIVE);
    const seen: string[] = [];
    const r = await h.withToken(async (t) => {
      seen.push(t);
      if (t === "tok-0") throw new Error("list_my_feedback failed (401): invalid-token");
      return "ok";
    });
    expect(r).toBe("ok");
    expect(seen).toEqual(["tok-0", "tok-1"]);
  });

  it("retries only once: a 401 on the fresh token is the answer, not a loop", async () => {
    const { h, mints } = holder(LIVE);
    let calls = 0;
    const r = await h.withToken(
      async () => {
        calls += 1;
        return { status: 401 };
      },
      { isRejected: (x) => x.status === 401 },
    );
    expect(r.status).toBe(401);
    expect(calls).toBe(2);
    expect(mints()).toBe(1);
  });

  it("other failures are not retried and mint nothing", async () => {
    const { h, mints } = holder(LIVE);
    let calls = 0;
    await expect(
      h.withToken(async () => {
        calls += 1;
        throw new Error("list_my_feedback failed (500): boom");
      }),
    ).rejects.toThrow("(500)");
    const r = await h.withToken(async () => ({ status: 403 }), { isRejected: (x) => x.status === 401 });
    expect(r.status).toBe(403);
    expect(calls).toBe(1);
    expect(mints()).toBe(0);
  });

  it("when the renewal fails, the original 401 stands and the call is not repeated", async () => {
    const { h, failures } = holder(LIVE, { fail: true });
    let calls = 0;
    await expect(
      h.withToken(async () => {
        calls += 1;
        throw new Error("record failed (401)");
      }),
    ).rejects.toThrow("(401)");
    expect(calls).toBe(1);
    expect(failures).toHaveLength(1);
  });

  it("two callers rejected on the same token cause one mint, not two", async () => {
    const { h, mints } = holder(LIVE);
    const call = (t: string) => Promise.resolve({ status: t === "tok-0" ? 401 : 200 });
    const rej = { isRejected: (x: { status: number }) => x.status === 401 };
    const [a, b] = await Promise.all([h.withToken(call, rej), h.withToken(call, rej)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(mints()).toBe(1);
  });

  it("a caller rejected on a token someone already replaced retries without minting", async () => {
    const { h, mints } = holder(LIVE);
    await h.renewAfterRejection("tok-0"); // first rejection: mints tok-1
    expect(await h.renewAfterRejection("tok-0")).toBe("tok-1"); // stale rejection: no second mint
    expect(mints()).toBe(1);
  });

  it("recognizes a 401 only as a status in parentheses", () => {
    expect(isUnauthorizedError(new Error("list_my_feedback failed (401): invalid-token"))).toBe(true);
    expect(isUnauthorizedError(new Error("ticket 4012 failed (500)"))).toBe(false);
    expect(isUnauthorizedError("(401)")).toBe(false);
  });
});

describe("triage uses the shared holder (FR-016)", () => {
  function schedule(h: McpTokenHolder, scans: string[], runs: TriageRunOptions[]): TriageSchedule {
    const repoRoot = mkdtempSync(join(tmpdir(), "mcp-token-"));
    mkdirSync(join(repoRoot, TRIAGE_DIR), { recursive: true });
    return new TriageSchedule({
      repoRoot,
      config: { projectToken: "wxk_live_test", supervisor: "KAIN", appBaseUrl: "https://app.test", mcpUrl: "https://mcp.test" },
      projectId: "ba924193-0335-4080-9fa6-33cd6b81300a",
      post: () => undefined,
      // Before 06:00, so start() arms without a catch-up run; TRIAGE below is the only run.
      now: () => new Date(2026, 9, 27, 5, 30),
      tokens: h,
      fetchSettings: async () => ({ allowRemote: true, feedbackSink: true }),
      refreshToken: async () => {
        throw new Error("a run must not mint its own token when a holder is given");
      },
      scanNow: async (s: FingerprintSource) => {
        scans.push(s.mcpToken);
        if (s.mcpToken === "tok-0") throw new Error("list_my_feedback failed (401): invalid-token");
        return { fingerprint: {}, titles: [] };
      },
      run: async (o) => {
        runs.push(o);
        return { ok: false, cause: "stub", blocks: [] };
      },
    });
  }

  it("a token revoked behind the bridge's back is caught by the scan and the run starts on the new one", async () => {
    const { h, mints } = holder({ token: "tok-0", expiresAt: inMs(10 * 60 * 60 * 1000) });
    const scans: string[] = [];
    const runs: TriageRunOptions[] = [];
    const s = schedule(h, scans, runs);
    await s.start();
    await s.trigger();
    expect(scans).toEqual(["tok-0", "tok-1"]);
    expect(runs).toHaveLength(1);
    expect(runs[0].mcpToken).toBe("tok-1");
    expect(mints()).toBe(1);
    // The gate draws from the same holder, so it is on the same live token.
    expect(await h.get()).toBe("tok-1");
  });
});
// [SCOPE 148 / T012] END
