// SPEC-144 T027 (AB-1, FR-016, FR-018) — the Room Link fields in the local status file.
// Real temp directory; no network.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearRoomLink, readRefusal, recordRefusal, recordRoomLink, statusPath } from "../../apps/remote-bridge/src/agent-status";

// [SCOPE 144 / T027] BEGIN — Room Link status file tests
let root: string;
const read = (): Record<string, unknown> => JSON.parse(readFileSync(statusPath(root), "utf-8")) as Record<string, unknown>;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-status-link-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("recordRoomLink", () => {
  it("writes roomLink, since, failures and the reason, nothing else", () => {
    expect(recordRoomLink(root, { roomLink: "reconnecting", since: "2026-11-22T14:05:00.000Z", failures: 3, reason: "socket closed" })).toBe(true);
    expect(read()).toEqual({ roomLink: "reconnecting", since: "2026-11-22T14:05:00.000Z", failures: 3, reason: "socket closed" });
    expect(readdirSync(join(root, ".wxai"))).toEqual(["project-agent-status.json"]);
  });

  it("drops the reason once connected and clears the old one on the next write", () => {
    recordRoomLink(root, { roomLink: "error", since: "2026-11-22T14:05:00.000Z", failures: 5, reason: "bad" });
    recordRoomLink(root, { roomLink: "connected", since: "2026-11-22T14:09:00.000Z", failures: 0, reason: "stale" });
    expect(read()).toEqual({ roomLink: "connected", since: "2026-11-22T14:09:00.000Z", failures: 0 });
  });

  it("keeps a refusal already in the file, and a refusal reader still works", () => {
    recordRefusal(root, "remote_not_allowed", new Date("2026-11-22T10:00:00.000Z"));
    recordRoomLink(root, { roomLink: "connected", since: "2026-11-22T10:01:00.000Z", failures: 0 });
    const rec = read();
    expect(rec.refused).toBe("remote_not_allowed");
    expect(rec.at).toBe("2026-11-22T10:00:00.000Z");
    expect(readRefusal(root)).toEqual({ refused: "remote_not_allowed", at: "2026-11-22T10:00:00.000Z" });
  });

  it("never writes a cookie or token placed in the reason", () => {
    const cookie = "yc_session=ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef";
    recordRoomLink(root, { roomLink: "error", since: "2026-11-22T14:05:00.000Z", failures: 5, reason: `login failed cookie ${cookie}` });
    const text = readFileSync(statusPath(root), "utf-8");
    expect(text).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789abcdef");
  });

  it("refuses an unknown state and survives a corrupt existing file", () => {
    expect(recordRoomLink(root, { roomLink: "weird" as never, since: "x", failures: 0 })).toBe(false);
    recordRoomLink(root, { roomLink: "connected", since: "2026-11-22T14:05:00.000Z", failures: 0 });
    expect(read().roomLink).toBe("connected");
  });
});
// [SCOPE 144 / T027] END

// [SCOPE 144 / T030] BEGIN — a new start drops the last run's Room Link fields
describe("clearRoomLink", () => {
  it("removes a stale error record left by the last run, so the Cockpit banner does not show at start", () => {
    recordRoomLink(root, { roomLink: "error", since: "2026-11-22T14:05:00.000Z", failures: 7, reason: "token: ws/token 503" });
    clearRoomLink(root);
    expect(existsSync(statusPath(root))).toBe(false);
  });

  it("keeps a refusal (SCOPE-149) and drops only the Room Link fields", () => {
    recordRefusal(root, "remote_not_allowed", new Date("2026-11-22T10:00:00.000Z"));
    recordRoomLink(root, { roomLink: "error", since: "2026-11-22T14:05:00.000Z", failures: 5, reason: "bad" });
    clearRoomLink(root);
    expect(read()).toEqual({ refused: "remote_not_allowed", at: "2026-11-22T10:00:00.000Z" });
    expect(readRefusal(root)).toEqual({ refused: "remote_not_allowed", at: "2026-11-22T10:00:00.000Z" });
  });

  it("is a no-op with no file, and never throws on a corrupt one", () => {
    expect(() => clearRoomLink(root)).not.toThrow();
    expect(existsSync(statusPath(root))).toBe(false);
    recordRoomLink(root, { roomLink: "connected", since: "2026-11-22T14:05:00.000Z", failures: 0 });
    writeFileSync(statusPath(root), "{not json");
    expect(() => clearRoomLink(root)).not.toThrow();
    expect(readdirSync(join(root, ".wxai")).filter((n) => n.endsWith(".tmp"))).toEqual([]);
  });
});
// [SCOPE 144 / T030] END
