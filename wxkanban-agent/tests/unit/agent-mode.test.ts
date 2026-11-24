/**
 * SCOPE-134 / T019, T022, T030 — project-agent mode: room binding, one agent per tree, the
 * audit record.
 *
 * Real behaviour against a temp directory and a stubbed fetch. The assertions that matter
 * most are the ones about what does NOT happen: no second yca_ mint while a copy is held
 * (SC-5), no start on an occupied tree (FR-026), no project agent tagged like its
 * supervisor (FR-032).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import {
  acquireWorktreeLock,
  assertDistinctTag,
  CompanyAccountNeededError,
  connectProjectAgent,
  lockPath,
  readProjectAgentConfig,
  recordOverride,
  refusalCode,
  roomStatePath,
  type ProjectAgentConfig,
} from "../../apps/remote-bridge/src/agent-mode";

// [SCOPE 134 / T030] BEGIN — project agent tests
let root: string;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-mode-"));
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

const PROJECT = "11111111-1111-4111-8111-111111111111";
const cfg: ProjectAgentConfig = {
  projectToken: "kit-project-token",
  supervisor: "KAIN",
  appBaseUrl: "https://app.test",
  mcpUrl: "https://mcp.test",
};

function roomReply(room: { minted: boolean; agentToken?: string }) {
  return {
    projectId: PROJECT,
    projectName: "wxKanban",
    agentName: "PROJECT-AGENT",
    mcp: { token: "wxk-bound-token", expiresAt: "2026-09-26T00:00:00.000Z" },
    room: { conversationId: "conv-1", operatorEmail: "andy@wxperts.com", ...room },
  };
}

function stubFetch(replies: unknown[]) {
  const calls: Array<{ url: string; body: Record<string, unknown>; auth: string }> = [];
  const fn = vi.fn(async (url: string, init: { body: string; headers: Record<string, string> }) => {
    calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown>, auth: init.headers.authorization });
    const next = replies.shift();
    return new Response(JSON.stringify(next), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

describe("readProjectAgentConfig", () => {
  it("is off without --project-agent — the bridge runs as SCOPE-102 built it", () => {
    expect(readProjectAgentConfig([], { WXKANBAN_API_TOKEN: "t" }, root)).toBeNull();
  });

  it("uses the project's kit token and defaults the supervisor to KAIN", () => {
    const c = readProjectAgentConfig(["--project-agent"], { WXKANBAN_API_TOKEN: "t" }, root);
    expect(c?.projectToken).toBe("t");
    expect(c?.supervisor).toBe("KAIN");
  });

  it("refuses to start without a project token", () => {
    expect(() => readProjectAgentConfig(["--project-agent"], {}, root)).toThrow(/kit API token/);
  });

  it("refuses an invalid supervisor name", () => {
    expect(() =>
      readProjectAgentConfig(["--project-agent"], { WXKANBAN_API_TOKEN: "t", WXKANBAN_SUPERVISOR: "no spaces" }, root),
    ).toThrow(/not a valid agent name/);
  });
});

describe("assertDistinctTag (FR-032)", () => {
  it("refuses a project agent tagged like its supervisor, case-insensitively", () => {
    expect(() => assertDistinctTag("kain", "KAIN")).toThrow(/Refusing to start/);
    expect(() => assertDistinctTag("wxKanban", "KAIN")).not.toThrow();
  });
});

describe("connectProjectAgent — mint once (SC-5), nothing hand-wired (SC-1)", () => {
  it("first bind: the server mints, the token is persisted locally", async () => {
    const calls = stubFetch([roomReply({ minted: true, agentToken: "yca_first" })]);
    const conn = await connectProjectAgent(cfg, root);

    expect(conn.yappchattToken).toBe("yca_first");
    expect(conn.conversationId).toBe("conv-1");
    expect(conn.agentName).toBe("PROJECT-AGENT");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://app.test/api/project-agent/room");
    expect(calls[0].auth).toBe("Bearer kit-project-token");
    // FR-013: neither a project nor a room id is ever sent.
    expect(Object.keys(calls[0].body)).toEqual(["supervisor"]);

    const saved = JSON.parse(readFileSync(roomStatePath(root), "utf-8")) as Record<string, { token: string }>;
    expect(saved["project-agent:KAIN"].token).toBe("yca_first");
  });

  it("rebind with a held copy: NO second mint", async () => {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(
      roomStatePath(root),
      JSON.stringify({ "project-agent:KAIN": { conversationId: "conv-1", token: "yca_held" } }),
    );
    const calls = stubFetch([roomReply({ minted: false })]);
    const conn = await connectProjectAgent(cfg, root);

    expect(conn.yappchattToken).toBe("yca_held");
    expect(calls).toHaveLength(1);
    expect(calls[0].body.mintAgentToken).toBeUndefined();
  });

  it("bound room but no local copy: exactly one deliberate re-mint", async () => {
    const calls = stubFetch([roomReply({ minted: false }), roomReply({ minted: true, agentToken: "yca_new" })]);
    const conn = await connectProjectAgent(cfg, root);

    expect(conn.yappchattToken).toBe("yca_new");
    expect(calls).toHaveLength(2);
    expect(calls[1].body.mintAgentToken).toBe(true);
  });

  it("surfaces a refusal plainly and does not retry (FR-016)", async () => {
    const fn = vi.fn(async () => new Response(JSON.stringify({ error: "not_a_member" }), { status: 502 }));
    vi.stubGlobal("fetch", fn);
    await expect(connectProjectAgent(cfg, root)).rejects.toThrow(/refused \(502\).*not_a_member/);
    expect(fn).toHaveBeenCalledTimes(1);
  });
});
// [SCOPE 134 / T030] END

// [SCOPE 144 / T011] BEGIN — company account question (FR-006)
describe("connectProjectAgent — no company account (SCOPE-144 FR-006)", () => {
  const QUESTION = "Create the company YappChatt account now, using ops@acme.test?";
  const noAccount = () =>
    new Response(JSON.stringify({ error: "no_company_account", contactEmail: "ops@acme.test" }), { status: 409 });

  function stubSequence(responses: Array<() => Response>) {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const fn = vi.fn(async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) as Record<string, unknown> });
      const next = responses.shift();
      if (!next) throw new Error("unexpected extra fetch");
      return next();
    });
    vi.stubGlobal("fetch", fn);
    return calls;
  }
  const ok = () => new Response(JSON.stringify(roomReply({ minted: true, agentToken: "yca_new" })), { status: 200 });

  it("yes: retries once with createCompanyAccount: true and connects", async () => {
    const calls = stubSequence([noAccount, ok]);
    const ask = vi.fn(async () => true);
    const conn = await connectProjectAgent(cfg, root, { ask });

    expect(ask).toHaveBeenCalledWith(QUESTION);
    expect(calls).toHaveLength(2);
    expect(calls[0].body.createCompanyAccount).toBeUndefined();
    expect(calls[1].body.createCompanyAccount).toBe(true);
    expect(conn.yappchattToken).toBe("yca_new");
  });

  it("no: stops with the question, creates nothing, one fetch only", async () => {
    const calls = stubSequence([noAccount]);
    const err = await connectProjectAgent(cfg, root, { ask: async () => false }).catch((e: unknown) => e);

    expect((err as Error).message).toBe(`${QUESTION} Not created.`);
    expect(refusalCode(err)).toBe("no_company_account");
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://app.test/api/project-agent/room");
  });

  it("non-TTY with no ask: throws the re-run hint, one fetch only", async () => {
    const calls = stubSequence([noAccount]);
    await expect(connectProjectAgent(cfg, root, { isTTY: false })).rejects.toThrow(
      `${QUESTION} Re-run with --create-company-account to create it.`,
    );
    expect(calls).toHaveLength(1);
  });

  it("--create-company-account: the first call already carries createCompanyAccount: true", async () => {
    const c = readProjectAgentConfig(["--project-agent", "--create-company-account"], { WXKANBAN_API_TOKEN: "t" }, root);
    expect(c?.createCompanyAccount).toBe(true);
    expect(readProjectAgentConfig(["--project-agent"], { WXKANBAN_API_TOKEN: "t" }, root)?.createCompanyAccount).toBe(false);

    const calls = stubSequence([ok]);
    await connectProjectAgent({ ...cfg, createCompanyAccount: true }, root);
    expect(calls).toHaveLength(1);
    expect(calls[0].body.createCompanyAccount).toBe(true);
  });

  it("words the question without an email when the server sent none", async () => {
    stubSequence([() => new Response(JSON.stringify({ error: "no_company_account" }), { status: 409 })]);
    const ask = vi.fn(async () => false);
    await connectProjectAgent(cfg, root, { ask }).catch(() => undefined);
    expect(ask).toHaveBeenCalledWith("Create the company YappChatt account now?");
  });

  it("refusalCode still maps the needed-error to no_company_account", () => {
    expect(refusalCode(new CompanyAccountNeededError("a@b.test"))).toBe("no_company_account");
    expect(refusalCode(new Error('project agent room refused (409): {"error":"no_company_account"}'))).toBe(
      "no_company_account",
    );
  });
});
// [SCOPE 144 / T011] END

// [SCOPE 134 / T022] BEGIN — one agent per working tree
describe("acquireWorktreeLock (FR-026)", () => {
  it("refuses when another live session holds the tree", () => {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    // The test runner's parent is alive and is not us.
    writeFileSync(lockPath(root), JSON.stringify({ pid: process.ppid, owner: "ALIS bridge", since: "x" }));
    expect(() => acquireWorktreeLock(root, "KAIN bridge")).toThrow(/Refusing to start: ALIS bridge/);
  });

  it("takes over a stale lock whose owner is gone, so a crash never wedges the tree", () => {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(lockPath(root), JSON.stringify({ pid: 2 ** 22 + 12345, owner: "dead", since: "x" }));
    const lock = acquireWorktreeLock(root, "KAIN bridge");
    expect(JSON.parse(readFileSync(lockPath(root), "utf-8")).pid).toBe(process.pid);
    lock.release();
    expect(existsSync(lockPath(root))).toBe(false);
  });

  it("release never deletes a lock someone else now holds", () => {
    const lock = acquireWorktreeLock(root, "KAIN bridge");
    writeFileSync(lockPath(root), JSON.stringify({ pid: process.ppid, owner: "other" }));
    lock.release();
    expect(existsSync(lockPath(root))).toBe(true);
  });
});
// [SCOPE 134 / T022] END

// [SCOPE 134 / T019] BEGIN — the record call
describe("recordOverride (FR-004, FR-006)", () => {
  it("files a grant naming the human who approved it", async () => {
    const seen: Array<Record<string, unknown>> = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url: string, init: { body: string }) => {
        seen.push(JSON.parse(init.body) as Record<string, unknown>);
        return new Response(
          JSON.stringify({ result: { content: [{ type: "text", text: JSON.stringify({ success: true }) }] } }),
          { status: 200 },
        );
      }),
    );
    const r = await recordOverride("https://mcp.test", "tok", {
      projectId: PROJECT,
      agentName: "KAIN",
      sessionId: "sess-1",
      action: "gitpush",
      granted: true,
      grantedBy: "Andy",
      requestText: "git push origin main",
    });
    expect(r.ok).toBe(true);
    const params = seen[0].params as { name: string; arguments: Record<string, unknown> };
    expect(params.name).toBe("project.record_override");
    expect(params.arguments).toMatchObject({ outcome: "granted", grantedBy: "Andy", action: "gitpush", sessionId: "sess-1" });
  });

  it("files a refusal with no grantor, and reports a failed record instead of hiding it", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 500 })));
    const r = await recordOverride("https://mcp.test", "tok", {
      projectId: PROJECT,
      agentName: "KAIN",
      action: "prodatawrite",
      granted: false,
      requestText: "drizzle-kit push",
    });
    expect(r.ok).toBe(false);
  });
});
// [SCOPE 134 / T019] END
