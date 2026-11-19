import type { DimensionId } from "../../core/finding.js";
import type { EngineAdapter, SupportLevel } from "../../core/engine.js";
import { createReadOnlyConnection } from "./connect.js";

// [SCOPE 121 / T014] BEGIN — PostgreSQL adapter
// MODIFIED-BY [SCOPE 121 / T022] — added "data", "performance" and
// "maintenance" as Tasks 15-21 shipped their collectors and analysers.
// "conventions", "security", "availability" and "impact" stay absent so
// `?? "not-implemented"` still covers them; they are Batch B.
const SUPPORT: Partial<Record<DimensionId, SupportLevel>> = {
  schema: "full",
  integrity: "full",
  data: "full",
  performance: "full",
  maintenance: "full",
};

export const postgresAdapter: EngineAdapter = {
  engine: "postgres",
  supports(dimension: DimensionId): SupportLevel {
    return SUPPORT[dimension] ?? "not-implemented";
  },
  connect: createReadOnlyConnection,
  async collect() {
    // Phase 1 drives the schema and integrity collectors directly from the CLI,
    // which needs both live and declared input that this signature does not
    // carry. Left refusing rather than returning empty: an adapter that answers
    // "nothing found" for a path it does not implement is the failure this
    // whole design is built to avoid.
    throw new Error(
      "postgres adapter: collect() is not the Phase 1 collection path — " +
        "the CLI calls collectLiveSchema and probeIntegrity directly",
    );
  },
  additiveWhitelist() {
    return [];
  },
};
// [SCOPE 121 / T014] END
