#!/usr/bin/env node
/**
 * Adapter contract validation — SCOPE-127 / T003 (FR-008).
 *
 * Every adapter answers SIX questions. One unanswered means the pipeline would run with a gap it
 * cannot see: no inventory source means no units, no DB posture means no proof the target is
 * disposable, no substitute limits means assertions that cannot fail.
 *
 * The contract stays six. Security cases are a companion requirement, not a seventh question.
 *
 * This validates ANY adapter — shipped, hand-authored or generated. Generated adapters matter
 * most: under FR-006 an unmatched stack generates one and the pipeline proceeds automatically
 * with no human gate, so this is one of the machine-checkable guards that carries the safety
 * burden a human is no longer carrying.
 *
 *   node _wxAI/adapters/validate-adapter.mjs [path...] [--all] [--root <dir>] [--json]
 *
 * Exit codes:  0 every adapter valid   1 at least one invalid   2 bad usage
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

const SHIPPED_DIR = join("_wxAI", "adapters");
const LOCAL_DIR = join(".wxai", "adapters");

/**
 * The six questions, and the heading each is answered under.
 *
 * `must` is what the answer has to contain to count as answered. A heading with nothing under it
 * is not an answer, and the last question has a further requirement — see below.
 */
export const CONTRACT = [
  { id: "inventory", heading: /^##\s+Inventory source/im, label: "Inventory source", feeds: "Phase 1" },
  { id: "schema", heading: /^##\s+Schema source/im, label: "Schema source", feeds: "Phase 1B" },
  { id: "harness", heading: /^##\s+Harness/im, label: "Harness", feeds: "Phase 3" },
  { id: "ui", heading: /^##\s+UI driver/im, label: "UI driver", feeds: "UI/UX coverage" },
  { id: "db", heading: /^##\s+DB posture/im, label: "DB posture", feeds: "Phase 0 step 3" },
  { id: "substitutes", heading: /^##\s+Test substitutes/im, label: "Test substitutes", feeds: "Phase 2A risk register" },
];

/** An answer shorter than this is a heading with nothing useful beneath it. */
export const MIN_ANSWER_CHARS = 80;

/**
 * The substitutes answer must say what the substitute CANNOT enforce.
 *
 * This is the least obvious question and the most valuable. A substitute that cannot enforce the
 * constraint under test makes every assertion about it unfailable — the suite goes green while
 * testing nothing. An adapter that lists substitutes without naming their limits passes a shallow
 * check and leaves that trap in place, so the limit is required explicitly.
 */
const LIMIT_SIGNALS = [/cannot/i, /can not/i, /does not enforce/i, /not enforced/i, /no enforcement/i, /unfailable/i];

/**
 * SCOPE-127 / T007 (FR-004) — every adapter must supply a REAL, NAMED, EXECUTABLE UI driver.
 *
 * No adapter may decline to drive the UI. The alternative — letting an adapter say it has no
 * automated driver and degrading the UI gate to a human walkthrough — was proposed and rejected
 * (owner decision 4), because an opt-out is the path every unfamiliar stack would take and the
 * gate would quietly stop existing.
 *
 * The consequence is deliberate and uncomfortable: a generated adapter must invent a driver for a
 * stack nobody anticipated. That is exactly why the proof probe in T008 exists and must not be
 * weakened — this requirement creates the risk that one contains.
 */
const DECLINED_DRIVER = [
  /\bno automated\b/i,
  /\bnot automated\b/i,
  /\bno ui driver\b/i,
  /\bmanual(ly)? only\b/i,
  /\bhuman walkthrough\b/i,
  /\btested manually\b/i,
  /\bnone\b/i,
];

/** Something that looks like an executable invocation rather than a description of one. */
const EXECUTABLE_SIGNALS = [
  /\bnpx? \S/i,
  /\bdotnet \S/i,
  /\bnode \S/i,
  /\bpytest\b|\bplaywright\b|\bappium\b|\bwinappdriver\b|\bselenium\b|\bcypress\b|\bxcuitest\b|\bespresso\b/i,
];

/** Extract the body under a heading, up to the next `##`. */
// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
function sectionBody(src, headingRe) {
  const m = headingRe.exec(src);
  if (!m) return null;
  const start = m.index + m[0].length;
  const next = /^##\s+/m.exec(src.slice(start));
  return src.slice(start, next ? start + next.index : src.length).trim();
}
// [SCOPE 127 / T003] END

/** Validate one adapter file. */
// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
export function validateAdapter(path) {
  const src = readFileSync(path, "utf-8");
  const name = basename(path, ".md");
  const failures = [];
  const answered = [];

  for (const q of CONTRACT) {
    const body = sectionBody(src, q.heading);
    if (body === null) {
      failures.push({ id: q.id, label: q.label, problem: "missing", detail: `No "## ${q.label}" section.` });
      continue;
    }
    if (body.length < MIN_ANSWER_CHARS) {
      failures.push({
        id: q.id,
        label: q.label,
        problem: "empty",
        detail: `"## ${q.label}" has ${body.length} characters beneath it — a heading, not an answer.`,
      });
      continue;
    }
    if (q.id === "ui") {
      if (DECLINED_DRIVER.some((re) => re.test(body))) {
        failures.push({
          id: q.id,
          label: q.label,
          problem: "declined-driver",
          detail:
            "The UI driver answer declines to drive the UI. No adapter may: an opt-out is the " +
            "path every unfamiliar stack would take, and the UI gate would quietly stop existing. " +
            "Name a real executable driver for this stack.",
        });
        continue;
      }
      if (!EXECUTABLE_SIGNALS.some((re) => re.test(body))) {
        failures.push({
          id: q.id,
          label: q.label,
          problem: "no-executable",
          detail:
            "The UI driver answer describes a driver but names nothing executable. A driver that " +
            "cannot be run is indistinguishable from no driver at all once a run depends on it.",
        });
        continue;
      }
    }
    if (q.id === "substitutes" && !LIMIT_SIGNALS.some((re) => re.test(body))) {
      failures.push({
        id: q.id,
        label: q.label,
        problem: "no-limits",
        detail:
          '"## Test substitutes" does not say what a substitute CANNOT enforce. A substitute that ' +
          "cannot enforce the constraint under test makes every assertion about it unfailable — the " +
          "suite goes green while testing nothing. Name the limits so they reach the risk register.",
      });
      continue;
    }
    answered.push(q.id);
  }

  // Not part of the six, but resolution needs it and a generated adapter must not omit it.
  const declaresMatches = /^\*\*Matches:\*\*\s*\S/m.test(src);

  return {
    name,
    path,
    valid: failures.length === 0,
    answered,
    unanswered: failures.map((f) => f.label),
    failures,
    declaresMatches,
  };
}
// [SCOPE 127 / T003] END

// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
export function listAdapterFiles(root) {
  const out = [];
  for (const dir of [SHIPPED_DIR, LOCAL_DIR]) {
    const full = resolve(root, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) {
      if (f.endsWith(".md") && f.toLowerCase() !== "readme.md") out.push(join(full, f));
    }
  }
  return out;
}
// [SCOPE 127 / T003] END

// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
function main(argv) {
  const args = argv.slice(2);
  const json = args.includes("--json");
  const all = args.includes("--all");
  const rootIdx = args.indexOf("--root");
  const root = rootIdx >= 0 ? args[rootIdx + 1] : process.cwd();

  let files = args.filter((a) => a.endsWith(".md"));
  if (all || files.length === 0) files = listAdapterFiles(root);

  if (files.length === 0) {
    console.error("No adapters found to validate.");
    process.exit(2);
  }

  const results = files.map(validateAdapter);
  const invalid = results.filter((r) => !r.valid);

  if (json) {
    console.log(JSON.stringify({ results, valid: invalid.length === 0 }, null, 2));
  } else {
    for (const r of results) {
      if (r.valid) {
        console.log(`OK    ${r.name}  — all ${CONTRACT.length} questions answered${r.declaresMatches ? "" : "  (no **Matches:** line)"}`);
      } else {
        console.error(`FAIL  ${r.name}  — ${r.unanswered.length} of ${CONTRACT.length} unanswered: ${r.unanswered.join(", ")}`);
        for (const f of r.failures) console.error(`        ${f.label}: ${f.detail}`);
      }
    }
    if (invalid.length > 0) {
      console.error(
        `\n${invalid.length} adapter(s) failed the contract. The pipeline does not proceed on a ` +
          "partially-specified adapter: an unanswered question is a gap the run cannot see.",
      );
    }
  }

  process.exit(invalid.length === 0 ? 0 : 1);
}
// [SCOPE 127 / T003] END

if (process.argv[1]?.endsWith("validate-adapter.mjs")) main(process.argv);
