// SCOPE-138 / T011 — "Learn wxKanban with your AI" (FR-010, SC-8).
//
// The app serves the lessons the kit generator wrote: exactly start-here.md and the lessons its
// manifest lists — never the manifest itself, a stray file in the folder, or a path a tampered
// manifest names. The routes are GET-only and signed-in; the Help card's strings exist everywhere.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { buildLessons, setEnvironments } from "../../_wxAI/skills/wxHelpGenerate/scripts/teach.mjs";
import { bundleInfo, buildBundle } from "../../src/server/services/TeachingBundleService";
import { enUS } from "../../src/client/i18n/locales/en-US";
import { frFR } from "../../src/client/i18n/locales/fr-FR";
import { ptBR } from "../../src/client/i18n/locales/pt-BR";
import { itIT } from "../../src/client/i18n/locales/it-IT";
import { deDE } from "../../src/client/i18n/locales/de-DE";
import { esES } from "../../src/client/i18n/locales/es-ES";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

vi.mock("~/server/middleware/auth.js", () => ({ authenticateToken: vi.fn(), requireAuth: vi.fn() }));
vi.mock("~/server/lib/logger.js", () => ({ createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }) }));

let root = "";
let out = "";

// [SCOPE 138 / T011] BEGIN — Test helper: read a stored zip back
/** Read a stored zip back: name → content, checking the structure as any unzip would. */
function unzip(buf: Buffer): Record<string, string> {
  const eocd = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const files: Record<string, string> = {};
  let at = buf.readUInt32LE(eocd + 16);
  for (let i = 0; i < buf.readUInt16LE(eocd + 10); i++) {
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.subarray(at + 46, at + 46 + nameLen).toString("utf8");
    const dataAt = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    files[name] = buf.subarray(dataAt, dataAt + size).toString("utf8");
    at += 46 + nameLen + buf.readUInt16LE(at + 30) + buf.readUInt16LE(at + 32);
  }
  return files;
}
// [SCOPE 138 / T011] END

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "teach-bundle-"));
  const ws = join(root, "docs-workspace");
  out = join(root, "docs", "teaching-skills");
  mkdirSync(ws, { recursive: true });
  writeFileSync(join(ws, "config.json"), JSON.stringify({ product_name: "wxKanban" }));
  writeFileSync(join(ws, "inventory.json"), JSON.stringify({
    screens: [{ id: "board", title: "Board", elements: [{ label: "New Task", type: "button" }, { label: "Save", type: "button" }] }],
    processes: [
      { id: "add-a-task", title: "Add a task", steps: [{ screen: "board", element: "New Task" }, { screen: "board", element: "Save" }] },
      { id: "move-a-task", title: "Move a task", steps: [{ screen: "board", element: "New Task" }] },
    ],
  }));
  setEnvironments(ws, { uat: ["https://uat.wxkanban.example"], production: ["https://wxkanban.example"] });
  buildLessons({ workspace: ws, outDir: out, appVersion: "1.5.340", root });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("SCOPE-138 T011 — the teaching bundle the app serves (FR-010)", () => {
  it("is unavailable until the generator has written lessons", () => {
    expect(bundleInfo(join(root, "nowhere"))).toEqual({ available: false, product: null, appVersion: null, generatedAt: null, lessons: [] });
    expect(buildBundle(join(root, "nowhere"))).toBeNull();
  });

  it("describes what the generator wrote: version and lessons", () => {
    const info = bundleInfo(out);
    expect(info).toMatchObject({ available: true, product: "wxKanban", appVersion: "1.5.340" });
    expect(info.lessons).toEqual([{ id: "add-a-task", title: "Add a task", version: 1 }, { id: "move-a-task", title: "Move a task", version: 1 }]);
  });

  it("SC-8: the download is exactly the release's lessons and start-here, byte for byte", () => {
    const bundle = buildBundle(out);
    expect(bundle?.fileName).toBe("wxkanban-teaching-skills-1.5.340.zip");
    const files = unzip(bundle!.data);
    expect(Object.keys(files).sort()).toEqual(["add-a-task.md", "move-a-task.md", "start-here.md"]);
    for (const f of Object.keys(files)) expect(files[f]).toBe(readFileSync(join(out, f), "utf8"));
  });

  it("never serves the manifest, a stray file, or a path a tampered manifest names", () => {
    writeFileSync(join(out, "notes.md"), "internal notes");
    writeFileSync(join(root, "docs", "secret.md"), "not a lesson");
    const manifest = JSON.parse(readFileSync(join(out, ".lessons.json"), "utf8"));
    manifest.lessons["../secret"] = { title: "Escape", version: 1 };
    manifest.lessons["missing-lesson"] = { title: "Gone", version: 1 };
    writeFileSync(join(out, ".lessons.json"), JSON.stringify(manifest));
    const names = Object.keys(unzip(buildBundle(out)!.data)).sort();
    expect(names).toEqual(["add-a-task.md", "move-a-task.md", "start-here.md"]);
  });

  it("the routes answer GET only", async () => {
    const { default: router } = await import("../../src/server/routes/teachingSkills");
    const stack = (router as unknown as { stack: Array<{ route?: { path: string; methods: Record<string, boolean> } }> }).stack;
    expect(stack.filter((l) => l.route).map((l) => ({ path: l.route!.path, methods: Object.keys(l.route!.methods) }))).toEqual([
      { path: "/", methods: ["get"] },
      { path: "/bundle", methods: ["get"] },
    ]);
  });

  it.each([["en-US", enUS], ["fr-FR", frFR], ["pt-BR", ptBR], ["it-IT", itIT], ["de-DE", deDE], ["es-ES", esES]])(
    "%s has every Help card string",
    (_name, bundle) => {
      const hp = (bundle as unknown as { helpPage: Record<string, string> }).helpPage;
      for (const k of ["teachTitle", "teachHowTo", "teachDownload", "teachVersion", "teachError"]) expect(typeof hp[k], k).toBe("string");
      expect(hp.teachVersion).toContain("{{version}}");
      expect(hp.teachVersion).toContain("{{count}}");
    },
  );
});

describe("SCOPE-138 T013 — Cockpit Help names --teach (FR-012)", () => {
  it("the command stub the Cockpit reads describes --teach and --teach --stale, in both copies", () => {
    const a = readFileSync("_wxAI/commands/wxHelpGenerate.md", "utf8");
    expect(readFileSync(".claude/commands/wxHelpGenerate.md", "utf8")).toBe(a);
    const description = /^description:\s*(.+)$/m.exec(a)?.[1] ?? "";
    expect(description).toMatch(/--teach/);
    expect(description).toMatch(/--teach --stale/);
    expect(a).toMatch(/## --teach — Teaching Skills/);
    expect(a).toMatch(/Do you wish to save your\s+changes\?/);
  });
});
