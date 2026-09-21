#!/usr/bin/env node
/**
 * Posture boundaries — SCOPE-127 / T006 (FR-009).
 *
 * The disposable-target guarantee has to survive the change of mechanism. Before adapters, "never
 * touch production" was one rule about one thing: a `wxktest_` schema prefix. Now a target may be
 * a schema, a file or a container, and a prefix check is meaningless on two of those.
 *
 * So every posture declares an explicit boundary and REFUSES writes outside it. Refusal is the
 * posture's own job, not a convention a caller is trusted to honour — a convention is exactly what
 * fails silently when a new stack arrives and nobody remembers the rule applied to it too.
 *
 * Two postures are hand-authored here: `schema` (the existing behaviour) and `file` (a disposable
 * database file inside a directory). `container` stays expressible and generation-proposable but
 * is deliberately NOT hand-authored — that is an analyst assumption recorded in the scope, and
 * shipping an unverified container posture would be exactly the confident wrong answer this scope
 * is trying not to create.
 *
 *   node _wxAI/adapters/posture-boundary.mjs --posture schema --boundary wxktest_ --target wxktest_119_ab
 *
 * Exit codes:  0 inside the boundary   4 refused   2 bad usage
 */
import { isAbsolute, relative, resolve, sep } from "node:path";

export const POSTURES = ["schema", "file", "container"];

/** A posture that is expressible but not hand-authored here. */
export const UNVERIFIED_POSTURES = new Set(["container"]);

// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export class BoundaryRefusal extends Error {
  constructor(posture, boundary, target, reason) {
    super(
      `Refused by the ${posture} posture: '${target}' is outside the declared boundary ` +
        `'${boundary}'. ${reason}`,
    );
    this.name = "BoundaryRefusal";
    this.posture = posture;
    this.boundary = boundary;
    this.target = target;
    this.reason = reason;
  }
}
// [SCOPE 127 / T006] END

/**
 * Schema posture — the target is a schema inside a shared instance.
 *
 * The boundary is a name prefix, because that is the only thing separating the disposable target
 * from production when both live in the same database. An empty prefix is rejected: it would admit
 * every schema including `public`, which is the failure the boundary exists to prevent.
 */
// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export function schemaBoundary(prefix) {
  const p = String(prefix ?? "").trim();
  if (p.length === 0) {
    throw new Error("A schema posture must declare a non-empty prefix. An empty prefix admits public.");
  }
  return {
    posture: "schema",
    boundary: p,
    describe: () => `schema names beginning '${p}'`,
    check(target) {
      const t = String(target ?? "").trim();
      if (t.length === 0) return { allowed: false, reason: "No target was named." };
      if (t.toLowerCase() === "public") {
        return { allowed: false, reason: "'public' is the production schema on a shared instance." };
      }
      if (!t.startsWith(p)) {
        return { allowed: false, reason: `A disposable schema must begin '${p}'.` };
      }
      return { allowed: true };
    },
  };
}
// [SCOPE 127 / T006] END

/**
 * File posture — the target is a database file in a directory.
 *
 * This is the posture that makes "never touching production" hold on a stack with no database
 * server at all. The boundary is a directory, and containment is decided after resolving both
 * paths: a relative path or a `..` segment must not be able to escape, which a string prefix
 * comparison would allow.
 */
// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export function fileBoundary(directory) {
  const dir = resolve(String(directory ?? "").trim());
  if (String(directory ?? "").trim().length === 0) {
    throw new Error("A file posture must declare a directory. Without one, every path is inside the boundary.");
  }
  return {
    posture: "file",
    boundary: dir,
    describe: () => `files under '${dir}'`,
    check(target) {
      const t = String(target ?? "").trim();
      if (t.length === 0) return { allowed: false, reason: "No target was named." };
      const full = isAbsolute(t) ? resolve(t) : resolve(dir, t);
      const rel = relative(dir, full);
      if (rel === "") return { allowed: false, reason: "The boundary directory itself is not a target." };
      if (rel.startsWith("..") || rel.split(sep).includes("..")) {
        return { allowed: false, reason: "The path escapes the boundary directory." };
      }
      if (isAbsolute(rel)) {
        return { allowed: false, reason: "The path is on a different root to the boundary directory." };
      }
      return { allowed: true };
    },
  };
}
// [SCOPE 127 / T006] END

/**
 * Container posture — expressible, deliberately not hand-authored.
 *
 * It refuses everything rather than admitting everything. An unverified posture that allowed
 * writes would be worse than one that does not exist, because a run would proceed on a guarantee
 * nobody has checked.
 */
// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export function containerBoundary(identifier) {
  return {
    posture: "container",
    boundary: String(identifier ?? ""),
    unverified: true,
    describe: () => `a container created by this run (${identifier || "unnamed"})`,
    check() {
      return {
        allowed: false,
        reason:
          "The container posture is expressible but not hand-authored in this scope, so its " +
          "boundary has never been proven by a refused write. Hand-author it, or generate and " +
          "verify one, before running on it.",
      };
    },
  };
}
// [SCOPE 127 / T006] END

/** Build a boundary from a posture name and its declared boundary value. */
// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export function makeBoundary(posture, boundary) {
  switch (String(posture)) {
    case "schema":
      return schemaBoundary(boundary);
    case "file":
      return fileBoundary(boundary);
    case "container":
      return containerBoundary(boundary);
    default:
      throw new Error(`Unknown posture '${posture}'. Expected one of: ${POSTURES.join(", ")}.`);
  }
}
// [SCOPE 127 / T006] END

/**
 * Assert a target is inside its boundary, throwing a refusal if not.
 *
 * Callers use this rather than `check` when there is nothing sensible to do with a false — which
 * is most of the time, because the alternative to refusing is writing somewhere unproven.
 */
// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
export function assertInsideBoundary(posture, boundary, target) {
  const b = makeBoundary(posture, boundary);
  const verdict = b.check(target);
  if (!verdict.allowed) throw new BoundaryRefusal(b.posture, b.boundary, target, verdict.reason);
  return true;
}
// [SCOPE 127 / T006] END

// [SCOPE 127 / T006] BEGIN — Posture boundary enforcement — schema and file postures (FR…
function main(argv) {
  const args = argv.slice(2);
  const get = (f) => {
    const i = args.indexOf(f);
    return i >= 0 ? args[i + 1] : null;
  };
  const posture = get("--posture");
  const boundary = get("--boundary");
  const target = get("--target");

  if (!posture || !target) {
    console.error("usage: posture-boundary.mjs --posture <schema|file|container> --boundary <b> --target <t>");
    process.exit(2);
  }

  try {
    const b = makeBoundary(posture, boundary);
    const verdict = b.check(target);
    if (verdict.allowed) {
      console.log(`allowed: '${target}' is within ${b.describe()}`);
      process.exit(0);
    }
    console.error(`REFUSED: '${target}' is outside ${b.describe()}`);
    console.error(`  ${verdict.reason}`);
    process.exit(4);
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }
}
// [SCOPE 127 / T006] END

if (process.argv[1]?.endsWith("posture-boundary.mjs")) main(process.argv);
