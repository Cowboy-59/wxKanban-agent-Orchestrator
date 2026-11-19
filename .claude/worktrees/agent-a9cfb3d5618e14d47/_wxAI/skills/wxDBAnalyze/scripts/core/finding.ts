// [SCOPE 121 / T001] BEGIN — Finding contract types
export type DimensionId =
  | "schema"
  | "integrity"
  | "data"
  | "conventions"
  | "performance"
  | "maintenance"
  | "security"
  | "availability"
  | "impact";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Urgency = "immediate" | "scheduled" | "deferred" | "none";
export type Confidence = "proven" | "inferred";
export type FixClass = "additive-safe" | "manual-only" | "none";

export interface Remediation {
  statements: string[];
  fixClass: FixClass;
  lockClass: string;
  estimatedDuration: string;
  rollback: string;
}

export interface Evidence {
  query: string;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface Finding {
  id: string;
  dimension: DimensionId;
  rule: string;
  subject: string;
  observation: string;
  evidence: Evidence;
  whyItNeedsChanging: string;
  businessImpact: string;
  severity: Severity;
  urgency: Urgency;
  remediation: Remediation;
  fixRisk: string;
  doingNothing: string;
  confidence: Confidence;
}

export interface RejectedFinding {
  id: string;
  missingFields: string[];
}
// [SCOPE 121 / T001] END

// [SCOPE 121 / T001] BEGIN — Finding contract validation
const SEVERITIES: ReadonlySet<string> = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);
const URGENCIES: ReadonlySet<string> = new Set([
  "immediate",
  "scheduled",
  "deferred",
  "none",
]);
const CONFIDENCES: ReadonlySet<string> = new Set(["proven", "inferred"]);
const FIX_CLASSES: ReadonlySet<string> = new Set([
  "additive-safe",
  "manual-only",
  "none",
]);
const DIMENSIONS: ReadonlySet<string> = new Set([
  "schema",
  "integrity",
  "data",
  "conventions",
  "performance",
  "maintenance",
  "security",
  "availability",
  "impact",
]);

const REQUIRED_TEXT_FIELDS = [
  "id",
  "rule",
  "subject",
  "observation",
  "whyItNeedsChanging",
  "businessImpact",
  "fixRisk",
  "doingNothing",
] as const;

function isFilledString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Return the names of every contract field that is missing, blank or invalid.
 * An empty array means the finding satisfies the contract in full.
 */
export function validateFinding(candidate: unknown): string[] {
  if (typeof candidate !== "object" || candidate === null) return ["<root>"];
  const f = candidate as Record<string, unknown>;
  const missing: string[] = [];

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!isFilledString(f[field])) missing.push(field);
  }

  if (!DIMENSIONS.has(String(f.dimension))) missing.push("dimension");
  if (!SEVERITIES.has(String(f.severity))) missing.push("severity");
  if (!URGENCIES.has(String(f.urgency))) missing.push("urgency");
  if (!CONFIDENCES.has(String(f.confidence))) missing.push("confidence");

  const evidence = f.evidence as Record<string, unknown> | undefined;
  if (
    !evidence ||
    !isFilledString(evidence.query) ||
    !Array.isArray(evidence.rows)
  ) {
    missing.push("evidence");
  }

  const remediation = f.remediation as Record<string, unknown> | undefined;
  if (
    !remediation ||
    !Array.isArray(remediation.statements) ||
    !FIX_CLASSES.has(String(remediation.fixClass)) ||
    !isFilledString(remediation.lockClass) ||
    !isFilledString(remediation.estimatedDuration) ||
    !isFilledString(remediation.rollback)
  ) {
    missing.push("remediation");
  }

  return missing.sort();
}

/**
 * Split candidates into contract-satisfying findings and rejects.
 *
 * Rejects are RETURNED, never discarded. A finding that vanishes because it was
 * incomplete would leave the report reading as clean, which is the exact
 * pathology this contract exists to prevent.
 */
export function partitionFindings(candidates: unknown[]): {
  emitted: Finding[];
  rejected: RejectedFinding[];
} {
  const emitted: Finding[] = [];
  const rejected: RejectedFinding[] = [];

  for (const candidate of candidates) {
    const missingFields = validateFinding(candidate);
    if (missingFields.length === 0) {
      emitted.push(candidate as Finding);
      continue;
    }
    const id = (candidate as { id?: unknown } | null)?.id;
    rejected.push({
      id: typeof id === "string" ? id : "<unidentified>",
      missingFields,
    });
  }

  return { emitted, rejected };
}
// [SCOPE 121 / T001] END
