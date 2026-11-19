// SCOPE-140 — a whole nightly run, end to end, on a fixture (T015, SC-1..SC-9).
//
// Nothing here touches wxKanban's app or database. A temporary project holds the configuration; a
// local server plays the UAT portal (sign-in, two-factor, the portal tile, the app, admin pages)
// and the hosted MCP (it records every call). The real nightly.mjs runs as a child process with a
// real Chromium, exactly as the scheduler would start it.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { totp } from "../../_wxAI/skills/wxPreTest/scripts/nightly/entry.mjs";
import { nightlyMetadataIssues } from "../../mcp-server/src/utils/schemas";

// Never reach the real wxKanban from a test (see change-impact-hook.test.ts, 2026-10-17).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

const NIGHTLY = resolve("_wxAI/skills/wxPreTest/scripts/nightly.mjs");
const OTP = "JBSWY3DPEHPK3PXP";
const PASSWORDS = { NIGHTLY_U1: "tester.one", NIGHTLY_P1: "Pw-one-123!", NIGHTLY_U2: "tester.two", NIGHTLY_P2: "Pw-two-456!", NIGHTLY_OTP1: OTP, NIGHTLY_OTP2: OTP, NIGHTLY_DB: "postgres://uat:dbpass@127.0.0.1:5999/uat" };

type Call = { name: string; args: Record<string, unknown> };
const state = { leak: false, noAuto: false, calls: [] as Call[], tasks: 0, frameworks: ["SOC2", "HITRUST"] as string[] };
let server: Server;
let base = "";

const page = (body: string) => `<!doctype html><html><body>${body}</body></html>`;
const cookieUser = (req: IncomingMessage) => /session=(\w+)/.exec(req.headers.cookie ?? "")?.[1] ?? null;

// [SCOPE 140 / T015] BEGIN — The fixture: a UAT portal and app, and a stub of the hosted MCP
function handle(req: IncomingMessage, res: ServerResponse, body: string) {
  const url = new URL(req.url ?? "/", base);
  const send = (code: number, html: string, headers: Record<string, string> = {}) => {
    res.writeHead(code, { "Content-Type": "text/html", ...headers });
    res.end(html);
  };
  if (url.pathname === "/mcp") {
    const rpc = JSON.parse(body);
    const { name, arguments: args } = rpc.params;
    state.calls.push({ name, args });
    let result: unknown = {};
    if (name === "project.start_test_run" && args.dryRun) {
      result = { dryRun: true, items: ["TC-1", "TC-2", "TC-FAIL"].map((k) => ({ id: `id-${k}`, itemKey: k, title: `Item ${k}`, gate: "crud", riskTier: "MEDIUM", automationRef: state.noAuto ? null : k, subjects: [{ sourcePath: `src/${k}.ts` }] })) };
    } else if (name === "project.start_test_run") result = { runId: "run-1", items: [] };
    else if (name === "project.create_task") result = { task: { id: `task-${++state.tasks}` } };
    else if (name === "project.get_compliance_context") result = { activeFrameworks: state.frameworks };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: rpc.id, result: { content: [{ type: "text", text: JSON.stringify(result) }] } }));
    return;
  }
  const user = cookieUser(req);
  if (url.pathname === "/login" && req.method === "GET") return send(200, page('<form method="post"><input id="u" name="u"><input id="p" name="p" type="password"><button id="s">Sign in</button></form>'));
  if (url.pathname === "/login") {
    const f = new URLSearchParams(body);
    const who = Object.entries({ one: [PASSWORDS.NIGHTLY_U1, PASSWORDS.NIGHTLY_P1], two: [PASSWORDS.NIGHTLY_U2, PASSWORDS.NIGHTLY_P2] }).find(([, [u, p]]) => f.get("u") === u && f.get("p") === p)?.[0];
    if (!who) return send(200, page('<p id="err">Wrong password</p>'));
    return send(302, "", { Location: "/otp", "Set-Cookie": `pending=${who}; Path=/` });
  }
  if (url.pathname === "/otp" && req.method === "GET") return send(200, page('<form method="post"><input id="otp" name="otp"><button id="s2">Verify</button></form>'));
  if (url.pathname === "/otp") {
    const who = /pending=(\w+)/.exec(req.headers.cookie ?? "")?.[1];
    const code = new URLSearchParams(body).get("otp");
    const ok = [totp(OTP), totp(OTP, { now: Date.now() - 30_000 })].includes(code ?? "");
    if (!who || !ok) return send(200, page('<p id="err">Bad code</p>'));
    return send(302, "", { Location: "/portal", "Set-Cookie": `session=${who}; Path=/` });
  }
  if (!user) return send(302, "", { Location: "/login" });
  if (url.pathname === "/portal") return send(200, page('<h1 id="home">Workbench</h1><a id="open-app" href="/app/">Open the app</a>'));
  if (url.pathname === "/app/") return send(200, page('<h1 id="app-ready">App</h1><a href="/app/a">A</a><a href="/app/form">Form</a><a href="/logout">Log out</a>'));
  if (url.pathname === "/app/a") return send(200, page('<a href="/app/b">B</a>'));
  if (url.pathname === "/app/b") return send(200, page('<a href="/app/c">C</a>'));
  if (url.pathname === "/app/c") return send(200, page('<a href="/app/d">D</a>'));
  if (url.pathname === "/app/d") return send(200, page("<p>deep</p>"));
  if (url.pathname === "/app/form") {
    return send(200, page('<form><label for="b">Second</label><input id="b" name="b" style="position:absolute;top:200px"><label for="a">First</label><input id="a" name="a" required style="position:absolute;top:100px"></form>'));
  }
  if (url.pathname === "/app/admin") return state.leak ? send(200, page("<h1>Admin console</h1>")) : send(403, page("<p>Access denied</p>"));
  if (url.pathname === "/logout") return send(200, page("bye"));
  return send(404, page("not found"));
}
// [SCOPE 140 / T015] END

beforeAll(async () => {
  server = createServer((req, res) => {
    let body = "";
    req.on("data", (d) => (body += d));
    req.on("end", () => handle(req, res, body));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

let root = "";
beforeEach(() => {
  state.leak = false;
  state.calls = [];
  state.tasks = 0;
  state.frameworks = ["SOC2", "HITRUST"];
  state.noAuto = false;
  root = mkdtempSync(join(tmpdir(), "nightly-run-"));
  mkdirSync(join(root, "docs-workspace"), { recursive: true });
  mkdirSync(join(root, "_wxAI", "adapters"), { recursive: true });
  writeFileSync(join(root, "_wxAI", "adapters", "resolve-adapter.mjs"), 'console.log(JSON.stringify({ adapter: "fixture", provenance: "shipped" }));\n');
  mkdirSync(join(root, ".claude", "skills", "wxG-O-D", "scripts"), { recursive: true });
  cpSync(".claude/skills/wxG-O-D/scripts/machine-capacity.mjs", join(root, ".claude", "skills", "wxG-O-D", "scripts", "machine-capacity.mjs"));
  writeFileSync(join(root, "item.mjs"), "process.exit(process.argv[2] === 'TC-FAIL' && process.env.FAIL_ONE === '1' ? 1 : 0);\n");
  writeFileSync(join(root, "clean.mjs"), "process.exit(0);\n");
  writeFileSync(join(root, "verify.mjs"), "console.log('0');\n");
  writeFileSync(join(root, "package.json"), JSON.stringify({ name: "fixture", version: "4.5.6" }));
  writeConfig({});
});

// [SCOPE 140 / T015] BEGIN — The fixture project's configuration, and starting nightly.mjs as the scheduler would
function writeConfig(over: Record<string, unknown>) {
  const nightly = {
    environment: "uat",
    appMode: "deployed",
    appUrl: `${base}/app/`,
    database: { mode: "url", urlSecret: "NIGHTLY_DB" },
    accounts: [
      { name: "normal-1", usernameSecret: "NIGHTLY_U1", passwordSecret: "NIGHTLY_P1", otpSecret: "NIGHTLY_OTP1" },
      { name: "normal-2", usernameSecret: "NIGHTLY_U2", passwordSecret: "NIGHTLY_P2", otpSecret: "NIGHTLY_OTP2" },
    ],
    adminPages: ["/app/admin"],
    testCommand: ["node", join(root, "item.mjs"), "${ref}"],
    cleanupCommand: ["node", join(root, "clean.mjs")],
    cleanupVerifyCommand: ["node", join(root, "verify.mjs")],
    agentName: "nightly-agent",
    ...over,
  };
  writeFileSync(join(root, "docs-workspace", "config.json"), JSON.stringify({
    environments: { uat: [base], production: ["https://prod.example.test"], uatDatabases: ["127.0.0.1:5999"], productionDatabases: ["prod-db.example.test"] },
    entryPath: { kind: "portal", portalName: "Workbench", signInUrl: `${base}/login`, appTile: "#open-app", appUrl: `${base}/app/`, selectors: { username: "#u", password: "#p", submit: "#s", otp: "#otp", otpSubmit: "#s2", signedIn: "#home", appReady: "#app-ready", signInError: "#err" } },
    nightly,
  }, null, 2));
}

async function runNightly(env: Record<string, string> = {}) {
  // spawnSync would block this process, and with it the fixture server the run talks to.
  const { spawn } = await import("node:child_process");
  return new Promise<{ code: number | null; out: string }>((done) => {
    const child = spawn(process.execPath, [NIGHTLY, "run", "--root", root], {
      env: { ...process.env, ...PASSWORDS, WXKANBAN_API_TOKEN: "test-token", WXKANBAN_PROJECT_ID: "33333333-3333-4333-8333-333333333333", WXKANBAN_MCP_URL: `${base}/mcp`, ...env },
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (out += d));
    child.on("close", (code) => done({ code, out }));
  });
}

// [SCOPE 140 / T015] END

const called = (name: string) => state.calls.filter((c) => c.name === name);
const allOutputs = () => {
  const texts: string[] = [];
  const walk = (d: string) => {
    for (const n of readdirSync(d, { withFileTypes: true })) {
      const f = join(d, n.name);
      if (n.isDirectory()) walk(f);
      else if (!/\.(png|pdf)$/.test(n.name)) texts.push(readFileSync(f, "utf8"));
    }
  };
  walk(join(root, ".wxai"));
  if (existsSync(join(root, "artifacts"))) walk(join(root, "artifacts"));
  return texts.join("\n");
};

describe("SCOPE-140 — a nightly run end to end (fixture portal, stub MCP)", () => {
  it("a green night: real sign-in through the portal with two-factor, permission refused, items pass, cleanup verified, evidence for SOC 2 only, no secret in any output", async () => {
    const r = await runNightly();
    expect(r.out).toMatch(/3 passed, 0 failed, 0 flaky, 0 not run/);
    expect(r.code).toBe(0);
    const run = called("project.start_test_run").find((c) => !c.args.dryRun)!;
    expect(run.args).toMatchObject({ runnerType: "ci", environment: "uat", runnerRef: "nightly-agent", itemIds: ["id-TC-1", "id-TC-2", "id-TC-FAIL"] });
    expect(called("project.report_test_progress").filter((c) => c.args.status === "pass")).toHaveLength(3);
    expect(called("project.complete_test_run")[0].args).toMatchObject({ status: "completed" });
    // SPEC-140 FR-016: every first-attempt pass is signed off by the Designated Agent.
    expect(called("project.sign_off_test").map((c) => c.args.itemId).sort()).toEqual(["id-TC-1", "id-TC-2", "id-TC-FAIL"]);
    expect(called("project.sign_off_test")[0].args).toMatchObject({ runId: "run-1", label: "nightly-agent" });

    const summary = JSON.parse(readFileSync(join(root, ".wxai/nightly/last-summary.json"), "utf8"));
    expect(summary.permission).toMatchObject({ ok: true, sampled: 1 });
    expect(summary.cleanup).toMatchObject({ choice: "remove", removed: true, leftovers: 0 });
    expect(summary.notTested.join("\n")).toMatch(/Entra ID sign-in is not tested nightly/);
    expect(summary.notTested.join("\n")).toMatch(/first run/);

    // Observations: the page 4 clicks deep and the form out of order, as tasks, never pass/fail.
    const obs = called("project.create_task").map((c) => String(c.args.title));
    expect(obs).toEqual(expect.arrayContaining([expect.stringMatching(/^\[Observation\] \/app\/d: click-depth/), expect.stringMatching(/^\[Observation\] \/app\/form: tab-order/)]));

    // Evidence: SOC 2 written and fingerprinted; HITRUST refused for want of a signed crosswalk.
    const evt = called("project.capture_event");
    const art = evt.filter((c) => c.args.type === "compliance_artifact_written");
    expect(art.map((c) => (c.args.metadata as { framework: string }).framework)).toEqual(["SOC2"]);
    expect(nightlyMetadataIssues("compliance_artifact_written", art[0].args.metadata)).toEqual([]);
    expect(existsSync(join(root, "artifacts/4.5.6/SOC2/evidence.pdf"))).toBe(true);
    expect(readFileSync(join(root, "artifacts/4.5.6/SOC2/evidence.pdf")).subarray(0, 5).toString()).toBe("%PDF-");
    expect(existsSync(join(root, "artifacts/4.5.6/HITRUST"))).toBe(false);
    expect(readFileSync(join(root, ".wxai/nightly/runs", readdirSync(join(root, ".wxai/nightly/runs"))[0], "summary.md"), "utf8")).toMatch(/HITRUST: no signed HITRUST crosswalk/);
    const done = evt.find((c) => c.args.type === "nightly_run_completed")!;
    expect(nightlyMetadataIssues("nightly_run_completed", done.args.metadata)).toEqual([]);
    expect(done.args.actor).toBe("nightly-agent");

    // SC-9: no secret anywhere the run wrote, and the session file is gone.
    const text = allOutputs();
    for (const v of Object.values(PASSWORDS)) expect(text.includes(v), "a secret value leaked").toBe(false);
    expect(readdirSync(join(root, ".wxai/nightly/runs", readdirSync(join(root, ".wxai/nightly/runs"))[0]))).not.toContain("session.json");
  }, 120_000);

  it("a red night: a reachable admin page and a real failure fail the run; one task across two nights; no evidence", async () => {
    state.leak = true;
    const r1 = await runNightly({ FAIL_ONE: "1" });
    expect(r1.code).toBe(1);
    expect(r1.out).toMatch(/2 passed, 1 failed/);
    expect(r1.out).toMatch(/\*\*Failed\*\*: reachable as a normal user: \/app\/admin/);
    expect(r1.out).toMatch(/None written: 1 test\(s\) failed; the permission check did not pass/);
    const failures = () => called("project.create_task").filter((c) => String(c.args.title).startsWith("Nightly failure: TC-FAIL"));
    expect(failures()).toHaveLength(1);
    expect(String(failures()[0].args.descriptionMarkdown)).toMatch(/Failed twice/);
    expect(called("project.capture_event").filter((c) => c.args.type === "compliance_artifact_written")).toHaveLength(0);
    expect(existsSync(join(root, "artifacts"))).toBe(false);

    await runNightly({ FAIL_ONE: "1" });
    expect(failures()).toHaveLength(1); // the same failure the next night: no second task
  }, 180_000);

  it("FR-015: a full run on request selects every machine item once, then clears the flag; a failing item is not signed off", async () => {
    writeConfig({ fullNext: true, rotationSlots: 0, helper: false });
    const r = await runNightly({ FAIL_ONE: "1" });
    expect(r.out).toMatch(/Full run: every machine item in the plan was selected \(3\); nightly\.fullNext is cleared/);
    expect(called("project.start_test_run").find((c) => !c.args.dryRun)!.args.itemIds).toEqual(["id-TC-1", "id-TC-2", "id-TC-FAIL"]);
    expect(JSON.parse(readFileSync(join(root, "docs-workspace/config.json"), "utf8")).nightly.fullNext).toBeUndefined();
    expect(called("project.sign_off_test").map((c) => c.args.itemId).sort()).toEqual(["id-TC-1", "id-TC-2"]);
  }, 120_000);

  it("SC-1: pointed at production, the run refuses before touching anything", async () => {
    writeConfig({ appUrl: "https://prod.example.test/app/" });
    const r = await runNightly();
    expect(r.code).toBe(2);
    expect(r.out).toMatch(/REFUSED before touching anything/);
    expect(called("project.start_test_run")).toHaveLength(0);
    expect(called("project.create_task")).toHaveLength(0);
    expect(existsSync(join(root, "artifacts"))).toBe(false);
  }, 60_000);

  it("a portal that does not offer the app is a setup problem, not an app failure", async () => {
    writeConfig({});
    const cfg = JSON.parse(readFileSync(join(root, "docs-workspace/config.json"), "utf8"));
    cfg.entryPath.appTile = "#no-such-tile";
    writeFileSync(join(root, "docs-workspace/config.json"), JSON.stringify(cfg));
    const r = await runNightly();
    expect(r.out).toMatch(/Setup problems\*\* \(not app failures\)/);
    expect(r.out).toMatch(/Workbench does not offer the app to account "normal-1" \(portal assignment missing\)/);
    expect(r.out).toMatch(/0 passed, 0 failed/);
  }, 60_000);

  it("an item with no automation goes to the agent command, which gets the prompt on stdin and reports back with record", async () => {
    state.noAuto = true;
    state.frameworks = [];
    // A stand-in agent: read the prompt, find the record command it names, run it for this item.
    writeFileSync(join(root, "agent.mjs"), [
      "import { spawnSync } from \"node:child_process\";",
      "let p = \"\"; for await (const c of process.stdin) p += c;",
      "const line = p.split(\"\\n\").find((l) => l.includes(\" record \"));",
      "const script = /node \"([^\"]+)\" record/.exec(line)[1];",
      "const status = process.env.NIGHTLY_ITEM === \"TC-2\" ? \"fail\" : \"pass\";",
      "spawnSync(process.execPath, [script, \"record\", \"--root\", process.cwd(), \"--run\", process.env.NIGHTLY_RUN_ID, \"--item\", process.env.NIGHTLY_ITEM, \"--attempt\", process.env.NIGHTLY_ATTEMPT, \"--status\", status, \"--duration\", \"500\", \"--error\", \"expected Saved\"], { stdio: \"inherit\" });",
    ].join("\n"));
    writeConfig({ testCommand: null, agentCommand: ["node", join(root, "agent.mjs")], helper: false });
    const r = await runNightly();
    expect(r.out).toMatch(/2 passed, 1 failed/);
    expect(called("project.create_task").filter((c) => String(c.args.title).startsWith("Nightly failure: TC-2"))).toHaveLength(1);
    const runDir = join(root, ".wxai/nightly/runs", readdirSync(join(root, ".wxai/nightly/runs"))[0]);
    expect(readdirSync(join(runDir, "records")).sort()).toEqual(["TC-1.1.json", "TC-2.1.json", "TC-2.2.json", "TC-FAIL.1.json"]);
  }, 120_000);

  it("record: the Designated Agent's report of one item lands in the run folder", () => {
    const out = spawnSync(process.execPath, [NIGHTLY, "record", "--root", root, "--run", "n-x", "--item", "TC-7", "--status", "pass", "--duration", "1200"], { encoding: "utf8" });
    expect(out.status).toBe(0);
    expect(JSON.parse(readFileSync(join(root, ".wxai/nightly/runs/n-x/records/TC-7.1.json"), "utf8"))).toMatchObject({ status: "pass", durationMs: 1200 });
    rmSync(root, { recursive: true, force: true });
  });
});
