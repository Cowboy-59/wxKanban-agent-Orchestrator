/**
 * [SCOPE 159 / T020] SC-005: local room traffic makes 0 network calls in a run, and a Manager
 * restart resumes the run board and the room with 0 lost messages.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { LocalRoom } from "../../apps/remote-bridge/src/local-room";
import { RunBoardStore } from "../../apps/remote-bridge/src/run-board";

const req = createRequire(import.meta.url);
const PROJECT = "ba924193-0335-4080-9fa6-33cd6b81300a";
const dirs: string[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "sc005-"));
  dirs.push(d);
  return d;
};
const msg = (n: number, kind = "notice") => ({ contractVersion: "1.0.0", projectId: PROJECT, source: "local", to: "agent", kind, body: `m${n}` });
const WORKER = { kind: "worker", id: "w-1" } as const;

describe("SC-005 no network", () => {
  it("a run of 200 messages, board writes, a restart and a re-ask makes 0 network calls", () => {
    const net = req("node:net") as { Socket: { prototype: { connect: (...a: unknown[]) => unknown } } };
    const dns = req("node:dns") as { lookup: (...a: unknown[]) => unknown };
    const http = req("node:http") as { request: (...a: unknown[]) => unknown };
    const https = req("node:https") as { request: (...a: unknown[]) => unknown };
    const calls: string[] = [];
    const trap = (name: string) => () => {
      calls.push(name);
      throw new Error(`network call: ${name}`);
    };
    vi.spyOn(net.Socket.prototype, "connect").mockImplementation(trap("net.connect") as never);
    vi.spyOn(dns, "lookup").mockImplementation(trap("dns.lookup") as never);
    vi.spyOn(http, "request").mockImplementation(trap("http.request") as never);
    vi.spyOn(https, "request").mockImplementation(trap("https.request") as never);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(trap("fetch") as never);

    const root = tmp();
    const room = new LocalRoom({ root, projectId: PROJECT });
    for (let i = 1; i <= 200; i += 1) expect(room.post(msg(i), WORKER).ok).toBe(true);
    const store = new RunBoardStore({ root, projectId: PROJECT });
    store.update((b) => b.scopes.push({ scopeId: "S1", specId: "P1" }));
    const again = new LocalRoom({ root, projectId: PROJECT });
    again.resume(["g1"]);
    again.read(0);
    store.load();

    expect(calls).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});

describe("SC-005 restart loses nothing", () => {
  it("every acknowledged message and the run board survive a Manager restart, repeatedly", () => {
    const root = tmp();
    let sent = 0;
    for (let restart = 0; restart < 5; restart += 1) {
      const room = new LocalRoom({ root, projectId: PROJECT });
      const board = new RunBoardStore({ root, projectId: PROJECT });
      // After each restart the room holds everything acknowledged before it, in order.
      expect(room.read(0).map((m) => m.body)).toEqual(Array.from({ length: sent }, (_, i) => `m${i + 1}`));
      expect(room.lastSeq()).toBe(sent);
      expect(board.load().assignments).toHaveLength(restart);
      for (let i = 0; i < 40; i += 1) {
        sent += 1;
        const r = room.post(msg(sent), WORKER);
        expect(r.ok).toBe(true);
      }
      board.update((b) => b.assignments.push({ taskId: `T${restart}`, worker: "w1", persona: "builder" }));
    }
    const final = new LocalRoom({ root, projectId: PROJECT });
    expect(final.read(0)).toHaveLength(200);
    expect(final.read(0).map((m) => m.seq)).toEqual(Array.from({ length: 200 }, (_, i) => i + 1));
    expect(new RunBoardStore({ root, projectId: PROJECT }).load().assignments.map((a) => a.taskId)).toEqual(["T0", "T1", "T2", "T3", "T4"]);
  });
});
