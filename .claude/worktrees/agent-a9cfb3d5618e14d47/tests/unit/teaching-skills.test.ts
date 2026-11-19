// SCOPE-138 — Teaching Skills: the --teach writer (T002–T006, T008, T010, T012).
//
// A fixture app with two processes, one of them crossing two screens and ending in a save, is
// written the way the walk records it. The writer must produce exactly one lesson per process
// (SC-1), mark every Committing Step with the save question (SC-2), refuse to write anything that
// carries personal data or a secret (SC-3), treat an unknown address as Production (SC-6), keep
// lessons AI-agnostic (FR-002), version them only when the teaching changes (FR-005/FR-006), and
// bundle only checked lessons (FR-009).
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { spawnSync } from "node:child_process";
import { crc32 as zlibCrc32 } from "node:zlib";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildLessons,
  checkAddress,
  classifyAddress,
  commitKind,
  coverage,
  dataFindings,
  generationEvent,
  logGeneration,
  readManifest,
  setEnvironments,
} from "../../_wxAI/skills/wxHelpGenerate/scripts/teach.mjs";
import { CaptureEventInputSchema } from "../../mcp-server/src/utils/schemas";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
let ws = "";
let out = "";

const inventory = () => ({
  screens: [
    {
      id: "invoice-list", title: "Invoices", url: "/invoices",
      elements: [
        { label: "New Invoice", type: "button", behavior: "Opens a blank invoice form." },
        { label: "Delete", type: "button", behavior: "Deletes the selected invoice after a confirmation.", commits: "delete" },
      ],
    },
    {
      id: "invoice-edit", title: "Invoice", url: "/invoices/new",
      elements: [
        { label: "Customer", type: "select", behavior: "Lists the customers you can bill." },
        { label: "Amount", type: "field", behavior: "The amount to bill, before tax." },
        { label: "Save", type: "button", behavior: "Saves the invoice; its number appears at the top." },
      ],
    },
  ],
  processes: [
    {
      id: "create-invoice", title: "Create an invoice", goal: "Bill a customer for completed work",
      steps: [
        { screen: "invoice-list", element: "New Invoice", action: "click", expect: "A blank invoice form opens." },
        { screen: "invoice-edit", element: "Customer", action: "choose", example: "Acme Testing Co.", expect: "The customer's name appears." },
        { screen: "invoice-edit", element: "Amount", action: "type", example: "125.00" },
        { screen: "invoice-edit", element: "Save", action: "click", expect: "The invoice is saved and its number appears." },
      ],
    },
    {
      id: "delete-invoice", title: "Delete an invoice", goal: "Remove an invoice created by mistake",
      steps: [{ screen: "invoice-list", element: "Delete", action: "click", expect: "The invoice disappears from the list." }],
    },
  ],
});

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "teach-"));
  ws = join(root, "docs-workspace");
  out = join(root, "docs", "teaching-skills");
  mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, "config.json"), JSON.stringify({ product_name: "Acme Billing" }));
  writeFileSync(join(ws, "inventory.json"), JSON.stringify(inventory()));
  setEnvironments(ws, { uat: ["https://uat.acme.example"], production: ["https://app.acme.example"] });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const lesson = (id: string) => readFileSync(join(out, `${id}.md`), "utf8");

describe("SCOPE-138 T005 — the UAT / Production address lists (FR-004, SC-6)", () => {
  it("refuses an address carrying credentials or a token, and never echoes it", () => {
    expect(checkAddress("https://user:pw@app.acme.example").ok).toBe(false);
    const tok = checkAddress("https://app.acme.example/?token=SUPERSECRETVALUE123");
    expect(tok).toMatchObject({ ok: false });
    expect(JSON.stringify(tok)).not.toContain("SUPERSECRETVALUE123");
    expect(checkAddress("https://app.acme.example/s/eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMifQ.abcdefghij").ok).toBe(false);
    expect(checkAddress("ftp://app.acme.example").ok).toBe(false);
    expect(checkAddress("https://app.acme.example/portal/?tab=1")).toEqual({ ok: true, address: "https://app.acme.example/portal" });
  });

  it("an address on neither list, or one that does not parse, is Production", () => {
    const envs = { uat: ["https://uat.acme.example"], production: ["https://app.acme.example"] };
    expect(classifyAddress("https://uat.acme.example/invoices", envs)).toBe("uat");
    expect(classifyAddress("https://app.acme.example/invoices", envs)).toBe("production");
    expect(classifyAddress("https://staging.acme.example/invoices", envs)).toBe("production");
    expect(classifyAddress("not a url", envs)).toBe("production");
  });

  it("stores the lists in config.json and refuses a list with no Production address or an overlap", () => {
    expect(JSON.parse(readFileSync(join(ws, "config.json"), "utf8")).environments).toEqual({
      uat: ["https://uat.acme.example"], production: ["https://app.acme.example"],
    });
    expect(() => setEnvironments(ws, { uat: ["https://a.example"], production: [] })).toThrow(/Production address/);
    expect(() => setEnvironments(ws, { uat: ["https://a.example"], production: ["https://a.example"] })).toThrow(/both lists/);
  });
});

describe("SCOPE-138 T004 — Committing Steps (FR-003, SC-2)", () => {
  it("the walk's own record wins; otherwise a button's leading verb decides; opening a form is not committing", () => {
    expect(commitKind({ label: "Delete", type: "button", commits: "delete" })).toBe("delete");
    expect(commitKind({ label: "Go", type: "button", commits: "send" })).toBe("send");
    expect(commitKind({ label: "Save draft", type: "button" })).toBe("save");
    expect(commitKind({ label: "Submit order", type: "button" })).toBe("submit");
    expect(commitKind({ label: "Send invite", type: "button" })).toBe("send");
    expect(commitKind({ label: "Remove", type: "button" })).toBe("delete");
    expect(commitKind({ label: "New Invoice", type: "button" })).toBeNull();
    expect(commitKind({ label: "Save", type: "button", commits: false })).toBeNull();
    expect(commitKind({ label: "Amount", type: "field" })).toBeNull();
  });

  it("every Committing Step carries the save question, and the environment check comes before the first one", () => {
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const text = lesson("create-invoice");
    expect(text).toMatch(/### Step 4 — Committing Step \(save\)/);
    expect(text).toMatch(/"Do you wish to save your changes\?"/);
    expect(text.indexOf("### Before the next step — check the environment")).toBeLessThan(text.indexOf("### Step 4"));
    expect(text.indexOf("### Before the next step")).toBeGreaterThan(text.indexOf("### Step 3"));
    expect(text).toMatch(/Treat \*\*unsure\*\* as Production/);
    expect(lesson("delete-invoice")).toMatch(/Committing Step \(delete\)/);
    expect(readManifest(out).lessons["create-invoice"].commits).toBe(1);
  });
});

describe("SCOPE-138 T002/T003/T006 — lessons (FR-001, FR-002, FR-005)", () => {
  it("SC-1: exactly one lesson per process, none missing, none extra", () => {
    const summary = buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    expect(summary.coverage).toEqual({ missing: [], extra: [] });
    expect(readdirSync(out).filter((f) => f.endsWith(".md")).sort()).toEqual(["create-invoice.md", "delete-invoice.md", "start-here.md"]);
    expect(coverage(inventory().processes, ["create-invoice"])).toEqual({ missing: ["delete-invoice"], extra: [] });
  });

  it("the header names the lesson version, the app version, the screens and the element ids", () => {
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const text = lesson("create-invoice");
    expect(text).toMatch(/^---\nlesson: create-invoice\n/);
    expect(text).toMatch(/lesson_version: 1\n/);
    expect(text).toMatch(/app_version: "2.4.0"\n/);
    expect(text).toMatch(/screens: \[invoice-list, invoice-edit\]/);
    expect(text).toMatch(/elements: \[invoice-list#new-invoice, invoice-edit#customer, invoice-edit#amount, invoice-edit#save\]/);
    expect(text).toMatch(/describes \*\*Acme Billing version 2\.4\.0\*\*.*stop and flag it rather than guess/);
  });

  it("FR-002: tutor and coach are described generically; no AI is named anywhere in the template", () => {
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const text = lesson("create-invoice") + readFileSync(join(out, "start-here.md"), "utf8");
    for (const brand of ["Claude", "ChatGPT", "OpenAI", "Anthropic", "Gemini", "Copilot", "MCP", "Chrome"]) expect(text).not.toContain(brand);
    expect(text).toMatch(/If you can see the learner's screen or browser, act as a coach/);
    expect(text).toMatch(/\*\*amateur\*\*.*\n.*\*\*junior\*\*.*\n.*\*\*senior\*\*/);
  });

  it("versions move only when the teaching changes; a stale regeneration says what changed", () => {
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.5.0" });
    expect(readManifest(out).lessons["create-invoice"].version).toBe(1); // a new app version alone is not a new lesson
    const inv = inventory();
    inv.screens[1].elements.push({ label: "Approve", type: "button", behavior: "Marks the invoice approved." });
    inv.processes[0].steps.splice(3, 0, { screen: "invoice-edit", element: "Approve", action: "click", expect: "The invoice shows Approved." });
    writeFileSync(join(ws, "inventory.json"), JSON.stringify(inv));
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.6.0", only: ["create-invoice"] });
    const text = lesson("create-invoice");
    expect(text).toMatch(/lesson_version: 2\n/);
    expect(text).toMatch(/## What changed since version 1\n\n- \*\*Added:\*\* click Approve on invoice-edit \(save\)/);
    expect(readManifest(out).lessons["delete-invoice"].version).toBe(1); // untouched
    // Rebuilding the same teaching later keeps version 2.
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.6.1" });
    expect(readManifest(out).lessons["create-invoice"].version).toBe(2);
  });

  it("refuses to write under _wxAI/, and asks for the address lists first", () => {
    expect(() => buildLessons({ workspace: ws, outDir: join(root, "_wxAI", "lessons"), appVersion: "1" })).toThrow(/never _wxAI/);
    writeFileSync(join(ws, "config.json"), JSON.stringify({ product_name: "Acme Billing" }));
    expect(() => buildLessons({ workspace: ws, outDir: out, appVersion: "1" })).toThrow(/UAT \/ Production addresses/);
  });
});

describe("SCOPE-138 T008 — the pre-write data check (FR-007, SC-3)", () => {
  it("fake personal data anywhere in a process stops the run before anything is written, naming lesson and pattern only", () => {
    const inv = inventory();
    inv.processes[0].steps[1].example = "jane.doe@realcustomer.com";
    inv.processes[0].steps[2].example = "4111 1111 1111 1111";
    inv.screens[1].elements[2].behavior = "Saves using key sk_live_ABCDEF1234567890XYZ";
    writeFileSync(join(ws, "inventory.json"), JSON.stringify(inv));
    let message = "";
    try {
      buildLessons({ workspace: ws, outDir: out, appVersion: "1" });
    } catch (e) {
      message = (e as Error).message;
    }
    expect(message).toMatch(/data check failed — nothing was written/);
    expect(message).toMatch(/create-invoice\.md: email address, API key, payment card number/);
    for (const secret of ["jane.doe@realcustomer.com", "4111", "sk_live_ABCDEF"]) expect(message).not.toContain(secret);
    expect(existsSync(out)).toBe(false);
  });

  it("each pattern is caught; made-up examples and the recorded addresses pass", () => {
    const cases: Array<[string, string]> = [
      ["mail me at a.b@c.org", "email address"],
      ["eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTYifQ.SflKxwRJSMeKKF2QT4", "JSON web token"],
      ["AKIAABCDEFGHIJKLMNOP", "API key"],
      ["ghp_abcdefghijklmnopqrstuvwxyz123456", "API key"],
      ["0123456789abcdef0123456789abcdef", "long secret-like string"],
      ["password: hunter22", "password or secret assignment"],
      ["123-45-6789", "US social security number"],
      ["call (555) 123-4567", "phone number"],
      ["GB82WEST12345698765432", "IBAN"],
      ["10.0.0.12", "IP address"],
    ];
    for (const [text, name] of cases) expect(dataFindings(text), text).toContain(name);
    expect(dataFindings("Acme Testing Co. · 125.00 · version 2.4.0 · 2026-10-17")).toEqual([]);
    expect(dataFindings("1234 5678 9012 3456")).not.toContain("payment card number"); // fails Luhn
    expect(dataFindings("https://10.1.2.3/uat", { allow: ["https://10.1.2.3/uat"] })).toEqual([]);
  });
});

describe("SCOPE-138 T010 — start-here.md and the bundle (FR-009)", () => {
  it("start-here lists every lesson, explains the save rule and asks the level", () => {
    buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const start = readFileSync(join(out, "start-here.md"), "utf8");
    expect(start).toMatch(/\[Create an invoice\]\(create-invoice\.md\) — version 1/);
    expect(start).toMatch(/\[Delete an invoice\]\(delete-invoice\.md\)/);
    expect(start).toMatch(/Do you wish to save your changes\?/);
    expect(start).toMatch(/\*\*amateur\*\*.*\*\*junior\*\*.*\*\*senior\*\*/);
  });

  it("the zip is valid and holds only start-here and the checked lessons — no inventory, manifest or config", () => {
    const summary = buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    // Read it the way any unzip tool does: end record → central directory → each local entry,
    // checking signatures and each entry's CRC with Node's own zlib.crc32 (not the writer's).
    const buf = readFileSync(summary.bundle);
    const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
    expect(eocd).toBeGreaterThan(0);
    const count = buf.readUInt16LE(eocd + 10);
    let at = buf.readUInt32LE(eocd + 16);
    const files: Record<string, string> = {};
    for (let i = 0; i < count; i++) {
      expect(buf.readUInt32LE(at)).toBe(0x02014b50);
      const crc = buf.readUInt32LE(at + 16);
      const size = buf.readUInt32LE(at + 20);
      const nameLen = buf.readUInt16LE(at + 28);
      const local = buf.readUInt32LE(at + 42);
      const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
      expect(buf.readUInt32LE(local)).toBe(0x04034b50);
      const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(dataAt, dataAt + size);
      expect(zlibCrc32(data), name).toBe(crc);
      files[name] = data.toString("utf8");
      at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
    }
    expect(Object.keys(files).sort()).toEqual(["create-invoice.md", "delete-invoice.md", "start-here.md"]);
    expect(files["create-invoice.md"]).toBe(lesson("create-invoice"));
    // Where a system unzip is available, it agrees.
    const unzip = spawnSync("unzip", ["-tq", summary.bundle], { encoding: "utf8" });
    if (unzip.status !== null && !unzip.error) expect(unzip.status, unzip.stdout + unzip.stderr).toBe(0);
  });
});

describe("SCOPE-138 T012 — the generation log (FR-011)", () => {
  it("one record per run, accepted by capture_event, with no learner identifiers", () => {
    const summary = buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const event = generationEvent({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a", actor: "dev", appVersion: "2.4.0", summary, stale: [], source: "walk" });
    expect(CaptureEventInputSchema.safeParse(event).success).toBe(true);
    expect(event.metadata).toMatchObject({ appVersion: "2.4.0", source: "walk", totalLessons: 2, stale: [] });
    expect(Object.keys(event.metadata).sort()).toEqual(["appVersion", "lessonsWritten", "occurredAt", "screens", "source", "stale", "totalLessons"]);
  });

  it("is sent through the kit's queue: offline, it waits; no project id, it says so", async () => {
    const summary = buildLessons({ workspace: ws, outDir: out, appVersion: "2.4.0" });
    const skipped = await logGeneration({ root, appVersion: "2.4.0", summary, source: "walk", actor: "dev" });
    expect(skipped.skipped).toMatch(/no wxKanban project id/);
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a" }));
    const queued = await logGeneration({ root, appVersion: "2.4.0", summary, source: "walk", actor: "dev", send: () => Promise.reject(new Error("offline")) });
    expect(queued).toMatchObject({ sent: false, queued: true });
    const line = JSON.parse(readFileSync(join(root, ".wxai", "impact-queue.jsonl"), "utf8").trim());
    expect(line.type).toBe("teaching_skill_generated");
  });
});

describe("SCOPE-138 — the two wxHelpGenerate copies stay identical", () => {
  it("every file in .claude/skills/wxHelpGenerate matches _wxAI/skills/wxHelpGenerate byte for byte", () => {
    const a = ".claude/skills/wxHelpGenerate";
    const b = "_wxAI/skills/wxHelpGenerate";
    const walk = (dir: string, base = dir): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
        e.isDirectory() ? walk(join(dir, e.name), base) : [join(dir, e.name).slice(base.length + 1).split("\\").join("/")]);
    const files = walk(a).sort();
    expect(walk(b).sort()).toEqual(files);
    for (const f of files) expect(readFileSync(join(a, f)).equals(readFileSync(join(b, f))), f).toBe(true);
  });
});

describe("SCOPE-138 T009 — desktop and mobile lessons from definitions (FR-008, SC-7)", () => {
  it("an inventory recorded from definitions labels every lesson and always asks the learner", () => {
    writeFileSync(join(ws, "inventory.json"), JSON.stringify({ ...inventory(), source: "definitions" }));
    const summary = buildLessons({ workspace: ws, outDir: out, appVersion: "8.0" });
    expect(summary.source).toBe("definitions");
    for (const id of ["create-invoice", "delete-invoice"]) {
      const text = lesson(id);
      expect(text).toMatch(/source: definitions\n/);
      expect(text).toMatch(/\*\*From definitions, not tested by clicking\.\*\*/);
      expect(text).toMatch(/always ask the learner which environment they are in before the first Committing Step/);
      expect(text).toMatch(/Ask the learner: "Are you working in the UAT \(practice\) system or in Production \(live\)\?" Treat \*\*unsure\*\* as Production/);
      expect(text).not.toMatch(/compare it with the lists above/);
    }
    expect(readFileSync(join(out, "start-here.md"), "utf8")).toMatch(/from definitions, not tested by clicking/);
  });

  it("a walked inventory stays a walk; an unknown --source is refused", () => {
    expect(buildLessons({ workspace: ws, outDir: out, appVersion: "8.0" }).source).toBe("walk");
    expect(lesson("create-invoice")).not.toMatch(/From definitions/);
    expect(() => buildLessons({ workspace: ws, outDir: out, appVersion: "8.0", source: "guess" })).toThrow(/walk or definitions/);
  });
});
