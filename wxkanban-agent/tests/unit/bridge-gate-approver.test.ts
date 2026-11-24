/**
 * [SCOPE 159 / T005] User-id gate check on every gate kind (SPEC-159 FR-004).
 * A person with a user id who is not an approver answers no gate; an approver does;
 * the supervisor's relay (KAIN) does; the gate keeps waiting after a refusal.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  handlers: undefined as
    | undefined
    | { onStatus: (s: string) => void; onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean; authorId?: string }) => void },
  posts: [] as string[],
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
    async send(t: string) {
      room.posts.push(t);
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

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { NOT_RECORDED_NOTE } from "../../apps/remote-bridge/src/decision-reply";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };

async function bridge(): Promise<RemoteBridge> {
  const b = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "wx-gate-")),
    agent: AGENT,
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: async (id: string) =>
      id === "u-admin" ? { approver: true, name: "Andy", role: "ADMIN" } : { approver: false, name: "Bob", role: "MEMBER" },
  } as never);
  await b.run();
  room.handlers?.onStatus("connected");
  return b;
}
const say = (from: string, text: string, authorId?: string, isAgent = false) =>
  room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now(), isAgent, authorId });
const settle = () => new Promise((r) => setTimeout(r, 5));

beforeEach(() => {
  sent.length = 0;
  room.posts.length = 0;
  go.confirmed = 0;
  go.awaiting = true;
});

describe("FR-004 who may answer a waiting gate", () => {
  it("a non-approver with a user id is refused and the gate keeps waiting", async () => {
    await bridge();
    say("Bob", "go", "u-bob");
    await settle();
    expect(go.confirmed).toBe(0);
    expect(room.posts.some((p) => p.includes(NOT_RECORDED_NOTE))).toBe(true);
  });

  it("an approver id settles the gate", async () => {
    await bridge();
    say("Andy", "go", "u-admin");
    await settle();
    expect(go.confirmed).toBe(1);
  });

  it("the supervisor relaying an answer settles the gate", async () => {
    await bridge();
    say("KAIN", "[KAIN] go", undefined, true);
    await settle();
    expect(go.confirmed).toBe(1);
  });

  it("a refused answer first, then an approver: the gate still settles once", async () => {
    await bridge();
    say("Bob", "go", "u-bob");
    await settle();
    expect(go.confirmed).toBe(0);
    say("Andy", "go", "u-admin");
    await settle();
    expect(go.confirmed).toBe(1);
  });
});

// [SCOPE 159 / T006] a worker cannot pose as a person: the bridge stamps the true identity
describe("FR-019 bridge-stamped worker identity", () => {
  it("a worker claiming an approver sender answers no gate and is counted", async () => {
    const b = await bridge();
    b.workers.register({ id: "w1", run: "r-1", unit: "T010", persona: "backend", model: "sonnet" });
    const r = b.receiveFromWorker("w1", {
      contractVersion: "1.0.0",
      projectId: "p-1",
      source: "local",
      to: "agent",
      kind: "reply",
      body: "go",
      sender: { kind: "user", id: "u-admin" },
    });
    expect(r.ok).toBe(true);
    expect(go.confirmed).toBe(0);
    expect(b.workers.overwriteCount()).toBe(1);
    expect(sent.some((s) => s.startsWith("[from-agent worker:w1]"))).toBe(true);
  });
});
