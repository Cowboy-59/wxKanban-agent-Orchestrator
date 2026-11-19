// SPEC-143 C4 / FR-011 / FR-012: the cost report, forecast and bridge summary line.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { buildReport, writeReport } from "../../../_wxAI/routing/report.mjs";
import { run, writeLog } from "./fixtures";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "routing-report-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

describe("report figures", () => {
  it("prices tokens at list price and reports per-hour, per-tier and per-command figures", () => {
    const root = tmp();
    writeLog(root, [
      run({ command: "implement", taskid: "T1" }),
      run({ command: "dbpush", difficulty: "easy", model: "claude-haiku-5-5", inputtokens: 2_000_000, outputtokens: 0, activeseconds: 1800 }),
    ]);
    const { json } = buildReport({ root });
    // sonnet: 1M in * 2 + 0.1M out * 10 = 3.00 USD; haiku: 2M * 0.10 = 0.20 USD
    expect(json.perModel["claude-sonnet-5-5"].priceEquivalentUsd).toBe(3);
    expect(json.perModel["claude-haiku-5-5"].priceEquivalentUsd).toBe(0.2);
    expect(json.totals.priceEquivalentUsd).toBe(3.2);
    expect(json.perModel["claude-sonnet-5-5"].tokensPerActiveHour).toBe(1_100_000);
    expect(json.byDifficulty.easy.runs).toBe(1);
    expect(json.perCommand.dbpush.runs).toBe(1);
  });

  it("shows window burn as unavailable unless a field provides it", () => {
    const root = tmp();
    writeLog(root, [run({})]);
    expect(buildReport({ root }).json.windowBurn).toEqual({ available: false, value: "unavailable" });
    writeLog(root, [run({ windowburn: 10 }), run({ windowburn: 20 })]);
    expect(buildReport({ root }).json.windowBurn).toEqual({ available: true, average: 15 });
  });

  it("does not guess: null tokens stay unpriced and a model without a price is counted as unpriced", () => {
    const root = tmp();
    writeLog(root, [run({ inputtokens: null, outputtokens: null, cachereadtokens: null, cachewritetokens: null }), run({ model: "mystery-model" })]);
    const { json } = buildReport({ root });
    expect(json.totals.priceEquivalentUsd).toBe(0);
    expect(json.totals.unpricedRuns).toBe(2);
  });

  it("billable view is active minutes per task, no tokens, and excludes waiting and never-billed runs", () => {
    const root = tmp();
    writeLog(root, [
      run({ taskid: "T1", activeseconds: 1830, waitingseconds: 5400 }),
      run({ taskid: "T1", activeseconds: 870 }),
      run({ taskid: "T2", activeseconds: 36000, neverbilled: true }),
    ]);
    const { json, md } = buildReport({ root });
    expect(json.billable.tasks).toEqual({ T1: { activeMinutes: 45, hours: 0.75 } });
    expect(JSON.stringify(json.billable.tasks)).not.toContain("tokens");
    expect(md).toContain("## Billable view");
  });

  it("prices cache-write tokens at 1.25 x input", () => {
    const root = tmp();
    // sonnet cacheWrite 2.5 per million: 2M tokens = 5 USD
    writeLog(root, [run({ inputtokens: 0, outputtokens: 0, cachewritetokens: 2_000_000 })]);
    expect(buildReport({ root }).json.totals.priceEquivalentUsd).toBe(5);
  });

  it("keeps comparison runs out of totals and forecast, in their own spend line", () => {
    const root = tmp();
    writeLog(root, [run({}), run({ comparisonid: "c1", variant: "current", neverbilled: true, model: "claude-opus-5-5" })]);
    const { json, md } = buildReport({ root, agents: 1, hours: 1 });
    expect(json.totals.runs).toBe(1);
    expect(json.totals.priceEquivalentUsd).toBe(3);
    expect(json.comparisonSpend.runs).toBe(1);
    expect(json.comparisonSpend.priceEquivalentUsd).toBe(6);
    expect(json.perModel["claude-opus-5-5"]).toBeUndefined();
    expect(json.forecast.usd.high).toBe(3);
    expect(md).toContain("Comparison spend");
  });

  it("an empty log still writes a valid report", () => {
    const root = tmp();
    const { json, md } = writeReport({ root, noBridge: true });
    expect(json.totals.runs).toBe(0);
    expect(existsSync(join(root, "docs", "agent-cost-report.json"))).toBe(true);
    expect(md).toContain("None yet.");
  });
});

describe("forecast", () => {
  it("gives a range for N agents x H hours with assumptions", () => {
    const root = tmp();
    writeLog(root, [
      run({}), // sonnet: 3 USD per hour
      run({ model: "claude-haiku-5-5", inputtokens: 1_000_000, outputtokens: 0 }), // 0.10 per hour
    ]);
    const f = buildReport({ root, agents: 4, hours: 8 }).json.forecast;
    expect(f.available).toBe(true);
    expect(f.agentHours).toBe(32);
    expect(f.usd.low).toBe(3.2);
    expect(f.usd.high).toBe(96);
    expect(f.assumptions.length).toBeGreaterThan(2);
  });

  it("says no range can be given without priced active time", () => {
    const f = buildReport({ root: tmp(), agents: 2, hours: 2 }).json.forecast;
    expect(f.available).toBe(false);
  });

  it("is absent when not requested", () => {
    expect(buildReport({ root: tmp() }).json.forecast).toBeNull();
  });
});

describe("bridge summary line", () => {
  function lock(root: string, pid: number): void {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(join(root, ".wxai", "remote-session.lock"), JSON.stringify({ pid, owner: "x", since: "t" }), "utf-8");
  }
  it("appends one versioned line to the outbox when the lock names a live pid", () => {
    const root = tmp();
    writeLog(root, [run({})]);
    lock(root, 4242);
    const res = writeReport({ root, agents: 1, hours: 1, pidAlive: () => true, project: "demo" });
    expect(res.bridge).toBe(true);
    const lines = readFileSync(join(root, ".wxai", "room-outbox.jsonl"), "utf-8").trim().split("\n");
    expect(lines).toHaveLength(1);
    const row = JSON.parse(lines[0]);
    expect(row.text.startsWith("[agent-cost v1] demo:")).toBe(true);
    expect(row.text).not.toContain("\n");
    expect(typeof row.time).toBe("string");
  });

  it("posts nothing for a stale lock or no lock", () => {
    const root = tmp();
    writeLog(root, [run({})]);
    expect(writeReport({ root, pidAlive: () => true }).bridge).toBe(false);
    lock(root, 4242);
    expect(writeReport({ root, pidAlive: () => false }).bridge).toBe(false);
    expect(existsSync(join(root, ".wxai", "room-outbox.jsonl"))).toBe(false);
  });
});
