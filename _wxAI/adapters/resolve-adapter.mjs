#!/usr/bin/env node
/**
 * Adapter resolution — SCOPE-127 / T002 (FR-001).
 *
 * ONE mechanism that reads `stack.md` and returns a resolved adapter or a documented miss.
 * `wxCreateTestPlan`, `implement` Phase 5b and `/preTest` all resolve through this, rather than
 * each deciding for itself — three implementations would drift, and a pipeline that resolved one
 * adapter at plan time and a different one at test time would be worse than one that resolved none.
 *
 * RESOLUTION IS MACHINE-DECIDABLE. Adapters declare a `**Matches:**` line of explicit tokens and
 * this compares tokens. It does not interpret prose at run time, because the primary caller is an
 * agent mid-`implement` and under FR-006 an unmatched result triggers generation rather than a
 * stop — so a fuzzy match here becomes a confident wrong answer downstream.
 *
 * IT NEVER DEFAULTS. No `stack.md`, or a stack nothing covers, produces a NAMED miss. Silently
 * falling back to the Express adapter is the specific failure this replaces: the TypeScript
 * extractor once walked 316 C# files, matched nothing, wrote a valid-looking inventory of zero
 * units and exited 0. A confident empty result reads as a result.
 *
 *   node _wxAI/adapters/resolve-adapter.mjs [--root <dir>] [--app-type web|desktop|mobile] [--json]
 *
 * Exit codes:  0 resolved   3 documented miss (the existing hard-stop convention)   2 bad usage
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, join, resolve } from "node:path";

/** Adapters wxperts ships. In KIT_DIRS, so these reach consumers. */
const SHIPPED_DIR = join("_wxAI", "adapters");
/** Generated and user-added adapters. Outside KIT_DIRS — deliberately never packaged. */
const LOCAL_DIR = join(".wxai", "adapters");

const APP_TYPES = ["web", "desktop", "mobile"];

/** Lower-case, strip punctuation, collapse whitespace — so "Node.js + Express" and "node express" agree. */
// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function normalize(text) {
  return String(text)
    .toLowerCase()
    .replace(/[().,/+·|]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
// [SCOPE 127 / T002] END

/** Tokens from a free-text value, minus words that carry no stack signal. */
const NOISE = new Set([
  "or", "and", "the", "a", "an", "with", "for", "only", "if", "needed", "optional",
  "core", "sidecar", "embedded", "native", "shell", "same", "as", "no", "required",
]);

// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function tokenize(text) {
  return normalize(text)
    .split(" ")
    .filter((t) => t.length > 1 && !NOISE.has(t));
}
// [SCOPE 127 / T002] END

/**
 * Parse `stack.md` into one token set per declared application type.
 *
 * Reads the `## Target Stack — <type>` tables. A dimension's Choice is the signal; the Why column
 * is prose and is deliberately ignored.
 */
// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function parseStack(stackPath) {
  if (!existsSync(stackPath)) return null;
  const src = readFileSync(stackPath, "utf-8");
  const out = {};

  const sectionRe = /^##\s+Target Stack\s*[—-]\s*(\w+)\s*$/gim;
  const marks = [];
  let m;
  while ((m = sectionRe.exec(src)) !== null) {
    marks.push({ type: String(m[1]).toLowerCase(), start: m.index + m[0].length });
  }
  if (marks.length === 0) return {};

  marks.forEach((mark, i) => {
    const end = i + 1 < marks.length ? marks[i + 1].start : src.length;
    const body = src.slice(mark.start, end);
    const dims = {};
    const tokens = new Set();
    for (const row of body.matchAll(/^\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|/gm)) {
      const dim = String(row[1]).trim();
      const choice = String(row[2]).trim();
      if (/^-+$/.test(dim) || dim.toLowerCase() === "dimension") continue;
      dims[normalize(dim)] = choice;
      for (const t of tokenize(choice)) tokens.add(t);
    }
    if (Object.keys(dims).length > 0) out[mark.type] = { dimensions: dims, tokens: [...tokens] };
  });

  return out;
}
// [SCOPE 127 / T002] END

/** Read one adapter file's declared identity. */
// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function readAdapter(path) {
  const src = readFileSync(path, "utf-8");
  const title = (/^#\s+(.+)$/m.exec(src) || [, basename(path)])[1].trim();
  const stackLine = (/^\*\*Stack:\*\*\s*([\s\S]*?)(?:\n\n|\n\*\*)/m.exec(src) || [, ""])[1];
  const matchLine = (/^\*\*Matches:\*\*\s*(.+)$/m.exec(src) || [, ""])[1];
  const appTypeLine = (/^\*\*Application type:\*\*\s*(.+)$/m.exec(src) || [, ""])[1];

  // `Matches:` is the machine-readable declaration. `Stack:` is prose kept for a human reader and
  // is used ONLY as a fallback signal for adapters written before `Matches:` existed.
  const declared = matchLine ? tokenize(matchLine) : [];
  const fallback = tokenize(stackLine);

  return {
    path,
    name: basename(path, ".md"),
    title,
    appType: appTypeLine ? normalize(appTypeLine) : null,
    tokens: declared.length > 0 ? declared : fallback,
    declaresMatches: declared.length > 0,
  };
}
// [SCOPE 127 / T002] END

/** Every adapter on disk, shipped first then local. */
// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function listAdapters(root) {
  const out = [];
  for (const [dir, origin] of [[SHIPPED_DIR, "shipped"], [LOCAL_DIR, "local"]]) {
    const full = resolve(root, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) {
      if (!f.endsWith(".md") || f.toLowerCase() === "readme.md") continue;
      out.push({ ...readAdapter(join(full, f)), origin });
    }
  }
  return out;
}
// [SCOPE 127 / T002] END

/**
 * Minimum overlapping tokens for a match to count.
 *
 * Two is deliberate. One token matches "PostgreSQL" against every adapter that mentions Postgres,
 * which is how a C# project would resolve to the Express adapter — the exact failure this replaces.
 */
export const MIN_TOKEN_OVERLAP = 2;

// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function scoreAdapter(adapter, stackTokens) {
  const set = new Set(stackTokens);
  const hits = adapter.tokens.filter((t) => set.has(t));
  return { hits, score: hits.length };
}
// [SCOPE 127 / T002] END

/**
 * Resolve an adapter for a project.
 *
 * Returns `{ resolved, adapter, reason, candidates, ... }`. It never throws and never picks a
 * default: an ambiguous or absent match is reported as a miss with everything needed to act on it.
 */
// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
export function resolveAdapter({ root = process.cwd(), appType = null } = {}) {
// [SCOPE 127 / T002] END
  const stackPath = resolve(root, "stack.md");
  const stack = parseStack(stackPath);

  if (stack === null) {
    return {
      resolved: false,
      reason: "no-stack-md",
      message:
        `No stack.md at ${stackPath}. The test pipeline cannot resolve machinery without a declared ` +
        "stack, and will not assume one. Run /buildstack to capture it, or pass --app-type with a " +
        "project that declares its stack elsewhere.",
      candidates: [],
    };
  }

  const types = appType ? [normalize(appType)] : Object.keys(stack);
  if (types.length === 0) {
    return {
      resolved: false,
      reason: "no-target-stack-tables",
      message: `stack.md at ${stackPath} declares no "Target Stack" table, so there is nothing to match against.`,
      candidates: [],
    };
  }

  const adapters = listAdapters(root);
  if (adapters.length === 0) {
    return {
      resolved: false,
      reason: "no-adapters",
      message: `No adapters found under ${SHIPPED_DIR} or ${LOCAL_DIR}.`,
      candidates: [],
    };
  }

  const scored = [];
  for (const type of types) {
    const entry = stack[type];
    if (!entry) continue;
    for (const a of adapters) {
      if (a.appType && a.appType !== type) continue;
      const { hits, score } = scoreAdapter(a, entry.tokens);
      scored.push({ adapter: a, appType: type, score, hits });
    }
  }

  scored.sort((x, y) => y.score - x.score);
  const best = scored[0];
  const viable = scored.filter((s) => s.score >= MIN_TOKEN_OVERLAP);

  if (!best || best.score < MIN_TOKEN_OVERLAP) {
    return {
      resolved: false,
      reason: "no-match",
      message:
        `No adapter covers the declared stack (${types.join(", ")}). Nothing is assumed: running an ` +
        "extractor built for another stack would produce a valid-looking inventory of zero units, " +
        "which reads as a result rather than an error.",
      candidates: scored.slice(0, 3).map((s) => ({ name: s.adapter.name, score: s.score, hits: s.hits })),
      stackTokens: types.flatMap((t) => stack[t]?.tokens ?? []),
    };
  }

  // A tie between two adapters is a miss, not a coin toss.
  const tied = viable.filter((s) => s.score === best.score);
  if (tied.length > 1) {
    return {
      resolved: false,
      reason: "ambiguous",
      message:
        `${tied.length} adapters match the declared stack equally well (${tied
          .map((s) => s.adapter.name)
          .join(", ")}). Resolution must be unambiguous, so this is reported rather than guessed.`,
      candidates: tied.map((s) => ({ name: s.adapter.name, score: s.score, hits: s.hits })),
    };
  }

  return {
    resolved: true,
    adapter: {
      name: best.adapter.name,
      path: best.adapter.path,
      title: best.adapter.title,
      origin: best.adapter.origin,
      declaresMatches: best.adapter.declaresMatches,
    },
    appType: best.appType,
    score: best.score,
    matchedOn: best.hits,
    // FR-010: provenance travels with every resolution, so a caller can always say where the
    // machinery it is about to run came from.
    provenance: best.adapter.origin === "shipped" ? "shipped" : "local",
    candidates: viable.slice(1, 3).map((s) => ({ name: s.adapter.name, score: s.score })),
  };
}

// [SCOPE 127 / T002] BEGIN — Build the shared adapter-resolution service (FR-001)
function main(argv) {
  const args = argv.slice(2);
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };
  const json = args.includes("--json");
  const root = get("--root") || process.cwd();
  const appType = get("--app-type");

  if (appType && !APP_TYPES.includes(normalize(appType))) {
    console.error(`--app-type must be one of: ${APP_TYPES.join(", ")}`);
    process.exit(2);
  }

  const result = resolveAdapter({ root, appType });

  if (json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.resolved) {
    console.log(`Resolved adapter: ${result.adapter.name} (${result.provenance})`);
    console.log(`  application type : ${result.appType}`);
    console.log(`  file             : ${result.adapter.path}`);
    console.log(`  matched on       : ${result.matchedOn.join(", ")}`);
    if (!result.adapter.declaresMatches) {
      console.log("  note             : matched on prose; this adapter declares no **Matches:** line");
    }
  } else {
    console.error(`Adapter resolution FAILED (${result.reason})\n`);
    console.error(result.message);
    if (result.candidates?.length) {
      console.error("\nClosest candidates:");
      for (const c of result.candidates) {
        console.error(`  ${c.name}  score ${c.score}${c.hits ? `  (${c.hits.join(", ")})` : ""}`);
      }
    }
    console.error(
      "\nThree honest options: write an adapter for this stack, run the method by hand with " +
        "substitutes agreed out loud, or narrow the target to a subtree an existing adapter covers.",
    );
  }

  process.exit(result.resolved ? 0 : 3);
}
// [SCOPE 127 / T002] END

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("resolve-adapter.mjs")) {
  main(process.argv);
}
