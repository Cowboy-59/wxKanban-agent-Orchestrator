/**
 * SCOPE-149 / T006 — the bridge arms the handoff watcher only in project-agent mode and posts
 * a waiting handoff with the [HANDOFF] prefix; its own post, echoed back, never reaches the session.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";

// [SCOPE 149 / T006] BEGIN — bridge handoff tests
// MODIFIED-BY: [SCOPE 149 / T007] — the session mock records its options and handlers, and one ordered log covers posts and sends
const room = vi.hoisted(() => ({
  posts: [] as string[],
  log: [] as string[],
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
      room.log.push(`post:${text}`);
      return true;
    }
    formatOutgoing(text: string) {
      return `[wxKanban] ${text}`;
    }
    dispose() {
      /* noop */
    }
  },
}));

type GuardHook = (input: unknown, id: string | undefined, o: { signal: AbortSignal }) => Promise<unknown>;
const session = vi.hoisted(() => ({
  sent: [] as string[],
  opts: undefined as undefined | { turnGuard?: GuardHook },
  handlers: undefined as undefined | { onResult: (subtype: string) => void },
}));
vi.mock("../../apps/remote-bridge/src/session", () => ({
  BridgeSession: class {
    constructor(o: typeof session.opts, h: typeof session.handlers) {
      session.opts = o;
      session.handlers = h;
    }
    get id() {
      return "sess-1";
    }
    async start() {
      /* noop */
    }
    send(t: string) {
      session.sent.push(t);
      room.log.push(`send:${t}`);
    }
    stop() {
      /* noop */
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

vi.mock("../../apps/remote-bridge/src/agent-mode", () => ({
  readyLine: (name: string) => `[ready] ${name}`,
  recordOverride: async () => ({ ok: true, detail: "" }),
  refreshMcpToken: async () => ({ token: "t", expiresAt: "" }),
}));

vi.mock("../../apps/remote-bridge/src/triage-schedule", () => ({
  TriageSchedule: class {
    isRunning = false;
    async start() {
      /* noop */
    }
    stop() {
      /* noop */
    }
    async trigger() {
      /* noop */
    }
  },
}));

import { handoffFileName } from "../../apps/remote-bridge/src/handoff-writer";
import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { handoffPrompt } from "../../apps/remote-bridge/src/handoff-turn";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };
const PA_CONFIG = {} as never;
const tick = () => new Promise((r) => setTimeout(r, 20));

let cwd: string;
let bridge: RemoteBridge | undefined;

function plantHandoff(): void {
  const d = join(cwd, ".wxai", "handoff");
  mkdirSync(d, { recursive: true });
  const name = handoffFileName(new Date());
  writeFileSync(join(d, name), `created-at: ${new Date().toISOString()}\nmasked: 0\n\nGoal: ship the thing\n`);
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), "bridge-handoff-"));
  room.posts.length = 0;
  room.log.length = 0;
  session.sent.length = 0;
  session.opts = undefined;
  session.handlers = undefined;
  bridge = undefined;
});
afterEach(async () => {
  await bridge?.shutdown();
  rmSync(cwd, { recursive: true, force: true });
});

describe("bridge handoff", () => {
  it("project-agent mode posts a waiting handoff with the [HANDOFF] prefix", async () => {
    plantHandoff();
    bridge = new RemoteBridge({ projectName: "wxKanban", cwd, agent: AGENT, projectAgentConfig: PA_CONFIG });
    await bridge.run();
    room.handlers?.onStatus("connected");
    await tick();
    expect(room.posts.some((p) => p.startsWith("[HANDOFF]\n") && p.includes("Goal: ship the thing"))).toBe(true);
  });

  it("its own [HANDOFF] post echoed back as an agent message is not sent to the session", async () => {
    plantHandoff();
    bridge = new RemoteBridge({ projectName: "wxKanban", cwd, agent: AGENT, supervisor: "KAIN", projectAgentConfig: PA_CONFIG });
    await bridge.run();
    room.handlers?.onStatus("connected");
    await tick();
    const posted = room.posts.find((p) => p.startsWith("[HANDOFF]"));
    expect(posted).toBeDefined();
    // The handoff turn has already started; the echo must add nothing to what the session got.
    const before = [...session.sent];
    room.handlers?.onMessage({ id: "e1", from: "Claude", text: `[wxKanban] ${posted}`, ts: Date.now(), isAgent: true });
    expect(session.sent).toEqual(before);
  });

  it("operator mode (no projectAgentConfig) arms no watcher", async () => {
    plantHandoff();
    bridge = new RemoteBridge({ projectName: "wxKanban", cwd });
    await bridge.run();
    room.handlers?.onStatus("connected");
    await tick();
    expect(room.posts.some((p) => p.startsWith("[HANDOFF]"))).toBe(false);
  });
});
// [SCOPE 149 / T006] END

// [SCOPE 149 / T007] BEGIN — the [HANDOFF] context-only turn: order, guard lifetime, typed handoff, held messages
const WRITE = { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: "notes.txt", content: "x" } };

async function guardDecision(): Promise<string | undefined> {
  const g = session.opts?.turnGuard;
  if (!g) throw new Error("no turnGuard was registered on the session");
  const r = (await g(WRITE, undefined, { signal: new AbortController().signal })) as {
    hookSpecificOutput?: { permissionDecision?: string };
  };
  return r.hookSpecificOutput?.permissionDecision;
}

async function connectAgent(): Promise<void> {
  bridge = new RemoteBridge({ projectName: "wxKanban", cwd, agent: AGENT, projectAgentConfig: PA_CONFIG });
  await bridge.run();
  room.handlers?.onStatus("connected");
  await tick();
}

describe("bridge handoff turn", () => {
  it("sends the context-only follow-up only after the [HANDOFF] post has landed", async () => {
    plantHandoff();
    await connectAgent();
    const posted = room.log.findIndex((e) => e.startsWith("post:[HANDOFF]\n"));
    const sent = room.log.findIndex((e) => e.startsWith("send:"));
    expect(posted).toBeGreaterThanOrEqual(0);
    expect(sent).toBeGreaterThan(posted);
    expect(session.sent).toHaveLength(1);
    expect(session.sent[0]).toContain("<<<HANDOFF");
    expect(session.sent[0]).toContain("Goal: ship the thing");
  });

  it("arms the guard for the handoff turn and lifts it when the turn ends", async () => {
    plantHandoff();
    await connectAgent();
    expect(await guardDecision()).toBe("deny");
    session.handlers?.onResult("success");
    expect(await guardDecision()).toBeUndefined();
  });

  it("gives a [HANDOFF] typed by a person the same context-only turn", async () => {
    await connectAgent();
    expect(await guardDecision()).toBeUndefined();
    room.handlers?.onMessage({ id: "m1", from: "andy", text: "[handoff]\nNext: rename the helper", ts: Date.now() });
    expect(session.sent).toEqual([handoffPrompt("Next: rename the helper")]);
    expect(await guardDecision()).toBe("deny");
  });

  it("holds an operator message during the handoff turn, then runs it as a normal turn", async () => {
    plantHandoff();
    await connectAgent();
    room.handlers?.onMessage({ id: "m2", from: "andy", text: "rename the helper", ts: Date.now() });
    expect(session.sent).toHaveLength(1);
    session.handlers?.onResult("success");
    expect(session.sent).toHaveLength(2);
    expect(session.sent[1]).toBe("rename the helper");
    expect(await guardDecision()).toBeUndefined();
  });

  it("STOP during the handoff turn lifts the guard at once and drops what it held", async () => {
    plantHandoff();
    await connectAgent();
    room.handlers?.onMessage({ id: "m3", from: "andy", text: "rename the helper", ts: Date.now() });
    room.handlers?.onMessage({ id: "m4", from: "andy", text: "stop", ts: Date.now() });
    // No onResult: the interrupted turn may never report, and the agent must not stay deaf.
    expect(await guardDecision()).toBeUndefined();
    expect(room.posts.some((p) => p.includes("1 held message(s) dropped"))).toBe(true);
    room.handlers?.onMessage({ id: "m5", from: "andy", text: "run the tests", ts: Date.now() });
    expect(session.sent).toHaveLength(2);
    expect(session.sent[1]).toBe("run the tests");
    // A late result from the interrupted turn releases nothing that was dropped.
    session.handlers?.onResult("error_during_execution");
    expect(session.sent).toHaveLength(2);
  });
});
// [SCOPE 149 / T007] END
