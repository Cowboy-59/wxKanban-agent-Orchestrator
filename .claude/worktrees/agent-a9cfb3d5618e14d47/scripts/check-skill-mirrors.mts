#!/usr/bin/env tsx
/**
 * Skill and command mirror parity — SPEC-129 / T011.
 *
 * Skills and commands exist in more than one tree. Three mirrors of another skill on this
 * codebase drifted apart silently and were only diagnosed after the divergence was measured, so
 * this measures it rather than asserting it.
 *
 * Not every artifact lives in every tree — the review skill is deliberately single-copy. A file
 * present in one tree and absent from the other is reported as SINGLE, not as a failure; only a
 * file present in BOTH trees with DIFFERENT content is a defect.
 *
 *   npx tsx scripts/check-skill-mirrors.mts [--strict]
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const TREES = [".claude", "_wxAI"] as const;
const STRICT = process.argv.includes("--strict");

function md5(path: string): string {
  return createHash("md5").update(readFileSync(path)).digest("hex");
}

function listRelative(root: string): string[] {
  if (!existsSync(root)) return [];
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const rel = prefix ? `${prefix}/${entry}` : entry;
      if (statSync(full).isDirectory()) walk(full, rel);
      else if (entry.endsWith(".md")) out.push(rel);
    }
  };
  walk(root, "");
  return out.sort();
}

let drifted = 0;
let both = 0;
let single = 0;

for (const area of ["skills", "commands"] as const) {
  const [a, b] = TREES.map((t) => join(process.cwd(), t, area));
  const files = new Set([...listRelative(String(a)), ...listRelative(String(b))]);

  for (const rel of [...files].sort()) {
    const pa = join(String(a), rel);
    const pb = join(String(b), rel);
    const inA = existsSync(pa);
    const inB = existsSync(pb);

    if (inA && inB) {
      both += 1;
      if (md5(pa) !== md5(pb)) {
        drifted += 1;
        console.log(`DRIFT   ${area}/${rel}`);
        console.log(`          ${TREES[0]}: ${md5(pa)}`);
        console.log(`          ${TREES[1]}: ${md5(pb)}`);
      }
    } else {
      single += 1;
    }
  }
}

console.log(`\nmirrored: ${both}   single-copy: ${single}   drifted: ${drifted}`);
if (drifted === 0) {
  console.log("OK — every artifact present in both trees is byte-identical");
} else {
  console.log("Artifacts above exist in both trees with different content. Apply the change to every copy.");
}
if (STRICT && drifted > 0) process.exit(1);
