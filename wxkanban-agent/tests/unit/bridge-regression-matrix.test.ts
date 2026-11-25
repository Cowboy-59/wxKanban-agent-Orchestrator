/**
 * [SCOPE 159 / T020] R1 regression matrix and replay check (SPEC-159 FR-016, FR-018, SC-001, SC-004).
 *
 * Matrix: every gate kind and control word x every R1 source. A gate settles only from an approver
 * checked by user id or from KAIN's relay; worker text, agent text, a stranger and a replayed line
 * settle nothing. Replay: masked run-log traffic goes through the old path and the new path and
 * the gate decisions are compared. Any gate-decision difference fails.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

const room = vi.hoisted(() => ({
  handlers: undefined as
    | undefined
    | {
        onStatus: (s: string) => void;
        onMessage: (m: { id: string; from: string; text: string; ts: number; isAgent?: boolean; authorId?: string; replayed?: boolean }) => void;
      },
  posts: [] as string[],
}));
const sent = vi.hoisted(() => [] as string[]);
const go = vi.hoisted(() => ({ confirmed: 0, awaiting: true, pushes: 0, interrupts: 0 }));

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
    async interrupt() {
      go.interrupts += 1;
    }
  },
}));
vi.mock("../../apps/remote-bridge/src/push-gate", () => ({
  runReview: async () => ({ clean: true, summary: "clean" }),
  gitTarget: async () => ({ remote: "origin", branch: "main" }),
  gitPush: async () => {
    go.pushes += 1;
    return { ok: true, output: "" };
  },
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
    skip() {
      return undefined;
    }
  },
}));

import { RemoteBridge } from "../../apps/remote-bridge/src/bridge";
import { isListAnswer } from "../../apps/remote-bridge/src/inbound";
import { existsSync, mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const AGENT = { name: "PROJECT-AGENT", projectId: "p-1", mcpUrl: "https://mcp.test", mcpToken: "tok" };

async function bridge(oldInboundPath = false): Promise<RemoteBridge> {
  const b = new RemoteBridge({
    projectName: "wxKanban",
    cwd: mkdtempSync(join(tmpdir(), "wx-matrix-")),
    agent: AGENT,
    supervisor: "KAIN",
    oldInboundPath,
    projectAgentConfig: { mcpUrl: "https://mcp.test" } as never,
    approverLookup: async (id: string) =>
      id === "u-admin" ? { approver: true, name: "Andy", role: "ADMIN" } : { approver: false, name: "Bob", role: "MEMBER" },
  } as never);
  await b.run();
  room.handlers?.onStatus("connected");
  return b;
}
const settle = () => new Promise((r) => setTimeout(r, 15));

type Source = "room_approver" | "room_stranger" | "room_kain" | "room_agent_untagged" | "room_replayed" | "local_worker" | "local_user_approver";
const SOURCES: Source[] = ["room_approver", "room_stranger", "room_kain", "room_agent_untagged", "room_replayed", "local_worker", "local_user_approver"];
/** Sources that may settle a gate (FR-004): an approver by user id, or KAIN's relay. */
const MAY_SETTLE = new Set<Source>(["room_approver", "room_kain", "local_user_approver"]);

function deliver(b: RemoteBridge, source: Source, text: string): void {
  const m = (over: Partial<{ from: string; text: string; isAgent: boolean; authorId: string; replayed: boolean }>) =>
    room.handlers?.onMessage({ id: String(Math.random()), from: "x", text, ts: Date.now(), ...over });
  switch (source) {
    case "room_approver":
      return m({ from: "Andy", authorId: "u-admin" });
    case "room_stranger":
      return m({ from: "Bob", authorId: "u-bob" });
    case "room_kain":
      return m({ from: "KAIN", text: `[KAIN] ${text}`, isAgent: true });
    case "room_agent_untagged":
      return m({ from: "Other", isAgent: true });
    case "room_replayed":
      return m({ from: "Andy", authorId: "u-admin", replayed: true });
    case "local_worker":
      b.receiveLocal({ contractVersion: "1.0.0", projectId: "p-1", source: "local", to: "agent", kind: "notice", body: text }, { kind: "worker", id: "w1" });
      return;
    case "local_user_approver":
      b.receiveLocal({ contractVersion: "1.0.0", projectId: "p-1", source: "local", to: "agent", kind: "notice", body: text }, { kind: "user", id: "u-admin" });
      return;
  }
}

beforeEach(() => {
  sent.length = 0;
  room.posts.length = 0;
  go.confirmed = 0;
  go.awaiting = true;
  go.pushes = 0;
  go.interrupts = 0;
});

const table: string[] = [];

describe("SC-001 gate matrix: every gate kind x every source", () => {
  for (const source of SOURCES) {
    it(`devplan list "go" from ${source}`, async () => {
      const b = await bridge();
      deliver(b, source, "go");
      await settle();
      table.push(`list-go | ${source} | settled=${go.confirmed}`);
      expect(go.confirmed).toBe(MAY_SETTLE.has(source) ? 1 : 0);
    });

    it(`push confirmation "CONFIRMED" from ${source}`, async () => {
      go.awaiting = false;
      const b = await bridge();
      deliver(b, "room_approver", "PUSH");
      await settle();
      deliver(b, source, "CONFIRMED");
      await settle();
      table.push(`push-CONFIRMED | ${source} | pushed=${go.pushes}`);
      expect(go.pushes).toBe(MAY_SETTLE.has(source) ? 1 : 0);
    });
  }
});

describe("control words x sources (FR-016: behavior as before)", () => {
  const PROBES: Array<{ word: string; effect: () => boolean }> = [
    { word: "STATUS", effect: () => room.posts.length > 0 },
    { word: "VERBOSE", effect: () => room.posts.some((p) => p.includes("verbose")) },
    { word: "CONCISE", effect: () => room.posts.some((p) => p.includes("concise")) },
    { word: "STOP", effect: () => go.interrupts > 0 },
  ];
  for (const { word, effect } of PROBES) {
    for (const source of SOURCES) {
      it(`${word} from ${source}`, async () => {
        go.awaiting = false;
        const b = await bridge();
        room.posts.length = 0;
        deliver(b, source, word);
        await settle();
        const ran = effect();
        table.push(`${word} | ${source} | ran=${ran}`);
        // Worker text, untagged agent text and replayed lines never run a control word.
        if (source === "local_worker" || source === "room_agent_untagged" || source === "room_replayed") expect(ran).toBe(false);
        // The developer, an approver and KAIN always can.
        if (source === "room_approver" || source === "room_kain" || source === "local_user_approver") expect(ran).toBe(true);
      });
    }
  }
});

describe("SC-004 replay: masked run-log traffic, old path vs new path", () => {
  function corpus(): string[] {
    const dirs = [join(process.cwd(), ".wxai", "run-log")];
    const out = new Set<string>();
    for (const d of dirs) {
      if (!existsSync(d)) continue;
      for (const f of readdirSync(d).filter((n) => n.startsWith("feed-") && n.endsWith(".jsonl"))) {
        for (const line of readFileSync(join(d, f), "utf8").split("\n")) {
          if (!line.trim()) continue;
          try {
            const row = JSON.parse(line) as { text?: string };
            const t = (row.text ?? "").replace(/^[^:]{1,40}:\s*/, "").trim();
            if (t && t.length <= 200 && t.toUpperCase() !== "CANCEL REMOTE") out.add(t);
          } catch {
            /* a damaged line is skipped */
          }
        }
      }
    }
    // The fixed lines every release replays, so the check never runs on an empty corpus.
    for (const t of ["go", "no", "skip 200", "yes", "CONFIRMED", "STATUS", "check the billing page", "go debug"]) out.add(t);
    return [...out];
  }

  async function decide(text: string, source: Source, oldPath: boolean) {
    sent.length = 0;
    room.posts.length = 0;
    go.confirmed = 0;
    go.awaiting = true;
    go.pushes = 0;
    const b = await bridge(oldPath);
    deliver(b, source, text);
    await settle();
    return { settled: go.confirmed, pushed: go.pushes, toSession: sent.length };
  }

  it("0 gate-decision differences between the old path and the new path", async () => {
    const texts = corpus();
    const gateDiffs: string[] = [];
    const otherDiffs: string[] = [];
    const explainedDiffs: string[] = [];
    for (const text of texts) {
      for (const source of ["room_approver", "room_stranger", "local_worker"] as Source[]) {
        const a = await decide(text, source, true);
        const n = await decide(text, source, false);
        if (a.settled !== n.settled || a.pushed !== n.pushed) {
          const row = `${source} | ${JSON.stringify(text)} | old=${JSON.stringify(a)} new=${JSON.stringify(n)}`;
          // FR-003 changes this on purpose: a waiting devplan list takes only go, no or skip. The old path
          // let any lenient yes/no text answer it. Only that exact shape is explained; anything else fails.
          const explained = !isListAnswer(text) && a.settled === 1 && n.settled === 0 && a.pushed === n.pushed;
          (explained ? explainedDiffs : gateDiffs).push(row);
        } else if (a.toSession !== n.toSession) otherDiffs.push(`${source} | ${JSON.stringify(text)} | old=${JSON.stringify(a)} new=${JSON.stringify(n)}`);
      }
    }
    process.stdout.write(`[replay] ${texts.length} distinct lines x 3 sources; unexplained gate differences: ${gateDiffs.length}; FR-003-explained: ${explainedDiffs.length}; other differences: ${otherDiffs.length}\n`);
    for (const d of explainedDiffs) process.stdout.write(`[replay] explained by FR-003 ${d}\n`);
    for (const d of gateDiffs) process.stdout.write(`[replay] GATE DIFF ${d}\n`);
    for (const d of otherDiffs.slice(0, 20)) process.stdout.write(`[replay] other diff ${d}\n`);
    expect(gateDiffs).toEqual([]);
  }, 120000);

  it("a replayed line never reaches a live gate on either path", async () => {
    for (const oldPath of [true, false]) {
      const r = await decide("go", "room_replayed", oldPath);
      expect(r.settled).toBe(0);
    }
  });
});

describe("matrix table", () => {
  it("prints the decision table for tests.md", () => {
    process.stdout.write(`[matrix]\n${table.join("\n")}\n`);
    expect(table.length).toBeGreaterThan(0);
  });
});
