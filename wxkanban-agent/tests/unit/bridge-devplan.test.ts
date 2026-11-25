/**
 * [SCOPE 159 / T020] "run devplan" wired into ingest (SPEC-159 FR-061). From the developer or a
 * Room Approver the list is shown and waits for go; from KAIN it starts at once; from anyone else
 * it is discussion and never starts anything. The command never reaches the AI session.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  handlers: undefined as
    | undefined
    | { onStatus: (s: string) => void; onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean; authorId?: string }) => void },
}));
const sent = vi.hoisted(() => [] as string[]);
const posted = vi.hoisted(() => [] as string[]);
const ap = vi.hoisted(() => ({ starts: 0, confirms: 0 }));

vi.mock("../../core/yappchatt", () => ({
  resolveYappchattConfig: () => ({ config: {}, user: { email: "andy@wxperts.com", displayName: "KAIN" } }),
  YappchattClient: class {
    constructor(_c: unknown, _u: unknown, h: typeof room.handlers) {
      room.handlers = h;
    }
    async start() {}
    async send(t: string) {
      posted.push(t);
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
    private awaiting = false;
    get isAwaitingGo() {
      return this.awaiting;
    }
    get pendingScopes() {
      return undefined;
    }
    async start() {
      ap.starts += 1;
      this.awaiting = true;
    }
    confirmGo() {
      ap.confirms += 1;
      this.awaiting = false;
      return [];
    }
    skip() {
      return undefined;
    }
  },
}));

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function bridge(): Promise<RemoteBridge> {
  const b = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "wx-devplan-")),
    agent: { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" },
    supervisor: "KAIN",
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: async (id: string) => (id === "u-approver" ? { approver: true, name: "Ann" } : { approver: false }),
  } as never);
  await b.run();
  room.handlers?.onStatus("connected");
  return b;
}
const say = (text: string, authorId?: string, isAgent?: boolean) =>
  room.handlers?.onMessage({ id: String(Math.random()), from: isAgent ? "KAIN" : "Someone", text, ts: Date.now(), authorId, isAgent });
const settle = () => new Promise((r) => setTimeout(r, 20));

beforeEach(() => {
  sent.length = 0;
  posted.length = 0;
  ap.starts = 0;
  ap.confirms = 0;
});

describe("UT-036 run devplan", () => {
  it("a Room Approver gets the list and it waits for go; the session never sees the command", async () => {
    await bridge();
    const base = ap.starts; // the connect-time list
    say("run devplan", "u-approver");
    await settle();
    expect(sent).not.toContain("run devplan");
    expect(ap.starts).toBe(base);
    expect(ap.confirms).toBe(0);
  });

  it("KAIN starts the run at once", async () => {
    await bridge();
    say("[KAIN] run devplan", undefined, true);
    await settle();
    expect(sent).not.toContain("run devplan");
    expect(ap.confirms).toBeGreaterThanOrEqual(1);
  });

  it("a stranger's run devplan is discussion and starts nothing", async () => {
    await bridge();
    const base = ap.starts;
    say("run devplan", "u-stranger");
    await settle();
    expect(ap.starts).toBe(base);
    expect(ap.confirms).toBe(0);
    expect(sent.some((s) => s.includes("Not taken as an instruction"))).toBe(true);
  });
});
