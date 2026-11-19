// [SCOPE 078 / T003] BEGIN — Infrastructure Health Monitor thresholds & budget config
// Runtime-configurable via env (INFRA_HEALTH_* and the pool/instance vars the budget check needs),
// with sensible defaults from the RDS scale-up exercise. Kept as a tiny config module (KISS) rather
// than a settings table; flip to a DB-backed settings row later if per-tenant tuning is ever needed.
import type { ServiceBudgetInput } from "./types.js";

export interface InfraHealthThresholds {
  cadenceMinutes: number;
  connectionReserve: number; // headroom subtracted from max_connections for the budget
  connectionCautionPct: number; // fraction of max_connections (0.70)
  connectionUrgentPct: number; // 0.85
  memoryFreeCautionPct: number; // freeable/total RAM below this -> caution (0.20)
  memoryFreeUrgentPct: number; // 0.10
  cpuCautionPct: number; // CPUUtilization above this -> caution (80)
  cpuUrgentPct: number; // 90
  storageFreeCautionPct: number; // free/allocated below this -> caution (0.20)
  storageFreeUrgentPct: number; // 0.10
  budgetCautionPct: number; // configured ceiling above this fraction of (max-reserve) -> caution (0.80)
  staleCadences: number; // panel flags "monitor may not be running" past this many cadences (2)
}

function numEnv(name: string, def: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return def;
  const n = Number(raw);
  return Number.isFinite(n) ? n : def;
}

export function loadThresholds(): InfraHealthThresholds {
  return {
    cadenceMinutes: numEnv("INFRA_HEALTH_CADENCE_MIN", 5),
    connectionReserve: numEnv("INFRA_HEALTH_CONN_RESERVE", 50),
    connectionCautionPct: numEnv("INFRA_HEALTH_CONN_CAUTION_PCT", 0.7),
    connectionUrgentPct: numEnv("INFRA_HEALTH_CONN_URGENT_PCT", 0.85),
    memoryFreeCautionPct: numEnv("INFRA_HEALTH_MEM_CAUTION_PCT", 0.2),
    memoryFreeUrgentPct: numEnv("INFRA_HEALTH_MEM_URGENT_PCT", 0.1),
    cpuCautionPct: numEnv("INFRA_HEALTH_CPU_CAUTION_PCT", 80),
    cpuUrgentPct: numEnv("INFRA_HEALTH_CPU_URGENT_PCT", 90),
    storageFreeCautionPct: numEnv("INFRA_HEALTH_STORAGE_CAUTION_PCT", 0.2),
    storageFreeUrgentPct: numEnv("INFRA_HEALTH_STORAGE_URGENT_PCT", 0.1),
    budgetCautionPct: numEnv("INFRA_HEALTH_BUDGET_CAUTION_PCT", 0.8),
    staleCadences: numEnv("INFRA_HEALTH_STALE_CADENCES", 2),
  };
}

/**
 * The App Runner services that draw on the connection budget. Pool sizes and instance ceilings are
 * read from existing config/env (single source of truth — same vars the Phase-1 RDS work surfaced),
 * never stored in infrahealthchecks. Defaults match the current code (app pg pool default 10, MCP 20)
 * and Terraform max_instances=5.
 */
export function loadBudgetServices(): ServiceBudgetInput[] {
  return [
    {
      name: "app",
      poolMax: numEnv("PG_POOL_MAX", 10),
      maxInstances: numEnv("APP_MAX_INSTANCES", 5),
    },
    {
      name: "mcp",
      poolMax: numEnv("MCP_PG_POOL_MAX", 20),
      maxInstances: numEnv("MCP_MAX_INSTANCES", 5),
    },
  ];
}

/**
 * Where the monitored resources live. RDS is us-east-1; App Runner is us-east-2 (the services run in
 * a different region than the DB), so the App Runner client needs its own region — using the RDS
 * region would make every live instance-ceiling read miss and silently fall back to the env value.
 */
export function infraTargets(): { rdsInstanceId: string; awsRegion: string; appRunnerRegion: string } {
  return {
    rdsInstanceId: process.env.INFRA_HEALTH_RDS_ID ?? "wxkanban",
    awsRegion: process.env.INFRA_HEALTH_AWS_REGION ?? process.env.AWS_REGION ?? "us-east-1",
    appRunnerRegion: process.env.APP_RUNNER_AWS_REGION ?? "us-east-2",
  };
}
// [SCOPE 078 / T003] END
