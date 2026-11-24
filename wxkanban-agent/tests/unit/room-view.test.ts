/**
 * [SCOPE 159 / T018] Agent room view model (FR-015, FR-058, FR-080, FR-087, FR-090).
 */
import { describe, expect, it } from "vitest";
import { GateNotifier, buildPanel, laneLight, todayRunLog } from "../../apps/remote-bridge/src/room-view";

const now = new Date("2026-11-24T10:00:00Z");
const ago = (s: number) => new Date(now.getTime() - s * 1000);

describe("UT-088 lane lights", () => {
  it("live within 90 s, stale after, gone at 3 min", () => {
    expect(laneLight(ago(30), now)).toBe("live");
    expect(laneLight(ago(90), now)).toBe("live");
    expect(laneLight(ago(91), now)).toBe("stale");
    expect(laneLight(ago(179), now)).toBe("stale");
    expect(laneLight(ago(180), now)).toBe("gone");
    expect(laneLight(null, now)).toBe("gone");
  });
});

describe("UT-089..092 panel", () => {
  const w = { id: "w1", role: "worker" as const, persona: "backend-engineer", model: "sonnet", taskId: "T1", state: "running", lane: "local" as const, lastBeatAt: ago(10) };
  it("shows persona and hit rate for every running worker", () => {
    const p = buildPanel("/r", [w, { ...w, id: "mgr", role: "manager", persona: "manager" }], [], [{ persona: "backend-engineer", hitRate: 0.8 }], now);
    expect(p.rows.map((r) => r.persona)).toEqual(["backend-engineer", "manager"]);
    expect(p.rows[0]?.hitRate).toBe(0.8);
    expect(p.rows[1]?.hitRate).toBeNull();
  });
  it("same inputs give the same rows (one source, three places)", () => {
    const a = buildPanel("/r", [w], [], [], now);
    const b = buildPanel("/r", [w], [], [], now);
    expect(a).toEqual(b);
  });
  it("a seeded secret never shows", () => {
    const p = buildPanel("/r", [{ ...w, state: "key AKIAIOSFODNN7EXAMPLE" }], [{ gateId: "g", raisedBy: "AKIAIOSFODNN7EXAMPLE", raisedAt: now }], [], now);
    expect(JSON.stringify(p)).not.toContain("AKIAIOSFODNN7EXAMPLE");
  });
  it("open run log points at today's file", () => {
    expect(todayRunLog("/r", now).split("\\").join("/")).toBe("/r/.wxai/run-log/2026-11-24.jsonl");
  });
});

describe("UT-093 gate notice", () => {
  it("a new gate gets one notice that cannot answer; repeats are silent", () => {
    const n = new GateNotifier();
    const g = [{ gateId: "g1", raisedBy: "w1", raisedAt: now }];
    const first = n.fresh(g);
    expect(first).toHaveLength(1);
    expect(first[0]?.canAnswer).toBe(false);
    expect(n.fresh(g)).toHaveLength(0);
  });
});

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join as pjoin } from "node:path";
import { PANEL_SNAPSHOT_REL, writePanelSnapshot } from "../../apps/remote-bridge/src/room-view";

describe("UT-090 snapshot", () => {
  it("writes the masked panel where the extension reads it", () => {
    const root = mkdtempSync(pjoin(tmpdir(), "rv-"));
    try {
      const p = buildPanel(root, [], [{ gateId: "g", raisedBy: "AKIAIOSFODNN7EXAMPLE", raisedAt: now }], [], now);
      writePanelSnapshot(root, p);
      const txt = readFileSync(pjoin(root, PANEL_SNAPSHOT_REL), "utf8");
      expect(txt).not.toContain("AKIAIOSFODNN7EXAMPLE");
      expect(JSON.parse(txt).gates).toHaveLength(1);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
