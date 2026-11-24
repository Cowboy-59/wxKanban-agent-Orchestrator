// [SCOPE 159 / T003] BEGIN — Local worker room journal tests (FR-002)
import { mkdtempSync, readFileSync, writeFileSync, appendFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { RefusalCounter } from "../../common-room/src/index";
import { LOCAL_ROOM_REL, LocalRoom, REASK_PREFIX } from "../../apps/remote-bridge/src/local-room";

const PROJECT = "ba924193-0335-4080-9fa6-33cd6b81300a";
const dirs: string[] = [];

function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "local-room-"));
  dirs.push(d);
  return d;
}
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

function open(root: string, counter?: RefusalCounter) {
  return new LocalRoom({ root, projectId: PROJECT, counter });
}
function msg(kind: string, body = "x", over: Record<string, unknown> = {}) {
  return { contractVersion: "1.0.0", projectId: PROJECT, source: "local", to: "agent", kind, body, ...over };
}
const WORKER = { kind: "worker", id: "w-1" } as const;
const PERSON = { kind: "user", id: "u-1" } as const;

describe("LocalRoom", () => {
  it("journals messages with rising seq and the receiver's stamp", () => {
    const room = open(tmp());
    const a = room.post(msg("progress"), WORKER);
    const b = room.post(msg("notice"), WORKER);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect([a.value.seq, b.value.seq]).toEqual([1, 2]);
    expect(a.value.sender).toEqual(WORKER);
    expect(room.read()).toHaveLength(2);
    expect(room.read(1)).toHaveLength(1);
  });

  it("refuses a sender in the body and journals nothing", () => {
    const root = tmp();
    const counter = new RefusalCounter();
    const room = open(root, counter);
    const r = room.post(msg("notice", "x", { sender: PERSON }), WORKER);
    expect(r.ok).toBe(false);
    expect(counter.count("sender_in_body")).toBe(1);
    expect(room.read()).toHaveLength(0);
  });

  it("survives a restart and resumes from the last seq", () => {
    const root = tmp();
    const first = open(root);
    first.post(msg("progress"), WORKER);
    first.post(msg("progress"), WORKER);
    const second = open(root);
    expect(second.lastSeq()).toBe(2);
    const r = second.post(msg("progress"), WORKER);
    expect(r.ok && r.value.seq).toBe(3);
  });

  it("skips a torn line and keeps going", () => {
    const root = tmp();
    const room = open(root);
    room.post(msg("progress"), WORKER);
    appendFileSync(join(root, LOCAL_ROOM_REL), '{"contractVersion":"1.0.0","seq":\n', "utf8");
    const again = open(root);
    expect(again.read()).toHaveLength(1);
    expect(again.lastSeq()).toBe(1);
  });

  it("a CONFIRMED journaled before a restart settles nothing; the gate is re-asked once", () => {
    const root = tmp();
    const before = open(root);
    const old = before.post(msg("reply", "CONFIRMED"), PERSON);
    expect(old.ok).toBe(true);

    const after = open(root);
    expect(after.resume(["gate-1"])).toBe(1);
    expect(after.resume(["gate-1"])).toBe(0); // exactly once
    const lines = after.read();
    expect(lines.filter((m) => m.body === `${REASK_PREFIX}gate-1`)).toHaveLength(1);

    if (!old.ok) return;
    expect(after.countsAsAnswer(old.value, "gate-1")).toBe(false);

    const fresh = after.post(msg("reply", "CONFIRMED"), PERSON);
    expect(fresh.ok && after.countsAsAnswer(fresh.value, "gate-1")).toBe(true);
  });

  it("a gate that was not re-asked still ignores history from before the restart", () => {
    const root = tmp();
    const before = open(root);
    const old = before.post(msg("reply", "go"), PERSON);
    const after = open(root);
    if (!old.ok) throw new Error("setup");
    expect(after.countsAsAnswer(old.value, "other")).toBe(false);
    const fresh = after.post(msg("reply", "go"), PERSON);
    expect(fresh.ok && after.countsAsAnswer(fresh.value, "other")).toBe(true);
  });

  it("only a reply kind can answer", () => {
    const room = open(tmp());
    const n = room.post(msg("notice", "CONFIRMED"), PERSON);
    expect(n.ok && room.countsAsAnswer(n.value, "g")).toBe(false);
  });

  it("makes no network call: the source imports no network module", () => {
    const src = readFileSync(join(__dirname, "..", "..", "apps", "remote-bridge", "src", "local-room.ts"), "utf-8");
    expect(src).not.toMatch(/node:(http|https|net|tls|dgram|dns)|\bfetch\(|WebSocket|axios/);
    writeFileSync(join(tmp(), "noop"), "");
  });
});
// [SCOPE 159 / T003] END
