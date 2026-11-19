/**
 * SCOPE-078 / T009 — Infrastructure Health Monitor rule-engine unit tests.
 * Pure (no DB/AWS): crafted readings -> expected statuses/solutions. Hermetic thresholds object
 * so env/.env cannot perturb the assertions.
 */
import { describe, expect, it } from "vitest";
import { evaluateChecks, INFRA_CHECK_KEYS } from "../../src/server/infrahealth/rules";
import type { InfraHealthThresholds } from "../../src/server/infrahealth/config";
import type { InfraReadings } from "../../src/server/infrahealth/types";

const T: InfraHealthThresholds = {
  cadenceMinutes: 5,
  connectionReserve: 50,
  connectionCautionPct: 0.7,
  connectionUrgentPct: 0.85,
  memoryFreeCautionPct: 0.2,
  memoryFreeUrgentPct: 0.1,
  cpuCautionPct: 80,
  cpuUrgentPct: 90,
  storageFreeCautionPct: 0.2,
  storageFreeUrgentPct: 0.1,
  budgetCautionPct: 0.8,
  staleCadences: 2,
};

const GB = 1024 ** 3;

function readings(over: Partial<InfraReadings["rds"]>, budget: Partial<InfraReadings["budget"]> = {}): InfraReadings {
  return {
    rds: {
      instanceId: "wxkanban",
      connections: 100,
      maxConnections: 1500,
      cpuPct: 10,
      freeableMemoryBytes: 8 * GB,
      instanceMemoryBytes: 16 * GB,
      freeStorageBytes: 15 * GB,
      allocatedStorageBytes: 20 * GB,
      maxAllocatedStorageBytes: 1000 * GB,
      ...over,
    },
    budget: {
      maxConnections: 1500,
      reserve: 50,
      services: [
        { name: "app", poolMax: 10, maxInstances: 5 },
        { name: "mcp", poolMax: 20, maxInstances: 5 },
      ],
      ...budget,
    },
  };
}

function byKey(rs: ReturnType<typeof evaluateChecks>, key: string) {
  const r = rs.find((x) => x.checkkey === key);
  if (!r) throw new Error(`missing check ${key}`);
  return r;
}

describe("infrahealth rule engine", () => {
  it("always emits exactly the four v1 checks", () => {
    const rs = evaluateChecks(readings({}), T);
    expect(rs.map((r) => r.checkkey).sort()).toEqual([...INFRA_CHECK_KEYS].sort());
  });

  it("connection headroom: ok / caution(70%) / urgent(85%)", () => {
    expect(byKey(evaluateChecks(readings({ connections: 1000 }), T), "rds-connection-headroom").status).toBe("ok"); // 67%
    expect(byKey(evaluateChecks(readings({ connections: 1100 }), T), "rds-connection-headroom").status).toBe("caution"); // 73%
    expect(byKey(evaluateChecks(readings({ connections: 1300 }), T), "rds-connection-headroom").status).toBe("urgent"); // 87%
  });

  it("non-ok checks carry a solution; ok checks do not", () => {
    const urgent = byKey(evaluateChecks(readings({ connections: 1400 }), T), "rds-connection-headroom");
    expect(urgent.status).toBe("urgent");
    expect(urgent.solution).toBeTruthy();
    const ok = byKey(evaluateChecks(readings({ connections: 50 }), T), "rds-connection-headroom");
    expect(ok.solution).toBeNull();
  });

  it("PROACTIVE BUDGET CATCH: ceiling over budget -> urgent", () => {
    // app 15x60 + mcp 20x5 = 1000 used; budget = 1500-50 = 1450; 1000/1450 = 69% -> ok
    const ok = byKey(
      evaluateChecks(readings({}, { services: [{ name: "app", poolMax: 15, maxInstances: 60 }, { name: "mcp", poolMax: 20, maxInstances: 5 }] }), T),
      "apprunner-connection-budget",
    );
    expect(ok.status).toBe("ok");
    // app 20x55 + mcp 20x5 = 1200 used; 1200/1450 = 83% -> caution
    const caution = byKey(
      evaluateChecks(readings({}, { services: [{ name: "app", poolMax: 20, maxInstances: 55 }, { name: "mcp", poolMax: 20, maxInstances: 5 }] }), T),
      "apprunner-connection-budget",
    );
    expect(caution.status).toBe("caution");
    // app 20x70 + mcp 20x10 = 1600 used > budget 1450 -> urgent
    const urgent = byKey(
      evaluateChecks(readings({}, { services: [{ name: "app", poolMax: 20, maxInstances: 70 }, { name: "mcp", poolMax: 20, maxInstances: 10 }] }), T),
      "apprunner-connection-budget",
    );
    expect(urgent.status).toBe("urgent");
    expect(urgent.solution).toBeTruthy();
  });

  it("storage: autoscaling at ceiling is at least a caution even with free space", () => {
    const r = byKey(
      evaluateChecks(readings({ freeStorageBytes: 18 * GB, allocatedStorageBytes: 20 * GB, maxAllocatedStorageBytes: 20 * GB }), T),
      "rds-storage",
    );
    expect(r.status).toBe("caution"); // 90% free but autoscaling off/at ceiling
  });

  it("memory & cpu take the worst of the two", () => {
    const lowMem = byKey(evaluateChecks(readings({ freeableMemoryBytes: 1 * GB, instanceMemoryBytes: 16 * GB, cpuPct: 5 }), T), "rds-memory-cpu");
    expect(lowMem.status).toBe("urgent"); // 6% free
    const highCpu = byKey(evaluateChecks(readings({ cpuPct: 95 }), T), "rds-memory-cpu");
    expect(highCpu.status).toBe("urgent");
  });

  it("missing metrics fail safe to ok with no solution", () => {
    const r = byKey(evaluateChecks(readings({ connections: null, maxConnections: null }), T), "rds-connection-headroom");
    expect(r.status).toBe("ok");
    expect(r.solution).toBeNull();
  });
});
