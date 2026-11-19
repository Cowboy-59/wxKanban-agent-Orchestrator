// [SCOPE 078 / T005] BEGIN — Infrastructure Health Monitor shared types
// Pure data shapes shared by the readers (which fetch from AWS), the rule engine (which evaluates
// them), the runner (which upserts results), and the admin API. No AWS or DB imports here.

export type CheckStatus = "ok" | "caution" | "urgent";

/** Raw RDS metrics + config the connection/memory/cpu/storage checks consume. null = unavailable. */
export interface RdsReadings {
  instanceId: string;
  connections: number | null; // CloudWatch DatabaseConnections (Maximum)
  maxConnections: number | null; // resolved effective ceiling
  cpuPct: number | null; // CloudWatch CPUUtilization
  freeableMemoryBytes: number | null; // CloudWatch FreeableMemory
  instanceMemoryBytes: number | null; // total RAM for the instance class
  freeStorageBytes: number | null; // CloudWatch FreeStorageSpace
  allocatedStorageBytes: number | null; // provisioned storage
  maxAllocatedStorageBytes: number | null; // storage-autoscaling ceiling (0/null = off)
}

/** One App Runner service's contribution to the connection budget. */
export interface ServiceBudgetInput {
  name: string; // "app" | "mcp"
  poolMax: number; // per-instance DB pool size
  maxInstances: number; // App Runner autoscaling ceiling
}

/** Inputs for the cross-system App-Runner-ceiling-vs-connection-budget check. */
export interface BudgetReadings {
  maxConnections: number | null;
  reserve: number;
  services: ServiceBudgetInput[];
}

/** Everything one monitor run collects before evaluation. */
export interface InfraReadings {
  rds: RdsReadings;
  budget: BudgetReadings;
}

/** A single evaluated check — maps 1:1 onto an infrahealthchecks row (current-state, upserted). */
export interface CheckResult {
  checkkey: string;
  resource: string;
  status: CheckStatus;
  title: string;
  detail: string;
  solution: string | null; // remediation + command/config change; null when ok
  readings: Record<string, unknown>; // raw numbers + thresholds applied, for transparency
}
// [SCOPE 078 / T005] END
