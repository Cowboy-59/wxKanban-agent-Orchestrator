// SCOPE-137 / T014 — the Change Impact agreement log (FR-013).
//
// Three promises are tested here:
//   1. what the kit builds is exactly what the MCP accepts (one schema, read from the MCP side);
//   2. an offline period loses nothing (SC-6), and a refused record never blocks the queue;
//   3. the app shows the log read-only, in every language, with resends shown once.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  buildAgreementEvent,
  changeHash,
  flushQueue,
  QUEUE_FILE,
  readQueue,
  recordAgreement,
  REJECTED_FILE,
} from "../../_wxAI/impact/lib/agreement.mjs";
import { CaptureEventInputSchema } from "../../mcp-server/src/utils/schemas";
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

const { executeSpy, selectSpy } = vi.hoisted(() => ({
  executeSpy: vi.fn(),
  selectSpy: vi.fn(),
}));
vi.mock("~/db/client.js", () => ({ db: { execute: executeSpy, select: selectSpy } }));

const PROJECT = "ba924193-0335-4080-9fa6-33cd6b81300a";

/** A report shaped as buildReport returns it, crossing into SCOPE-002. */
const report = {
  changedFiles: ["src/server/service.ts"],
  broad: false,
  summary: { affected: 3 },
  links: [
    { type: "import", direction: "dependent", from: "src/server/service.ts", to: "src/server/routes/items.ts" },
    { type: "table", direction: "dependent", from: "src/server/service.ts", to: "src/server/report.ts", via: "table:items" },
    { type: "scope", direction: "dependent", from: "src/server/service.ts", to: "scope:002" },
  ],
  scopes: { ownScopes: ["001"], reachedScopes: ["002"] },
  classification: {
    mode: "boundaries",
    decision: "ask",
    boundary: true,
    ownScopes: ["001"],
    reasons: [{ kind: "other-scope", scope: "002", detail: "reaches SCOPE-002 code (1 file)" }],
    dataLoss: [],
    signoff: { checked: false, reason: "" },
  },
};

const event = (kind: string, extra: Record<string, unknown> = {}) =>
  buildAgreementEvent({
    projectId: PROJECT,
    actor: "andy",
    kind,
    answer: kind === "crossing" ? "continued" : kind === "approval" ? "approve" : "agree",
    attended: kind !== "crossing",
    entryPoint: kind === "crossing" ? "unattended" : kind === "acknowledgment" ? "cockpit" : "hook",
    report,
    hash: changeHash([{ file: "src/server/service.ts", content: "x" }]),
    ...extra,
  });

let dirs: string[] = [];
const tempRoot = () => {
  const d = mkdtempSync(join(tmpdir(), "impact-queue-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
  dirs = [];
});

describe("SCOPE-137 T014 — agreement records match the MCP contract (FR-013)", () => {
  it("each kind builds a record capture_event accepts, with its own event type", () => {
    for (const [kind, type] of [
      ["acknowledgment", "change_impact_ack"],
      ["approval", "change_impact_approval"],
      ["crossing", "change_impact_crossing"],
    ]) {
      const e = event(kind);
      expect(e.type).toBe(type);
      const parsed = CaptureEventInputSchema.safeParse(e);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("records the scopes it touched, so the app tab can find it under each", () => {
    expect(event("approval").metadata.scopes.sort()).toEqual(["001", "002"]);
  });

  it("a hand-edit self-agreement can never be stored as an approval", () => {
    const tampered = { ...event("acknowledgment"), type: "change_impact_approval" };
    const parsed = CaptureEventInputSchema.safeParse(tampered);
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.message)).toContain('metadata.kind must be "approval" for change_impact_approval');
  });

  it("a crossing is always unattended, and a record with no change hash is refused", () => {
    expect(event("crossing", { attended: true }).metadata.attended).toBe(false);
    const noHash = event("approval");
    noHash.metadata.change.hash = "";
    expect(CaptureEventInputSchema.safeParse(noHash).success).toBe(false);
  });

  it("other event types are untouched by the agreement-log rules", () => {
    expect(CaptureEventInputSchema.safeParse({ projectId: PROJECT, type: "manual_note", source: "cli", actor: "a", rawContent: "x" }).success).toBe(true);
  });

  it("the change hash depends on content and is order-independent", () => {
    const a = changeHash([{ file: "a.ts", content: "1" }, { file: "b.ts", content: "2" }]);
    expect(changeHash([{ file: "b.ts", content: "2" }, { file: "a.ts", content: "1" }])).toBe(a);
    expect(changeHash([{ file: "a.ts", content: "1" }, { file: "b.ts", content: "3" }])).not.toBe(a);
  });
});

describe("SCOPE-137 T014 — offline queue (SC-6)", () => {
  it("0 records lost: three offline records resend in order once the MCP is back", async () => {
    const root = tempRoot();
    const offline = () => Promise.reject(new Error("ECONNREFUSED"));
    const records = [event("approval"), event("acknowledgment"), event("crossing")];
    for (const r of records) expect((await recordAgreement(root, r, offline)).queued).toBe(true);
    expect(readQueue(root)).toHaveLength(3);

    const received: unknown[] = [];
    const online = (e: unknown) => {
      received.push(e);
      return Promise.resolve({});
    };
    const fourth = event("approval");
    const result = await recordAgreement(root, fourth, online);
    expect(result.sent).toBe(true);
    expect(result.flushed).toMatchObject({ sent: 3, remaining: 0 });
    expect(received.map((e) => (e as { metadata: { clientEventId: string } }).metadata.clientEventId)).toEqual(
      [...records, fourth].map((r) => r.metadata.clientEventId),
    );
    expect(readQueue(root)).toEqual([]);
    // Queued records say so, so the app can show they arrived late.
    expect((received[0] as { metadata: { queued?: boolean } }).metadata.queued).toBe(true);
  });

  it("still offline mid-flush: what was sent is removed, the rest stays in order", async () => {
    const root = tempRoot();
    const records = [event("approval"), event("approval"), event("approval")];
    for (const r of records) await recordAgreement(root, r, () => Promise.reject(new Error("offline")));
    let calls = 0;
    const flaky = () => (++calls === 1 ? Promise.resolve({}) : Promise.reject(new Error("offline")));
    expect(await flushQueue(root, flaky)).toMatchObject({ sent: 1, remaining: 2 });
    expect(readQueue(root).map((e: { metadata: { clientEventId: string } }) => e.metadata.clientEventId)).toEqual(
      records.slice(1).map((r) => r.metadata.clientEventId),
    );
  });

  it("a record the server refuses is set aside, kept, and does not block the queue", async () => {
    const root = tempRoot();
    const bad = event("approval");
    const good = event("approval");
    await recordAgreement(root, bad, () => Promise.reject(new Error("offline")));
    await recordAgreement(root, good, () => Promise.reject(new Error("offline")));
    const refuseBad = (e: { metadata: { clientEventId: string } }) =>
      e.metadata.clientEventId === bad.metadata.clientEventId
        ? Promise.reject(Object.assign(new Error("invalid"), { permanent: true }))
        : Promise.resolve({});
    expect(await flushQueue(root, refuseBad)).toMatchObject({ sent: 1, rejected: 1, remaining: 0 });
    const setAside = readFileSync(join(root, REJECTED_FILE), "utf8").trim().split("\n").map((l) => JSON.parse(l));
    expect(setAside[0].event.metadata.clientEventId).toBe(bad.metadata.clientEventId);
  });

  it("a torn last line from a crash does not lose the lines before it", () => {
    const root = tempRoot();
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(join(root, QUEUE_FILE), JSON.stringify(event("approval")) + "\n" + '{"projectId":"x","ty');
    expect(readQueue(root)).toHaveLength(1);
    expect(existsSync(join(root, QUEUE_FILE))).toBe(true);
  });
});

describe("SCOPE-137 T014 — the app's read-only log", () => {
  const LOCALES: Array<[string, Record<string, unknown>]> = [
    ["en-US", enUS as unknown as Record<string, unknown>],
    ["fr-FR", frFR as unknown as Record<string, unknown>],
    ["pt-BR", ptBR as unknown as Record<string, unknown>],
    ["it-IT", itIT as unknown as Record<string, unknown>],
    ["de-DE", deDE as unknown as Record<string, unknown>],
    ["es-ES", esES as unknown as Record<string, unknown>],
  ];
  const KEYS = [
    "changeImpactTitle", "changeImpactCount", "changeImpactLoading", "changeImpactEmpty", "changeImpactError",
    "changeImpactKindAck", "changeImpactKindApproval", "changeImpactKindDeclined", "changeImpactKindCrossing",
    "changeImpactAffected", "changeImpactQueued", "changeImpactReadOnly",
  ];

  it.each(LOCALES)("%s defines every Change Impact log string", (_name, bundle) => {
    const pp = (bundle.projectPanel ?? {}) as Record<string, string>;
    for (const k of KEYS) expect(typeof pp[k], k).toBe("string");
    expect(pp.changeImpactCount).toContain("{{count}}");
    expect(pp.changeImpactAffected).toContain("{{count}}");
  });

  it("lists the scope's records newest first, and a resend from the queue only once", async () => {
    const { ChangeImpactLogService } = await import("../../src/server/services/ChangeImpactLogService");
    selectSpy.mockReturnValue({ from: () => ({ where: () => Promise.resolve([{ specnumber: "2" }]) }) });
    const meta = (id: string, extra: Record<string, unknown> = {}) => ({
      clientEventId: id, kind: "approval", attended: true, mode: "boundaries", answer: "approve",
      change: { files: ["a.ts"], hash: "h" }, impact: { affected: 2, reasons: [{ kind: "other-scope", detail: "reaches SCOPE-002" }] },
      scopes: ["002"], ...extra,
    });
    executeSpy.mockResolvedValue({
      rows: [
        { id: "e3", type: "change_impact_approval", actor: "andy", source: "cli", raw_content: "late copy", metadata: meta("c1", { queued: true }), created_at: "2026-10-17T12:00:00Z" },
        { id: "e2", type: "change_impact_crossing", actor: "bot", source: "cli", raw_content: "crossed", metadata: meta("c2", { kind: "crossing", attended: false }), created_at: "2026-10-17T11:00:00Z" },
        { id: "e1", type: "change_impact_approval", actor: "andy", source: "cli", raw_content: "first", metadata: meta("c1"), created_at: "2026-10-17T10:00:00Z" },
      ],
    });
    const result = await ChangeImpactLogService.listForScope(PROJECT, "00000000-0000-7000-8000-000000000002");
    expect(result?.scopeNumber).toBe("002");
    expect(result?.records.map((r) => r.id)).toEqual(["e2", "e1"]);
    expect(result?.records[1]).toMatchObject({ kind: "approval", affected: 2, changedFiles: ["a.ts"], queued: false });
  });

  it("a scope that is not in the project returns nothing, without reading events", async () => {
    const { ChangeImpactLogService } = await import("../../src/server/services/ChangeImpactLogService");
    executeSpy.mockClear();
    selectSpy.mockReturnValue({ from: () => ({ where: () => Promise.resolve([]) }) });
    expect(await ChangeImpactLogService.listForScope(PROJECT, "00000000-0000-7000-8000-000000000009")).toBeNull();
    expect(executeSpy).not.toHaveBeenCalled();
  });
});
