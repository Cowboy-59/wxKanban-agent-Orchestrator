/**
 * SCOPE-078 / T009 — Infrastructure Health Monitor summary/freshness unit tests.
 * Pure: crafted rows + a fixed `now` -> ordering, overall status, and the stale-monitor flag
 * (the dashboard's honesty guard).
 */
import { describe, expect, it } from "vitest";
import { summarizeInfraHealth } from "../../src/server/infrahealth/summary";

const STALE_MS = 2 * 5 * 60_000; // 2 cadences x 5 min = 10 min
const NOW = 1_000_000_000_000;
const ago = (ms: number) => new Date(NOW - ms);

function row(checkkey: string, status: string, evaluatedat: Date | null) {
  return { checkkey, status, evaluatedat };
}

describe("summarizeInfraHealth", () => {
  it("empty -> stale, overall ok, no lastChecked", () => {
    const s = summarizeInfraHealth([], STALE_MS, NOW);
    expect(s.stale).toBe(true);
    expect(s.overall).toBe("ok");
    expect(s.lastChecked).toBeNull();
  });

  it("fresh rows -> not stale; overall is the worst status", () => {
    const s = summarizeInfraHealth(
      [
        row("rds-storage", "ok", ago(60_000)),
        row("rds-connection-headroom", "caution", ago(30_000)),
        row("apprunner-connection-budget", "urgent", ago(10_000)),
      ],
      STALE_MS,
      NOW,
    );
    expect(s.stale).toBe(false);
    expect(s.overall).toBe("urgent");
  });

  it("orders urgent-first then by checkkey", () => {
    const s = summarizeInfraHealth(
      [
        row("rds-storage", "ok", ago(1000)),
        row("apprunner-connection-budget", "urgent", ago(1000)),
        row("rds-connection-headroom", "caution", ago(1000)),
      ],
      STALE_MS,
      NOW,
    );
    expect(s.checks.map((c) => c.status)).toEqual(["urgent", "caution", "ok"]);
  });

  it("newest evaluation older than staleMs -> stale (monitor may not be running)", () => {
    const s = summarizeInfraHealth(
      [row("rds-connection-headroom", "ok", ago(STALE_MS + 60_000))],
      STALE_MS,
      NOW,
    );
    expect(s.stale).toBe(true);
    expect(s.lastChecked).not.toBeNull();
  });
});
