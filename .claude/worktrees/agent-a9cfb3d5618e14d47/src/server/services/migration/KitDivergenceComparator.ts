/**
 * KitDivergenceComparator
 *
 * Compares legacy gateway results against kit MCP shadow results.
 * Logs divergences to Pino structured logs for Phase B triage.
 *
 * Part of Spec 019 — Phase B shadow run.
 */

import { createLogger } from "~/server/lib/logger.js";
import type { KitShadowResult } from "./KitShadowClient.js";

const logger = createLogger("kit-divergence");

export interface DivergenceRecord {
  requestId: string;
  legacyTool: string;
  kitTool: string;
  divergenceType: "structural" | "value" | "error" | "skipped" | "none";
  legacySummary: string;
  kitSummary: string;
  details?: string;
  timestamp: string;
}

/**
 * Compare legacy result and kit shadow result, log if divergent.
 * Returns the divergence record (always — even if no divergence, for audit).
 */
export function compareDivergence(
  requestId: string,
  legacyTool: string,
  legacyResult: unknown,
  kitResult: KitShadowResult,
): DivergenceRecord {
  const timestamp = new Date().toISOString();

  // Skipped — no kit equivalent (parity tools, etc.)
  if (kitResult.response && typeof kitResult.response === "object" && "skipped" in kitResult.response) {
    const record: DivergenceRecord = {
      requestId,
      legacyTool,
      kitTool: kitResult.tool,
      divergenceType: "skipped",
      legacySummary: summarize(legacyResult),
      kitSummary: "Skipped — no kit equivalent",
      timestamp,
    };
    logger.info(record, "Shadow comparison skipped (no kit equivalent)");
    return record;
  }

  // Kit errored
  if (!kitResult.success) {
    const record: DivergenceRecord = {
      requestId,
      legacyTool,
      kitTool: kitResult.tool,
      divergenceType: "error",
      legacySummary: summarize(legacyResult),
      kitSummary: `Error: ${kitResult.error}`,
      details: JSON.stringify(kitResult.response),
      timestamp,
    };
    logger.warn(record, "Shadow divergence: kit returned error");
    return record;
  }

  // Both succeeded — compare structure
  const legacyNorm = normalize(legacyResult);
  const kitNorm = normalize(kitResult.response);

  if (legacyNorm === kitNorm) {
    const record: DivergenceRecord = {
      requestId,
      legacyTool,
      kitTool: kitResult.tool,
      divergenceType: "none",
      legacySummary: summarize(legacyResult),
      kitSummary: summarize(kitResult.response),
      timestamp,
    };
    logger.debug(record, "Shadow comparison: no divergence");
    return record;
  }

  // Structural divergence — different shapes
  const legacyKeys = extractKeys(legacyResult);
  const kitKeys = extractKeys(kitResult.response);
  const isStructural = legacyKeys !== kitKeys;

  const record: DivergenceRecord = {
    requestId,
    legacyTool,
    kitTool: kitResult.tool,
    divergenceType: isStructural ? "structural" : "value",
    legacySummary: summarize(legacyResult),
    kitSummary: summarize(kitResult.response),
    details: `Legacy keys: ${legacyKeys} | Kit keys: ${kitKeys}`,
    timestamp,
  };
  logger.warn(record, `Shadow divergence: ${record.divergenceType}`);
  return record;
}

/** Normalize for comparison: strip timestamps, UUIDs, and sort keys */
function normalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  const str = JSON.stringify(value, Object.keys(typeof value === "object" && value !== null ? value : {}).sort());
  // Strip ISO timestamps and UUIDs for comparison
  return str
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[.\d]*Z?/g, "__TIMESTAMP__")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "__UUID__");
}

/** Get top-level keys as a sorted string for structural comparison */
function extractKeys(value: unknown): string {
  if (typeof value !== "object" || value === null) return typeof value;
  if (Array.isArray(value)) return `array[${value.length}]`;
  return Object.keys(value).sort().join(",");
}

/** Short summary for log readability */
function summarize(value: unknown): string {
  const str = JSON.stringify(value);
  return str.length > 200 ? str.slice(0, 200) + "..." : str;
}
