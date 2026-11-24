// [SCOPE 159 / T002] BEGIN — Common room contract tests (FR-001, FR-078, FR-091)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  BODY_MAX_CHARS,
  CONTRACT_VERSION,
  RefusalCounter,
  formatRunLogLine,
  ignoredFields,
  parseRunLog,
  parseRunLogLine,
  parseStoredMessage,
  receiveMessage,
  type SenderStamp,
} from "../../common-room/src/index";

const PROJECT = "ba924193-0335-4080-9fa6-33cd6b81300a";
const SENDER: SenderStamp = { kind: "worker", id: "w-1", run: "run-7" };
const NOW = new Date("2026-11-24T12:00:00.000Z");

function inbound(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contractVersion: CONTRACT_VERSION,
    projectId: PROJECT,
    source: "local",
    to: "kain",
    kind: "notice",
    body: "hello",
    ...over,
  };
}

function ctx(counter?: RefusalCounter) {
  return { now: NOW, nextSeq: 5, sender: SENDER, counter };
}

describe("receiveMessage", () => {
  it("stamps seq, sender and sentAt from the receiver", () => {
    const r = receiveMessage(inbound(), ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.seq).toBe(5);
    expect(r.value.sender).toEqual(SENDER);
    expect(r.value.sentAt).toBe(NOW.toISOString());
    expect(r.value.deliveredAt).toBeNull();
  });

  it("ignores receiver-owned fields a sender supplies", () => {
    const raw = inbound({ sentAt: "1999-01-01T00:00:00.000Z", seq: 99, deliveredAt: "x", ackedAt: "y", expiresAt: "z" });
    const r = receiveMessage(raw, ctx());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sentAt).toBe(NOW.toISOString());
    expect(r.value.seq).toBe(5);
    expect(r.value.deliveredAt).toBeNull();
    expect(ignoredFields(raw).sort()).toEqual(["ackedAt", "deliveredAt", "expiresAt", "sentAt", "seq"]);
  });

  it("refuses and counts a sender in the body", () => {
    const counter = new RefusalCounter();
    const r = receiveMessage(inbound({ sender: { kind: "user", id: "me" } }), ctx(counter));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("sender_in_body");
    expect(counter.count("sender_in_body")).toBe(1);
    expect(counter.total()).toBe(1);
  });

  it("refuses a version mismatch and names both versions", () => {
    const r = receiveMessage(inbound({ contractVersion: "0.9.0" }), ctx());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("version_mismatch");
    expect(r.refusal.detail).toContain("0.9.0");
    expect(r.refusal.detail).toContain(CONTRACT_VERSION);
  });

  it("refuses a body over the cap and never cuts it", () => {
    const r = receiveMessage(inbound({ body: "a".repeat(BODY_MAX_CHARS + 1) }), ctx());
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.refusal.code).toBe("body_too_long");
    expect(receiveMessage(inbound({ body: "a".repeat(BODY_MAX_CHARS) }), ctx()).ok).toBe(true);
  });

  it("uses one validator for all three sources", () => {
    for (const source of ["local", "mailbox", "yappchatt"]) {
      expect(receiveMessage(inbound({ source }), ctx()).ok).toBe(true);
    }
    const bad = receiveMessage(inbound({ source: "smoke" }), ctx());
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.refusal.code).toBe("bad_source");
  });

  it("refuses bad shapes", () => {
    expect(receiveMessage("nope", ctx()).ok).toBe(false);
    expect(receiveMessage(inbound({ to: "everyone" }), ctx()).ok).toBe(false);
    expect(receiveMessage(inbound({ kind: "shout" }), ctx()).ok).toBe(false);
    expect(receiveMessage(inbound({ body: "" }), ctx()).ok).toBe(false);
    expect(receiveMessage(inbound({ projectId: "" }), ctx()).ok).toBe(false);
  });

  it("refuses a message for another Project when one is expected", () => {
    const r = receiveMessage(inbound({ projectId: "other" }), { ...ctx(), expectedProjectId: PROJECT });
    expect(r.ok).toBe(false);
  });
});

describe("run log", () => {
  it("round-trips a stamped message", () => {
    const stamped = receiveMessage(inbound(), ctx());
    expect(stamped.ok).toBe(true);
    if (!stamped.ok) return;
    const line = formatRunLogLine(stamped.value, NOW);
    expect(line).not.toContain("\n");
    const back = parseRunLogLine(line);
    expect(back.ok).toBe(true);
    if (back.ok) expect(back.value.message).toEqual(stamped.value);
  });

  it("parses every line of the fixture log", () => {
    const text = readFileSync(join(__dirname, "..", "fixtures", "common-room", "run-log.fixture.jsonl"), "utf-8");
    const result = parseRunLog(text);
    expect(result.refused).toEqual([]);
    expect(result.lines).toHaveLength(3);
    for (const l of result.lines) expect(parseStoredMessage(l.message).ok).toBe(true);
  });

  it("lists bad lines instead of throwing", () => {
    const result = parseRunLog('not json\n{"logVersion":2}\n');
    expect(result.lines).toHaveLength(0);
    expect(result.refused).toHaveLength(2);
    expect(result.refused[1]?.refusal.detail).toContain("2");
  });
});
// [SCOPE 159 / T002] END
