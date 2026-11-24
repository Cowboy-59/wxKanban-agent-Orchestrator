/**
 * [SCOPE 159 / T016] Masked local run log with retention (FR-073..FR-077, FR-079).
 */
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { RoomMessage, SenderStamp } from "../../common-room/src/index";
import { RunLog } from "../../apps/remote-bridge/src/run-log";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "rl-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const msg = (sender: SenderStamp, body: string, to: RoomMessage["to"] = "kain"): RoomMessage => ({
  contractVersion: "1.0.0", seq: 1, projectId: "p", source: "local", to, kind: "notice", body, sender,
  sentAt: "2026-11-24T00:00:00.000Z", deliveredAt: null, ackedAt: null, expiresAt: null,
});
const at = (iso: string) => () => new Date(iso);

describe("UT-059 run log", () => {
  it("each message kind appears with its stamp, and every line parses under the contract validator", () => {
    const log = new RunLog({ root: tmp(), now: at("2026-11-24T10:00:00Z") });
    log.write(msg({ kind: "worker", id: "w1" }, "w"));
    log.write(msg({ kind: "manager", id: "mgr" }, "m", "worker"));
    log.write(msg({ kind: "kain", id: "kain" }, "k"));
    log.write(msg({ kind: "worker", id: "w2" }, "p", "peer"));
    const r = log.readMessages();
    expect(r).toEqual({ lines: 4, ok: 4, refused: 0 });
    const raw = readFileSync(join(log.dir, "2026-11-24.jsonl"), "utf8");
    for (const k of ["worker", "manager", "kain"]) expect(raw).toContain(`"kind":"${k}"`);
  });
  it("a seeded secret never appears in the log, feed included", () => {
    const log = new RunLog({ root: tmp(), now: at("2026-11-24T10:00:00Z") });
    const secret = "AKIAIOSFODNN7EXAMPLE";
    expect(log.write(msg({ kind: "worker", id: "w1" }, `key ${secret}`))).toBeGreaterThan(0);
    log.writeFeed(`also ${secret}`);
    for (const f of readdirSync(log.dir)) expect(readFileSync(join(log.dir, f), "utf8")).not.toContain(secret);
    expect(readdirSync(log.dir).some((f) => f.startsWith("feed-"))).toBe(true);
  });
  it("files older than 30 days are deleted", () => {
    const root = tmp();
    const dir = join(root, ".wxai", "run-log");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-09-01.jsonl"), "x\n");
    writeFileSync(join(dir, "2026-11-20.jsonl"), "x\n");
    const log = new RunLog({ root, now: at("2026-11-24T10:00:00Z") });
    expect(log.prune()).toEqual(["2026-09-01.jsonl"]);
    expect(readdirSync(dir)).toEqual(["2026-11-20.jsonl"]);
  });
  it("at the size cap the oldest file goes first", () => {
    const root = tmp();
    const dir = join(root, ".wxai", "run-log");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "2026-11-21.jsonl"), "a".repeat(600));
    writeFileSync(join(dir, "2026-11-22.jsonl"), "b".repeat(600));
    writeFileSync(join(dir, "2026-11-23.jsonl"), "c".repeat(600));
    const log = new RunLog({ root, now: at("2026-11-24T10:00:00Z"), maxBytes: 1500 });
    expect(log.prune()).toEqual(["2026-11-21.jsonl"]);
    expect(readdirSync(dir)).toEqual(["2026-11-22.jsonl", "2026-11-23.jsonl"]);
  });
  it("the developer may delete the log", () => {
    const log = new RunLog({ root: tmp(), now: at("2026-11-24T10:00:00Z") });
    log.write(msg({ kind: "worker", id: "w1" }, "x"));
    expect(log.deleteAll()).toBe(1);
    expect(log.readMessages().lines).toBe(0);
  });
});
