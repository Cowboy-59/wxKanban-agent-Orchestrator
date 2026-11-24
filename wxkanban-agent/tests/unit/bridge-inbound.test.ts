/**
 * [SCOPE 159 / T004] One inbound path (SPEC-159 FR-003, FR-017). UT-030 a waiting devplan list
 * takes only go / no / skip; UT-031 a worker or agent line is marked from-agent from every source;
 * UT-032 the one-release old-path switch keeps the old behavior.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  handlers: undefined as
    | undefined
    | { onStatus: (s: string) => void; onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean }) => void },
}));
const sent = vi.hoisted(() => [] as string[]);
const go = vi.hoisted(() => ({ confirmed: 0, awaiting: true }));

vi.mock("../../core/yappchatt", () => ({
  resolveYappchattConfig: () => ({ config: {}, user: { email: "andy@wxperts.com", displayName: "KAIN" } }),
  YappchattClient: class {
    constructor(_c: unknown, _u: unknown, h: typeof room.handlers) {
      room.handlers = h;
    }
    async start() {}
    async send() {
      return true;
    }
    formatOutgoing(text: string) {
      return `[KAIN] ${text}`;
    }
    dispose() {}
  },
}));
vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    get id() {
      return "sess-1";
    }
    async start() {}
    send(t: string) {
      sent.push(t);
    }
    stop() {}
    async interrupt() {}
  },
}));
vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => ({ ok: true, output: "" }),
}));
vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  recordOverride: async () => ({ ok: true, detail: "" }),
  readyLine: (p: string) => `[bridge] ready project=${p}`,
}));
vi.mock("../../apps/remote-bridge/src/autopilot-schedule", () => ({
  AutopilotSchedule: class {
    async start() {}
    get isAwaitingGo() {
      return go.awaiting;
    }
    get pendingScopes() {
      return go.awaiting ? [{ num: "200", title: "First", stage: "implementation" }] : undefined;
    }
    confirmGo() {
      go.confirmed += 1;
      go.awaiting = false;
      return [];
    }
  },
}));

import { fromLocalRoom, isListAnswer, labelFromAgent, listTakesMessage, oldInboundPathOn } from "../../apps/remote-bridge/src/inbound";
import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };

async function bridge(oldInboundPath?: boolean): Promise<RemoteBridge> {
  const b = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "wx-inbound-")),
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    oldInboundPath,
  });
  await b.run();
  room.handlers?.onStatus("connected");
  return b;
}
const say = (text: string) => room.handlers?.onMessage({ id: String(Math.random()), from: "Andy", text, ts: Date.now() });

beforeEach(() => {
  sent.length = 0;
  go.confirmed = 0;
  go.awaiting = true;
});

describe("UT-030 a waiting list takes only go, no or skip", () => {
  it("pure rule", () => {
    for (const t of ["go", "GO!", "go debug", "no", "skip 200"]) expect(isListAnswer(t)).toBe(true);
    for (const t of ["please also check x", "go ahead and refactor", "skip", "yes"]) expect(isListAnswer(t)).toBe(false);
    expect(listTakesMessage("CANCEL REMOTE", true)).toBe(false);
  });

  it("other text runs as an instruction and leaves the list waiting", async () => {
    await bridge();
    say("please also check the billing page");
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toContain("please also check the billing page");
    expect(go.confirmed).toBe(0);
    say("go");
    await new Promise((r) => setTimeout(r, 0));
    expect(go.confirmed).toBe(1);
  });
});

describe("UT-031 from-agent mark from every source", () => {
  it("a local worker line is labeled and answers no gate", async () => {
    const b = await bridge();
    const r = b.receiveLocal({ contractVersion: "1.0.0", projectId: "p-1", source: "local", to: "agent", kind: "notice", body: "go" }, { kind: "worker", id: "w1" });
    expect(r.ok).toBe(true);
    expect(go.confirmed).toBe(0);
    expect(sent.some((s) => s.startsWith("[from-agent worker:w1]") && s.endsWith("go"))).toBe(true);
  });

  it("fromLocalRoom marks agents and not users", () => {
    const base = { contractVersion: "1.0.0", projectId: "p-1", seq: 3, sentAt: "2026-11-24T00:00:00Z", source: "local", to: "agent", kind: "notice", body: "hi" } as never;
    expect(fromLocalRoom({ ...(base as object), sender: { kind: "worker", id: "w1" } } as never).fromAgent).toBe(true);
    const u = fromLocalRoom({ ...(base as object), sender: { kind: "user", id: "u1" } } as never);
    expect(u.fromAgent).toBe(false);
    expect(u.authorId).toBe("u1");
    expect(labelFromAgent({ source: "local", text: "x", from: "worker:w1", fromAgent: true })).toBe("[from-agent worker:w1] x");
  });
});

describe("UT-032 the old-path switch", () => {
  it("option wins, then env", () => {
    expect(oldInboundPathOn(true, {} as never)).toBe(true);
    expect(oldInboundPathOn(false, { WXAI_OLD_INBOUND: "1" } as never)).toBe(false);
    expect(oldInboundPathOn(undefined, { WXAI_OLD_INBOUND: "1" } as never)).toBe(true);
    expect(oldInboundPathOn(undefined, {} as never)).toBe(false);
  });

  it("old path: any text answers the waiting list", async () => {
    await bridge(true);
    say("please also check the billing page");
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).not.toContain("please also check the billing page");
  });
});
