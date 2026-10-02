#!/usr/bin/env node
/**
 * Adapter generation — SCOPE-127 / T010 (FR-006) and T011 (FR-007).
 *
 * When no adapter covers a project's declared stack, the pipeline no longer stops: this writes a
 * candidate adapter into the project's own `.wxai/adapters/`, and the agent running the pipeline
 * completes it from `stack.md` and the repository, following `GENERATE.md`. There is no approval
 * prompt (owner decision 3).
 *
 * WHAT THIS WRITES, AND WHAT IT DELIBERATELY DOES NOT. It writes everything a script can know for
 * certain — the header, a `**Matches:**` line built from this project's own stack tokens,
 * `**Status:** provisional`, `**Origin:** generated`, the six headings and a security section — and
 * a marked placeholder under each heading. It does NOT write the answers. A script cannot know what
 * enumerates the commands of a Flutter or Tauri app, and a script that guessed would produce the
 * exact failure this subsystem exists to prevent: a confident adapter that is wrong. The answers
 * come from the agent, and the guards decide whether to trust them — `validate-adapter.mjs` refuses
 * an unfilled placeholder, `inventory-guard.mjs` refuses an inventory the adapter's own signal
 * contradicts, and `ui-driver-proof.mjs` refuses a UI result nothing was shown to have driven.
 *
 * IT NEVER OVERWRITES. A file the developer may have edited is theirs (FR-007). A persisted adapter
 * is found by the resolver on the next run, so nothing regenerates; an existing file that no longer
 * resolves is a hard stop naming it, not a silent replacement.
 *
 * ONLY A GENUINE MISS GENERATES. No `stack.md` means there is nothing to generate from, and a tie
 * means adapters already match — both stay hard stops (clarification 15).
 *
 *   node _wxAI/adapters/generate-adapter.mjs [--root <dir>] [--app-type web|desktop|mobile] [--json]
 *
 * Exit codes:  0 nothing to generate — every declared type resolves (reuse)
 *              6 a candidate was written — complete it per GENERATE.md, then validate it
 *              3 cannot generate (no stack.md, ambiguous, or an existing file in the way)
 *              2 bad usage
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import { normalize, parseStack, resolveAdapter } from "./resolve-adapter.mjs";
import { GENERATE_MARKER } from "./validate-adapter.mjs";

const LOCAL_DIR = join(".wxai", "adapters");
const APP_TYPES = ["web", "desktop", "mobile"];

/** A placeholder line — the marker is what `validate-adapter.mjs` refuses. */
const todo = (text) => `${GENERATE_MARKER} — ${text} -->`;

/**
 * File name for a generated adapter: the application type and the first few stack tokens.
 * Deterministic, so two runs on the same stack agree on where the file lives.
 */
// [SCOPE 127 / T010] BEGIN — Generate a candidate adapter from stack.md and proceed automatically (FR-006)
export function adapterSlug(type, tokens) {
  const parts = tokens
    .map((t) => String(t).replace(/[^a-z0-9]/g, ""))
    .filter(Boolean)
    .slice(0, 4);
  return [normalize(type).replace(/[^a-z0-9]/g, "") || "app", ...parts].join("-").slice(0, 64);
}
// [SCOPE 127 / T010] END

/** The candidate adapter's text. Pure, so it can be tested without touching disk. */
// [SCOPE 127 / T010] BEGIN — Generate a candidate adapter from stack.md and proceed automatically (FR-006)
export function scaffoldAdapter({ type, entry, date }) {
  const choices = Object.values(entry.dimensions);
  const summary = choices.slice(0, 4).join(" · ");
  const stack = Object.entries(entry.dimensions)
    .map(([dim, choice]) => `${dim}: ${choice}`)
    .join("; ");

  return [
    `# Adapter — ${summary} (${type})`,
    "",
    `**Stack:** ${stack}.`,
    "",
    `**Application type:** ${type}`,
    `**Matches:** ${entry.tokens.join(" ")}`,
    "**Status:** provisional",
    `**Origin:** generated ${date} from stack.md by generate-adapter.mjs`,
    `**Inventory signal (<kind>):** ${todo(
      "replace <kind> with the kind these units carry in inventory.json, and this comment with " +
        "`<glob> :: <regex>`: the files, and the pattern, where each unit of that kind is DECLARED (a " +
        "route, a command or IPC handler, a screen) — the file a unit is declared in is its `file` in " +
        "the inventory. Shape: `**Inventory signal (command):** src-tauri/src/**/*.rs :: " +
        "#\\[(?:tauri::)?command\\b`. One line per kind; `/pattern/i` for flags.",
    )}`,
    "",
    "> Generated for this project because no adapter wxperts ships covers its stack. It is",
    "> **provisional**: every run says so until a developer reviews it and sets `**Status:** approved`.",
    "> The contract is `_wxAI/adapters/README.md`; how to complete this file is `_wxAI/adapters/GENERATE.md`.",
    "",
    `**How this was completed.** ${todo(
      "say which commands were run in this repository and which named commands were not (they come " +
        "from knowledge of the stack). A reader must be able to tell an observed fact from a recalled one.",
    )}`,
    "",
    "## Inventory source",
    "",
    todo(
      "name the command or search that enumerates EVERY callable unit of this stack in this " +
        "repository — routes, command or IPC handlers, exported services, screens — with the real " +
        "paths it scans, and what it cannot see (dynamic registration, reflection, macros). Its " +
        "output goes to tests/testplans/<target>/inventory.json in the shape GENERATE.md gives.",
    ),
    "",
    "## Schema source",
    "",
    todo(
      "name where this repository's schema of record lives (migration or DDL files, an ORM model) " +
        "and what it is reconciled against — the live catalogue of a freshly built disposable " +
        "database. A mismatch between the two is a finding.",
    ),
    "",
    "## Harness",
    "",
    todo(
      "say how units are driven under test the way production wires them: this stack's test " +
        "runner, its real command, and where tests live. Then add a `### Seeding form (Phase 5b)` " +
        "subsection — where a seed lives, what runs it, how it is idempotent, how a shared base is " +
        "reused, where it may write, how it is verified — in this stack's own language.",
    ),
    "",
    "## UI driver",
    "",
    todo(
      "name a REAL driver that boots this app and drives its screens, as a runnable command " +
        "(`npx wdio run …`, `npx playwright test …`, `maestro test …`). Declining is not allowed. " +
        "Say how it captures the element tree or a screenshot: /preTest records no UI result until " +
        "the driver proves it drove something.",
    ),
    "",
    "## DB posture",
    "",
    todo(
      "name the production connection and where its configuration lives. Then add a " +
        "`### Disposable target (/preTest Phase 1-2)` subsection with a Posture line naming exactly " +
        "one of **schema**, **file** or **container** in bold; how the target is created (a schema " +
        "posture uses clone-test-schema.mjs); how isolation is proven; the faithfulness check; and " +
        "the write boundary.",
    ),
    "",
    "## Test substitutes",
    "",
    todo(
      "name each substitute (mocks, in-memory stores, fake clocks) and, for each, what it CANNOT " +
        "enforce — constraints, validation, transactions — so those cases route to a real-engine " +
        "tier instead of passing unfailably.",
    ),
    "",
    "## Security test cases",
    "",
    todo(
      "concrete security cases for THIS stack (SOC 2 CC7.1): the command or IPC boundary, secrets " +
        "at rest, input validation at the trust boundary, file-system access, authentication of " +
        "local endpoints. Name the unit or file each case targets.",
    ),
    "",
  ].join("\n");
}
// [SCOPE 127 / T010] END

/**
 * Decide, per declared application type, whether to reuse, generate or stop — and write any
 * candidate that needs writing. `write: false` plans without touching disk.
 */
// [SCOPE 127 / T011] BEGIN — Persist, reuse and preserve a generated adapter (FR-007)
export function generateAdapters({ root = process.cwd(), appType = null, date = null, write = true } = {}) {
  const stack = parseStack(resolve(root, "stack.md"));
  if (stack === null) {
    return {
      exit: 3,
      results: [
        {
          type: null,
          action: "stop",
          reason: "no-stack-md",
          message:
            "No stack.md, so there is nothing to generate an adapter from. Run /buildstack to " +
            "capture the stack; generation never guesses one.",
        },
      ],
    };
  }

  const declared = Object.keys(stack);
  const types = appType ? [normalize(appType)] : declared;
  if (types.length === 0 || (appType && !stack[types[0]])) {
    return {
      exit: 3,
      results: [
        {
          type: appType,
          action: "stop",
          reason: "no-target-stack-tables",
          message: appType
            ? `stack.md declares no "Target Stack — ${appType}" table.`
            : 'stack.md declares no "Target Stack" table, so there is nothing to generate from.',
        },
      ],
    };
  }

  const stamp = date ?? new Date().toISOString().slice(0, 10);
  const results = [];
  for (const type of types) {
    const r = resolveAdapter({ root, appType: type });
    if (r.resolved) {
      results.push({ type, action: "reuse", adapter: r.adapter, provenance: r.provenance });
      continue;
    }
    if (r.reason !== "no-match") {
      results.push({ type, action: "stop", reason: r.reason, message: r.message, candidates: r.candidates });
      continue;
    }

    const entry = stack[type];
    const path = join(resolve(root, LOCAL_DIR), `${adapterSlug(type, entry.tokens)}.md`);
    if (existsSync(path)) {
      // The file is there and did not resolve for this stack: its Matches line no longer fits, or it
      // declares another application type. It may carry the developer's edits, so it is never replaced.
      results.push({
        type,
        action: "stop",
        reason: "exists-unresolved",
        path,
        message:
          `${path} already exists but does not resolve for the "${type}" stack in stack.md. It is never ` +
          "overwritten — it may hold edits. Update its **Matches:** or **Application type:** line to fit " +
          "the declared stack, or move it aside to generate a fresh one.",
      });
      continue;
    }

    if (write) {
      mkdirSync(resolve(root, LOCAL_DIR), { recursive: true });
      writeFileSync(path, scaffoldAdapter({ type, entry, date: stamp }), "utf-8");
    }
    results.push({ type, action: "generate", path, written: write });
  }

  const exit = results.some((r) => r.action === "stop") ? 3 : results.some((r) => r.action === "generate") ? 6 : 0;
  return { exit, results };
}
// [SCOPE 127 / T011] END

// [SCOPE 127 / T010] BEGIN — Generate a candidate adapter from stack.md and proceed automatically (FR-006)
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

  const out = generateAdapters({ root, appType });

  if (json) {
    console.log(JSON.stringify(out, null, 2));
  } else {
    for (const r of out.results) {
      const label = r.type ?? "stack";
      if (r.action === "reuse") {
        console.log(`${label}: adapter exists — ${r.adapter.name} (${r.provenance}). Nothing generated.`);
      } else if (r.action === "generate") {
        console.log(`${label}: GENERATED a candidate adapter (provisional) — ${r.path}`);
        console.log(
          "  It holds placeholders, not answers. Complete it per _wxAI/adapters/GENERATE.md, then run\n" +
            `  node _wxAI/adapters/validate-adapter.mjs "${r.path}"`,
        );
      } else {
        console.error(`${label}: cannot generate (${r.reason}) — ${r.message}`);
      }
    }
  }

  process.exit(out.exit);
}
// [SCOPE 127 / T010] END

if (process.argv[1]?.endsWith("generate-adapter.mjs")) main(process.argv);
