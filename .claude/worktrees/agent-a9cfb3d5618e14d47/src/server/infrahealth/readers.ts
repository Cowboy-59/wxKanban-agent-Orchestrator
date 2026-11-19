// [SCOPE 078 / T004] BEGIN — Infrastructure Health Monitor AWS readers (read-only)
// Collect RDS metrics + resolve effective max_connections + App Runner instance ceilings. Every
// reader is READ-ONLY (Describe / GetMetricStatistics) and fails soft: a failed metric becomes null
// (the rule engine treats null as ok), so one AWS hiccup never blocks a run or writes wrong warnings.
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
  type Statistic,
} from "@aws-sdk/client-cloudwatch";
import { RDSClient, DescribeDBInstancesCommand, DescribeDBParametersCommand } from "@aws-sdk/client-rds";
import {
  AppRunnerClient,
  DescribeServiceCommand,
  DescribeAutoScalingConfigurationCommand,
} from "@aws-sdk/client-apprunner";
import type { BudgetReadings, RdsReadings, ServiceBudgetInput } from "./types.js";
import { loadBudgetServices, infraTargets } from "./config.js";

const GB = 1024 ** 3;

// Instance-class -> total RAM (bytes). Used to turn the max_connections formula
// (LEAST({DBInstanceClassMemory/9531392},N)) into a concrete number. Extend as classes are adopted.
const CLASS_MEMORY: Record<string, number> = {
  "db.t3.micro": 1 * GB,
  "db.t3.small": 2 * GB,
  "db.t3.medium": 4 * GB,
  "db.t3.large": 8 * GB,
  "db.m6g.large": 8 * GB,
  "db.m6g.xlarge": 16 * GB,
  "db.r6g.large": 16 * GB,
  "db.r6g.xlarge": 32 * GB,
  "db.r6g.2xlarge": 64 * GB,
};

async function latestMetric(
  cw: CloudWatchClient,
  instanceId: string,
  metricName: string,
  stat: Statistic,
): Promise<number | null> {
  try {
    const end = new Date();
    const start = new Date(end.getTime() - 15 * 60 * 1000); // last 15 min
    const out = await cw.send(
      new GetMetricStatisticsCommand({
        Namespace: "AWS/RDS",
        MetricName: metricName,
        Dimensions: [{ Name: "DBInstanceIdentifier", Value: instanceId }],
        StartTime: start,
        EndTime: end,
        Period: 300,
        Statistics: [stat],
      }),
    );
    const points = (out.Datapoints ?? []).sort(
      (a, b) => (a.Timestamp?.getTime() ?? 0) - (b.Timestamp?.getTime() ?? 0),
    );
    const last = points[points.length - 1];
    const v = last ? (last[stat as keyof typeof last] as number | undefined) : undefined;
    return typeof v === "number" ? v : null;
  } catch {
    return null;
  }
}

async function resolveMaxConnections(
  rds: RDSClient,
  paramGroup: string | undefined,
  instanceMemoryBytes: number | null,
): Promise<number | null> {
  if (!paramGroup) return null;
  try {
    let marker: string | undefined;
    for (let i = 0; i < 20; i++) {
      const out = await rds.send(
        new DescribeDBParametersCommand({ DBParameterGroupName: paramGroup, Marker: marker }),
      );
      const p = (out.Parameters ?? []).find((x) => x.ParameterName === "max_connections");
      if (p?.ParameterValue) {
        const raw = p.ParameterValue.trim();
        const asInt = Number(raw);
        if (Number.isInteger(asInt) && asInt > 0) return asInt; // pinned numeric value
        // formula form: LEAST({DBInstanceClassMemory/9531392},N)
        if (/DBInstanceClassMemory/.test(raw) && instanceMemoryBytes) {
          return Math.floor(instanceMemoryBytes / 9531392);
        }
        return null;
      }
      marker = out.Marker;
      if (!marker) break;
    }
  } catch {
    /* fall through to null */
  }
  // last resort: derive from the formula default if we know the memory
  return instanceMemoryBytes ? Math.floor(instanceMemoryBytes / 9531392) : null;
}

export async function readRds(instanceId: string, region: string): Promise<RdsReadings> {
  const cw = new CloudWatchClient({ region });
  const rds = new RDSClient({ region });

  let instanceClass: string | undefined;
  let allocatedStorageBytes: number | null = null;
  let maxAllocatedStorageBytes: number | null = null;
  let paramGroup: string | undefined;
  try {
    const out = await rds.send(new DescribeDBInstancesCommand({ DBInstanceIdentifier: instanceId }));
    const inst = out.DBInstances?.[0];
    instanceClass = inst?.DBInstanceClass;
    allocatedStorageBytes = inst?.AllocatedStorage ? inst.AllocatedStorage * GB : null;
    maxAllocatedStorageBytes = inst?.MaxAllocatedStorage ? inst.MaxAllocatedStorage * GB : null;
    paramGroup = inst?.DBParameterGroups?.[0]?.DBParameterGroupName;
  } catch {
    /* describe failed -> leave config nulls; metrics may still read */
  }
  const instanceMemoryBytes = instanceClass ? (CLASS_MEMORY[instanceClass] ?? null) : null;

  const [connections, cpuPct, freeableMemoryBytes, freeStorageBytes, maxConnections] = await Promise.all([
    latestMetric(cw, instanceId, "DatabaseConnections", "Maximum"),
    latestMetric(cw, instanceId, "CPUUtilization", "Average"),
    latestMetric(cw, instanceId, "FreeableMemory", "Minimum"),
    latestMetric(cw, instanceId, "FreeStorageSpace", "Minimum"),
    resolveMaxConnections(rds, paramGroup, instanceMemoryBytes),
  ]);

  return {
    instanceId,
    connections,
    maxConnections,
    cpuPct,
    freeableMemoryBytes,
    instanceMemoryBytes,
    freeStorageBytes,
    allocatedStorageBytes,
    maxAllocatedStorageBytes,
  };
}

/** Best-effort live App Runner max_instances for a service ARN; null if unconfigured/unreadable. */
async function liveMaxInstances(ar: AppRunnerClient, serviceArn: string | undefined): Promise<number | null> {
  if (!serviceArn) return null;
  try {
    const svc = await ar.send(new DescribeServiceCommand({ ServiceArn: serviceArn }));
    const asgArn = svc.Service?.AutoScalingConfigurationSummary?.AutoScalingConfigurationArn;
    if (!asgArn) return null;
    const asg = await ar.send(
      new DescribeAutoScalingConfigurationCommand({ AutoScalingConfigurationArn: asgArn }),
    );
    return asg.AutoScalingConfiguration?.MaxSize ?? null;
  } catch {
    return null;
  }
}

export async function readBudget(
  maxConnections: number | null,
  reserve: number,
): Promise<BudgetReadings> {
  const services = loadBudgetServices();
  // App Runner is in its own region (us-east-2), NOT the RDS region — see infraTargets().
  const ar = new AppRunnerClient({ region: infraTargets().appRunnerRegion });
  // Prefer LIVE App Runner ceilings (so a raised max_instances is caught immediately); fall back to
  // the env-configured value when no service ARN is provided or the read fails.
  const arnByName: Record<string, string | undefined> = {
    app: process.env.APP_RUNNER_APP_SERVICE_ARN,
    mcp: process.env.APP_RUNNER_MCP_SERVICE_ARN,
  };
  const enriched: ServiceBudgetInput[] = await Promise.all(
    services.map(async (s) => {
      const live = await liveMaxInstances(ar, arnByName[s.name]);
      return live && live > 0 ? { ...s, maxInstances: live } : s;
    }),
  );
  return { maxConnections, reserve, services: enriched };
}
// [SCOPE 078 / T004] END
