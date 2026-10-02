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
 * Docs that live beside adapters but are not adapters — README.md, GENERATE.md. Adapter names are
 * kebab-case lower-case; an all-capitals name is documentation. Without this, a procedure file
 * dropped into the directory would be resolved, scored and validated as though it were machinery.
 */
export const isAdapterDoc = (file) => /^[A-Z0-9_-]+\.md$/.test(basename(file));

/**
 * The placeholder `generate-adapter.mjs` writes under every heading it cannot answer itself.
 *
 * SCOPE-127 / T010, clarification 13: a placeholder is long enough to clear MIN_ANSWER_CHARS on its
 * own, so without this check an unfilled scaffold would validate as six real answers.
 */
export const GENERATE_MARKER = "<!-- wxai:generate";

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
 * The consequence is deliberate and uncomfortable: a generated adapter must name a driver for a
 * stack nobody anticipated, often one not yet set up in the repository. That is exactly why the proof probe in T008 exists and must not be
 * weakened — this requirement creates the risk that one contains.
 */
// These refuse an answer that DECLINES to drive the UI — not an honest statement that the driver is
// not set up yet, which GENERATE.md asks for. Two cold runs of GENERATE.md (2026-10-02) found the
// broad forms refusing exactly that honesty: a bare /\bnone\b/ caught "needs none of the web
// tooling", /\bno automated\b/ caught "no automated UI tests exist yet", and "driver: none
// installed" read as declining. Each is now anchored to the act of declining. The proof probe
// (T008) remains the real refusal of a driver that drives nothing.
const DECLINED_DRIVER = [
  /\bno automated (?:ui )?driver\b/i,
  /\b(?:ui|screens?|interface)\s+(?:is|are)\s+not automated\b/i,
  /\bno ui driver\b/i,
  /\bmanual(ly)? only\b/i,
  /\bhuman walkthrough\b/i,
  /\btested manually\b/i,
  /\bdriver\b[^.\n]{0,20}?[:=—-]\s*none\s*(?:[.;,]|$)/im,
  /^\s*(?:\*\*)?none\.?(?:\*\*)?\s*$/im,
];

/**
 * Something that looks like an executable invocation rather than a description of one.
 *
 * Widened under SCOPE-127 / T010 (clarification 19): a generated adapter for a Rust, Flutter or Go
 * stack names its runner in that stack's own terms, and `cargo test` failing this check while
 * `npx anything` passed it was a gap, not a safeguard. It stays shallow on purpose — the T008 proof
 * probe, which demands a booted target and a real element tree or frame, is what actually decides.
 */
const EXECUTABLE_SIGNALS = [
  /\bnpx? \S/i,
  /\b(?:npm|pnpm|yarn|bun) (?:run \S|test\b|exec \S|dlx \S)/i,
  /\bdotnet \S/i,
  /\bnode \S/i,
  /\bcargo (?:test|run|nextest)\b/i,
  /\b(?:flutter|go|mvn|gradle|gradlew|swift|xcodebuild) (?:test|drive|run|build)\b/i,
  /\bpytest\b|\bplaywright\b|\bappium\b|\bwinappdriver\b|\bselenium\b|\bcypress\b|\bxcuitest\b|\bespresso\b/i,
  /\bwdio\b|\bwebdriverio\b|\btauri-driver\b|\bmaestro\b|\bdetox\b|\bpatrol\b/i,
];

/** Headings a project adapter carries beyond the six — see `validateProjectRules`. */
const SECURITY_HEADING = /^##\s+Security test cases/im;
const DISPOSABLE_HEADING = /^###\s+Disposable target/im;
const POSTURES = ["schema", "file", "container"];

/**
 * Parse every `**Inventory signal (<kind>):** <glob> :: <regex>` line.
 *
 * SCOPE-127 / T013 (clarification 16). The signal is the pattern of the stack's registration site —
 * where a route, command or screen is declared. `inventory-guard.mjs` counts it independently of
 * whatever produced the inventory, which is what lets the under-count stop reach an inventory an
 * agent wrote rather than one `inventory-functions.mjs` wrote.
 *
 * The `(<kind>)` names the inventory `kind` the signal counts, so the guard compares like with like:
 * without it, a file's total could be made up with units of another kind and a missed command would
 * pass (second cold run, 2026-10-02). It is required on a project adapter; an unkinded signal is
 * compared against every unit in the file. The regex is JavaScript; write `/pattern/i` for flags —
 * `g` and `m` are always added. Backticks around either half are optional. Returns
 * `{ signals, errors }`; a line that does not parse is an error, never skipped.
 */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function parseInventorySignals(src) {
  const signals = [];
  const errors = [];
  for (const m of src.matchAll(/^\*\*Inventory signal(?:\s*\(([^)]*)\))?:\*\*\s*(.*)$/gm)) {
    const kind = m[1] !== undefined ? String(m[1]).trim().toLowerCase() : null;
    const raw = String(m[2]).trim();
    if (raw.includes(GENERATE_MARKER)) {
      errors.push("the **Inventory signal:** line is still a generation placeholder");
      continue;
    }
    if (kind !== null && !/^[a-z0-9][a-z0-9_-]*$/.test(kind)) {
      errors.push(`"(${kind})" is not a kind — write the single word these units carry as \`kind\` in inventory.json`);
      continue;
    }
    const sep = raw.indexOf(" :: ");
    if (sep < 0) {
      errors.push(`"${raw}" is not "<glob> :: <regex>"`);
      continue;
    }
    const strip = (s) => s.trim().replace(/^`(.*)`$/, "$1").trim();
    const glob = strip(raw.slice(0, sep));
    let pattern = strip(raw.slice(sep + 4));
    let flags = "";
    const lit = /^\/(.+)\/([a-z]*)$/.exec(pattern);
    if (lit) {
      pattern = lit[1];
      flags = lit[2];
    }
    if (!glob || !pattern) {
      errors.push(`"${raw}" has an empty glob or pattern`);
      continue;
    }
    try {
      const all = [...new Set(`${flags}gm`)].join("");
      signals.push({ kind, glob, pattern, regex: new RegExp(pattern, all) });
    } catch (e) {
      errors.push(`"${pattern}" is not a valid regular expression (${e instanceof Error ? e.message : e})`);
    }
  }
  return { signals, errors };
}
// [SCOPE 127 / T013] END

/** Where an adapter file sits decides which rules apply to it. */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function originOf(path) {
  const p = String(resolve(path)).replace(/\\/g, "/").toLowerCase();
  if (p.includes("/_wxai/adapters/")) return "shipped";
  if (p.includes("/.wxai/adapters/")) return "local";
  return "unplaced";
}
// [SCOPE 127 / T013] END

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
// MODIFIED-BY: [SCOPE 127 / T010] — an unfilled generation placeholder is not an answer
// MODIFIED-BY: [SCOPE 127 / T013] — project adapters must also pass validateProjectRules
export function validateAdapter(path, { origin = originOf(path) } = {}) {
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
    if (body.includes(GENERATE_MARKER)) {
      failures.push({
        id: q.id,
        label: q.label,
        problem: "placeholder",
        detail:
          `"## ${q.label}" still holds the generation placeholder. Replace it with an answer that is ` +
          "real for this stack and this repository — a placeholder is long enough to look like one.",
      });
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

  // The six questions are the contract; everything below is checked in addition and reported
  // separately, so "N of 6 unanswered" keeps meaning exactly that.
  const contractIds = new Set(CONTRACT.map((q) => q.id));
  const unanswered = failures.filter((f) => contractIds.has(f.id)).map((f) => f.label);

  if (origin === "local") failures.push(...validateProjectRules(src, { declaresMatches }));
  if (src.includes(GENERATE_MARKER) && !failures.some((f) => f.problem === "placeholder")) {
    failures.push({
      id: "placeholder",
      label: "Generation placeholder",
      problem: "placeholder",
      detail: "The file still contains a generation placeholder outside the six answers. Fill or remove it.",
    });
  }

  return {
    name,
    path,
    origin,
    valid: failures.length === 0,
    answered,
    unanswered,
    failures,
    declaresMatches,
  };
}
// [SCOPE 127 / T003] END

/**
 * Rules a PROJECT adapter must meet beyond the six answers — SCOPE-127 / T013 (clarifications 16-17).
 *
 * A project adapter (generated, or written by the developer) has not been verified by wxperts, and
 * under FR-006 a generated one runs with no human approving it. These are the machine-checkable
 * parts of trusting it anyway:
 *
 *   - a `**Matches:**` line, or it cannot be resolved without interpreting prose;
 *   - an `**Inventory signal:**`, so `inventory-guard.mjs` can catch an under-counted inventory;
 *   - a `### Disposable target` naming exactly ONE posture and a faithfulness check — and on the
 *     schema posture, `clone-test-schema.mjs`, so its `faithful:false` refusal is what fires;
 *   - a generated adapter carries `## Security test cases` (FR-014) rather than omitting them.
 *
 * Shipped adapters are not held to these: they are verified by wxperts, and holding them here would
 * change wxKanban's own pipeline (SC-6).
 */
// [SCOPE 127 / T013] BEGIN — Generation cannot bypass the existing guards (FR-013)
export function validateProjectRules(src, { declaresMatches }) {
  const out = [];
  const fail = (id, label, problem, detail) => out.push({ id, label, problem, detail });

  if (!declaresMatches) {
    fail("matches", "Matches line", "missing",
      "A project adapter must declare **Matches:** — without it resolution falls back to prose, which is not machine-decidable.");
  }

  const { signals, errors } = parseInventorySignals(src);
  for (const e of errors) fail("signal", "Inventory signal", "unparseable", e);
  if (signals.length === 0 && errors.length === 0) {
    fail("signal", "Inventory signal", "missing",
      "A project adapter must declare **Inventory signal (<kind>):** <glob> :: <regex> — the pattern of where " +
        "this stack declares a unit. inventory-guard.mjs counts it independently of the inventory; without it " +
        "an under-counted inventory reads as complete.");
  }
  for (const s of signals.filter((x) => x.kind === null)) {
    fail("signal", "Inventory signal", "no-kind",
      `The signal "${s.glob} :: ${s.pattern}" names no kind. Write **Inventory signal (<kind>):**, using the kind ` +
        "those units carry in inventory.json, so the guard compares like with like — a file's count cannot then " +
        "be made up with units of another kind.");
  }

  const dbBody = sectionBody(src, CONTRACT.find((q) => q.id === "db").heading) ?? "";
  const dtStart = DISPOSABLE_HEADING.exec(dbBody);
  if (!dtStart) {
    fail("posture", "Disposable target", "missing",
      'No "### Disposable target" under "## DB posture". /preTest reads the posture, its boundary and its ' +
        "faithfulness check from there.");
  } else {
    const rest = dbBody.slice(dtStart.index + dtStart[0].length);
    const next = /^###?\s+/m.exec(rest);
    const dt = next ? rest.slice(0, next.index) : rest;
    // The Posture line is the one LABELLED Posture — a `| Posture |` table row or a `Posture:` /
    // `**Posture**` line. Only when none is labelled does the first line mentioning posture count;
    // otherwise an introductory sentence above the table was read as the answer (cold run, 2026-10-02).
    const lines = dt.split("\n");
    const postureLine =
      lines.find((l) => /^\s*(?:\|\s*)?(?:\*\*)?posture(?:\*\*)?\s*(?:\||:|\*\*)/i.test(l)) ??
      lines.find((l) => /posture/i.test(l)) ??
      "";
    const bold = [...postureLine.matchAll(/\*\*(schema|file|container)\*\*/gi)].map((m) => m[1].toLowerCase());
    const plain = [...postureLine.matchAll(/\b(schema|file|container)\b/gi)].map((m) => m[1].toLowerCase());
    const named = [...new Set(bold.length > 0 ? bold : plain)];
    if (named.length !== 1) {
      fail("posture", "Disposable target", "posture",
        `The Posture line must name exactly one of ${POSTURES.join(", ")} (in bold) — it names ` +
          `${named.length === 0 ? "none" : named.join(", ")}.`);
    } else if (named[0] === "schema" && !/clone-test-schema\.mjs/.test(dt)) {
      fail("posture", "Disposable target", "unguarded-clone",
        "A schema posture must build its target with clone-test-schema.mjs, so that script's faithful:false " +
          "refusal is the one that fires. A hand-rolled clone has no faithfulness check.");
    }
    if (!/faithful/i.test(dt)) {
      fail("posture", "Disposable target", "no-faithfulness",
        "The Disposable target names no faithfulness check. A target that quietly lost constraints lets a " +
          "test pass that production would reject.");
    }
    // A floor, not a review: these confirm each part is addressed, not that it is right. The runtime
    // guards (posture-boundary.mjs, the faithfulness check, ui-driver-proof.mjs) decide that.
    for (const [re, part] of [
      [/creat|buil[dt]|clon|cop(?:y|ied)|generat|initiali[sz]|provision/i, "how the target is created"],
      [/isolat/i, "how isolation is proven"],
      [/boundar/i, "the write boundary"],
    ]) {
      if (!re.test(dt)) {
        fail("posture", "Disposable target", "incomplete", `The Disposable target does not say ${part}.`);
      }
    }
  }

  if (/^\*\*Origin:\*\*\s*generated\b/im.test(src)) {
    const sec = sectionBody(src, SECURITY_HEADING);
    if (sec === null || sec.length < MIN_ANSWER_CHARS || sec.includes(GENERATE_MARKER)) {
      fail("security", "Security test cases", sec === null ? "missing" : "empty",
        "A generated adapter must carry concrete security test cases for its stack (FR-014, SOC 2 CC7.1), " +
          "not omit them.");
    }
  }

  return out;
}
// [SCOPE 127 / T013] END

// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
// MODIFIED-BY: [SCOPE 127 / T010] — README.md and GENERATE.md are docs, not adapters
export function listAdapterFiles(root) {
  const out = [];
  for (const dir of [SHIPPED_DIR, LOCAL_DIR]) {
    const full = resolve(root, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) {
      if (f.endsWith(".md") && !isAdapterDoc(f)) out.push(join(full, f));
    }
  }
  return out;
}
// [SCOPE 127 / T003] END

// [SCOPE 127 / T003] BEGIN — Adapter contract validation — six answers or hard-stop (FR-…
// MODIFIED-BY: [SCOPE 127 / T013] — reports origin, and project-rule problems apart from the six
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

  const results = files.map((f) => validateAdapter(f));
  const invalid = results.filter((r) => !r.valid);

  if (json) {
    console.log(JSON.stringify({ results, valid: invalid.length === 0 }, null, 2));
  } else {
    for (const r of results) {
      const kind = r.origin === "local" ? "project adapter" : r.origin === "shipped" ? "shipped" : "unplaced";
      if (r.valid) {
        console.log(`OK    ${r.name} (${kind})  — all ${CONTRACT.length} questions answered${r.declaresMatches ? "" : "  (no **Matches:** line)"}`);
      } else {
        const other = r.failures.length - r.unanswered.length;
        console.error(
          `FAIL  ${r.name} (${kind})  — ${r.unanswered.length} of ${CONTRACT.length} unanswered` +
            `${r.unanswered.length ? `: ${r.unanswered.join(", ")}` : ""}` +
            `${other > 0 ? `; ${other} other problem(s)` : ""}`,
        );
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
