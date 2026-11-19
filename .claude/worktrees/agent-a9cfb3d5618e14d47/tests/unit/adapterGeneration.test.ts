// SCOPE-127 / T009–T013 — adapter generation, provenance, persistence, and the guards that make
// generating without an approval gate safe.
//
// Owner decision 3 removed the human from the loop: a stack no adapter covers now generates its own
// and the run carries on. That is only safe if a generated adapter cannot pass unfilled, cannot be
// mistaken for a shipped one, and cannot hand back an under-counted inventory. The tests that matter
// most here are therefore the REFUSALS — each one is a confident wrong answer that must not get
// through (ADR docs/adr/0001).
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { generateAdapters, scaffoldAdapter, adapterSlug } from "../../_wxAI/adapters/generate-adapter.mjs";
import { globToRegExp, guardInventory } from "../../_wxAI/adapters/inventory-guard.mjs";
import { listAdapters, parseStack, provenanceOf, resolveAdapter } from "../../_wxAI/adapters/resolve-adapter.mjs";
import {
  GENERATE_MARKER,
  isAdapterDoc,
  parseInventorySignals,
  validateAdapter,
} from "../../_wxAI/adapters/validate-adapter.mjs";

const REPO = process.cwd();
const temps: string[] = [];

afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

/** A throwaway project root carrying the real shipped adapters and a stack.md we control. */
function project(stackMd: string | null): string {
  const root = mkdtempSync(join(tmpdir(), "adapter-gen-"));
  temps.push(root);
  mkdirSync(join(root, "_wxAI"), { recursive: true });
  cpSync(join(REPO, "_wxAI", "adapters"), join(root, "_wxAI", "adapters"), { recursive: true });
  if (stackMd !== null) writeFileSync(join(root, "stack.md"), stackMd, "utf-8");
  return root;
}

const write = (root: string, rel: string, text: string): string => {
  const full = join(root, rel);
  mkdirSync(join(full, ".."), { recursive: true });
  writeFileSync(full, text, "utf-8");
  return full;
};

// Feedback 8a4e0de4's stack — the fourth "no adapter covers the declared stack" report.
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

const DOTNET_STACK = [
  "## Target Stack — Desktop",
  "",
  "| Dimension | Choice | Why |",
  "|---|---|---|",
  "| Backend | C# / .NET 8 | Existing team skills. |",
  "| Frontend | WPF (XAML) / MVVM | Native Windows desktop. |",
  "| Testing | xUnit + FluentAssertions | Standard .NET test stack. |",
  "",
].join("\n");

/** What an agent writes in place of each placeholder, by the part of the scaffold it fills. */
const PART = {
  signal: "`src-tauri/src/**/*.rs` :: `#\\[(?:tauri::)?command\\b`",
  completed: "Searched `src-tauri/src` and `src/` with grep; `cargo` and `tauri-driver` were not run here.",
  inventory:
    "Every `#[tauri::command]` function under `src-tauri/src/**/*.rs` is a callable unit, the analogue " +
    "of an Express route. Macros generated at build time are invisible to this search.",
  schema:
    "The ordered DDL files in `src-tauri/db/schema/NNN-*.sql`, reconciled against RDB$RELATIONS on a " +
    "freshly built database file.",
  harness:
    "`cargo test` integration tests in `src-tauri/tests/`, invoking commands through the same builder " +
    "production registers them on.\n\n### Seeding form (Phase 5b)\n\nA Rust seed in `src-tauri/tests/seeds/`, " +
    "idempotent by natural key.",
  ui:
    "tauri-driver exposes the built app over WebDriver; `npx wdio run wdio.conf.ts` boots the binary, walks " +
    "each screen, and captures the element tree and a screenshot per step.",
  db:
    "Production is the `.fdb` named in the app config.\n\n### Disposable target (/preTest Phase 1-2)\n\n" +
    "| Question | Answer |\n|---|---|\n" +
    "| Posture | **file** — a throwaway `.fdb` |\n" +
    "| Create it | Built from the DDL in a per-run temp directory |\n" +
    "| Prove isolation | The path lies inside the temp directory and differs from the production path |\n" +
    "| Faithfulness | Table and constraint counts must equal those the DDL declares |\n" +
    "| Write boundary | The temp directory this run created |",
  substitutes:
    "The mocked invoke layer in Vitest **cannot** enforce Rust-side validation or Firebird constraints, so " +
    "those assertions are unfailable there and route to the cargo tier.",
  security:
    "IPC boundary: every command rejects a payload that fails validation (`src-tauri/src/commands.rs`); the " +
    "database file is created with owner-only permissions; no command reads outside the app data directory.",
};
type Part = keyof typeof PART;

/** The order the scaffold lays its placeholders out in. */
const ORDER: Part[] = ["signal", "completed", "inventory", "schema", "harness", "ui", "db", "substitutes", "security"];
const ANSWERS = ORDER.map((k) => PART[k]);

/** Replace the scaffold's placeholders, in order, the way an agent following GENERATE.md would. */
function fill(scaffold: string, answers: string[] = ANSWERS): string {
  let i = 0;
  return scaffold
    .replace("**Inventory signal (<kind>):**", "**Inventory signal (command):**")
    .replace(/<!-- wxai:generate[\s\S]*?-->/g, (m) => (i < answers.length ? answers[i++] : m));
}

/** Generate into a fresh Tauri project and return its root and the written path. */
function generated(): { root: string; path: string } {
  const root = project(TAURI_STACK);
  const out = generateAdapters({ root, date: "2026-10-02" });
  const g = out.results.find((r: { action: string }) => r.action === "generate");
  if (!g?.path) throw new Error("expected a generated adapter");
  return { root, path: g.path as string };
}

describe("T009 / T012 — provenance: shipped, provisional, approved", () => {
  it("a shipped adapter is shipped whatever its file says", () => {
    expect(provenanceOf({ origin: "shipped", status: "provisional" })).toBe("shipped");
    expect(provenanceOf({ origin: "shipped", status: null })).toBe("shipped");
  });

  it("a project adapter is provisional until its file says approved", () => {
    expect(provenanceOf({ origin: "local", status: null })).toBe("provisional");
    expect(provenanceOf({ origin: "local", status: "provisional" })).toBe("provisional");
    expect(provenanceOf({ origin: "local", status: "draft" })).toBe("provisional");
    expect(provenanceOf({ origin: "local", status: "approved" })).toBe("approved");
  });

  it("editing **Status:** approved promotes a project adapter — and never blocks resolution before it", () => {
    const { root, path } = generated();
    expect(resolveAdapter({ root }).provenance).toBe("provisional");
    writeFileSync(path, readFileSync(path, "utf-8").replace("**Status:** provisional", "**Status:** approved"), "utf-8");
    const r = resolveAdapter({ root });
    expect(r.resolved).toBe(true);
    expect(r.provenance).toBe("approved");
  });

  it("wxKanban's own adapter still reports shipped (SC-6)", () => {
    expect(resolveAdapter({ root: REPO }).provenance).toBe("shipped");
  });
});

describe("T010 — an unmatched stack generates a candidate and carries on", () => {
  it("writes one candidate into the project's .wxai/adapters, with exit 6", () => {
    const root = project(TAURI_STACK);
    const out = generateAdapters({ root, date: "2026-10-02" });
    expect(out.exit).toBe(6);
    const g = out.results[0];
    expect(g.action).toBe("generate");
    expect(g.path.replace(/\\/g, "/")).toContain("/.wxai/adapters/desktop-rust-tauri-react-webview.md");
    expect(existsSync(g.path)).toBe(true);
  });

  it("writes provisional status, generated origin, and this project's own stack tokens", () => {
    const { path } = generated();
    const text = readFileSync(path, "utf-8");
    expect(text).toMatch(/^\*\*Status:\*\* provisional$/m);
    expect(text).toMatch(/^\*\*Origin:\*\* generated 2026-10-02/m);
    expect(text).toMatch(/^\*\*Application type:\*\* desktop$/m);
    expect(text).toMatch(/^\*\*Matches:\*\* .*\brust\b.*\btauri\b.*\bfirebird\b/m);
    for (const h of ["Inventory source", "Schema source", "Harness", "UI driver", "DB posture", "Test substitutes", "Security test cases"]) {
      expect(text).toContain(`## ${h}`);
    }
  });

  it("resolves immediately, as provisional and generated — never as shipped", () => {
    const { root } = generated();
    const r = resolveAdapter({ root });
    expect(r.resolved).toBe(true);
    expect(r.provenance).toBe("provisional");
    expect(r.adapter.generated).toBe(true);
    expect(r.adapter.origin).toBe("local");
  });

  it("an UNFILLED candidate fails validation on every placeholder — a placeholder is not an answer", () => {
    // The placeholders clear the 80-character floor on their own. Without the marker check this
    // file would validate as six real answers: the precise confident-wrong outcome to prevent.
    const { path } = generated();
    const r = validateAdapter(path);
    expect(r.valid).toBe(false);
    expect(r.unanswered).toHaveLength(6);
    expect(r.failures.filter((f: { problem: string }) => f.problem === "placeholder").length).toBeGreaterThanOrEqual(6);
    expect(r.failures.some((f: { id: string }) => f.id === "signal")).toBe(true);
    expect(r.failures.some((f: { id: string }) => f.id === "security")).toBe(true);
  });

  it("one question left unanswered still fails, naming that question (FR-008)", () => {
    const { path } = generated();
    const scaffold = readFileSync(path, "utf-8");
    // Fill everything except the UI driver.
    const partial = [...ANSWERS];
    partial[ORDER.indexOf("ui")] = "__LEAVE__";
    let text = fill(scaffold, partial);
    text = text.replace("__LEAVE__", `${GENERATE_MARKER} — still to do -->`);
    writeFileSync(path, text, "utf-8");
    const r = validateAdapter(path);
    expect(r.valid).toBe(false);
    expect(r.unanswered).toEqual(["UI driver"]);
  });

  it("a candidate completed from the repository validates, and the run can proceed on it", () => {
    const { root, path } = generated();
    writeFileSync(path, fill(readFileSync(path, "utf-8")), "utf-8");
    const r = validateAdapter(path);
    expect(r.valid, r.failures.map((f: { label: string; detail: string }) => `${f.label}: ${f.detail}`).join(" | ")).toBe(true);
    expect(resolveAdapter({ root }).adapter.name).toBe("desktop-rust-tauri-react-webview");
  });

  it("does not generate for a stack an adapter already covers", () => {
    const root = project(DOTNET_STACK);
    const out = generateAdapters({ root });
    expect(out.exit).toBe(0);
    expect(out.results[0].action).toBe("reuse");
    expect(out.results[0].provenance).toBe("shipped");
    expect(existsSync(join(root, ".wxai", "adapters"))).toBe(false);
  });

  it("does not generate without a stack.md — there is nothing to generate from", () => {
    const root = project(null);
    const out = generateAdapters({ root });
    expect(out.exit).toBe(3);
    expect(out.results[0].reason).toBe("no-stack-md");
    expect(existsSync(join(root, ".wxai"))).toBe(false);
  });

  it("does not generate on a tie — adapters already match", () => {
    const root = project(TAURI_STACK);
    const twin = "# Adapter — twin\n\n**Application type:** desktop\n**Matches:** rust tauri\n";
    write(root, ".wxai/adapters/twin-a.md", twin);
    write(root, ".wxai/adapters/twin-b.md", twin);
    const out = generateAdapters({ root });
    expect(out.exit).toBe(3);
    expect(out.results[0].reason).toBe("ambiguous");
  });

  it("plans without writing when asked to", () => {
    const root = project(TAURI_STACK);
    const out = generateAdapters({ root, write: false });
    expect(out.results[0].action).toBe("generate");
    expect(existsSync(out.results[0].path)).toBe(false);
  });

  it("names the file deterministically from the stack", () => {
    const stack = parseStack(join(project(TAURI_STACK), "stack.md"));
    expect(adapterSlug("desktop", stack?.desktop.tokens ?? [])).toBe("desktop-rust-tauri-react-webview");
    expect(adapterSlug("Mobile", ["c#", "flutter"])).toBe("mobile-c-flutter");
  });

  it("scaffoldAdapter is pure — the same input yields the same file", () => {
    const stack = parseStack(join(project(TAURI_STACK), "stack.md"));
    const a = scaffoldAdapter({ type: "desktop", entry: stack?.desktop, date: "2026-10-02" });
    const b = scaffoldAdapter({ type: "desktop", entry: stack?.desktop, date: "2026-10-02" });
    expect(a).toBe(b);
  });
});

describe("T011 — persisted, reused, never overwritten", () => {
  it("a second run reuses the file and leaves it byte-identical", () => {
    const { root, path } = generated();
    const before = readFileSync(path, "utf-8");
    const out = generateAdapters({ root, date: "2099-01-01" });
    expect(out.exit).toBe(0);
    expect(out.results[0].action).toBe("reuse");
    expect(readFileSync(path, "utf-8")).toBe(before);
  });

  it("a developer's edits survive every later run", () => {
    const { root, path } = generated();
    const edited = `${fill(readFileSync(path, "utf-8"))}\n<!-- my own note -->\n`;
    writeFileSync(path, edited, "utf-8");
    generateAdapters({ root });
    generateAdapters({ root });
    expect(readFileSync(path, "utf-8")).toBe(edited);
  });

  it("an existing file that no longer resolves is a hard stop, and is not touched", () => {
    const { root, path } = generated();
    // The developer re-pointed it at another application type; it no longer fits this stack.
    const moved = readFileSync(path, "utf-8").replace("**Application type:** desktop", "**Application type:** web");
    writeFileSync(path, moved, "utf-8");
    const out = generateAdapters({ root });
    expect(out.exit).toBe(3);
    expect(out.results[0].reason).toBe("exists-unresolved");
    expect(readFileSync(path, "utf-8")).toBe(moved);
  });

  it("the kit never packages .wxai, so a kit upgrade cannot carry or clobber a project adapter", () => {
    const sync = readFileSync(join(REPO, "scripts", "sync-to-orchestrator.mjs"), "utf-8");
    const dirs = /const KIT_DIRS = \[([^\]]*)\]/.exec(sync)?.[1] ?? "";
    expect(dirs).toContain("_wxAI");
    expect(dirs).not.toMatch(/\.wxai/);
  });
});

describe("T013 — an adapter-driven inventory meets the same hard stops", () => {
  /** A small Tauri tree: 3 commands in one file, 1 in another, and build output that must be ignored. */
  function tauriTree(): { root: string; adapter: string } {
    const { root, path } = generated();
    writeFileSync(path, fill(readFileSync(path, "utf-8")), "utf-8");
    const cmd = (n: string) => `#[tauri::command]\nfn ${n}() {}\n`;
    write(root, "src-tauri/src/commands.rs", cmd("save") + cmd("load") + cmd("delete"));
    write(root, "src-tauri/src/sub/db.rs", cmd("migrate"));
    write(root, "src-tauri/target/debug/build/gen.rs", cmd("generated_a") + cmd("generated_b"));
    return { root, adapter: path };
  }

  const unit = (file: string, name: string) => ({ file, line: 1, name, kind: "command", risk: "HIGH" });
  const FULL = [
    unit("src-tauri/src/commands.rs", "save"),
    unit("src-tauri/src/commands.rs", "load"),
    unit("src-tauri/src/commands.rs", "delete"),
    unit("src-tauri/src/sub/db.rs", "migrate"),
  ];

  it("accepts an inventory its signal agrees with — and ignores build output", () => {
    const { root, adapter } = tauriTree();
    const r = guardInventory({ adapterPath: adapter, inventory: { units: FULL }, root });
    expect(r.ok).toBe(true);
    expect(r.signalHits).toBe(4);
    expect(r.signalFiles).toBe(2);
  });

  it("REFUSES zero units — the C# incident: a valid-looking empty inventory", () => {
    const { root, adapter } = tauriTree();
    const r = guardInventory({ adapterPath: adapter, inventory: { units: [] }, root });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("zero-units");
    expect(r.message).toContain("4 registration");
  });

  it("REFUSES an under-count, naming the file — the 6c7d9a5c shape", () => {
    const { root, adapter } = tauriTree();
    const short = [unit("src-tauri/src/commands.rs", "save"), unit("src-tauri/src/sub/db.rs", "migrate")];
    const r = guardInventory({ adapterPath: adapter, inventory: { units: short }, root });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("under-count");
    expect(r.underCounted).toEqual([{ file: "src-tauri/src/commands.rs", kind: "command", registrations: 3, units: 1 }]);
  });

  it("REFUSES a signal that matches nothing — the adapter does not describe this codebase", () => {
    const { root, adapter } = tauriTree();
    // A fabricated adapter: plausible for some stack, wrong for this one.
    const text = readFileSync(adapter, "utf-8").replace(
      /^\*\*Inventory signal[^\n]*$/m,
      "**Inventory signal (command):** `lib/**/*.dart` :: `GoRoute\\(`",
    );
    writeFileSync(adapter, text, "utf-8");
    const r = guardInventory({ adapterPath: adapter, inventory: { units: FULL }, root });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("signal-matches-nothing");
  });

  it("REFUSES a project adapter that declares no signal", () => {
    const { root, adapter } = tauriTree();
    writeFileSync(adapter, readFileSync(adapter, "utf-8").replace(/^\*\*Inventory signal[^\n]*$/m, ""), "utf-8");
    const r = guardInventory({ adapterPath: adapter, inventory: { units: FULL }, root });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no-signal");
  });

  it("lets a shipped adapter with no signal through untouched (SC-6)", () => {
    const r = guardInventory({
      adapterPath: join(REPO, "_wxAI", "adapters", "wxkanban-express.md"),
      inventory: { units: [unit("src/server/app.ts", "createApp")] },
      root: REPO,
    });
    expect(r.ok).toBe(true);
    expect(r.reason).toBe("shipped-no-signal");
  });

  it("checks a path-scoped run against the CALLER's scope, and reports what it left out", () => {
    const { root, adapter } = tauriTree();
    const r = guardInventory({
      adapterPath: adapter,
      inventory: { units: [unit("src-tauri/src/sub/db.rs", "migrate")] },
      root,
      scope: ["src-tauri/src/sub"],
    });
    expect(r.ok).toBe(true);
    expect(r.scope).toEqual(["src-tauri/src/sub"]);
    expect(r.outOfScope).toBe(3);
  });

  it("IGNORES the inventory's own scanned.dirs — an inventory cannot narrow its own check", () => {
    // Found by a cold run of GENERATE.md (2026-10-02): a whole-app inventory missing every Tauri
    // command passed as "consistent" once it set scanned.dirs to the webview folder. The inventory
    // is written by the agent being checked, so it must not decide what the check covers.
    const { root, adapter } = tauriTree();
    const evasive = { scanned: { dirs: ["src-tauri/src/sub"] }, units: [unit("src-tauri/src/sub/db.rs", "migrate")] };
    const r = guardInventory({ adapterPath: adapter, inventory: evasive, root });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("under-count");
    expect(r.underCounted).toEqual([{ file: "src-tauri/src/commands.rs", kind: "command", registrations: 3, units: 0 }]);
  });

  it("names every file the signal matched, so a reader sees what was checked", () => {
    const { root, adapter } = tauriTree();
    const r = guardInventory({ adapterPath: adapter, inventory: { units: FULL }, root });
    expect(r.matched).toEqual([
      { file: "src-tauri/src/commands.rs", kind: "command", registrations: 3, units: 3 },
      { file: "src-tauri/src/sub/db.rs", kind: "command", registrations: 1, units: 1 },
    ]);
  });

  it("counts a command declared with arguments to its attribute — the robust signal", () => {
    const { root, adapter } = tauriTree();
    write(root, "src-tauri/src/sub/db.rs", "#[tauri::command(async)]\nfn migrate() {}\n#[command]\nfn seed() {}\n");
    const r = guardInventory({ adapterPath: adapter, inventory: { units: FULL }, root });
    expect(r.ok).toBe(false);
    expect(r.underCounted).toEqual([{ file: "src-tauri/src/sub/db.rs", kind: "command", registrations: 2, units: 1 }]);
  });

  it("REFUSES a missed command covered by units of another kind in the same file", () => {
    // Second cold run, 2026-10-02: whole-file totals let a file's count be made up with units of
    // another kind. A kinded signal is compared only with its own kind.
    const { root, adapter } = tauriTree();
    const padded = [
      unit("src-tauri/src/commands.rs", "save"),
      { ...unit("src-tauri/src/commands.rs", "helperA"), kind: "exported-function" },
      { ...unit("src-tauri/src/commands.rs", "helperB"), kind: "exported-function" },
      unit("src-tauri/src/sub/db.rs", "migrate"),
    ];
    const r = guardInventory({ adapterPath: adapter, inventory: { units: padded }, root });
    expect(r.ok).toBe(false);
    expect(r.underCounted).toEqual([{ file: "src-tauri/src/commands.rs", kind: "command", registrations: 3, units: 1 }]);
  });

  it("honours /pattern/i flags on a signal — SQL DDL needs case-insensitive matching", () => {
    const { root, adapter } = tauriTree();
    write(root, "db/schema/001.sql", "create table customers (id int);\nCREATE TABLE invoices (id int);\n");
    const withTables = readFileSync(adapter, "utf-8").replace(
      /^(\*\*Inventory signal \(command\):\*\*[^\n]*)$/m,
      "$1\n**Inventory signal (table):** `db/schema/*.sql` :: `/\\bcreate\\s+table\\b/i`",
    );
    writeFileSync(adapter, withTables, "utf-8");
    const tables = [
      { ...unit("db/schema/001.sql", "customers"), kind: "table" },
      { ...unit("db/schema/001.sql", "invoices"), kind: "table" },
    ];
    const r = guardInventory({ adapterPath: adapter, inventory: { units: [...FULL, ...tables] }, root });
    expect(r.ok, r.message).toBe(true);
    expect(r.matched).toContainEqual({ file: "db/schema/001.sql", kind: "table", registrations: 2, units: 2 });
  });

  it("--allow-empty admits an empty inventory only when the signal is empty too", () => {
    const { root, adapter } = tauriTree();
    expect(guardInventory({ adapterPath: adapter, inventory: { units: [] }, root, allowEmpty: true }).ok).toBe(false);
    const bare = project(TAURI_STACK);
    const bareAdapter = write(bare, ".wxai/adapters/a.md", readFileSync(adapter, "utf-8"));
    expect(guardInventory({ adapterPath: bareAdapter, inventory: { units: [] }, root: bare, allowEmpty: true }).ok).toBe(true);
  });

  it("REFUSES an inventory with no units array", () => {
    const { root, adapter } = tauriTree();
    expect(guardInventory({ adapterPath: adapter, inventory: { items: FULL }, root }).reason).toBe("bad-inventory");
  });

  it("matches globs the way the README documents them", () => {
    expect(globToRegExp("src/**/*.rs").test("src/a.rs")).toBe(true);
    expect(globToRegExp("src/**/*.rs").test("src/x/y/a.rs")).toBe(true);
    expect(globToRegExp("src/**/*.rs").test("srcx/a.rs")).toBe(false);
    expect(globToRegExp("src/*.{ts,tsx}").test("src/a.tsx")).toBe(true);
    expect(globToRegExp("src/*.{ts,tsx}").test("src/sub/a.ts")).toBe(false);
  });
});

describe("T013 — the validator holds project adapters to the guards", () => {
  function projectAdapter(mutate: (s: string) => string): string {
    const { path } = generated();
    writeFileSync(path, mutate(fill(readFileSync(path, "utf-8"))), "utf-8");
    return path;
  }
  const problems = (p: string) => validateAdapter(p).failures.map((f: { id: string; problem: string }) => `${f.id}:${f.problem}`);

  it("refuses a posture line that names two postures", () => {
    const p = projectAdapter((s) => s.replace("| Posture | **file**", "| Posture | **file** or **container**"));
    expect(problems(p)).toContain("posture:posture");
  });

  it("refuses a schema posture that bypasses clone-test-schema.mjs — faithful:false must still fire", () => {
    const p = projectAdapter((s) => s.replace("| Posture | **file** — a throwaway `.fdb` |", "| Posture | **schema** — a hand-rolled copy |"));
    expect(problems(p)).toContain("posture:unguarded-clone");
  });

  it("refuses a disposable target with no faithfulness check", () => {
    const p = projectAdapter((s) => s.replace(/^\| Faithfulness \|[^\n]*\n/m, ""));
    expect(problems(p)).toContain("posture:no-faithfulness");
  });

  it("refuses a disposable target that never says how isolation is proven", () => {
    const p = projectAdapter((s) => s.replace(/^\| Prove isolation \|[^\n]*\n/m, ""));
    expect(problems(p)).toContain("posture:incomplete");
  });

  it("reads the LABELLED Posture line, not an introductory sentence that mentions posture", () => {
    // Cold run, 2026-10-02: a sentence above the table naming the posture concept was read as the
    // answer and refused a correct adapter.
    const p = projectAdapter((s) =>
      s.replace("| Question | Answer |", "This posture keeps every write inside one directory.\n\n| Question | Answer |"),
    );
    expect(problems(p).filter((x) => x.startsWith("posture:"))).toEqual([]);
  });

  it("does not read the word 'none' in ordinary prose as a declined driver — but does read 'Driver: none'", () => {
    const prose = projectAdapter((s) =>
      s.replace(/tauri-driver exposes[^\n]*/, "tauri-driver needs none of the web tooling; `npx wdio run wdio.conf.ts` boots the binary and captures a screenshot per screen."),
    );
    expect(problems(prose).filter((x) => x.startsWith("ui:"))).toEqual([]);
    const declined = projectAdapter((s) =>
      s.replace(/tauri-driver exposes[^\n]*/, "UI driver: none. The screens are reviewed by the team at each release, which has been enough so far."),
    );
    expect(problems(declined)).toContain("ui:declined-driver");
  });

  it("refuses a generated adapter that drops its security cases (FR-014)", () => {
    const p = projectAdapter((s) => s.replace(/## Security test cases[\s\S]*$/, ""));
    expect(problems(p)).toContain("security:missing");
  });

  it("refuses a signal that is not a valid regular expression", () => {
    expect(parseInventorySignals("**Inventory signal:** `src/**/*.rs` :: `([`").errors).toHaveLength(1);
  });

  it("refuses a project adapter signal that names no kind, or leaves <kind> unreplaced", () => {
    const unkinded = projectAdapter((s) => s.replace("**Inventory signal (command):**", "**Inventory signal:**"));
    expect(problems(unkinded)).toContain("signal:no-kind");
    const unreplaced = projectAdapter((s) => s.replace("**Inventory signal (command):**", "**Inventory signal (<kind>):**"));
    expect(problems(unreplaced)).toContain("signal:unparseable");
  });

  it("accepts the honest 'not set up yet' phrasings GENERATE.md asks for", () => {
    for (const honest of [
      "No automated UI tests exist yet; `npx wdio run wdio.conf.ts` with tauri-driver is what this stack uses, and it boots the binary per screen.",
      "The driver: none installed yet — `npx wdio run wdio.conf.ts` with tauri-driver boots the binary and captures a screenshot per screen.",
    ]) {
      const p = projectAdapter((s) => s.replace(/tauri-driver exposes[^\n]*/, honest));
      expect(problems(p).filter((x) => x.startsWith("ui:")), honest).toEqual([]);
    }
  });

  it("accepts this stack's own runners as executable UI drivers, and still refuses a declined one", () => {
    for (const driver of ["`cargo test --test ui` drives", "`npm run e2e` drives", "`flutter test integration_test` drives"]) {
      const p = projectAdapter((s) => s.replace(/tauri-driver exposes[^\n]*/, `${driver} the app and captures a screenshot per screen, booting the real binary each time.`));
      expect(problems(p).filter((x) => x.startsWith("ui:"))).toEqual([]);
    }
    // Long enough to clear the 80-character floor, so the declined-driver rule is what refuses it.
    const declined = projectAdapter((s) =>
      s.replace(/tauri-driver exposes[^\n]*/, "There is no automated driver on this stack; a human walkthrough covers every screen before each release."),
    );
    expect(problems(declined)).toContain("ui:declined-driver");
  });

  it("does not apply project rules to wxKanban's shipped adapters (SC-6)", () => {
    for (const a of listAdapters(REPO)) {
      expect(validateAdapter(a.path).valid, a.name).toBe(true);
    }
  });

  it("README.md and GENERATE.md are docs, never resolved or validated as adapters", () => {
    expect(isAdapterDoc("GENERATE.md")).toBe(true);
    expect(isAdapterDoc("README.md")).toBe(true);
    expect(isAdapterDoc("dotnet-wpf.md")).toBe(false);
    expect(listAdapters(REPO).map((a) => a.name).sort()).toEqual(["dotnet-wpf", "wxkanban-express"]);
  });
});

describe("FR-006 — every layer generates on a miss, through the one procedure", () => {
  const LAYERS = [
    "_wxAI/skills/wxCreateTestPlan/SKILL.md",
    "_wxAI/commands/wxCreateTestPlan.md",
    ".claude/commands/wxCreateTestPlan.md",
    "_wxAI/skills/wxPreTest/SKILL.md",
    "_wxAI/commands/implement.md",
    ".claude/commands/implement.md",
  ];

  for (const rel of LAYERS) {
    it(`${rel} points a no-match at GENERATE.md`, () => {
      expect(readFileSync(join(REPO, rel), "utf-8")).toContain("_wxAI/adapters/GENERATE.md");
    });
  }

  it("wxCreateTestPlan runs the inventory guard on every inventory", () => {
    expect(readFileSync(join(REPO, "_wxAI/skills/wxCreateTestPlan/SKILL.md"), "utf-8")).toContain("_wxAI/adapters/inventory-guard.mjs");
  });

  it("SC-2: Phase 5b carries none of wxKanban's own seeding idiom", () => {
    const impl = readFileSync(join(REPO, "_wxAI/commands/implement.md"), "utf-8");
    const phase5b = /### Phase 5b[\s\S]*?(?=### Phase 6)/.exec(impl)?.[0] ?? "";
    expect(phase5b.length).toBeGreaterThan(0);
    for (const idiom of ["tests/seeds", "onConflictDoNothing", "runSeed", "wxktest_"]) {
      expect(phase5b, idiom).not.toContain(idiom);
    }
  });
});
