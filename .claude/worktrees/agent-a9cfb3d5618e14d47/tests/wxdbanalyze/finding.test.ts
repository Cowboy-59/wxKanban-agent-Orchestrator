// tests/wxdbanalyze/finding.test.ts
import { describe, expect, it } from "vitest";
import {
  partitionFindings,
  validateFinding,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";

const complete = {
  id: "integrity.missing-fk.tasks.projectid",
  dimension: "integrity",
  rule: "missing-fk",
  subject: "tasks.projectid",
  observation: "tasks.projectid has no FK constraint; 412 orphaned rows.",
  evidence: { query: "select count(*) ...", rows: [{ orphans: 412 }] },
  whyItNeedsChanging:
    "Nothing prevents a task pointing at a deleted project; those 412 rows already 404 on load.",
  businessImpact: "Users see broken tasks; per-project billing rollups undercount.",
  severity: "high",
  urgency: "scheduled",
  remediation: {
    statements: ["alter table \"tasks\" add constraint ... not valid"],
    fixClass: "additive-safe",
    lockClass: "SHARE ROW EXCLUSIVE",
    estimatedDuration: "under 1s",
    rollback: "drop constraint",
  },
  fixRisk: "Brief lock; existing orphans remain until cleaned manually.",
  doingNothing: "Orphan count grows with every project deletion.",
  confidence: "proven",
};

describe("validateFinding", () => {
  it("accepts a complete finding", () => {
    expect(validateFinding(complete)).toEqual([]);
  });

  it("names every missing contract field", () => {
    const { whyItNeedsChanging, doingNothing, ...partial } = complete;
    expect(validateFinding(partial).sort()).toEqual([
      "doingNothing",
      "whyItNeedsChanging",
    ]);
  });

  it("rejects a field that is present but blank", () => {
    expect(validateFinding({ ...complete, businessImpact: "   " })).toEqual([
      "businessImpact",
    ]);
  });

  it("rejects an unknown severity", () => {
    expect(validateFinding({ ...complete, severity: "urgent" })).toEqual([
      "severity",
    ]);
  });

  it("rejects an unknown dimension", () => {
    expect(
      validateFinding({ ...complete, dimension: "not-a-real-dimension" }),
    ).toEqual(["dimension"]);
  });

  it("rejects an unknown urgency", () => {
    expect(validateFinding({ ...complete, urgency: "whenever" })).toEqual([
      "urgency",
    ]);
  });

  it("rejects an unknown confidence", () => {
    expect(validateFinding({ ...complete, confidence: "guess" })).toEqual([
      "confidence",
    ]);
  });

  it("rejects a malformed evidence object", () => {
    const { query, ...evidenceWithoutQuery } = complete.evidence;
    expect(
      validateFinding({ ...complete, evidence: evidenceWithoutQuery }),
    ).toEqual(["evidence"]);
  });

  it("rejects a malformed remediation object", () => {
    expect(
      validateFinding({
        ...complete,
        remediation: { ...complete.remediation, fixClass: "not-a-fixclass" },
      }),
    ).toEqual(["remediation"]);
  });
});

describe("partitionFindings", () => {
  it("emits valid findings and reports rejects rather than dropping them", () => {
    const { emitted, rejected } = partitionFindings([
      complete,
      { ...complete, id: "x", whyItNeedsChanging: "" },
    ]);
    expect(emitted).toHaveLength(1);
    expect(rejected).toEqual([
      { id: "x", missingFields: ["whyItNeedsChanging"] },
    ]);
  });
});
