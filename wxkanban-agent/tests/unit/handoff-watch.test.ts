import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Writable } from "stream";
import pino from "pino";
import {
  HANDOFF_MAX_BYTES,
  HandoffWatcher,
  parseHandoff,
  readHandoffEntry,
  type HandoffFile,
} from "../../apps/remote-bridge/src/handoff-watch";
import { handoffFileName, renderHandoff } from "../../apps/remote-bridge/src/handoff-writer";

// [SCOPE 149 / T005] BEGIN — hand-off folder watcher tests (FR-006)
//
// A temp directory stands in for the repo; the clock is injected and the scan is driven
// directly, so no timer, room or network is involved.

const NOW = new Date("2026-10-28T12:00:00.000Z");

function writeHandoff(dir: string, createdAt: Date, body = "next step"): string {
  const name = handoffFileName(createdAt);
  writeFileSync(join(dir, name), renderHandoff({ nextStep: body }, createdAt).doc);
  return name;
}

describe("handoff watcher — parse and safe reads (FR-006)", () => {
  let root: string;
  let dir: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "handoff-watch-"));
    dir = join(root, ".wxai", "handoff");
    mkdirSync(dir, { recursive: true });
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it("parses the writer's own output", () => {
    const { doc } = renderHandoff({ repo: "r", nextStep: "go" }, NOW);
    const p = parseHandoff(doc);
    expect(p?.createdAt.toISOString()).toBe(NOW.toISOString());
    expect(p?.masked).toBe(0);
    expect(p?.body).toContain("## Next step\ngo");
  });

  it("hands on a valid file", () => {
    const name = writeHandoff(dir, new Date(NOW.getTime() - 60_000));
    const r = readHandoffEntry(dir, name, NOW);
    expect(r.kind).toBe("ok");
  });

  it("ignores a wrong name, a sub-folder, an oversize file and a malformed one", () => {
    writeFileSync(join(dir, "notes.md"), "x");
    mkdirSync(join(dir, "20261028T115900000Z.md"));
    const big = handoffFileName(new Date(NOW.getTime() - 1000));
    writeFileSync(join(dir, big), "x".repeat(HANDOFF_MAX_BYTES + 1));
    const bad = handoffFileName(new Date(NOW.getTime() - 2000));
    writeFileSync(join(dir, bad), "no header here");
    expect(readHandoffEntry(dir, "notes.md", NOW)).toMatchObject({ kind: "ignored", reason: "name" });
    expect(readHandoffEntry(dir, "20261028T115900000Z.md", NOW)).toMatchObject({ kind: "ignored", reason: "not-file" });
    expect(readHandoffEntry(dir, big, NOW)).toMatchObject({ kind: "ignored", reason: "oversize" });
    expect(readHandoffEntry(dir, bad, NOW)).toMatchObject({ kind: "ignored", reason: "malformed" });
  });

  it("ignores a symlink and never reads through it", () => {
    const outside = join(root, "outside.md");
    writeFileSync(outside, renderHandoff({ nextStep: "outside" }, NOW).doc);
    const name = handoffFileName(new Date(NOW.getTime() - 3000));
    try {
      symlinkSync(outside, join(dir, name), "file");
    } catch {
      return; // Windows without symlink privilege: the platform cannot plant one, so nothing to read through
    }
    expect(readHandoffEntry(dir, name, NOW)).toMatchObject({ kind: "ignored", reason: "symlink" });
  });

  it("flags a file older than 4 hours as expired and a future one as ignored", () => {
    const old = writeHandoff(dir, new Date(NOW.getTime() - 4 * 3600_000 - 1));
    const future = writeHandoff(dir, new Date(NOW.getTime() + 3600_000));
    expect(readHandoffEntry(dir, old, NOW).kind).toBe("expired");
    expect(readHandoffEntry(dir, future, NOW)).toMatchObject({ kind: "ignored", reason: "future" });
  });
});

describe("handoff watcher — scan (FR-006)", () => {
  let root: string;
  let dir: string;
  let ready: HandoffFile[];
  let expired: Date[];
  let lines: string[];
  let watcher: HandoffWatcher;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "handoff-scan-"));
    dir = join(root, ".wxai", "handoff");
    mkdirSync(dir, { recursive: true });
    ready = [];
    expired = [];
    lines = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    watcher = new HandoffWatcher({
      repoRoot: root,
      onReady: (f) => ready.push(f),
      onExpired: (d) => expired.push(d),
      logger: pino({ base: { component: "handoff" } }, sink),
      now: () => NOW,
      scanMs: 3_600_000,
    });
  });
  afterEach(() => {
    watcher.stop();
    rmSync(root, { recursive: true, force: true });
  });

  it("the startup scan picks up a file already waiting, once", () => {
    writeHandoff(dir, new Date(NOW.getTime() - 5000), "PLANTED-SUMMARY");
    watcher.start();
    watcher.scan();
    expect(ready).toHaveLength(1);
    expect(ready[0].body).toContain("PLANTED-SUMMARY");
  });

  it("deletes a stale handoff unposted, reports it once, and logs no content", () => {
    const name = writeHandoff(dir, new Date(NOW.getTime() - 5 * 3600_000), "PLANTED-STALE");
    watcher.scan();
    expect(existsSync(join(dir, name))).toBe(false);
    expect(ready).toHaveLength(0);
    expect(expired).toHaveLength(1);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "expired" });
    expect(lines.join("")).not.toContain("PLANTED-STALE");
  });

  it("ignores junk once and skips the writer's in-flight temp files", () => {
    writeFileSync(join(dir, "junk.txt"), "x");
    writeFileSync(join(dir, ".20261028T115959000Z.md.123.tmp"), "partial");
    watcher.scan();
    watcher.scan();
    expect(ready).toHaveLength(0);
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0])).toMatchObject({ event: "ignored", reason: "name" });
  });

  it("does nothing when the folder does not exist", () => {
    rmSync(dir, { recursive: true, force: true });
    watcher.scan();
    expect(ready).toHaveLength(0);
  });

  it("sees a file again after it was removed and a new one arrives under the same name", () => {
    const name = writeHandoff(dir, new Date(NOW.getTime() - 5000));
    watcher.scan();
    rmSync(join(dir, name));
    watcher.scan();
    writeHandoff(dir, new Date(NOW.getTime() - 5000));
    watcher.scan();
    expect(ready).toHaveLength(2);
  });
});
// [SCOPE 149 / T005] END
