/**
 * SCOPE-149 / T006 — the one-slot handoff queue: post when the agent is free, newer replaces
 * older, nothing posted twice, no content in the log.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Writable } from "stream";
import { HandoffQueue } from "../../apps/remote-bridge/src/handoff-queue";
import { createHandoffLogger } from "../../apps/remote-bridge/src/handoff-log";
import type { HandoffFile } from "../../apps/remote-bridge/src/handoff-watch";

// [SCOPE 149 / T006] BEGIN — handoff queue tests
let dir: string;
let lines: string[];

function sink(): Writable {
  return new Writable({
    write(chunk, _enc, cb) {
      lines.push(String(chunk));
      cb();
    },
  });
}

function makeFile(name: string, createdAt: Date, body: string, masked = 0): HandoffFile {
  const path = join(dir, name);
  writeFileSync(path, body);
  return { name, path, createdAt, masked, body };
}

function events(): Array<Record<string, unknown>> {
  return lines.flatMap((l) => l.split("\n").filter(Boolean)).map((l) => JSON.parse(l) as Record<string, unknown>);
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "handoff-queue-"));
  lines = [];
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

const flush = () => new Promise((res) => setTimeout(res, 0));
const T1 = new Date("2026-10-28T10:00:00.000Z");
const T2 = new Date("2026-10-28T10:05:00.000Z");

describe("HandoffQueue", () => {
  it("idle: delivers once, removes the file, logs exactly one posted line", async () => {
    const deliver = vi.fn(async () => true);
    const q = new HandoffQueue({ isBusy: () => false, deliver, logger: createHandoffLogger(sink()) });
    const f = makeFile("a.md", T1, "body", 3);
    q.offer(f);
    await flush();
    await q.drain();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(existsSync(f.path)).toBe(false);
    expect(q.pending).toBeUndefined();
    const posted = events().filter((e) => e.event === "posted");
    expect(posted).toHaveLength(1);
    expect(posted[0]).toMatchObject({ createdAt: T1.toISOString(), masked: 3 });
  });

  it("busy: not delivered until the flag clears, then delivered on drain", async () => {
    let busy = true;
    const deliver = vi.fn(async () => true);
    const q = new HandoffQueue({ isBusy: () => busy, deliver });
    q.offer(makeFile("a.md", T1, "body"));
    await q.drain();
    expect(deliver).not.toHaveBeenCalled();
    expect(q.pending).toBeDefined();
    busy = false;
    await q.drain();
    expect(deliver).toHaveBeenCalledTimes(1);
    expect(q.pending).toBeUndefined();
  });

  it("two offers before pickup: one delivery with the newer body, older file deleted, replaced logged", async () => {
    const bodies: string[] = [];
    let busy = true;
    const q = new HandoffQueue({
      isBusy: () => busy,
      deliver: async (f) => {
        bodies.push(f.body);
        return true;
      },
      logger: createHandoffLogger(sink()),
    });
    const older = makeFile("a.md", T1, "old");
    const newer = makeFile("b.md", T2, "new");
    q.offer(older);
    q.offer(newer);
    expect(existsSync(older.path)).toBe(false);
    expect(existsSync(newer.path)).toBe(true);
    expect(events().filter((e) => e.event === "replaced")).toHaveLength(1);
    busy = false;
    await q.drain();
    expect(bodies).toEqual(["new"]);
  });

  it("an older file offered after a newer one is the one dropped", async () => {
    const q = new HandoffQueue({ isBusy: () => true, deliver: async () => true });
    const newer = makeFile("b.md", T2, "new");
    const older = makeFile("a.md", T1, "old");
    q.offer(newer);
    q.offer(older);
    expect(existsSync(older.path)).toBe(false);
    expect(existsSync(newer.path)).toBe(true);
    expect(q.pending?.body).toBe("new");
  });

  it("deliver returning false keeps it pending and retries", async () => {
    const results = [false, true];
    const deliver = vi.fn(async () => results.shift() ?? true);
    const q = new HandoffQueue({ isBusy: () => false, deliver });
    const f = makeFile("a.md", T1, "body");
    q.offer(f);
    await flush();
    expect(existsSync(f.path)).toBe(true);
    expect(q.pending).toBeDefined();
    await q.drain();
    expect(deliver).toHaveBeenCalledTimes(2);
    expect(existsSync(f.path)).toBe(false);
  });

  it("deliver throwing keeps it pending", async () => {
    let fail = true;
    const q = new HandoffQueue({
      isBusy: () => false,
      deliver: async () => {
        if (fail) throw new Error("boom");
        return true;
      },
    });
    const f = makeFile("a.md", T1, "body");
    q.offer(f);
    await flush();
    expect(existsSync(f.path)).toBe(true);
    fail = false;
    await q.drain();
    expect(existsSync(f.path)).toBe(false);
  });

  it("an offer during an in-flight delivery posts after it, nothing twice", async () => {
    const bodies: string[] = [];
    let release: (ok: boolean) => void = () => undefined;
    const q = new HandoffQueue({
      isBusy: () => false,
      deliver: (f) => {
        bodies.push(f.body);
        return new Promise<boolean>((r) => {
          release = r;
        });
      },
    });
    const first = makeFile("a.md", T1, "first");
    const second = makeFile("b.md", T2, "second");
    q.offer(first);
    q.offer(second);
    expect(existsSync(first.path)).toBe(true); // the in-flight one is never deleted early
    release(true);
    await new Promise((r) => setTimeout(r, 0));
    const second2 = q.drain();
    release(true);
    await second2;
    expect(bodies).toEqual(["first", "second"]);
    expect(existsSync(first.path)).toBe(false);
    expect(existsSync(second.path)).toBe(false);
  });

  it("no log line contains summary text", async () => {
    const q = new HandoffQueue({
      isBusy: () => false,
      deliver: async () => true,
      logger: createHandoffLogger(sink()),
    });
    q.offer(makeFile("a.md", T1, "PLANTED-SECRET-SUMMARY"));
    q.offer(makeFile("b.md", T2, "ANOTHER-PLANTED-TEXT"));
    await flush();
    const all = lines.join("");
    expect(all).not.toContain("PLANTED");
    expect(all).not.toContain("a.md");
    expect(all).not.toContain("b.md");
  });
});
// [SCOPE 149 / T006] END
