// SPEC-143 C5 / FR-015: the routing audit log is append only and validates event names.
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { logEvent } from "../../../_wxAI/routing/log.mjs";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "routing-log-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("logEvent", () => {
  it("appends one line per event and never rewrites earlier lines", () => {
    const root = tmp();
    logEvent(root, { event: "model-choice", taskid: "T1", command: "dbpush", from: null, to: "claude-haiku-5-5", reason: "easy", evidence: null });
    logEvent(root, { event: "escalation", taskid: "T1", command: "dbpush", from: "claude-haiku-5-5", to: "claude-sonnet-5-5", reason: "failed twice", evidence: { attempts: 2 } });
    const lines = readFileSync(join(root, "decisions", "routing-log.jsonl"), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]).event).toBe("model-choice");
    expect(JSON.parse(lines[1]).evidence).toEqual({ attempts: 2 });
    expect(typeof JSON.parse(lines[1]).time).toBe("string");
  });

  it("rejects an unknown event name", () => {
    expect(() => logEvent(tmp(), { event: "other" })).toThrow();
  });
});
