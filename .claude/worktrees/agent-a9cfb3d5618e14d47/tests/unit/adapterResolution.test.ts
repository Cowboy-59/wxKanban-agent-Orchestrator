// SCOPE-127 / T002, T003 — adapter resolution and contract validation.
//
// The failure these guard is specific and has happened: the TypeScript extractor was run against
// a C# repository, walked 316 .cs files, matched nothing, wrote a valid-looking inventory of ZERO
// units and exited 0. A confident empty result reads as a result. So the tests that matter most
// here are the ones asserting that a wrong stack does NOT resolve.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, cpSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { generateAdapters } from "../../_wxAI/adapters/generate-adapter.mjs";
import {
  MIN_TOKEN_OVERLAP,
  listAdapters,
  missingRequirements,
  normalize,
  parseRequires,
  parseStack,
  resolveAdapter,
  tokenize,
  typesNotServed,
} from "../../_wxAI/adapters/resolve-adapter.mjs";
import {
  CONTRACT,
  listAdapterFiles,
  validateAdapter,
} from "../../_wxAI/adapters/validate-adapter.mjs";

const REPO = process.cwd();
const temps: string[] = [];

/** A throwaway project root carrying the real adapters and a stack.md we control. */
function project(stackMd: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "adapter-test-"));
  temps.push(root);
  mkdirSync(join(root, "_wxAI"), { recursive: true });
  cpSync(join(REPO, "_wxAI", "adapters"), join(root, "_wxAI", "adapters"), { recursive: true });
  if (stackMd !== null) writeFileSync(join(root, "stack.md"), stackMd, "utf-8");
  return root;
}

const DOTNET_STACK = [
  "## Target Stack — Desktop",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Backend | C# / .NET 8 | Existing team skills. |",
  "| Frontend | WPF (XAML) / MVVM | Native Windows desktop. |",
  "| Database | PostgreSQL | Shared with the server estate. |",
  "| Testing | xUnit + FluentAssertions | Standard .NET test stack. |",
  "",
].join("\n");

const EXOTIC_STACK = [
  "## Target Stack — Web",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Backend | Elixir Phoenix | Team preference. |",
  "| Database | Mnesia | Embedded. |",
  "| Testing | ExUnit | Standard. |",
  "",
].join("\n");

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/**
 * A UI driver section that satisfies T007.
 *
 * The contract now requires a NAMED EXECUTABLE driver, so a fixture built from the generic
 * section helper no longer passes — correctly. Fixtures here are about the other five questions,
 * so they use this to keep the UI answer valid without restating the rule in each one.
 */
function uiSection(): string {
  // Long enough to clear MIN_ANSWER_CHARS as well as naming an executable driver — both rules
  // apply to this section, and a fixture that satisfied only one would test the wrong thing.
  return (
    "## UI driver\n\nPlaywright drives the running client, captures a trace and a screenshot per " +
    "step, and asserts on pathname and visible text rather than on appearance.\n\n"
  );
}

describe("T002 — resolution never assumes a stack", () => {
  it("reports a named miss when there is no stack.md, rather than defaulting", () => {
    const r = resolveAdapter({ root: project(null) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no-stack-md");
    expect(r.message).toContain("will not assume one");
    // The specific thing that must never happen.
    expect(JSON.stringify(r)).not.toContain("wxkanban-express");
  });

  it("does NOT resolve a C# desktop project to the Express adapter", () => {
    // This is the incident, as a test.
    const r = resolveAdapter({ root: project(DOTNET_STACK) });
    expect(r.resolved).toBe(true);
    expect(r.adapter.name).toBe("dotnet-wpf");
    expect(r.adapter.name).not.toBe("wxkanban-express");
  });

  it("reports a miss for a stack nothing covers, and says why silence would be worse", () => {
    const r = resolveAdapter({ root: project(EXOTIC_STACK) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no-match");
    expect(r.message).toContain("zero units");
  });

  it("resolves wxKanban's own stack to its reference adapter", () => {
    const r = resolveAdapter({ root: REPO });
    expect(r.resolved).toBe(true);
    expect(r.adapter.name).toBe("wxkanban-express");
    expect(r.appType).toBe("web");
  });

  it("carries provenance on every resolution, so a caller can say where machinery came from", () => {
    const r = resolveAdapter({ root: REPO });
    expect(r.provenance).toBe("shipped");
    expect(r.matchedOn.length).toBeGreaterThanOrEqual(MIN_TOKEN_OVERLAP);
  });

  it("requires more than one overlapping token, so a shared database cannot decide a match", () => {
    // Both shipped adapters mention PostgreSQL. One token must never be enough.
    expect(MIN_TOKEN_OVERLAP).toBeGreaterThan(1);
    const onlyPostgres = [
      "## Target Stack — Web",
      "",
      "| Dimension | Choice | Why |",
      "|---|---|---|",
      "| Database | PostgreSQL | Shared. |",
      "",
    ].join("\n");
    const r = resolveAdapter({ root: project(onlyPostgres) });
    expect(r.resolved).toBe(false);
  });

  it("honours an explicit app type", () => {
    const r = resolveAdapter({ root: REPO, appType: "desktop" });
    // wxKanban's desktop row is Tauri/SQLite, which no adapter covers.
    expect(r.resolved).toBe(false);
  });
});

describe("T002 — stack.md parsing is machine-decidable", () => {
  it("reads every Target Stack table into tokens", () => {
    const stack = parseStack(join(REPO, "stack.md"));
    expect(stack).not.toBeNull();
    expect(Object.keys(stack ?? {})).toContain("web");
    expect(stack?.web.tokens).toContain("express");
  });

  it("returns null for a missing file rather than throwing", () => {
    expect(parseStack(join(tmpdir(), "definitely-not-here-stack.md"))).toBeNull();
  });

  it("ignores the Why column, which is prose", () => {
    const stack = parseStack(join(REPO, "stack.md"));
    // "ubiquitous" appears only in a Why cell.
    expect(stack?.web.tokens).not.toContain("ubiquitous");
  });

  it("normalises punctuation so separators cannot change a match", () => {
    expect(normalize("Node.js + Express")).toBe("node js express");
    expect(tokenize("C# / .NET 8 (core)")).not.toContain("core");
  });

  it("finds both shipped adapters", () => {
    const names = listAdapters(REPO).map((a) => a.name).sort();
    expect(names).toEqual(["dotnet-wpf", "wxkanban-express"]);
  });

  it("both shipped adapters declare a machine-readable Matches line", () => {
    // Without it resolution falls back to prose, which FR-001 forbids at run time.
    for (const a of listAdapters(REPO)) {
      expect(a.declaresMatches, `${a.name} should declare **Matches:**`).toBe(true);
    }
  });
});

describe("T003 — the six-question contract", () => {
  it("is exactly six questions", () => {
    // Owner decision 8: security cases are a companion requirement, not a seventh question.
    expect(CONTRACT).toHaveLength(6);
  });

  it("passes both shipped adapters", () => {
    for (const f of listAdapterFiles(REPO)) {
      const r = validateAdapter(f);
      expect(r.valid, `${r.name} unanswered: ${r.unanswered.join(", ")}`).toBe(true);
    }
  });

  it("fails an adapter missing questions, and names WHICH", () => {
    const root = project(null);
    const p = join(root, "partial.md");
    writeFileSync(
      p,
      [
        "# Adapter — partial",
        "",
        "## Inventory source",
        "",
        "A real command that enumerates every callable unit here and states what it misses entirely.",
        "",
      ].join("\n"),
      "utf-8",
    );
    const r = validateAdapter(p);
    expect(r.valid).toBe(false);
    expect(r.unanswered).toContain("Schema source");
    expect(r.unanswered).toContain("DB posture");
    expect(r.unanswered).toContain("Test substitutes");
    expect(r.answered).toContain("inventory");
  });

  it("treats a heading with nothing under it as unanswered", () => {
    const root = project(null);
    const p = join(root, "hollow.md");
    writeFileSync(p, ["# Adapter — hollow", "", "## Inventory source", "", "TBD.", ""].join("\n"), "utf-8");
    const r = validateAdapter(p);
    const inventory = r.failures.find((f) => f.id === "inventory");
    expect(inventory?.problem).toBe("empty");
    expect(inventory?.detail).toContain("a heading, not an answer");
  });

  it("fails substitutes that never say what they CANNOT enforce", () => {
    // The least obvious question and the most valuable: a substitute that cannot enforce the
    // constraint under test makes every assertion about it unfailable.
    const root = project(null);
    const p = join(root, "nolimits.md");
    const section = (h: string) =>
      `## ${h}\n\nA complete and specific answer for this stack, long enough to be a real answer and not a stub.\n\n`;
    writeFileSync(
      p,
      "# Adapter — no limits\n\n" +
        section("Inventory source") +
        section("Schema source") +
        section("Harness") +
        // T007: the UI section must name a real executable driver, so this fixture does.
        uiSection() +
        section("DB posture") +
        // Deliberately long enough to clear the minimum-answer check, so this exercises the
        // limits rule rather than the length rule — the two failures are distinct and the
        // subtle one is worth testing on its own.
        "## Test substitutes\n\nAn in-memory store stands in for the database, and a fixed clock " +
        "stands in for time. Both are wired in through the same container the production code uses.\n",
      "utf-8",
    );
    const r = validateAdapter(p);
    expect(r.valid).toBe(false);
    const sub = r.failures.find((f) => f.id === "substitutes");
    expect(sub?.problem).toBe("no-limits");
    expect(sub?.detail).toContain("unfailable");
  });

  it("accepts substitutes once their limits are named", () => {
    const root = project(null);
    const p = join(root, "withlimits.md");
    const section = (h: string) =>
      `## ${h}\n\nA complete and specific answer for this stack, long enough to be a real answer and not a stub.\n\n`;
    writeFileSync(
      p,
      "# Adapter — with limits\n\n" +
        section("Inventory source") +
        section("Schema source") +
        section("Harness") +
        // T007: the UI section must name a real executable driver, so this fixture does.
        uiSection() +
        section("DB posture") +
        "## Test substitutes\n\nAn in-memory store stands in for the database. It **cannot** enforce " +
        "foreign keys or unique constraints, so any assertion about them is unfailable against it.\n",
      "utf-8",
    );
    expect(validateAdapter(p).valid).toBe(true);
  });
});

// Feedback 8a4e0de4: a Tauri 2 + Rust + embedded Firebird project hit "no adapter covers the
// declared stack" in /wxCreateTestPlan. Two things had to be true for a hand-written adapter to be
// a real way out, and neither was tested: every layer must actually call the shared resolver (the
// wxCreateTestPlan skill still matched a two-row table by eye, with paths T001 had moved away),
// and an adapter in the project's own .wxai/adapters/ must resolve and validate as documented.
const TAURI_STACK = [
  "## Target Stack — Desktop",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Shell | Rust (Tauri core) | Small signed binaries. |",
  "| UI | React webview + Tailwind CSS | Shared with the web team. |",
  "| Database | Firebird (embedded 5) | Existing customer data. |",
  "| Testing | Vitest | Webview unit tests. |",
  "",
].join("\n");

/** The header and six answers README.md "Writing your own adapter" documents, filled in. */
const TAURI_ADAPTER = [
  "# Adapter — Tauri 2 · Rust · React · embedded Firebird (desktop)",
  "",
  "**Stack:** Rust (Tauri core) with a React webview, Firebird 5 embedded, cargo test + Vitest.",
  "",
  "**Application type:** desktop",
  "**Matches:** rust tauri firebird webview",
  "**Status:** provisional",
  "**Inventory signal (command):** `src-tauri/src/**/*.rs` :: `#\\[tauri::command\\]`",
  "",
  "## Inventory source",
  "",
  "Every `#[tauri::command]` function under `src-tauri/src/**/*.rs` is a callable unit, the analogue",
  "of an Express route; add `pub fn` per module and the React screens under `src/`.",
  "",
  "## Schema source",
  "",
  "The ordered DDL files in `src-tauri/db/schema/NNN-*.sql` (isql style, `SET TERM`), reconciled",
  "against `RDB$RELATIONS` and `RDB$RELATION_FIELDS` on a freshly built database.",
  "",
  "## Harness",
  "",
  "`cargo test` integration tests against a temporary embedded `.fdb`, with fbclient loaded",
  "dynamically under `Providers = Engine13`; Vitest for the webview with invoke/listen mocked.",
  "",
  "## UI driver",
  "",
  "tauri-driver exposes the built app over WebDriver; `npx wdio run wdio.conf.ts` boots the binary,",
  "walks each screen, and captures a screenshot and the element tree per step.",
  "",
  "## DB posture",
  "",
  "Production is the `.fdb` named in the app config. Tests never open it.",
  "",
  "### Disposable target (/preTest Phase 1-2)",
  "",
  "Posture **file**: a new `.fdb` created from the DDL inside a per-run temp directory, which is the",
  "write boundary; a path outside that directory is refused. Isolation: the path lies inside this",
  "run's temp directory and differs from the production path. Faithfulness: the table and constraint",
  "counts in RDB$RELATIONS must equal those the DDL declares, or the run stops.",
  "",
  "## Test substitutes",
  "",
  "The mocked invoke/listen layer in Vitest **cannot** enforce Rust-side validation or Firebird",
  "constraints, so those assertions are unfailable there and route to the cargo tier instead.",
  "",
].join("\n");

describe("T002 / T017 — a project adapter is a real way out of a miss", () => {
  it("reproduces the report: this stack is a named miss when no adapter covers it", () => {
    const r = resolveAdapter({ root: project(TAURI_STACK) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no-match");
  });

  it("resolves a hand-written adapter in .wxai/adapters, and reports it as provisional", () => {
    const root = project(TAURI_STACK);
    mkdirSync(join(root, ".wxai", "adapters"), { recursive: true });
    writeFileSync(join(root, ".wxai", "adapters", "tauri-firebird.md"), TAURI_ADAPTER, "utf-8");

    const r = resolveAdapter({ root });
    expect(r.resolved).toBe(true);
    expect(r.adapter.name).toBe("tauri-firebird");
    // A project adapter must never be announced as one wxperts ships.
    expect(r.provenance).toBe("provisional");
    expect(r.adapter.origin).toBe("local");
    expect(r.matchedOn).toEqual(expect.arrayContaining(["rust", "tauri", "firebird"]));
  });

  it("validates the adapter exactly as the README documents it, project rules included", () => {
    const root = project(null);
    mkdirSync(join(root, ".wxai", "adapters"), { recursive: true });
    const p = join(root, ".wxai", "adapters", "tauri-firebird.md");
    writeFileSync(p, TAURI_ADAPTER, "utf-8");
    const r = validateAdapter(p);
    expect(r.origin).toBe("local");
    expect(r.valid, r.failures.map((f) => `${f.label}: ${f.detail}`).join(" | ")).toBe(true);
    expect(r.declaresMatches).toBe(true);
  });
});

describe("T002 — every layer resolves through the one shared resolver (FR-001)", () => {
  const LAYERS = [
    "_wxAI/skills/wxCreateTestPlan/SKILL.md",
    "_wxAI/commands/wxCreateTestPlan.md",
    ".claude/commands/wxCreateTestPlan.md",
    "_wxAI/skills/wxPreTest/SKILL.md",
    "_wxAI/commands/implement.md",
    ".claude/commands/implement.md",
  ];

  for (const rel of LAYERS) {
    it(`${rel} calls resolve-adapter.mjs`, () => {
      expect(readFileSync(join(REPO, rel), "utf-8")).toContain("_wxAI/adapters/resolve-adapter.mjs");
    });
  }

  it("wxCreateTestPlan names no adapter path T001 moved away", () => {
    // Before T001 adapters sat under the skill, so the skill said `adapters/x.md`. That directory
    // no longer exists; a bare path into it sends the reader nowhere.
    const skill = readFileSync(join(REPO, "_wxAI/skills/wxCreateTestPlan/SKILL.md"), "utf-8");
    expect(skill).not.toMatch(/(?<![\w./])adapters\/[\w-]+\.md/);
  });
});

// Feedback 3626c874 (T020, decision 25): an Express + React + SQLite web project — better-sqlite3,
// no Drizzle — resolved to wxkanban-express at implement Phase 5b, announced as SHIPPED, on
// express/vitest/playwright/react/node. Following its seeding form would have introduced the
// PostgreSQL/Drizzle machinery the declared stack does not use. Scoring only adds; these pin the
// disqualifier.
const webStack = (rows: string[][]): string =>
  [
    "## Target Stack — Web",
    "",
    "| Dimension | Choice | Why |",
    "|---|---|---|",
    ...rows.map(([dim, choice]) => `| ${dim} | ${choice} | x |`),
    "",
  ].join("\n");

const SQLITE_EXPRESS_STACK = webStack([
  ["Backend", "Node.js + Express"],
  ["Frontend", "React + Vite"],
  ["Database", "SQLite (better-sqlite3)"],
  ["Testing", "Vitest + Playwright"],
]);

const FASTAPI_POSTGRES_STACK = webStack([
  ["Backend", "Python + FastAPI"],
  ["Frontend", "React + Vite"],
  ["Database", "PostgreSQL"],
  ["Testing", "Pytest + Playwright"],
]);

describe("T020 — an adapter whose machinery the stack contradicts is excluded", () => {
  it("reproduces 3626c874: Express + SQLite is a no-match, not the Express/PostgreSQL adapter", () => {
    const r = resolveAdapter({ root: project(SQLITE_EXPRESS_STACK) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no-match");
    expect(r.adapter).toBeUndefined();
    const x = r.excluded.find((e: { name: string }) => e.name === "wxkanban-express");
    expect(x?.missing).toEqual(["postgresql|postgres"]);
    // The overlap that used to win is still reported, so the miss explains itself.
    expect(x?.score).toBe(5);
  });

  it("routes that miss to generation, and the generated adapter then resolves without a tie", () => {
    const root = project(SQLITE_EXPRESS_STACK);
    const out = generateAdapters({ root, date: "2026-10-05" });
    expect(out.exit).toBe(6);
    const r = resolveAdapter({ root });
    expect(r.resolved).toBe(true);
    expect(r.adapter.origin).toBe("local");
    expect(r.provenance).toBe("provisional");
    expect(r.matchedOn).toContain("sqlite");
  });

  it("closes the 2026-10-02 hole: Python/FastAPI + PostgreSQL no longer resolves on postgresql + playwright", () => {
    const r = resolveAdapter({ root: project(FASTAPI_POSTGRES_STACK) });
    expect(r.resolved).toBe(false);
    expect(r.reason).toBe("no-match");
    expect(r.excluded.find((e: { name: string }) => e.name === "wxkanban-express")?.missing).toEqual(["express"]);
  });

  it("accepts the alternative spelling a captured stack uses — Supabase (Postgres)", () => {
    const r = resolveAdapter({
      root: project(
        webStack([
          ["Backend", "Node.js + Express"],
          ["Database", "Supabase (Postgres)"],
          ["Testing", "Vitest + Playwright"],
        ]),
      ),
    });
    expect(r.resolved).toBe(true);
    expect(r.adapter.name).toBe("wxkanban-express");
    expect(r.excluded).toEqual([]);
  });

  it("leaves wxKanban's own stack and the .NET fixture resolving exactly as before (SC-6)", () => {
    const own = resolveAdapter({ root: REPO });
    expect(own.adapter.name).toBe("wxkanban-express");
    // stack.md also declares a Desktop table, where dotnet-wpf is rightly excluded (no wpf).
    expect(own.excluded.map((e: { name: string }) => e.name)).not.toContain("wxkanban-express");
    expect(resolveAdapter({ root: project(DOTNET_STACK) }).adapter.name).toBe("dotnet-wpf");
  });

  it("every shipped adapter declares a **Requires:** line", () => {
    for (const a of listAdapters(REPO).filter((x) => x.origin === "shipped")) {
      expect(a.requires.length, `${a.name} should declare **Requires:**`).toBeGreaterThan(0);
    }
  });

  it("parses groups and alternatives, and ignores backticks", () => {
    expect(parseRequires("`express` postgresql|postgres")).toEqual([[["express"]], [["postgresql"], ["postgres"]]]);
    expect(parseRequires("")).toEqual([]);
    const adapter = { requires: parseRequires("express postgresql|postgres") };
    expect(missingRequirements(adapter, ["express", "postgres"])).toEqual([]);
    expect(missingRequirements(adapter, ["express", "sqlite"])).toEqual(["postgresql|postgres"]);
    // No Requires line: never excluded — project adapters may omit it.
    expect(missingRequirements({ requires: [] }, [])).toEqual([]);
  });
});

// The reporter's stack.md (feedback 1565dac1), Choice columns verbatim. Both tables are the
// /buildstack defaults; the Mobile one is word-for-word wxKanban's own.
const WEB_PLUS_MOBILE_STACK = [
  "**Application types:** Web, Mobile",
  "",
  "## Target Stack — Web",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Backend | Node.js + Express | x |",
  "| Frontend | React + Vite | x |",
  "| Database | PostgreSQL | x |",
  "| Styling / Components | Tailwind CSS + shadcn/ui | x |",
  "| Testing | Vitest + Playwright | x |",
  "| Hosting / Deploy | Containerized (AWS / Vercel) | x |",
  "",
  "## Target Stack — Mobile",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Backend | Node.js + Express API | x |",
  "| Frontend | React Native (Expo) | x |",
  "| Database | SQLite (on-device) + Postgres (server) | x |",
  "| Styling / Components | NativeWind (Tailwind for RN) | x |",
  "| Testing | Jest + Detox | x |",
  "| Hosting / Deploy | App stores + EAS / managed API | x |",
  "",
].join("\n");

describe("T021 — every declared application type is reported, none silently dropped (decision 26)", () => {
  const RESOLVER = join(REPO, "_wxAI", "adapters", "resolve-adapter.mjs");

  it("keeps the top-level answer but names the Mobile type as no-match (feedback 1565dac1)", () => {
    const r = resolveAdapter({ root: project(WEB_PLUS_MOBILE_STACK) });
    expect(r.resolved).toBe(true);
    expect(r.adapter.name).toBe("wxkanban-express");
    expect(r.appType).toBe("web");
    expect(r.byAppType).toEqual([
      { appType: "web", resolved: true, adapter: "wxkanban-express", provenance: "shipped" },
      { appType: "mobile", resolved: false, reason: "no-match" },
    ]);
    expect(typesNotServed(r).map((t: { appType: string }) => t.appType)).toEqual(["mobile"]);
  });

  it("routes the dropped type to generation when it is asked for by name", () => {
    const root = project(WEB_PLUS_MOBILE_STACK);
    expect(resolveAdapter({ root, appType: "mobile" }).reason).toBe("no-match");
    const gen = generateAdapters({ root, appType: "mobile", write: false });
    expect(gen.results).toHaveLength(1);
    expect(gen.results[0].type).toBe("mobile");
    expect(["stop", "reuse"]).not.toContain(gen.results[0].action);
  });

  it("prints the unserved type and the exact command, without changing the exit code", () => {
    const root = project(WEB_PLUS_MOBILE_STACK);
    const out = spawnSync(process.execPath, [RESOLVER, "--root", root], { encoding: "utf-8" });
    expect(out.status).toBe(0);
    expect(out.stdout).toContain("This answer is for web only.");
    expect(out.stdout).toContain("--app-type mobile");
  });

  it("adds nothing for a single-type stack or an explicit --app-type", () => {
    expect(resolveAdapter({ root: project(DOTNET_STACK) }).byAppType).toBeUndefined();
    expect(resolveAdapter({ root: project(WEB_PLUS_MOBILE_STACK), appType: "web" }).byAppType).toBeUndefined();
  });

  it("leaves wxKanban's own three-type stack resolving to its reference adapter (SC-6)", () => {
    const own = resolveAdapter({ root: REPO });
    expect(own.adapter.name).toBe("wxkanban-express");
    expect(own.byAppType.map((t: { appType: string }) => t.appType)).toEqual(["web", "desktop", "mobile"]);
  });

  for (const rel of [
    "_wxAI/skills/wxCreateTestPlan/SKILL.md",
    "_wxAI/commands/wxCreateTestPlan.md",
    ".claude/commands/wxCreateTestPlan.md",
    "_wxAI/skills/wxPreTest/SKILL.md",
    "_wxAI/commands/implement.md",
    ".claude/commands/implement.md",
  ]) {
    it(`${rel} tells the caller what to do with byAppType`, () => {
      const text = readFileSync(join(REPO, rel), "utf-8");
      expect(text).toContain("byAppType");
      expect(text).toContain("--app-type");
    });
  }
});
