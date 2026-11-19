// [SCOPE 078 / T007] BEGIN — Infrastructure Health Monitor summary (pure; powers the admin GET)
// Orders checks urgent-first, derives the overall status, the last-checked timestamp, and the
// stale-monitor flag (the dashboard's honesty guard: a silently stopped agent must not look green).
export interface InfraHealthRow {
  checkkey: string;
  status: string; // "ok" | "caution" | "urgent"
  evaluatedat: Date | string | null;
}

export interface InfraHealthSummary<T> {
  checks: T[];
  overall: "ok" | "caution" | "urgent";
  lastChecked: string | null;
  stale: boolean;
}

const SEVERITY: Record<string, number> = { urgent: 2, caution: 1, ok: 0 };

export function summarizeInfraHealth<T extends InfraHealthRow>(
  rows: T[],
  staleMs: number,
  now: number = Date.now(),
): InfraHealthSummary<T> {
  const checks = [...rows].sort(
    (a, b) =>
      (SEVERITY[b.status] ?? 0) - (SEVERITY[a.status] ?? 0) ||
      a.checkkey.localeCompare(b.checkkey),
  );
  const overall = checks.reduce<"ok" | "caution" | "urgent">(
    (acc, r) =>
      r.status === "urgent" ? "urgent" : r.status === "caution" && acc !== "urgent" ? "caution" : acc,
    "ok",
  );
  const newest = checks.reduce<number>(
    (max, r) => Math.max(max, r.evaluatedat ? new Date(r.evaluatedat).getTime() : 0),
    0,
  );
  return {
    checks,
    overall,
    lastChecked: newest > 0 ? new Date(newest).toISOString() : null,
    stale: newest === 0 || now - newest > staleMs,
  };
}
// [SCOPE 078 / T007] END
