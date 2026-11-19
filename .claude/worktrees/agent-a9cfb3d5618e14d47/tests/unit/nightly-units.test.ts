// SCOPE-140 — Nightly Testing, unit by unit (SC-1..SC-9 on fixtures).
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { checkTargets, dockerDatabasePlan, refusalText } from "../../_wxAI/skills/wxPreTest/scripts/nightly/targets.mjs";
import { estimate, planNight, readHistory, recordResults, releaseLock, selectItems, tryLock, updateCoverage, DEFAULT_ITEM_MS } from "../../_wxAI/skills/wxPreTest/scripts/nightly/selection.mjs";
import { checkEntryPath, totp, ENTRA_STATEMENT } from "../../_wxAI/skills/wxPreTest/scripts/nightly/entry.mjs";
import { deepPages, fieldOrderIssues, mergeObservations, dismissObservation, observationsFrom } from "../../_wxAI/skills/wxPreTest/scripts/nightly/observations.mjs";
import { runWithRetry, patchRefusal, failureSignature, taskForFailure, shouldRemove, removeRunData, savePatch } from "../../_wxAI/skills/wxPreTest/scripts/nightly/failures.mjs";
import { resolveSecrets, scanText, redact, expiryWarnings, secretNames } from "../../_wxAI/skills/wxPreTest/scripts/nightly/secrets.mjs";
import { installPlan, uninstall, jobId } from "../../_wxAI/skills/wxPreTest/scripts/nightly/schedule.mjs";
import { evidenceGate, MAPPINGS, CHECKS, assertWording, buildEvidence, writeArtifacts, readCrosswalk, hitrustMapping, evidenceHtml, ensureArtifactsIgnored } from "../../_wxAI/skills/wxPreTest/scripts/nightly/evidence.mjs";
import { buildSummary, renderSummary, runEventMetadata } from "../../_wxAI/skills/wxPreTest/scripts/nightly/summary.mjs";
import { nightlyMetadataIssues, ProjectEventTypeSchema } from "../../mcp-server/src/utils/schemas";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "nightly-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const ENV = {
  uat: ["https://uat.example.test"],
  production: ["https://app.example.test"],
  uatDatabases: ["uat-db.example.test", "127.0.0.1:55432"],
  productionDatabases: ["prod-db.example.test"],
};

describe("SC-1 — the refusal (T002)", () => {
  const ok = { appUrl: "https://uat.example.test/app", databaseUrl: "postgres://u:p@uat-db.example.test:5432/x", environments: ENV, appMode: "deployed" };
  it("allows a UAT app and a UAT database, and reports no credentials", () => {
    const r = checkTargets(ok);
    expect(r).toEqual({ ok: true, database: "uat-db.example.test:5432", app: "https://uat.example.test" });
  });
  it.each([
    ["the app is production", { appUrl: "https://app.example.test/x" }, /app address https:\/\/app.example.test is on the Production list/],
    ["the app is unlisted", { appUrl: "https://other.example.test" }, /not on the UAT list/],
    ["the database is production", { databaseUrl: "postgres://u:p@prod-db.example.test/x" }, /Production database list/],
    ["the database is unlisted", { databaseUrl: "postgres://u:p@somewhere.example.test/x" }, /not on the UAT database list/],
    ["the database cannot be read", { databaseUrl: "not a url" }, /cannot be read, so it counts as production/],
    ["no lists at all", { environments: {} }, /no Production address list/],
    ["the app address is missing", { appUrl: null }, /no app address/],
  ])("refuses when %s", (_label, change, why) => {
    const r = checkTargets({ ...ok, ...change });
    expect(r.ok).toBe(false);
    expect(r.reasons.join("\n")).toMatch(why);
    expect(refusalText(r)).toMatch(/There is no override/);
    expect(JSON.stringify(r)).not.toMatch(/u:p@/);
  });
  it("when the kit boots the app itself, the project's own DATABASE_URL (production here) is never the target, nor its instance", () => {
    const live = "postgres://u:p@uat-db.example.test:5432/live";
    expect(checkTargets({ ...ok, appMode: "local", databaseUrl: live, productionDatabaseUrl: live }).reasons.join()).toMatch(/project's own DATABASE_URL/);
    expect(checkTargets({ ...ok, appMode: "local", databaseUrl: "postgres://u:p@uat-db.example.test:5432/copy", productionDatabaseUrl: live }).reasons.join()).toMatch(/separate instance is required/);
    // Read from the env file when not given: wxKanban's own case.
    writeFileSync(join(root, ".env"), `DATABASE_URL=${live}\n`);
    expect(checkTargets({ ...ok, appMode: "local", databaseUrl: live, root }).ok).toBe(false);
  });
  it("wxKanban's own runs use a local Docker PostgreSQL labelled with the run id; the password never appears in the command", () => {
    const plan = dockerDatabasePlan("n-1");
    const args = plan.start[1].join(" ");
    expect(args).toMatch(/--label wxkanban\.nightly\.run=n-1/);
    expect(args).toMatch(/-e POSTGRES_PASSWORD( |$)/);
    expect(args).toMatch(/127\.0\.0\.1:55432:5432/);
    expect(plan.url("s3cret")).toBe("postgresql://nightly:s3cret@127.0.0.1:55432/nightly");
    expect(checkTargets({ ...ok, appMode: "local", databaseUrl: plan.url("x"), productionDatabaseUrl: "postgres://u:p@prod-db.example.test/db" }).ok).toBe(true);
  });
});

describe("SC-2, SC-3 — selection, estimate, split, no overlap (T003, T004)", () => {
  const item = (k: string, paths: string[], riskTier = "MEDIUM") => ({ id: k, itemKey: k, title: k, riskTier, subjects: paths.map((p) => ({ sourcePath: p })) });
  const items = [item("A", ["src/a.ts"]), item("B", ["src/b.ts"], "HIGH"), item("C", ["src/c.ts"]), item("D", []), item("E", ["src/e.ts"]), item("F", ["src/f.ts"])];

  it("every item a change reached runs first, boundary crossings first, with no cap; rotation fills the rest, least recently tested first", () => {
    const history = { items: { E: { lastRunAt: "2026-10-01" }, F: { lastRunAt: "2026-09-01" } }, carry: [] };
    const sel = selectItems({ items, changed: ["src/a.ts", "src/b.ts"], reached: ["src/a.ts", "src/b.ts", "src/c.ts"], boundary: ["src/a.ts"], history, slots: 2 });
    expect(sel.impacted.map((i) => i.itemKey)).toEqual(["A", "B", "C"]);
    expect(sel.rotation.map((i) => i.itemKey)).toEqual(["D", "F"]); // never tested, then the oldest
    expect(sel.unmapped.map((i) => i.itemKey)).toEqual(["D"]);
    expect(sel.reasons.A).toMatch(/Impact Boundary/);
  });
  it("a change too broad to list makes every mapped item impacted; carried items come back first", () => {
    const sel = selectItems({ items, changed: null, reached: null, history: { items: {}, carry: [] }, slots: 0 });
    expect(sel.impacted).toHaveLength(5);
    const carried = selectItems({ items, changed: [], reached: [], history: { items: {}, carry: ["F"] }, slots: 0 });
    expect(carried.impacted.map((i) => i.itemKey)).toEqual(["F"]);
  });
  it("rotation reaches every item within one coverage cycle, then a new cycle begins", () => {
    const h: Record<string, unknown> = { items: {}, cycle: { startedAt: null, covered: [] } };
    const all = items.map((i) => i.itemKey);
    expect(updateCoverage(h as never, all, ["A", "B", "C"]).complete).toBe(false);
    expect(updateCoverage(h as never, all, ["D", "E", "F"])).toMatchObject({ covered: 6, total: 6, complete: true });
    expect((h.cycle as { covered: string[] }).covered).toEqual([]);
  });
  it("estimates from history, says when defaults were used, and splits only on the fallback", () => {
    const history = recordResults({ items: {} } as never, [{ itemKey: "A", status: "pass", durationMs: 60_000 }]);
    const est = estimate(items.slice(0, 2), history);
    expect(est.perItem).toEqual({ A: 60_000, B: DEFAULT_ITEM_MS });
    expect(est.note).toMatch(/1 item\(s\) have no history/);
    const big = { perItem: Object.fromEntries(items.map((i) => [i.itemKey, 3 * 3600_000])), totalMs: 0 };
    expect(planNight(items, big as never, { environment: "uat" })).toMatchObject({ split: false, carried: [] });
    const fb = planNight(items, big as never, { environment: "fallback", now: new Date("2026-10-17T20:00:00"), endTime: "06:00" });
    expect(fb.split).toBe(true);
    expect(fb.run.map((i) => i.itemKey)).toEqual(["A", "B", "C"]);
    expect(fb.carried[0].reason).toMatch(/runs first next night/);
  });
  it("a second run never overlaps a live one; a stale lock is taken over", () => {
    expect(tryLock(root, "r1", { isAlive: () => true }).ok).toBe(true);
    expect(tryLock(root, "r2", { isAlive: () => true })).toMatchObject({ ok: false, heldBy: { runId: "r1" } });
    expect(tryLock(root, "r2", { isAlive: () => false }).ok).toBe(true);
    releaseLock(root, "r2");
    expect(tryLock(root, "r3", { isAlive: () => true }).ok).toBe(true);
    expect(readHistory(root).items).toEqual({});
  });
});

describe("T005 — the Entry Path and the authenticator code", () => {
  it("validates the Entry Path: two normal-user accounts, no real person's account, portal fields", () => {
    expect(checkEntryPath(null, [])).toEqual([expect.stringMatching(/no Entry Path/)]);
    const portal = { kind: "portal", signInUrl: "https://uat.example.test/login", selectors: { username: "#u", password: "#p", submit: "#s", signedIn: "#home" } };
    const p = checkEntryPath(portal, [{ name: "a", usernameSecret: "A_U", passwordSecret: "A_P", realPerson: true }]);
    expect(p.join("\n")).toMatch(/portalName is required/);
    expect(p.join("\n")).toMatch(/at least two normal-user test accounts/);
    expect(p.join("\n")).toMatch(/real person's account/);
    expect(ENTRA_STATEMENT).toMatch(/Entra ID sign-in is not tested nightly/);
  });
  it("produces RFC 6238 codes (the published SHA-1 test vector)", () => {
    // RFC 6238 Appendix B: key "12345678901234567890", T = 59 s, 8 digits = 94287082.
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", { now: 59_000, digits: 8 })).toBe("94287082");
    expect(totp("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ", { now: 1111111109_000, digits: 8 })).toBe("07081804");
  });
});

describe("SC-4, SC-5 — Observations (T007)", () => {
  it("finds pages more than 3 clicks deep, with the click path", () => {
    const graph = { "/": [{ to: "/a", label: "A" }], "/a": [{ to: "/b", label: "B" }], "/b": [{ to: "/c", label: "C" }], "/c": [{ to: "/d", label: "D" }] };
    expect(deepPages(graph, "/")).toEqual([{ page: "/d", clicks: 4, path: ["A", "B", "C", "D"] }]);
  });
  it("finds tab order against visual order, required after optional, split groups and unlabeled fields", () => {
    const issues = fieldOrderIssues([
      { name: "phone", label: "Phone", required: false, x: 0, y: 100, group: "Contact" },
      { name: "name", label: "Name", required: true, x: 0, y: 0, group: null },
      { name: "email", label: "", required: true, x: 0, y: 200, group: "Contact" },
      { name: "notes", label: "Notes", required: false, x: 0, y: 150, group: null },
    ]).map((i) => i.issue);
    expect(issues).toEqual(["tab-order", "required-after-optional", "group-split", "unlabeled"]);
  });
  it("reports each Observation once, marks it fixed when it is gone, and never reports a dismissed one again; none is pass/fail", () => {
    const reg = {};
    const o = { screen: "/x", issue: "click-depth", detail: "4 clicks" };
    expect(mergeObservations(reg, [o], { visited: ["/x"], runId: "r1" }).fresh).toHaveLength(1);
    expect(mergeObservations(reg, [o], { visited: ["/x"], runId: "r2" }).fresh).toHaveLength(0);
    mergeObservations(reg, [], { visited: ["/x"], runId: "r3" });
    expect((reg as Record<string, { state: string }>)["/x::click-depth"].state).toBe("fixed");
    mergeObservations(reg, [o], { visited: ["/x"], runId: "r4" });
    dismissObservation(reg, "/x::click-depth", "by design");
    expect(mergeObservations(reg, [o], { visited: ["/x"], runId: "r5" }).fresh).toHaveLength(0);
    for (const v of Object.values(reg)) expect(JSON.stringify(v)).not.toMatch(/"status":"(pass|fail)"/);
    expect(observationsFrom({ home: "/", graph: {}, forms: [], errors: [{ screen: "/y", detail: "HTTP 500" }] })[0]).toMatchObject({ issue: "odd" });
  });
});

describe("SC-6 — failure handling (T008)", () => {
  it("re-runs a failure once: pass then pass is pass, fail then pass is flaky, fail twice is a failure", async () => {
    const seq = (...s: string[]) => {
      let i = 0;
      return async () => ({ status: s[i++], error: "boom" });
    };
    expect((await runWithRetry(seq("pass"), {})).status).toBe("pass");
    expect((await runWithRetry(seq("fail", "pass"), {})).status).toBe("flaky");
    const f = await runWithRetry(seq("fail", "fail"), {});
    expect(f.status).toBe("fail");
    expect(f.attempts).toHaveLength(2);
  });
  it("refuses a proposed patch that touches a test or removes an assertion", () => {
    const appFix = "--- a/src/x.ts\n+++ b/src/x.ts\n@@\n-const a = 1;\n+const a = 2;\n";
    expect(patchRefusal(appFix)).toBeNull();
    expect(patchRefusal("--- a/tests/x.test.ts\n+++ b/tests/x.test.ts\n@@\n-x\n+y\n")).toMatch(/never edits tests/);
    expect(patchRefusal("--- a/src/y.ts\n+++ b/src/y.ts\n@@\n-  assert(ok);\n")).toMatch(/weaken an assertion/);
    const saved = savePatch(root, { itemKey: "TC-1" }, appFix);
    expect(existsSync(saved.path!)).toBe(true);
    expect(savePatch(root, { itemKey: "TC-2" }, null).note).toMatch(/No patch offered/);
  });
  it("opens exactly one task per failure across nights", async () => {
    const created: unknown[] = [];
    const createTask = async (t: unknown) => {
      created.push(t);
      return { task: { id: `task-${created.length}` } };
    };
    const item = { itemKey: "TC-9", title: "Save an invoice" };
    const result = { attempts: [{ error: "expected 200, got 500 at id 3f2a" }, { error: "expected 200, got 500 at id 9c1b" }] };
    const a = await taskForFailure(root, { item, result, diagnosisText: "d", createTask, runId: "n1" });
    const b = await taskForFailure(root, { item, result: { attempts: [{}, { error: "expected 200, got 500 at id 7777" }] }, diagnosisText: "d", createTask, runId: "n2" });
    expect(a).toEqual({ taskId: "task-1", created: true });
    expect(b).toEqual({ taskId: "task-1", created: false });
    expect(created).toHaveLength(1);
    expect(failureSignature("K", "Timeout 3000ms at 12:01")).toBe("K::Timeout <n>ms at <n>:<n>");
  });
});

describe("SC-7 — cleanup (T009)", () => {
  it("follows the choice: remove always, keep on failure, or keep", () => {
    expect(shouldRemove("remove", { green: false })).toBe(true);
    expect(shouldRemove("keep-on-failure", { green: false })).toBe(false);
    expect(shouldRemove("keep-on-failure", { green: true })).toBe(true);
    expect(shouldRemove("keep", { green: true })).toBe(false);
    expect(() => shouldRemove("never", { green: true })).toThrow(/must be one of/);
  });
  it("verifies removal: a container still labelled, or rows still tagged, are leftovers", () => {
    const calls: string[][] = [];
    const exec = (cmd: string, args: string[], env?: Record<string, string>) => {
      calls.push([cmd, ...args, env?.NIGHTLY_RUN_ID ?? ""]);
      if (cmd === "docker" && args[0] === "ps") return { status: 0, stdout: "" };
      if (cmd === "verify") return { status: 0, stdout: "count\n0\n" };
      return { status: 0, stdout: "" };
    };
    expect(removeRunData("n1", { kind: "docker", container: "wxnightly-n1" }, { exec })).toMatchObject({ removed: true, leftovers: 0 });
    expect(removeRunData("n1", { kind: "commands", command: ["clean"], verifyCommand: ["verify"] }, { exec })).toMatchObject({ removed: true, leftovers: 0 });
    expect(calls.find((c) => c[0] === "clean")?.at(-1)).toBe("n1");
    const left = (cmd: string) => (cmd === "verify" ? { status: 0, stdout: "3" } : { status: 0, stdout: "" });
    expect(removeRunData("n1", { kind: "commands", command: ["clean"], verifyCommand: ["verify"] }, { exec: left })).toMatchObject({ removed: false, leftovers: 3 });
    expect(removeRunData("n1", { kind: "commands" }, { exec }).detail).toMatch(/no cleanup command/);
  });
});

describe("SC-9 — secrets (T010)", () => {
  it("resolves secrets by name, reports missing ones by name only, and scans outputs without echoing values", () => {
    const n = { accounts: [{ name: "a", usernameSecret: "NIGHTLY_A_USER", passwordSecret: "NIGHTLY_A_PASS" }], database: { urlSecret: "NIGHTLY_DB" } };
    expect(secretNames(n)).toEqual(["NIGHTLY_A_USER", "NIGHTLY_A_PASS", "NIGHTLY_DB"]);
    const { values, missing } = resolveSecrets(secretNames(n), { NIGHTLY_A_USER: "tester1", NIGHTLY_A_PASS: "Hunter2!x" });
    expect(missing).toEqual(["NIGHTLY_DB"]);
    const found = scanText("login ok for tester1 with Hunter2!x; db postgres://u:pw@h/x", { secrets: values, where: "log" });
    expect(found.map((f) => f.kind)).toEqual(["the value of secret NIGHTLY_A_USER", "the value of secret NIGHTLY_A_PASS", "connection string with a password"]);
    expect(JSON.stringify(found)).not.toMatch(/Hunter2/);
    expect(redact("pw=Hunter2!x", values)).toBe("pw=[secret NIGHTLY_A_PASS]");
    expect(scanText("all clean here", { secrets: values })).toEqual([]);
  });
  it("warns before a test account's password expires", () => {
    const w = expiryWarnings({ accounts: [{ name: "a", passwordExpiresAt: "2026-10-20" }, { name: "b", passwordExpiresAt: "2026-10-01" }] }, new Date("2026-10-17"));
    expect(w).toEqual([expect.stringMatching(/"a": password expires in 3 day/), expect.stringMatching(/"b": password expired 16 day/)]);
  });
});

describe("T011 — install and uninstall", () => {
  it("builds the scheduler entry for each platform, as the Designated Agent, with wake only on the fallback", () => {
    const win = installPlan({ root: "C:/p", script: "C:/k/nightly.mjs", node: "C:/node.exe", at: "02:30", platform: "win32", fallback: true, agentUser: "UAT\\nightly" });
    expect(win.xml).toMatch(/<WakeToRun>true<\/WakeToRun>/);
    expect(win.xml).toMatch(/<UserId>UAT\\nightly<\/UserId>/);
    expect(win.xml).toMatch(/T02:30:00/);
    expect(win.xml).toMatch(/<MultipleInstancesPolicy>IgnoreNew/);
    expect(win.create[1]).toContain("/RU");
    const linux = installPlan({ root: "/p", script: "/k/n.mjs", node: "/usr/bin/node", at: "02:00", platform: "linux", home: "/home/u" });
    expect(linux.files.map((f) => f.path.replace(/\\/g, "/"))).toEqual([`/home/u/.config/systemd/user/${jobId("/p")}.service`, `/home/u/.config/systemd/user/${jobId("/p")}.timer`]);
    expect(linux.files[1].body).toMatch(/OnCalendar=\*-\*-\* 02:00:00/);
    expect(linux.files[1].body).toMatch(/WakeSystem=false/);
    const mac = installPlan({ root: "/p", script: "/k/n.mjs", node: "/n", at: "03:15", platform: "darwin", home: "/Users/u", fallback: true });
    expect(mac.files[0].body).toMatch(/<key>Hour<\/key><integer>3<\/integer><key>Minute<\/key><integer>15/);
    expect(mac.note).toMatch(/pmset/);
    expect(() => installPlan({ root: "/p", script: "/k", at: "25:00", platform: "linux" })).toThrow(/not a time/);
  });
  it("uninstall removes everything and reports no residue", () => {
    const plan = installPlan({ root, script: "/k/n.mjs", node: "/n", platform: "linux", home: root });
    for (const f of plan.files) {
      mkdirSync(join(f.path, ".."), { recursive: true });
      writeFileSync(f.path, f.body);
    }
    const run = () => ({ status: 1, stdout: "" });
    expect(uninstall(plan, { run })).toEqual([]);
    for (const f of plan.files) expect(existsSync(f.path)).toBe(false);
  });
});

describe("T013, T014 — compliance evidence", () => {
  const green = { results: [{ status: "pass" }], permission: { ok: true, results: [{}] }, cleanup: { choice: "remove", removed: true }, secretScan: [] };
  it("writes evidence only after a completely green run, and says why not", () => {
    expect(evidenceGate(green).green).toBe(true);
    const red = evidenceGate({ ...green, results: [{ status: "pass" }, { status: "flaky" }], permission: { ok: false }, secretScan: [{}] });
    expect(red.green).toBe(false);
    expect(red.reasons).toEqual(["1 test(s) were flaky (failed, then passed)", "the permission check did not pass", "the secret scan found 1 finding(s)"]);
  });
  it("maps only to control ids that exist in the repo's SCOPE-112/113 catalogs, and ships no HITRUST content", () => {
    const corpus = ["0011_spec112_soc2_check_corpus.sql", "0014_spec113_nistssdf_catalog.sql", "0015_spec113_iso27001_catalog.sql", "0017_spec113_hipaa_catalog.sql", "0018_spec113_gdpr_catalog.sql"]
      .map((f) => readFileSync(join("src/db/migrations", f), "utf8"))
      .join("\n");
    for (const [fw, m] of Object.entries(MAPPINGS)) {
      for (const c of m.controls) {
        expect(corpus.includes(`'${c.id}'`), `${fw} ${c.id}`).toBe(true);
        for (const k of c.checks) expect(CHECKS[k as keyof typeof CHECKS], k).toBeTruthy();
      }
    }
    expect(Object.keys(MAPPINGS)).not.toContain("HITRUST");
    expect(MAPPINGS.ISO27001.title).toMatch(/15 of 93 controls; no ISMS/);
  });
  it("never says compliant or certified", () => {
    expect(() => assertWording("The system is SOC 2 compliant")).toThrow(/may not say "compliant"/);
    expect(() => assertWording("Certified by wxKanban")).toThrow();
    expect(assertWording("what was checked and found")).toBeTruthy();
  });
  it("writes evidence.json, the PDF and a manifest whose fingerprints match; a later run replaces the folder", async () => {
    const run = { releaseVersion: "1.2.3", runId: "n1", runAt: "2026-10-17T02:00:00Z", agent: "nightly-agent", environment: { app: "https://uat.example.test", database: "uat-db:5432" }, changeLog: ["abc fix"], results: { total: 1, passed: 1, failed: 0 } };
    const found = Object.fromEntries(Object.keys(CHECKS).map((k) => [k, `found ${k}`]));
    const doc = buildEvidence({ framework: "SOC2", mapping: MAPPINGS.SOC2, run, found });
    expect(evidenceHtml(doc)).toMatch(/SOC 2 Trust Services Criteria/);
    mkdirSync(join(root, "artifacts/1.2.3/SOC2"), { recursive: true });
    writeFileSync(join(root, "artifacts/1.2.3/SOC2/stale.txt"), "old");
    const w = await writeArtifacts(root, doc, { renderPdf: async () => Buffer.from("%PDF-1.4 fake") });
    expect(existsSync(join(root, "artifacts/1.2.3/SOC2/stale.txt"))).toBe(false);
    for (const f of w.manifest.files) {
      const sha = createHash("sha256").update(readFileSync(join(w.dir, f.file))).digest("hex");
      expect(sha).toBe(f.sha256);
    }
    expect(createHash("sha256").update(readFileSync(join(w.dir, "manifest.json"))).digest("hex")).toBe(w.manifestSha256);
    expect(ensureArtifactsIgnored(root, false)).toBe(true);
    expect(readFileSync(join(root, ".gitignore"), "utf8")).toMatch(/^\/artifacts\/$/m);
    expect(ensureArtifactsIgnored(root, false)).toBe(false);
  });
  it("HITRUST: only from the customer's assessor-signed CSF v11.9.0 crosswalk; anything else writes none and says why", () => {
    expect(readCrosswalk(root).reason).toMatch(/no signed HITRUST crosswalk/);
    const dir = join(root, "artifacts/hitrust-crosswalk");
    mkdirSync(dir, { recursive: true });
    const cw = { csfVersion: "11.9.0", crosswalkVersion: "1", derivedFrom: "customer-licensed-csf", nistCrossCheck: true, assessor: { name: "A. Assessor", organization: "Assess LLC", signedAt: "2026-10-01" }, mappings: [{ csfRef: "CUSTOMER-REF-1", checks: ["permission-check"] }] };
    writeFileSync(join(dir, "crosswalk.json"), JSON.stringify({ ...cw, assessor: { name: "A" } }));
    expect(readCrosswalk(root).reason).toMatch(/not signed off/);
    writeFileSync(join(dir, "crosswalk.json"), JSON.stringify({ ...cw, source: "wxkanban-local-taxonomy" }));
    expect(readCrosswalk(root).reason).toMatch(/local 01-17 taxonomy/);
    writeFileSync(join(dir, "crosswalk.json"), JSON.stringify(cw));
    expect(readCrosswalk(root, { currentCsf: "11.10.0" })).toMatchObject({ ok: false, reReview: true });
    const ok = readCrosswalk(root);
    expect(ok.ok).toBe(true);
    expect(hitrustMapping(ok.crosswalk).title).toMatch(/CSF v11\.9\.0 .*signed by A\. Assessor/);
  });
});

describe("T012 — the morning summary", () => {
  it("lists what was not tested, every time, including the Entra statement for portal entry", () => {
    const s = buildSummary({
      runId: "n1", environment: "uat", agent: "agent", entryPath: { kind: "portal" },
      results: [{ itemKey: "A", status: "pass" }, { itemKey: "B", status: "fail", title: "B", taskId: "t1" }, { itemKey: "C", status: "unresolved", reason: "no agent" }],
      carried: [{ itemKey: "D", reason: "did not fit" }], unmapped: [{}], permission: { ok: true, results: [{}], leaks: [] }, gate: { green: false, reasons: ["1 test(s) failed"] },
      cleanup: { choice: "remove", removed: true, leftovers: 0, detail: "gone" }, helper: { ran: false, reason: "one agent only" },
    });
    expect(s.notTested.join("\n")).toMatch(/D: did not fit/);
    expect(s.notTested.join("\n")).toMatch(/C: no agent/);
    expect(s.notTested.join("\n")).toMatch(/Entra ID sign-in is not tested nightly/);
    expect(s.notTested.join("\n")).toMatch(/usability pass skipped: one agent only/);
    const md = renderSummary(s);
    expect(md).toMatch(/1 passed, 1 failed, 0 flaky, 1 not run/);
    expect(md).toMatch(/None written: 1 test\(s\) failed/);
    expect(nightlyMetadataIssues("nightly_run_completed", runEventMetadata(s))).toEqual([]);
  });
  it("the two event types are accepted by capture_event and their metadata is checked", () => {
    expect(ProjectEventTypeSchema.safeParse("nightly_run_completed").success).toBe(true);
    expect(ProjectEventTypeSchema.safeParse("compliance_artifact_written").success).toBe(true);
    expect(nightlyMetadataIssues("compliance_artifact_written", { runId: "n", framework: "SOC2", releaseVersion: "1", manifestSha256: "x", files: [] }).length).toBeGreaterThan(0);
    expect(nightlyMetadataIssues("compliance_artifact_written", { runId: "n", framework: "SOC2", releaseVersion: "1", manifestSha256: "a".repeat(64), files: [{ file: "evidence.json", sha256: "b".repeat(64) }] })).toEqual([]);
  });
});
