#!/usr/bin/env node
/**
 * UI driver proof — SCOPE-127 / T008 (FR-005).
 *
 * THE LOAD-BEARING SAFETY REQUIREMENT OF THIS SCOPE. Read before changing anything here.
 *
 * Everything else in SCOPE-127 is more permissive than today's behaviour: an unmatched stack
 * generates its own adapter and the pipeline proceeds automatically, with no human approving it.
 * That moves the safety burden off a person and onto machine-checkable guards. This is one of the
 * two guards (the other is T013), and it is the only thing standing between a fabricated driver
 * and a false green.
 *
 * The failure it prevents is precise and has a precedent. A generated adapter must invent a UI
 * driver for a stack nobody anticipated — it may name a command that does not exist, or one that
 * exits 0 having launched nothing. Without proof of real interaction, a UI tier would then report
 * passes for screens that were never rendered. That is the zero-unit inventory again: a confident
 * empty result reads as a result.
 *
 * So no UI-tier result is recorded until the driver proves it drove something:
 *   - a target that actually booted, AND
 *   - a non-empty element tree OR a captured frame with real bytes
 *
 * Absent proof the run exits non-zero and records NO UI pass. Not a warning, not a skip with a
 * green tier — a hard stop that names the adapter, the declared driver and what the probe
 * actually returned.
 *
 * DO NOT TRADE THIS DOWN UNDER SCHEDULE PRESSURE.
 * Rationale: docs/adr/0001-generated-stack-adapters-proceed-without-human-approval.md
 *
 *   node _wxAI/adapters/ui-driver-proof.mjs --probe <probe.json> [--adapter <name>] [--json]
 *
 * Exit codes:  0 proof accepted   5 proof refused, no UI result may be recorded   2 bad usage
 */
import { existsSync, readFileSync } from "node:fs";

/** An element tree smaller than this is not a rendered screen. */
export const MIN_ELEMENTS = 1;
/** A "screenshot" smaller than this is not an image of anything. */
export const MIN_FRAME_BYTES = 1024;

/**
 * Judge whether a probe result constitutes proof of real interaction.
 *
 * `probe` is whatever the adapter's declared driver returned, normalised to:
 *   { booted, target, elementCount, frameBytes, driver, error }
 *
 * Deliberately strict about types. A driver reporting `booted: "true"` or `elementCount: "many"`
 * is a driver nobody ran — real instrumentation returns a boolean and a number, and accepting a
 * string here is how a fabricated result would pass.
 */
// [SCOPE 127 / T008] BEGIN — UI driver must PROVE it drove something before any UI resul…
export function judgeProof(probe, { adapter = "unknown", driver = "unnamed" } = {}) {
// [SCOPE 127 / T008] END
  const reasons = [];
  const p = probe && typeof probe === "object" ? probe : {};

  const declaredDriver = typeof p.driver === "string" && p.driver.trim() ? p.driver.trim() : driver;

  if (p.error) {
    reasons.push(`The driver reported an error: ${String(p.error)}`);
  }

  if (p.booted !== true) {
    reasons.push(
      `No booted target. The probe returned booted=${JSON.stringify(p.booted)}; proof requires the ` +
        "boolean true, because a driver that never launched anything can still return a truthy string.",
    );
  }

  const elements = typeof p.elementCount === "number" && Number.isFinite(p.elementCount) ? p.elementCount : null;
  const frame = typeof p.frameBytes === "number" && Number.isFinite(p.frameBytes) ? p.frameBytes : null;

  const hasTree = elements !== null && elements >= MIN_ELEMENTS;
  const hasFrame = frame !== null && frame >= MIN_FRAME_BYTES;

  if (!hasTree && !hasFrame) {
    reasons.push(
      `No evidence of a rendered screen. Proof requires an element tree of at least ${MIN_ELEMENTS} ` +
        `(probe returned elementCount=${JSON.stringify(p.elementCount)}) OR a captured frame of at ` +
        `least ${MIN_FRAME_BYTES} bytes (probe returned frameBytes=${JSON.stringify(p.frameBytes)}).`,
    );
  }

  const accepted = reasons.length === 0;
  return {
    accepted,
    adapter,
    driver: declaredDriver,
    target: typeof p.target === "string" ? p.target : null,
    evidence: accepted ? (hasTree ? `element tree of ${elements}` : `captured frame of ${frame} bytes`) : null,
    probeReturned: {
      booted: p.booted ?? null,
      elementCount: p.elementCount ?? null,
      frameBytes: p.frameBytes ?? null,
      error: p.error ?? null,
    },
    reasons,
    // Stated on every verdict so a caller cannot read a refusal as "skip the UI tier and carry on".
    consequence: accepted
      ? "UI-tier results may be recorded for this run."
      : "NO UI-tier result may be recorded for this run. This is a hard stop, not a skipped tier.",
  };
}

/** Human-readable report. Names the adapter, the driver and what the probe actually returned. */
// [SCOPE 127 / T008] BEGIN — UI driver must PROVE it drove something before any UI resul…
export function describeVerdict(v) {
  if (v.accepted) {
    return [
      `UI driver proof ACCEPTED`,
      `  adapter  : ${v.adapter}`,
      `  driver   : ${v.driver}`,
      `  target   : ${v.target ?? "(unnamed)"}`,
      `  evidence : ${v.evidence}`,
    ].join("\n");
  }
  return [
    `UI driver proof REFUSED — no UI-tier result may be recorded`,
    `  adapter        : ${v.adapter}`,
    `  declared driver: ${v.driver}`,
    `  target         : ${v.target ?? "(unnamed)"}`,
    `  probe returned : booted=${JSON.stringify(v.probeReturned.booted)} ` +
      `elementCount=${JSON.stringify(v.probeReturned.elementCount)} ` +
      `frameBytes=${JSON.stringify(v.probeReturned.frameBytes)}` +
      (v.probeReturned.error ? ` error=${JSON.stringify(v.probeReturned.error)}` : ""),
    ...v.reasons.map((r) => `  - ${r}`),
    ``,
    `  ${v.consequence}`,
  ].join("\n");
}
// [SCOPE 127 / T008] END

// [SCOPE 127 / T008] BEGIN — UI driver must PROVE it drove something before any UI resul…
function main(argv) {
  const args = argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : null;
  };
  const probePath = get("--probe");
  const adapter = get("--adapter") ?? "unknown";
  const json = args.includes("--json");

  if (!probePath) {
    console.error("usage: ui-driver-proof.mjs --probe <probe.json> [--adapter <name>] [--json]");
    process.exit(2);
  }

  let probe = null;
  if (!existsSync(probePath)) {
    // A missing probe file is itself a refusal, not a usage error: a driver that produced no
    // output at all is exactly the case this guard exists for.
    probe = { error: `The driver produced no probe result at ${probePath}.` };
  } else {
    try {
      probe = JSON.parse(readFileSync(probePath, "utf-8"));
    } catch (err) {
      probe = { error: `Probe result at ${probePath} is not valid JSON: ${err instanceof Error ? err.message : err}` };
    }
  }

  const verdict = judgeProof(probe, { adapter });
  if (json) console.log(JSON.stringify(verdict, null, 2));
  else console[verdict.accepted ? "log" : "error"](describeVerdict(verdict));

  process.exit(verdict.accepted ? 0 : 5);
}
// [SCOPE 127 / T008] END

if (process.argv[1]?.endsWith("ui-driver-proof.mjs")) main(process.argv);
