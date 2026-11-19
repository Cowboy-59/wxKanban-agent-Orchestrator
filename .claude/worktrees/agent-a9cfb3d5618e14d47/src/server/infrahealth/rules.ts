// [SCOPE 078 / T005] BEGIN — Infrastructure Health Monitor rule engine (pure, no AWS/DB)
// Evaluates raw readings into CheckResults. Each non-ok result carries a `solution` written for an
// operator who did NOT run the original RDS scale-up exercise. Severity: ok < caution < urgent.
import type {
  BudgetReadings,
  CheckResult,
  CheckStatus,
  InfraReadings,
  RdsReadings,
} from "./types.js";
import type { InfraHealthThresholds } from "./config.js";

const CONNECTION_KEY = "rds-connection-headroom";
const MEMCPU_KEY = "rds-memory-cpu";
const STORAGE_KEY = "rds-storage";
const BUDGET_KEY = "apprunner-connection-budget";

const SEVERITY: Record<CheckStatus, number> = { ok: 0, caution: 1, urgent: 2 };
function worst(a: CheckStatus, b: CheckStatus): CheckStatus {
  return SEVERITY[a] >= SEVERITY[b] ? a : b;
}
function round(n: number, dp = 0): number {
  const f = 10 ** dp;
  return Math.round(n * f) / f;
}
function gb(bytes: number): number {
  return round(bytes / 1024 ** 3, 1);
}

const SOLUTIONS = {
  connection:
    "Resize to a larger memory-optimized instance (proven path: db.r6g.large, max_connections~1500) " +
    "and/or put RDS Proxy in front to pool connections. Also cap app pool sizes (PG_POOL_MAX) so " +
    "instances x pool stays within budget. See the connection-budget check below.",
  memory:
    "Right-size to a memory-optimized Graviton class (db.r6g.large = 16 GB). Each DB backend costs " +
    "memory, so falling free memory often tracks connection growth — check the connection-headroom " +
    "result too.",
  cpu:
    "Sustained high CPU: size up the instance. If still on a burstable t3 class, CPU-credit " +
    "exhaustion throttles the DB under load — move to a non-burstable r6g/m6g class (db.r6g.large).",
  storage:
    "Raise the storage-autoscaling ceiling (aws rds modify-db-instance --max-allocated-storage <GB>) " +
    "and confirm gp3 autoscaling is enabled. A full disk is a hard Postgres outage — act before 10% " +
    "free. Investigate what is growing (bloat, logs, large tables).",
  budget:
    "The configured App Runner instance ceiling x per-instance pool size approaches or exceeds the " +
    "safe DB connection budget (max_connections - reserve). Lower max_instances or PG_POOL_MAX, or " +
    "raise DB capacity first (resize / RDS Proxy) before scaling App Runner further.",
} as const;

function checkConnectionHeadroom(r: RdsReadings, t: InfraHealthThresholds): CheckResult {
  const base = {
    checkkey: CONNECTION_KEY,
    resource: `rds:${r.instanceId}`,
    title: "RDS connection headroom",
  };
  if (r.connections === null || r.maxConnections === null || r.maxConnections <= 0) {
    return {
      ...base,
      status: "ok",
      detail: "connection metrics unavailable this run",
      solution: null,
      readings: { connections: r.connections, maxConnections: r.maxConnections },
    };
  }
  const ratio = r.connections / r.maxConnections;
  const status: CheckStatus =
    ratio >= t.connectionUrgentPct ? "urgent" : ratio >= t.connectionCautionPct ? "caution" : "ok";
  return {
    ...base,
    status,
    detail: `connections ${r.connections} of ${r.maxConnections} (${round(ratio * 100)}%)`,
    solution: status === "ok" ? null : SOLUTIONS.connection,
    readings: {
      connections: r.connections,
      maxConnections: r.maxConnections,
      ratio: round(ratio, 3),
      cautionPct: t.connectionCautionPct,
      urgentPct: t.connectionUrgentPct,
    },
  };
}

function checkMemoryCpu(r: RdsReadings, t: InfraHealthThresholds): CheckResult {
  const base = {
    checkkey: MEMCPU_KEY,
    resource: `rds:${r.instanceId}`,
    title: "RDS memory & CPU",
  };
  let status: CheckStatus = "ok";
  const parts: string[] = [];
  let solution: string | null = null;
  const readings: Record<string, unknown> = {};

  if (r.freeableMemoryBytes !== null && r.instanceMemoryBytes !== null && r.instanceMemoryBytes > 0) {
    const freePct = r.freeableMemoryBytes / r.instanceMemoryBytes;
    const memStatus: CheckStatus =
      freePct <= t.memoryFreeUrgentPct ? "urgent" : freePct <= t.memoryFreeCautionPct ? "caution" : "ok";
    parts.push(`free memory ${gb(r.freeableMemoryBytes)} GB of ${gb(r.instanceMemoryBytes)} GB (${round(freePct * 100)}%)`);
    readings.freeMemoryPct = round(freePct, 3);
    if (memStatus !== "ok") solution = SOLUTIONS.memory;
    status = worst(status, memStatus);
  }
  if (r.cpuPct !== null) {
    const cpuStatus: CheckStatus =
      r.cpuPct >= t.cpuUrgentPct ? "urgent" : r.cpuPct >= t.cpuCautionPct ? "caution" : "ok";
    parts.push(`CPU ${round(r.cpuPct)}%`);
    readings.cpuPct = round(r.cpuPct, 1);
    if (cpuStatus !== "ok") solution = solution ? `${solution} ${SOLUTIONS.cpu}` : SOLUTIONS.cpu;
    status = worst(status, cpuStatus);
  }
  return {
    ...base,
    status,
    detail: parts.length ? parts.join("; ") : "memory/cpu metrics unavailable this run",
    solution: status === "ok" ? null : solution,
    readings,
  };
}

function checkStorage(r: RdsReadings, t: InfraHealthThresholds): CheckResult {
  const base = { checkkey: STORAGE_KEY, resource: `rds:${r.instanceId}`, title: "RDS storage" };
  if (r.freeStorageBytes === null || r.allocatedStorageBytes === null || r.allocatedStorageBytes <= 0) {
    return {
      ...base,
      status: "ok",
      detail: "storage metrics unavailable this run",
      solution: null,
      readings: {},
    };
  }
  const freePct = r.freeStorageBytes / r.allocatedStorageBytes;
  const autoscaleOff = !r.maxAllocatedStorageBytes || r.maxAllocatedStorageBytes <= r.allocatedStorageBytes;
  let status: CheckStatus =
    freePct <= t.storageFreeUrgentPct ? "urgent" : freePct <= t.storageFreeCautionPct ? "caution" : "ok";
  // No autoscaling headroom is itself a caution even with free space today.
  if (autoscaleOff) status = worst(status, "caution");
  return {
    ...base,
    status,
    detail:
      `free storage ${gb(r.freeStorageBytes)} GB of ${gb(r.allocatedStorageBytes)} GB (${round(freePct * 100)}%); ` +
      `autoscaling ${autoscaleOff ? "OFF/at ceiling" : `to ${gb(r.maxAllocatedStorageBytes ?? 0)} GB`}`,
    solution: status === "ok" ? null : SOLUTIONS.storage,
    readings: { freeStoragePct: round(freePct, 3), autoscaleOff },
  };
}

function checkConnectionBudget(b: BudgetReadings, t: InfraHealthThresholds): CheckResult {
  const base = {
    checkkey: BUDGET_KEY,
    resource: "apprunner:connection-budget",
    title: "App Runner ceiling vs connection budget",
  };
  if (b.maxConnections === null || b.maxConnections <= 0) {
    return {
      ...base,
      status: "ok",
      detail: "max_connections unavailable this run",
      solution: null,
      readings: {},
    };
  }
  const budget = Math.max(0, b.maxConnections - b.reserve);
  const used = b.services.reduce((sum, s) => sum + s.poolMax * s.maxInstances, 0);
  const ratio = budget > 0 ? used / budget : Number.POSITIVE_INFINITY;
  const status: CheckStatus =
    used > budget ? "urgent" : ratio >= t.budgetCautionPct ? "caution" : "ok";
  const breakdown = b.services.map((s) => `${s.name} ${s.poolMax}x${s.maxInstances}`).join(" + ");
  return {
    ...base,
    status,
    detail:
      `configured max connections ${used} (${breakdown}) vs budget ${budget} ` +
      `(max_connections ${b.maxConnections} - reserve ${b.reserve}) = ${round(ratio * 100)}%`,
    solution: status === "ok" ? null : SOLUTIONS.budget,
    readings: { used, budget, ratio: Number.isFinite(ratio) ? round(ratio, 3) : null, services: b.services },
  };
}

/** Evaluate every v1 check. Pure: same inputs -> same outputs. */
export function evaluateChecks(readings: InfraReadings, t: InfraHealthThresholds): CheckResult[] {
  return [
    checkConnectionHeadroom(readings.rds, t),
    checkMemoryCpu(readings.rds, t),
    checkStorage(readings.rds, t),
    checkConnectionBudget(readings.budget, t),
  ];
}

export const INFRA_CHECK_KEYS = [CONNECTION_KEY, MEMCPU_KEY, STORAGE_KEY, BUDGET_KEY] as const;
// [SCOPE 078 / T005] END
