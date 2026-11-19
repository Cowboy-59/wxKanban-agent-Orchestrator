import type {
  TestGateVerdict,
  TestRunSnapshot,
  RegressionReport,
} from "~/shared/types/tests";

// [SCOPE 111 / T029] BEGIN — Client access to the Test Suite Lifecycle API
// One place for the fetches so the panels stay about rendering. Mirrors the
// plain-fetch style the audit panels already use rather than introducing a
// second data-fetching approach.

export interface TestPlanRow {
  id: string;
  specid: string;
  projectid?: string | null;
  forcetest: boolean;
  itemcount: number;
  status?: string;
  source?: string;
  /** Present on the project listing — the scope this plan belongs to. */
  specnumber?: string | null;
  title?: string | null;
  machinecount?: number;
  humancount?: number;
  outstandingcount?: number;
}

/** "SCOPE-041 — Time Tracking", or a graceful fallback if the spec is gone. */
export function scopeLabel(plan: TestPlanRow): string {
  const num = plan.specnumber ? `SCOPE-${plan.specnumber}` : null;
  if (num && plan.title) return `${num} — ${plan.title}`;
  return num ?? plan.title ?? plan.specid.slice(0, 8);
}

export interface TestItemRow {
  id: string;
  itemkey: string;
  title: string;
  requirementid: string | null;
  specref: string | null;
  fenceref: string | null;
  gate: string;
  priority: string;
  risktier: string;
  executor: "machine" | "human";
  origin: "ai" | "user";
  released: boolean;
  forcetest: boolean | null;
  /** Resolved (item ?? plan) — what the UI badges as binding. */
  forceresolved: boolean;
  lastresultstatus: string | null;
  lastresultat: string | null;
  detail: {
    preconditions?: string[];
    steps?: Array<{ step: number; action: string; expected: string }>;
    postconditions?: string[];
    flow?: { startRoute: string; navAction: string; destRoute: string; backTo: string | null } | null;
  };
}

export interface TestCycleRow {
  id: string;
  version: string;
  status: string;
  openedat: string;
  promotedtouatat: string | null;
}

export interface RetestRow {
  id: string;
  itemid: string;
  reason: string;
  triggerpath: string | null;
  chain: string | null;
  pathlength: number | null;
  resolution: string | null;
  dismissreason: string | null;
}

async function req<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: init?.body ? { "Content-Type": "application/json" } : undefined,
    ...init,
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(data.error ?? `Request failed (${res.status})`);
  return data;
}

export const testApi = {
  listPlans: (projectId: string, specId?: string) =>
    req<{ plans: TestPlanRow[] }>(
      `/api/projects/${projectId}/testplans${specId ? `?specId=${specId}` : ""}`,
    ),

  listItems: (planId: string, params: Record<string, string> = {}) =>
    req<{ plan: TestPlanRow; items: TestItemRow[] }>(
      `/api/testplans/${planId}/items?${new URLSearchParams(params).toString()}`,
    ),

  cycles: (projectId: string) =>
    req<{ cycles: TestCycleRow[]; current: TestCycleRow }>(
      `/api/projects/${projectId}/testcycles`,
    ),

  regression: (cycleId: string) =>
    req<{ regression: RegressionReport }>(`/api/testcycles/${cycleId}/regression`),

  retests: (cycleId: string) =>
    req<{ retests: RetestRow[] }>(`/api/testcycles/${cycleId}/retests`),

  runs: (projectId: string) =>
    req<{ runs: Array<Record<string, unknown>> }>(`/api/projects/${projectId}/testruns`),

  runSnapshot: (runId: string) =>
    req<{ snapshot: TestRunSnapshot }>(`/api/testruns/${runId}`),

  startRun: (body: Record<string, unknown>) =>
    req<{ run: { id: string }; items: unknown[] }>("/api/testruns", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  gate: (projectId: string, requirement: "ai" | "user" | "all") =>
    req<{ verdict: TestGateVerdict }>(
      `/api/projects/${projectId}/testgate?requirement=${requirement}`,
    ),

  signoff: (itemId: string, passed: boolean, notes?: string) =>
    req<{ signoff: unknown; bugreportid: string | null }>(
      `/api/testplanitems/${itemId}/signoff`,
      { method: "POST", body: JSON.stringify({ passed, notes }) },
    ),

  waive: (itemId: string, reason: string) =>
    req<{ signoff: unknown }>(`/api/testplanitems/${itemId}/waive`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  dismissRetest: (retestId: string, reason: string) =>
    req<{ ok: true }>(`/api/testretests/${retestId}/dismiss`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    }),

  // [SCOPE 111 / Amendment A] Project-level testing opt-out.
  getSkipTesting: (projectId: string) =>
    req<{ skiptesting: boolean }>(`/api/projects/${projectId}/testing-settings`),

  setSkipTesting: (projectId: string, skiptesting: boolean) =>
    req<{ project: { id: string; skiptesting: boolean } }>(
      `/api/projects/${projectId}/testing-settings`,
      { method: "PATCH", body: JSON.stringify({ skiptesting }) },
    ),

  setPlanForce: (planId: string, forcetest: boolean) =>
    req<{ plan: TestPlanRow }>(`/api/testplans/${planId}`, {
      method: "PATCH",
      body: JSON.stringify({ forcetest }),
    }),

  setItemForce: (itemId: string, forcetest: boolean | null) =>
    req<{ item: TestItemRow }>(`/api/testplanitems/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify({ forcetest }),
    }),

  addItem: (planId: string, body: Record<string, unknown>) =>
    req<{ item: TestItemRow }>(`/api/testplans/${planId}/items`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
};
// [SCOPE 111 / T029] END
