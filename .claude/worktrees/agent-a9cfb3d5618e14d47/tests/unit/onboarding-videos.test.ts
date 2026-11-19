// SCOPE-139 — Onboarding Videos (SC-1..SC-9 on fixtures).
//
// Nothing here touches wxKanban's app or database. The replay test records a real browser against
// a local fixture app; narration and rendering are stubbed (the real HyperFrames render was proven
// live on a fixture, recorded in specs/139-onboarding-videos/verification.md).
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  recordingGuard, webOnlyCheck, attestationStatus, setAttestation, preflight, lengthCheck, presenterOptions,
  staleVideos, compositionHtml, stepNarration, speakable, videoEvent, ensureVideosIgnored, recordVideos,
  ATTESTATION_QUESTION, PINNED_HYPERFRAMES, readVideos, appTypes,
} from "../../_wxAI/skills/wxHelpGenerate/scripts/video.mjs";
import { onboardingVideoMetadataIssues, ProjectEventTypeSchema } from "../../mcp-server/src/utils/schemas";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

const ENV = { uat: ["https://uat.example.test"], production: ["https://app.example.test"] };
let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "videos-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe("SC-2, SC-9 — where recording may happen (T002, T011)", () => {
  it("records only on a UAT address; Production and unlisted are refused with the classification and how to add a UAT address", () => {
    expect(recordingGuard("https://uat.example.test/app", ENV)).toEqual({ ok: true, classification: "uat" });
    const prod = recordingGuard("https://app.example.test/x", ENV);
    expect(prod).toMatchObject({ ok: false, classification: "production" });
    expect(prod.reason).toMatch(/is on the Production list.*UAT only.*teach\.mjs env --uat/);
    const other = recordingGuard("https://elsewhere.example.test", ENV);
    expect(other).toMatchObject({ ok: false, classification: "unlisted" });
    expect(other.reason).toMatch(/on neither list, so it is treated as Production/);
    expect(recordingGuard(null, ENV).ok).toBe(false);
    expect(recordingGuard("https://uat.example.test", {}).ok).toBe(false);
  });
  it("covers web apps only: a desktop or mobile app records nothing and says why", () => {
    expect(webOnlyCheck(["desktop"])).toMatchObject({ ok: false, reason: expect.stringMatching(/web apps only.*Nothing was recorded/) });
    expect(webOnlyCheck(["mobile", "desktop"]).ok).toBe(false);
    expect(webOnlyCheck(["web", "desktop"])).toMatchObject({ ok: true, note: expect.stringMatching(/desktop video is reserved/) });
    writeFileSync(join(root, "stack.md"), "# Stack\n\n**Application types:** Web, Mobile\n");
    expect(appTypes(root)).toEqual(["web", "mobile"]);
  });
});

describe("SC-3 — the demo-data attestation (T003)", () => {
  it("nothing is recorded without a yes; a new UAT address is asked again; a seeded demo company replaces the question", () => {
    const ws = join(root, "docs-workspace");
    expect(attestationStatus({}, "https://uat.example.test").ok).toBe(false);
    setAttestation(ws, "https://uat.example.test/app", "no", "dev");
    let cfg = JSON.parse(readFileSync(join(ws, "config.json"), "utf8"));
    expect(attestationStatus(cfg, "https://uat.example.test")).toMatchObject({ ok: false, kind: "no" });
    setAttestation(ws, "https://uat.example.test", "yes", "dev");
    cfg = JSON.parse(readFileSync(join(ws, "config.json"), "utf8"));
    expect(attestationStatus(cfg, "https://uat.example.test/other/page")).toMatchObject({ ok: true, kind: "attested" });
    expect(attestationStatus(cfg, "https://uat2.example.test")).toMatchObject({ ok: false, kind: "missing" });
    expect(attestationStatus({ video: { demoSeed: { command: ["node", "seed.mjs"] } } }, "https://x")).toMatchObject({ ok: true, kind: "seeded" });
    const log = readFileSync(join(ws, "video-log.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(log.map((l) => l.answer)).toEqual(["no", "yes"]);
    expect(log[0].question).toBe(ATTESTATION_QUESTION);
    expect(() => setAttestation(ws, "https://uat.example.test", "maybe", "dev")).toThrow();
  });
});

describe("SC-8 — preflight (T009)", () => {
  it("stops and names Node 22+, FFmpeg and Playwright when missing", () => {
    const none = preflight({ root, nodeVersion: "20.11.0", which: () => ({ status: 1 }), chromium: null });
    expect(none.ok).toBe(false);
    expect(none.missing.join("\n")).toMatch(/Node\.js 22 or newer \(found 20\.11\.0\)/);
    expect(none.missing.join("\n")).toMatch(/FFmpeg/);
    expect(none.missing.join("\n")).toMatch(/Playwright/);
    expect(preflight({ root, nodeVersion: "22.3.0", which: () => ({ status: 0 }), chromium: {} }).ok).toBe(true);
    expect(PINNED_HYPERFRAMES).toMatch(/^\d+\.\d+\.\d+$/);
  });
});

describe("SC-5, T007 — length and presenter", () => {
  it("flags a long process for splitting and never speeds it up", () => {
    expect(lengthCheck(300)).toMatchObject({ flagged: true, note: expect.stringMatching(/split this process.*not sped up/) });
    expect(lengthCheck(120).flagged).toBe(false);
    expect(lengthCheck(200, 240).flagged).toBe(false);
  });
  it("uses a presenter clip only with a recorded consent attestation; never generates a likeness", () => {
    writeFileSync(join(root, "intro.mp4"), "x");
    const without = presenterOptions({ video: { presenterClip: { file: "intro.mp4" } } }, root);
    expect(without.presenter).toBeNull();
    expect(without.problems[0]).toMatch(/no consent attestation/);
    const withConsent = presenterOptions({ video: { presenterClip: { file: "intro.mp4", durationS: 5, consent: { personConsented: true, attestedBy: "HR", attestedAt: "2026-10-01" } } } }, root);
    expect(withConsent.presenter).toMatchObject({ durationS: 5 });
    expect(presenterOptions({}, root)).toMatchObject({ presenter: null, mascot: null, voice: "am_adam" });
    const src = readFileSync("_wxAI/skills/wxHelpGenerate/scripts/video.mjs", "utf8");
    expect(src).not.toMatch(/heygen\.com\/v\d|avatar|api\.d-id|synthesia/i);
  });
});

describe("SC-6 — staleness (T008)", () => {
  it("re-records only videos whose lesson moved, was flagged by Change Impact, or has no video", () => {
    const lessons = { a: { version: 2 }, b: { version: 1 }, c: { version: 1 }, d: { version: 1 } };
    const videos = { a: { lessonVersion: 1 }, b: { lessonVersion: 1 }, c: { lessonVersion: 1 } };
    expect(staleVideos({ lessons, videos, flagged: [{ lesson: "c" }] })).toEqual([
      { id: "a", reason: "its lesson moved from version 1 to 2" },
      { id: "c", reason: "a change reached its screens (Change Impact)" },
      { id: "d", reason: "no video yet" },
    ]);
  });
});

describe("SC-4 — the composition (T005)", () => {
  const timeline = { durationMs: 9000, steps: [
    { index: 0, start: 0, end: 4000, click: { t: 2500, x: 100, y: 200, box: { x: 80, y: 190, w: 40, h: 20 } } },
    { index: 1, start: 4000, end: 9000, click: { t: 6200, x: 300, y: 400, box: { x: 280, y: 390, w: 40, h: 20 } } },
  ] };
  const narrations = [{ text: "Click New invoice.", file: "nar-0.wav", durationS: 1.4 }, { text: "In Customer, type Acme.", file: "nar-1.wav", durationS: 1.8 }];
  it("puts the cursor on every click, a caption and narration on every step, chapters and an end card naming the lesson", () => {
    const { html, durationS } = compositionHtml({ lesson: { id: "create-invoice", title: "Create an invoice", version: 3 }, product: "Demo", timeline, narrations });
    expect((html.match(/tl\.to\("#cursor"/g) ?? []).length).toBe(2);
    expect((html.match(/class="clip caption"/g) ?? []).length).toBe(2);
    expect((html.match(/<audio id="nar-/g) ?? []).length).toBe(2);
    expect(html).toMatch(/Step 1 of 2.*Click New invoice\./s);
    expect(html).toMatch(/Lesson create-invoice · version 3/);
    expect(html).toMatch(/data-composition-id="main"[^>]*data-duration="16"/);
    expect(html).toMatch(/immediateRender: false/);
    expect(html).toMatch(/<video id="footage" class="clip" src="footage\.webm" data-start="3"/);
    expect(durationS).toBe(16);
  });
  it("narration is the lesson's own step text, safe to pass through a shell", () => {
    expect(stepNarration({}, { element: "Customer", action: "type", example: "Acme Demo" }, { label: "Customer" })).toBe("In Customer, type Acme Demo.");
    expect(stepNarration({}, { element: "Save", action: "click", expect: "The invoice is saved." }, null)).toBe("Click Save. The invoice is saved.");
    expect(speakable('Say "hi" & <go> 100%')).toBe("Say 'hi' go 100");
  });
});

describe("T012 — delivery and the generation log", () => {
  it("the log record passes the MCP schema, for a run and for a refusal; footage is never part of it", () => {
    expect(ProjectEventTypeSchema.safeParse("onboarding_video_generated").success).toBe(true);
    const ok = videoEvent({ projectId: "p", actor: "dev", appVersion: "2.0.0", environment: "uat", attestation: "attested-yes", pin: PINNED_HYPERFRAMES, videos: [{ lessonId: "a", lessonVersion: 1, durationS: 22, flaggedForSplit: false }] });
    expect(onboardingVideoMetadataIssues(ok.type, ok.metadata)).toEqual([]);
    const refused = videoEvent({ projectId: "p", actor: "dev", appVersion: "2.0.0", environment: "production", attestation: "none", pin: PINNED_HYPERFRAMES, videos: [], refused: "Recording refused" });
    expect(onboardingVideoMetadataIssues(refused.type, refused.metadata)).toEqual([]);
    expect(JSON.stringify(ok)).not.toMatch(/\.mp4|\.webm|footage/);
  });
  it("keeps the videos and the saved recording session out of git", () => {
    expect(ensureVideosIgnored(root)).toBe(true);
    const gi = readFileSync(join(root, ".gitignore"), "utf8");
    expect(gi).toMatch(/^\/docs\/onboarding-videos\/$/m);
    expect(gi).toMatch(/^\*\*\/\.video-session\.json$/m);
    expect(ensureVideosIgnored(root)).toBe(false);
  });
});

// [SCOPE 139 / T013] BEGIN — A fixture web app the replay test records
let server: Server;
let base = "";
const html = (body: string) => `<!doctype html><html><body style="font-family:Arial">${body}</body></html>`;
// [SCOPE 139 / T013] END

beforeAll(async () => {
  server = createServer((req, res) => {
    res.writeHead(200, { "Content-Type": "text/html" });
    const p = new URL(req.url ?? "/", "http://x").pathname;
    if (p === "/") return res.end(html('<h1>Invoices</h1><button onclick="location.href=\'/new\'">New invoice</button>'));
    if (p === "/new") return res.end(html('<h1>New invoice</h1><label>Customer <input id="c"></label><button onclick="location.href=\'/saved\'">Save</button>'));
    return res.end(html("<h1>Saved</h1>"));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

// [SCOPE 139 / T013] BEGIN — A fixture project: lessons, inventory and configuration
function project(over: Record<string, unknown> = {}) {
  const ws = join(root, "docs-workspace");
  const lessonsDir = join(root, "docs/teaching-skills");
  mkdirSync(ws, { recursive: true });
  mkdirSync(lessonsDir, { recursive: true });
  writeFileSync(join(root, "package.json"), JSON.stringify({ version: "2.0.0" }));
  writeFileSync(join(ws, "config.json"), JSON.stringify({ product_name: "Invoice Demo", environments: { uat: [base], production: ["https://prod.example.test"] }, video: { address: `${base}/`, attestations: { [base]: { answer: "yes", by: "dev", at: "2026-10-17" } }, pacing: { hoverMs: 50, afterClickMs: 50, typeDelayMs: 5, screenHoldMs: 50, stepGapMs: 10 } }, ...over }));
  writeFileSync(join(ws, "inventory.json"), JSON.stringify({
    screens: [
      { id: "list", title: "Invoices", url: "https://prod.example.test/", elements: [{ label: "New invoice", type: "button" }] },
      { id: "new", title: "New invoice", url: "https://prod.example.test/new", elements: [{ label: "Customer", type: "input" }, { label: "Save", type: "button", commits: "save" }] },
    ],
    processes: [
      { id: "create-an-invoice", title: "Create an invoice", steps: [{ screen: "list", element: "New invoice", action: "click" }, { screen: "new", element: "Customer", action: "type", example: "Acme" }, { screen: "new", element: "Save", action: "click", expect: "Saved." }] },
      { id: "open-invoices", title: "Open the invoices", steps: [{ screen: "list", element: "New invoice", action: "click" }] },
    ],
  }));
  writeFileSync(join(lessonsDir, ".lessons.json"), JSON.stringify({ lessons: { "create-an-invoice": { version: 1, screens: ["list", "new"], steps: [] }, "open-invoices": { version: 1, screens: ["list"], steps: [] } } }));
  return { ws, lessonsDir, outDir: join(root, "docs/onboarding-videos") };
}
// [SCOPE 139 / T013] END

describe("SC-1, SC-6, SC-7 — recording on a fixture app (T001, T004, T013)", () => {
  const deps = () => {
    const calls = { narrate: [] as string[], render: [] as string[], log: [] as Array<Record<string, unknown>> };
    return {
      calls,
      d: {
        appTypes: ["web"],
        preflight: () => ({ ok: true, missing: [] }),
        ensureHyperframes: () => ({ ok: true, version: PINNED_HYPERFRAMES }),
        narrate: (text: string) => {
          calls.narrate.push(text);
          return 0.3;
        },
        render: (dir: string, out: string) => {
          calls.render.push(readFileSync(join(dir, "index.html"), "utf8"));
          writeFileSync(out, "fake mp4");
          return 7;
        },
        log: async (e: Record<string, unknown>) => {
          calls.log.push(e);
          return { sent: false };
        },
      },
    };
  };

  it("records one video per lesson in a real browser, capturing every click, paired with the lesson id and version; nothing leaves the machine", async () => {
    const { ws, lessonsDir, outDir } = project();
    const { calls, d } = deps();
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const r = await recordVideos({ root, workspace: ws, lessonsDir, outDir, address: null, deps: d });
    expect(r.refused).toBeNull();
    expect(r.problems).toEqual([]);
    expect(r.videos.map((v: { lessonId: string; lessonVersion: number; clicks: number }) => [v.lessonId, v.lessonVersion, v.clicks])).toEqual([["create-an-invoice", 1, 3], ["open-invoices", 1, 1]]);
    expect(calls.narrate[1]).toBe("In Customer, type Acme.");
    expect(calls.render[0]).toMatch(/Step 3 of 3/);
    expect(readVideos(outDir).videos["create-an-invoice"]).toMatchObject({ environment: { classification: "uat" }, attestation: expect.stringMatching(/^yes/), hyperframesVersion: PINNED_HYPERFRAMES });
    expect(existsSync(join(outDir, ".work"))).toBe(false);
    expect(calls.log).toHaveLength(1);
    expect(fetchSpy).not.toHaveBeenCalled(); // SC-7: no paid service, nothing sent
    fetchSpy.mockRestore();

    // SC-6: the lesson moved to version 2; --stale re-records only it.
    writeFileSync(join(lessonsDir, ".lessons.json"), JSON.stringify({ lessons: { "create-an-invoice": { version: 2, screens: ["list", "new"] }, "open-invoices": { version: 1, screens: ["list"] } } }));
    const again = await recordVideos({ root, workspace: ws, lessonsDir, outDir, address: null, stale: true, deps: d });
    expect(again.videos.map((v: { lessonId: string; lessonVersion: number }) => [v.lessonId, v.lessonVersion])).toEqual([["create-an-invoice", 2]]);
    const none = await recordVideos({ root, workspace: ws, lessonsDir, outDir, address: null, stale: true, deps: d });
    expect(none.notes).toContain("no video is stale");
  }, 120_000);

  it("SC-2/SC-3: Production, unlisted, or no yes records nothing and starts no browser", async () => {
    const launches: string[] = [];
    const chromium = { launch: async () => {
      launches.push("launch");
      throw new Error("must not launch");
    } };
    let p = project();
    const { calls, d } = deps();
    const prod = await recordVideos({ root, workspace: p.ws, lessonsDir: p.lessonsDir, outDir: p.outDir, address: "https://prod.example.test/", deps: { ...d, chromium } });
    expect(prod.refused).toMatch(/Production list/);
    expect(calls.log[0]).toMatchObject({ refused: expect.stringMatching(/Production list/) });
    p = project({ video: { address: `${base}/`, attestations: { [base]: { answer: "no", by: "dev", at: "x" } } } });
    expect((await recordVideos({ root, workspace: p.ws, lessonsDir: p.lessonsDir, outDir: p.outDir, address: null, deps: { ...d, chromium } })).refused).toMatch(/demo-data attestation answered "no"/);
    expect((await recordVideos({ root, workspace: p.ws, lessonsDir: p.lessonsDir, outDir: p.outDir, address: null, deps: { ...d, chromium, appTypes: ["desktop"] } })).refused).toMatch(/web apps only/);
    expect((await recordVideos({ root, workspace: p.ws, lessonsDir: p.lessonsDir, outDir: p.outDir, address: `${base}/`, deps: { ...d, chromium, preflight: () => ({ ok: false, missing: ["FFmpeg on the PATH"] }) } })).refused).toMatch(/demo-data attestation|Preflight/);
    expect(launches).toEqual([]);
    expect(existsSync(p.outDir)).toBe(false);
  });
});
