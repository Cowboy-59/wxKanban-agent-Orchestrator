/**
 * SCOPE-134 / T019, T020, T024 — the bridge in agent mode, end to end with the room and
 * the SDK session stubbed.
 *
 * T024 is the one that matters most: CANCEL REMOTE must halt an agent that is WORKING —
 * mid-turn, with a gated action suspended awaiting approval — not merely one idling for
 * input. The test drives exactly that state and asserts the session is torn down, the
 * suspended action is refused, and the process exits, inside SC-9's 5 seconds.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { HookCallback } from "@anthropic-ai/claude-agent-sdk";

// ── stubs ────────────────────────────────────────────────────────────────────
const room = vi.hoisted(() => ({
  posts: [] as string[],
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string) => void;
        onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean }) => void;
      },
}));

vi.mock("../../core/yappchatt", () => ({
  resolveYappchattConfig: () => ({ config: {}, user: { email: "andy@wxperts.com", displayName: "KAIN" } }),
  YappchattClient: class {
    constructor(_c: unknown, _u: unknown, h: typeof room.handlers) {
      room.handlers = h;
    }
    async start() {
      /* connected by the test */
    }
    async send(text: string) {
      room.posts.push(text);
      return true;
    }
    formatOutgoing(text: string) {
      return `[KAIN] ${text}`;
    }
    dispose() {
      /* noop */
    }
  },
}));

const session = vi.hoisted(() => ({
  gate: undefined as HookCallback | undefined,
  sent: [] as string[],
  stopped: false,
}));

vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    constructor(opts: { overrideGate?: HookCallback }) {
      session.gate = opts.overrideGate;
    }
    get id() {
      return "sess-123";
    }
    async start() {
      /* noop */
    }
    send(t: string) {
      session.sent.push(t);
    }
    stop() {
      session.stopped = true;
    }
    async interrupt() {
      /* noop */
    }
  },
}));

vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => ({ ok: true, output: "" }),
}));

const records = vi.hoisted(() => [] as Array<Record<string, unknown>>);
vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  recordOverride: async (_url: string, _tok: string, rec: Record<string, unknown>) => {
    records.push(rec);
    return { ok: true, detail: "" };
  },
}));

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";

// [SCOPE 134 / T024] BEGIN — bridge test helpers
const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };

async function connectedBridge(supervisor: string | null = "KAIN"): Promise<RemoteBridge> {
  const bridge = new RemoteBridge({ projectName: "wxKanban", cwd: ".", agent: AGENT, supervisor: supervisor ?? undefined });
  await bridge.run();
  room.handlers?.onStatus("connected");
  return bridge;
}

const say = (text: string, from = "Andy") =>
  room.handlers?.onMessage({ id: String(Math.random()), from, text, ts: Date.now() });

/** A post by an agent principal — every agent in a room is the same user, "Claude". */
const agentSays = (text: string) =>
  room.handlers?.onMessage({ id: String(Math.random()), from: "Claude", text, ts: Date.now(), isAgent: true });

const tick = () => new Promise((r) => setTimeout(r, 0));

/** Drive the gate exactly as the SDK does: a PreToolUse hook call. Maps the hook's
 * decision back to allow/deny so the assertions read plainly. */
async function askGate(command: string): Promise<{ behavior: "allow" | "deny" }> {
  const hook = session.gate as HookCallback;
  const out = (await hook(
    { hook_event_name: "PreToolUse", tool_name: "Bash", tool_input: { command }, tool_use_id: "t" } as never,
    "t",
    { signal: new AbortController().signal },
  )) as { hookSpecificOutput?: { permissionDecision?: string } };
  return { behavior: out.hookSpecificOutput?.permissionDecision === "allow" ? "allow" : "deny" };
}

// [SCOPE 134 / T024] END

beforeEach(() => {
  room.posts.length = 0;
  records.length = 0;
  session.sent.length = 0;
  session.stopped = false;
  session.gate = undefined;
});

// [SCOPE 134 / T019] BEGIN — decisions are filed, naming who decided
describe("agent-mode bridge — every decision is recorded (T019)", () => {
  it("a grant is filed with the human who answered it", async () => {
    await connectedBridge();
    const pending = askGate("git push origin main");
    await tick();
    await tick();
    say("CONFIRMED", "Andy");
    const result = await pending;
    await tick();

    expect(result.behavior).toBe("allow");
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      projectId: "p-1",
      agentName: "PROJECT-AGENT",
      sessionId: "sess-123",
      action: "gitpush",
      granted: true,
      grantedBy: "Andy",
    });
  });

  it("a refusal is filed too, with no grantor", async () => {
    await connectedBridge();
    const pending = askGate("drizzle-kit push");
    await tick();
    say("no");
    expect((await pending).behavior).toBe("deny");
    await tick();
    expect(records[0]).toMatchObject({ action: "prodatawrite", granted: false });
    expect(records[0].grantedBy).toBeUndefined();
  });

  it("asks as the project agent and says who may answer (T020)", async () => {
    await connectedBridge();
    void askGate("drizzle-kit push");
    await tick();
    const ask = room.posts.find((p) => p.startsWith("The project agent is asking to run a gated action."));
    expect(ask).toMatch(/\(you or KAIN\)/);
  });

  it("KAIN may grant (FR-033), and the record names KAIN as grantor", async () => {
    await connectedBridge();
    const pending = askGate("git push origin main");
    await tick();
    await tick();
    agentSays("[KAIN] CONFIRMED");
    expect((await pending).behavior).toBe("allow");
    await tick();
    expect(records[0]).toMatchObject({ granted: true, grantedBy: "KAIN" });
  });
});
// [SCOPE 134 / T019] END

// [SCOPE 134 / T031] BEGIN — who the project agent listens to (FR-032)
describe("project agent — input from KAIN, nothing from other agents", () => {
  it("relays a [KAIN] message into the session, tag stripped", async () => {
    await connectedBridge();
    agentSays("[KAIN] what is the status of SPEC-134?");
    expect(session.sent).toEqual(["what is the status of SPEC-134?"]);
  });

  it("drops its own posts and any other agent's", async () => {
    await connectedBridge();
    agentSays("[wxKanban] Status — idle");
    agentSays("[ALIS] do something");
    agentSays("no tag at all");
    expect(session.sent).toEqual([]);
  });

  it("an operator-driven bridge (no supervisor) ignores KAIN entirely", async () => {
    await connectedBridge(null);
    agentSays("[KAIN] push everything");
    expect(session.sent).toEqual([]);
  });

  it("a [KAIN] refusal answers the gate as a refusal", async () => {
    await connectedBridge();
    const pending = askGate("drizzle-kit push");
    await tick();
    agentSays("[KAIN] no");
    expect((await pending).behavior).toBe("deny");
  });
});
// [SCOPE 134 / T031] END

// [SCOPE 134 / T024] BEGIN — the kill switch halts a WORKING agent
describe("CANCEL REMOTE mid-task (T024, SC-9)", () => {
  it("tears down a working session with a gated action suspended, refuses it, and exits within 5s", async () => {
    const exit = vi.spyOn(process, "exit").mockImplementation((() => undefined) as never);
    await connectedBridge();

    // Working, not idle: a turn is in flight...
    say("refactor the auth module");
    expect(session.sent).toEqual(["refactor the auth module"]);
    // ...and it has reached a gated action that is suspended awaiting approval.
    const pending = askGate("git push origin main");
    await tick();
    await tick();

    const t0 = Date.now();
    say("CANCEL REMOTE");
    const result = await pending;
    await vi.waitFor(() => expect(exit).toHaveBeenCalledWith(0), { timeout: 5000 });
    const elapsed = Date.now() - t0;

    expect(result.behavior).toBe("deny");
    expect(session.stopped).toBe(true);
    expect(elapsed).toBeLessThan(5000);
    // The abandoned action is recorded as refused, not silently dropped.
    expect(records[records.length - 1]).toMatchObject({ granted: false });
    exit.mockRestore();
  });
});
// [SCOPE 134 / T024] END
