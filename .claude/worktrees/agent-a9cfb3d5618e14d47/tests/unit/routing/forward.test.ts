// SPEC-143 T006: forward.mjs posts unforwarded run records to a (local mock) endpoint.
import { createServer, type IncomingMessage, type Server } from "node:http";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { afterEach, describe, expect, it } from "vitest";

import { forward, LOCK_REL } from "../../../_wxAI/routing/forward.mjs";
import { findForRoot, saveProjectToken } from "../../../_wxAI/routing/token-store.mjs";

const dirs: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  while (servers.length) await new Promise((r) => (servers.pop() as Server).close(() => r(null)));
});

function project(ids: string[]): string {
  const root = mkdtempSync(join(tmpdir(), "forward-"));
  dirs.push(root);
  mkdirSync(join(root, "decisions"));
  writeFileSync(join(root, "decisions", "agentrun-log.jsonl"), ids.map((id) => JSON.stringify({ id, projectid: null, model: "claude-haiku-5-5" })).join("\n") + "\n");
  return root;
}

async function mock(handler: (req: IncomingMessage, body: string, n: number) => number): Promise<{ url: string; seen: { auth: string | undefined; body: Record<string, unknown> }[] }> {
  const seen: { auth: string | undefined; body: Record<string, unknown> }[] = [];
  let n = 0;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      n++;
      const status = handler(req, body, n);
      if (status < 300) seen.push({ auth: req.headers.authorization, body: JSON.parse(body) });
      res.statusCode = status;
      res.end("{}");
    });
  });
  servers.push(server);
  await new Promise((r) => server.listen(0, "127.0.0.1", () => r(null)));
  const addr = server.address() as { port: number };
  return { url: `http://127.0.0.1:${addr.port}/api/consultant-hub/agent-runs`, seen };
}

describe("forward", () => {
  it("does nothing when the URL is unset", async () => {
    const root = project(["a"]);
    const r = await forward({ root, url: "" });
    expect(r.skipped).toMatch(/No agent-runs URL/);
    expect(r.sent).toBe(0);
  });

  it("posts each record once, with the token, and remembers what it sent", async () => {
    const root = project(["a", "b"]);
    const m = await mock(() => 201);
    const r = await forward({ root, url: m.url, token: "tok-1", baseDelayMs: 1 });
    expect(r.sent).toBe(2);
    expect(m.seen.map((s) => s.body.id)).toEqual(["a", "b"]);
    expect(m.seen[0].auth).toBe("Bearer tok-1");
    expect(readFileSync(join(root, "decisions", "agentrun-forwarded.txt"), "utf8").trim().split("\n")).toEqual(["a", "b"]);
    appendFileSync(join(root, "decisions", "agentrun-log.jsonl"), JSON.stringify({ id: "c" }) + "\n");
    const again = await forward({ root, url: m.url, token: "tok-1", baseDelayMs: 1 });
    expect(again.sent).toBe(1);
    expect(m.seen.map((s) => s.body.id)).toEqual(["a", "b", "c"]);
  });

  it("retries a 503 with backoff and then succeeds", async () => {
    const root = project(["a"]);
    const m = await mock((_r, _b, n) => (n < 3 ? 503 : 201));
    const r = await forward({ root, url: m.url, token: "t", retries: 3, baseDelayMs: 1 });
    expect(r.sent).toBe(1);
    expect(r.failed).toBe(0);
  });

  it("treats a 4xx as a rejection, keeps the record unforwarded, and continues with the rest", async () => {
    const root = project(["bad", "good"]);
    const m = await mock((_r, body) => (JSON.parse(body).id === "bad" ? 400 : 201));
    const r = await forward({ root, url: m.url, token: "t", baseDelayMs: 1 });
    expect(r).toMatchObject({ sent: 1, rejected: 1, failed: 0, pending: 1 });
    expect(readFileSync(join(root, "decisions", "agentrun-forwarded.txt"), "utf8").trim()).toBe("good");
  });

  it("leaves records pending when the server stays down", async () => {
    const root = project(["a"]);
    const m = await mock(() => 500);
    const r = await forward({ root, url: m.url, token: "t", retries: 1, baseDelayMs: 1 });
    expect(r).toMatchObject({ sent: 0, failed: 1 });
  });
});

// [SCOPE 143 / T025] BEGIN — the forwarder reads this machine's token store, sends once, prints no token
describe("forward from the per-machine token store (T025)", () => {
  const TOKEN = "store-token-abcdefghijklmnopqrstuvwxyz";
  const PROJECT_ID = "0192f0a8-1111-7000-8000-000000000001";

  function storeFor(root: string, url: string): string {
    const home = mkdtempSync(join(tmpdir(), "wxai-home-"));
    dirs.push(home);
    const file = join(home, ".wxai", "agentrun-tokens.json");
    saveProjectToken({ projectid: PROJECT_ID, token: TOKEN, root, url, file });
    return file;
  }

  it("finds the project by its folder, sends with the stored token, and fills a null projectid", async () => {
    const root = project(["a"]);
    const m = await mock(() => 200);
    const storeFile = storeFor(root, m.url);
    const r = await forward({ root, storeFile, baseDelayMs: 1 });
    expect(r.sent).toBe(1);
    expect(m.seen[0].auth).toBe(`Bearer ${TOKEN}`);
    expect(m.seen[0].body.projectid).toBe(PROJECT_ID);
  });

  it("sends nothing for a folder with no stored token", async () => {
    const root = project(["a"]);
    const other = project([]);
    const m = await mock(() => 200);
    const storeFile = storeFor(other, m.url);
    const r = await forward({ root, storeFile, baseDelayMs: 1 });
    expect(r.skipped).toMatch(/kit:configure/);
    expect(m.seen).toHaveLength(0);
  });

  it("network down: the record stays pending and goes on the next run, exactly once", async () => {
    const root = project(["a"]);
    const down = await forward({ root, url: "http://127.0.0.1:9/none", token: TOKEN, retries: 0, baseDelayMs: 1 });
    expect(down).toMatchObject({ sent: 0, failed: 1 });
    const m = await mock(() => 200);
    expect((await forward({ root, url: m.url, token: TOKEN, baseDelayMs: 1 })).sent).toBe(1);
    expect((await forward({ root, url: m.url, token: TOKEN, baseDelayMs: 1 })).sent).toBe(0);
    expect(m.seen).toHaveLength(1);
  });

  it("a second forward while one is running sends nothing (lock)", async () => {
    const root = project(["a"]);
    writeFileSync(join(root, LOCK_REL), "12345");
    const m = await mock(() => 200);
    const r = await forward({ root, url: m.url, token: TOKEN, baseDelayMs: 1 });
    expect(r.skipped).toMatch(/Another forward/);
    expect(m.seen).toHaveLength(0);
  });

  it("the command line never prints the token, whatever happens", () => {
    const root = project(["a"]);
    const home = mkdtempSync(join(tmpdir(), "wxai-home-"));
    dirs.push(home);
    saveProjectToken({ projectid: PROJECT_ID, token: TOKEN, root, url: "http://127.0.0.1:9/none", file: join(home, ".wxai", "agentrun-tokens.json") });
    const out = spawnSync(process.execPath, [join(process.cwd(), "_wxAI", "routing", "forward.mjs"), "--root", root], {
      encoding: "utf8",
      env: { ...process.env, WXAI_HOME: home, WXAI_AGENTRUNS_URL: "" },
      timeout: 60_000,
    });
    expect(out.status).toBe(0);
    expect(out.stdout + out.stderr).not.toContain(TOKEN);
    expect(out.stdout).toMatch(/Forwarded 0; rejected 0; failed 1/);
  });
});

describe("token-store (T026)", () => {
  it("keeps one entry per folder, returns it by folder, and never by another folder", () => {
    const home = mkdtempSync(join(tmpdir(), "wxai-home-"));
    dirs.push(home);
    const file = join(home, ".wxai", "agentrun-tokens.json");
    const root = project([]);
    saveProjectToken({ projectid: "0192f0a8-1111-7000-8000-000000000001", token: "first-token-abcdefghijklmnop", root, file });
    saveProjectToken({ projectid: "0192f0a8-1111-7000-8000-000000000002", token: "second-token-abcdefghijklmnop", root, file });
    expect(findForRoot(root, file)).toMatchObject({ projectid: "0192f0a8-1111-7000-8000-000000000002", token: "second-token-abcdefghijklmnop" });
    expect(findForRoot(project([]), file)).toBeNull();
    expect(Object.keys(JSON.parse(readFileSync(file, "utf8")).projects)).toHaveLength(1);
  });

  it("refuses a malformed project id or a short token", () => {
    const file = join(mkdtempSync(join(tmpdir(), "wxai-home-")), "s.json");
    dirs.push(join(file, ".."));
    expect(() => saveProjectToken({ projectid: "nope", token: "x".repeat(30), root: ".", file })).toThrow(/UUID/);
    expect(() => saveProjectToken({ projectid: "0192f0a8-1111-7000-8000-000000000001", token: "short", root: ".", file })).toThrow(/short/);
  });

  it("--save reads the token from stdin and prints only the project id", () => {
    const home = mkdtempSync(join(tmpdir(), "wxai-home-"));
    dirs.push(home);
    const root = project([]);
    const secret = "stdin-token-abcdefghijklmnopqrstuv";
    const script = join(process.cwd(), "_wxAI", "routing", "token-store.mjs");
    const saved = spawnSync(process.execPath, [script, "--save", "--project", "0192f0a8-1111-7000-8000-000000000003", "--root", root], {
      input: secret, encoding: "utf8", env: { ...process.env, WXAI_HOME: home },
    });
    expect(saved.status).toBe(0);
    expect(saved.stdout + saved.stderr).not.toContain(secret);
    const check = spawnSync(process.execPath, [script, "--check", "--root", root], { encoding: "utf8", env: { ...process.env, WXAI_HOME: home } });
    expect(check.status).toBe(0);
    expect(check.stdout).not.toContain(secret);
  });
});
// [SCOPE 143 / T025] END

// [SCOPE 143 / T025] BEGIN — the hook launcher returns at once and its detached forward still sends
describe("forward-hook (T025)", () => {
  it("SessionStart: the hook exits immediately and the detached forward delivers the record", async () => {
    const root = project(["hooked"]);
    const m = await mock(() => 200);
    const started = Date.now();
    const out = spawnSync(process.execPath, [join(process.cwd(), "_wxAI", "routing", "forward-hook.mjs")], {
      input: JSON.stringify({ hook_event_name: "SessionStart", cwd: root }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, WXAI_AGENTRUNS_URL: m.url, WXAI_AGENTRUNS_TOKEN: "t" },
    });
    expect(out.status).toBe(0);
    expect(out.stdout).toBe("");
    expect(Date.now() - started).toBeLessThan(5000);
    // Wait for the detached forward to FINISH (sent marker written, lock released), not just for the
    // request to arrive, or the temp folder is removed while the child still holds files (Windows EBUSY).
    const sentFile = join(root, "decisions", "agentrun-forwarded.txt");
    const lockFile = join(root, LOCK_REL);
    for (let i = 0; i < 100 && !(existsSync(sentFile) && !existsSync(lockFile)); i++) await new Promise((r) => setTimeout(r, 100));
    expect(m.seen.map((s) => s.body.id)).toEqual(["hooked"]);
    expect(readFileSync(sentFile, "utf8").trim()).toBe("hooked");
  }, 20_000);

  it("ignores other hook events", () => {
    const root = project(["x"]);
    const out = spawnSync(process.execPath, [join(process.cwd(), "_wxAI", "routing", "forward-hook.mjs")], {
      input: JSON.stringify({ hook_event_name: "PreToolUse" }),
      encoding: "utf8",
      env: { ...process.env, CLAUDE_PROJECT_DIR: root, WXAI_AGENTRUNS_URL: "http://127.0.0.1:9/none" },
    });
    expect(out.status).toBe(0);
  });
});
// [SCOPE 143 / T025] END

// [SCOPE 143 / T025] BEGIN — the default target is the app host, which serves the route
describe("default agent-runs URL", () => {
  it("is the app host's agent-runs route, not the marketing site", async () => {
    const { DEFAULT_AGENTRUNS_URL } = await import("../../../_wxAI/routing/token-store.mjs");
    expect(DEFAULT_AGENTRUNS_URL).toBe("https://wxkanban.wxperts.com/api/consultant-hub/agent-runs");
  });
});
// [SCOPE 143 / T025] END
