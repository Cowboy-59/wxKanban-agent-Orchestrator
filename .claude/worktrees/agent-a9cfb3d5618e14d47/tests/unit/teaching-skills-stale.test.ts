// SCOPE-138 / T007 — precise staleness through SPEC-137 Change Impact (FR-006, SC-5).
//
// A real git project and the real engine: the invoice edit screen renders through
// InvoiceEdit.tsx, which imports money.ts; the invoice list renders through InvoiceList.tsx.
// Changing money.ts must flag exactly the lesson that teaches the edit screen (0 extra, 0 missed),
// and `build --stale` must regenerate only that lesson, with a "What changed" section.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildLessons,
  markStale,
  readManifest,
  readStale,
  clearStale,
  setEnvironments,
  staleLessons,
} from "../../_wxAI/skills/wxHelpGenerate/scripts/teach.mjs";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
const put = (rel: string, body: string) => {
  mkdirSync(join(root, rel, ".."), { recursive: true });
  writeFileSync(join(root, rel), body);
};
const git = (...a: string[]) => execFileSync("git", ["-c", "user.email=t@t", "-c", "user.name=t", ...a], { cwd: root, stdio: "ignore", windowsHide: true });

const inventory = () => ({
  screens: [
    { id: "invoice-list", title: "Invoices", files: ["src/client/InvoiceList.tsx"], elements: [
      { label: "New Invoice", type: "button", behavior: "Opens a blank invoice." },
      { label: "Delete", type: "button", behavior: "Deletes the invoice.", commits: "delete" } ] },
    { id: "invoice-edit", title: "Invoice", files: ["src/client/InvoiceEdit.tsx"], elements: [
      { label: "Amount", type: "field", behavior: "Amount to bill." },
      { label: "Save", type: "button", behavior: "Saves the invoice." } ] },
    { id: "reports", title: "Reports", elements: [{ label: "Run", type: "button", behavior: "Runs a report." }] },
  ],
  processes: [
    { id: "create-invoice", title: "Create an invoice", steps: [
      { screen: "invoice-list", element: "New Invoice", action: "click" },
      { screen: "invoice-edit", element: "Amount", action: "type", example: "125.00" },
      { screen: "invoice-edit", element: "Save", action: "click" } ] },
    { id: "delete-invoice", title: "Delete an invoice", steps: [{ screen: "invoice-list", element: "Delete", action: "click" }] },
    { id: "run-report", title: "Run a report", steps: [{ screen: "reports", element: "Run", action: "click" }] },
  ],
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "teach-stale-"));
  put("src/lib/money.ts", "export const fmt = (n: number) => n.toFixed(2);\n");
  put("src/client/InvoiceEdit.tsx", "import { fmt } from '../lib/money';\nexport const InvoiceEdit = () => fmt(1);\n");
  put("src/client/InvoiceList.tsx", "export const InvoiceList = () => null;\n");
  put("docs-workspace/config.json", JSON.stringify({ product_name: "Acme Billing" }));
  put("docs-workspace/inventory.json", JSON.stringify(inventory()));
  setEnvironments(join(root, "docs-workspace"), { uat: ["https://uat.acme.example"], production: ["https://app.acme.example"] });
  git("init", "-q");
  git("add", "-A");
  git("commit", "-qm", "app");
  buildLessons({ workspace: join(root, "docs-workspace"), outDir: join(root, "docs/teaching-skills"), appVersion: "1.0", root });
  git("add", "-A");
  git("commit", "-qm", "lessons");
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const out = () => join(root, "docs/teaching-skills");

describe("SCOPE-138 T007 — only the lessons a change reaches (FR-006, SC-5)", () => {
  it("records each lesson's commit and the screen → files map", () => {
    const m = readManifest(out());
    expect(m.lessons["create-invoice"].commit).toMatch(/^[0-9a-f]{40}$/);
    expect(m.screenFiles).toEqual({ "invoice-list": ["src/client/InvoiceList.tsx"], "invoice-edit": ["src/client/InvoiceEdit.tsx"] });
  });

  it("a change to a file one screen imports flags exactly that screen's lesson — 0 extra, 0 missed", async () => {
    put("src/lib/money.ts", "export const fmt = (n: number) => n.toFixed(3);\n");
    git("commit", "-qam", "money change");
    const r = await markStale({ root, outDir: out() });
    expect(r.flagged.map((f) => f.lesson)).toEqual(["create-invoice"]);
    expect(r.flagged[0].because).toEqual(["src/client/InvoiceEdit.tsx"]);
    expect(r.unmapped).toEqual(["reports"]); // no files recorded: reported, not assumed current
    expect(readStale(root).flagged.map((f: { lesson: string }) => f.lesson)).toEqual(["create-invoice"]);
  });

  it("a change to a file no screen reaches flags nothing", async () => {
    put("src/server/unrelated.ts", "export const x = 1;\n");
    git("add", "-A");
    git("commit", "-qm", "unrelated");
    expect((await markStale({ root, outDir: out() })).flagged).toEqual([]);
  });

  it("an uncommitted change counts too", async () => {
    put("src/client/InvoiceList.tsx", "export const InvoiceList = () => 'list';\n");
    expect((await markStale({ root, outDir: out() })).flagged.map((f) => f.lesson).sort()).toEqual(["create-invoice", "delete-invoice"]);
  });

  it("--stale regenerates only the flagged lesson, bumps it, says what changed, and clears its flag", async () => {
    put("src/lib/money.ts", "export const fmt = (n: number) => n.toFixed(3);\n");
    git("commit", "-qam", "money change");
    await markStale({ root, outDir: out() });
    // The re-walk of the flagged screen finds a new step.
    const inv = inventory();
    inv.screens[1].elements.push({ label: "Approve", type: "button", behavior: "Marks it approved." });
    inv.processes[0].steps.splice(2, 0, { screen: "invoice-edit", element: "Approve", action: "click" });
    put("docs-workspace/inventory.json", JSON.stringify(inv));
    const before = readFileSync(join(out(), "delete-invoice.md"), "utf8");
    const only = readStale(root).flagged.map((f: { lesson: string }) => f.lesson);
    buildLessons({ workspace: join(root, "docs-workspace"), outDir: out(), appVersion: "1.1", only, root });
    clearStale(root, only);
    const text = readFileSync(join(out(), "create-invoice.md"), "utf8");
    expect(text).toMatch(/lesson_version: 2\n/);
    expect(text).toMatch(/## What changed since version 1\n\n- \*\*Added:\*\* click Approve on invoice-edit \(save\)/);
    expect(readFileSync(join(out(), "delete-invoice.md"), "utf8")).toBe(before);
    expect(readStale(root).flagged).toEqual([]);
  });

  it("a change too broad to list flags every mapped lesson rather than guessing", () => {
    const manifest = readManifest(out());
    const r = staleLessons({ manifest, reachByCommit: () => null });
    expect(r.flagged.map((f) => f.lesson).sort()).toEqual(["create-invoice", "delete-invoice"]);
    expect(r.flagged[0].because).toEqual(["(a change too broad to list)"]);
  });
});
