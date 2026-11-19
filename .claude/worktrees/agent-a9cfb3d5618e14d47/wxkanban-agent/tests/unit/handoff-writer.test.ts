import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { Writable } from "stream";
import pino from "pino";
import {
  BLOCKED_LINES,
  HANDOFF_MAX_CHARS,
  HANDOFF_NAME_RE,
  TRUNCATED_MARKER,
  capSummary,
  handoffFileName,
  preflight,
  preflightEnv,
  redactSecrets,
  renderHandoff,
  readHandoffInput,
  runHandoff,
  stripContents,
} from "../../apps/remote-bridge/src/handoff-writer";
import { recordRefusal } from "../../apps/remote-bridge/src/agent-status";

// [SCOPE 149 / T002] BEGIN — HANDOFF REMOTE writer tests (FR-001 – FR-005, FR-017 masked)
//
// No network: fetch is stubbed and the app base URL points at an unroutable host, so nothing
// can reach a real wxKanban, room or database. A temp directory stands in for the repo.

const LIVE_PID = 424242;

function makeRepo(opts: { token?: boolean } = {}): string {
  const root = mkdtempSync(join(tmpdir(), "handoff-"));
  mkdirSync(join(root, ".wxai"), { recursive: true });
  if (opts.token !== false) {
    writeFileSync(join(root, ".wxai", "project.json"), JSON.stringify({ kit: { apiToken: "test-kit-token" } }));
  }
  return root;
}

function holdLock(root: string, pid = LIVE_PID, owner = "project agent"): void {
  writeFileSync(join(root, ".wxai", "remote-session.lock"), JSON.stringify({ pid, owner, since: new Date().toISOString() }));
}

function stubSettings(allowRemote: boolean | "throw"): ReturnType<typeof vi.fn> {
  const fn = vi.fn(async () => {
    if (allowRemote === "throw") throw new Error("ECONNREFUSED");
    return new Response(JSON.stringify({ allowRemote, projectName: "p", feedbackSink: false }), { status: 200 });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

const ENV = { WXKANBAN_APP_BASE_URL: "http://stub.invalid" } as NodeJS.ProcessEnv;
const alive = (pid: number): boolean => pid === LIVE_PID;

function listTree(root: string, rel = ""): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(root, rel), { withFileTypes: true })) {
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) out.push(...listTree(root, p));
    else out.push(p);
  }
  return out.sort();
}

describe("handoff writer — preflight (FR-002)", () => {
  let root: string;
  beforeEach(() => {
    root = makeRepo();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it("passes when Allow remote is on and a live project agent holds the lock", async () => {
    stubSettings(true);
    holdLock(root);
    expect(await preflight({ repoRoot: root, env: ENV, pidAlive: alive })).toEqual({ ok: true });
  });

  it("asks only the read-only settings route, never the room route", async () => {
    const fetchFn = stubSettings(true);
    holdLock(root);
    await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(String(fetchFn.mock.calls[0][0])).toBe("http://stub.invalid/api/project-agent/settings");
  });

  it("names Allow remote off", async () => {
    stubSettings(false);
    holdLock(root);
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(r).toEqual({ ok: false, cause: "remote_not_allowed", line: BLOCKED_LINES.remote_not_allowed });
  });

  it("names a recorded no_company_account refusal, not 'not running'", async () => {
    stubSettings(true);
    recordRefusal(root, "no_company_account");
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.cause).toBe("no_company_account");
      expect(r.line).toMatch(/no YappChatt account/);
    }
  });

  it("names a recorded worktree_locked refusal", async () => {
    stubSettings(true);
    recordRefusal(root, "worktree_locked");
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(!r.ok && r.cause).toBe("worktree_locked");
  });

  it("says 'not running' with no lock and no refusal on record", async () => {
    stubSettings(true);
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(r).toEqual({ ok: false, cause: "agent_not_running", line: BLOCKED_LINES.agent_not_running });
  });

  it("says 'not running' when the lock's pid is dead", async () => {
    stubSettings(true);
    holdLock(root, 999);
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(!r.ok && r.cause).toBe("agent_not_running");
  });

  it("ignores a stale refusal when a live project agent holds the lock", async () => {
    stubSettings(true);
    recordRefusal(root, "no_company_account");
    holdLock(root);
    expect(await preflight({ repoRoot: root, env: ENV, pidAlive: alive })).toEqual({ ok: true });
  });

  it("does not count a lock held by something other than the project agent", async () => {
    stubSettings(true);
    holdLock(root, LIVE_PID, "remote bridge");
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(!r.ok && r.cause).toBe("agent_not_running");
  });

  it("stops when the project has no kit token", async () => {
    const bare = makeRepo({ token: false });
    stubSettings(true);
    const r = await preflight({ repoRoot: bare, env: ENV, pidAlive: alive });
    expect(!r.ok && r.cause).toBe("no_token");
    rmSync(bare, { recursive: true, force: true });
  });

  it("stops when the settings route cannot be reached", async () => {
    stubSettings("throw");
    holdLock(root);
    const r = await preflight({ repoRoot: root, env: ENV, pidAlive: alive });
    expect(!r.ok && r.cause).toBe("settings_unreachable");
  });

  it("each blocked line is one plain line naming a fix", () => {
    for (const line of Object.values(BLOCKED_LINES)) {
      expect(line).not.toMatch(/\n/);
      expect(line).toMatch(/^Handoff stopped: .+ Fix: .+/);
    }
  });
});

describe("handoff writer — template, cap and contents (FR-003)", () => {
  it("renders every field as 'none' when empty", () => {
    const { doc } = renderHandoff({}, new Date("2026-10-27T20:00:00.000Z"));
    expect(doc.startsWith("created-at: 2026-10-27T20:00:00.000Z\nmasked: 0\n")).toBe(true);
    for (const h of ["Repo and branch", "Working on", "Done", "In flight", "Blocked or waiting on a decision", "Uncommitted work", "Next step", "Where to resume"]) {
      expect(doc).toContain(`## ${h}\nnone`);
    }
  });

  it("renders the filled fields, uncommitted work as a count and names", () => {
    const { doc } = renderHandoff(
      {
        repo: "wxKanban",
        branch: "main",
        workingOn: "SCOPE-149 / T002",
        done: ["writer", "tests"],
        uncommitted: { count: 2, files: ["a.ts", "b.ts"] },
        nextStep: "T003",
      },
      new Date(),
    );
    expect(doc).toContain("## Repo and branch\nwxKanban · branch main");
    expect(doc).toContain("## Done\n- writer\n- tests");
    expect(doc).toContain("## Uncommitted work\n2 files:\n- a.ts\n- b.ts");
    expect(doc).toContain("## In flight\nnone");
  });

  it("cuts a long summary at 2,000 characters with a visible marker line", () => {
    const { doc } = renderHandoff({ done: "x ".repeat(3000) }, new Date());
    expect(doc.length).toBeLessThanOrEqual(HANDOFF_MAX_CHARS);
    expect(doc.endsWith(`\n${TRUNCATED_MARKER}`)).toBe(true);
    expect(capSummary("short")).toBe("short");
  });

  it("drops file bodies and diffs from a field", () => {
    const diff = ["diff --git a/x.ts b/x.ts", "index 1234567..89abcde 100644", "--- a/x.ts", "+++ b/x.ts", "@@ -1,2 +1,2 @@", "-const old = 1;", "+const neu = 2;"].join("\n");
    const out = stripContents(`changed x.ts\n${diff}`);
    expect(out).toContain("changed x.ts");
    expect(out).toContain("[diff removed]");
    expect(out).not.toMatch(/const (old|neu)/);
    const body = stripContents("see file:\n```ts\nexport const secretSauce = 42;\n```\nend");
    expect(body).not.toContain("secretSauce");
    expect(body).toContain("[file content removed]");
  });

  it("names each file once and never its contents in uncommitted work", () => {
    const { doc } = renderHandoff({ uncommitted: { files: ["ok.ts", "bad\nname"] } }, new Date());
    expect(doc).toContain("1 file:\n- ok.ts");
    expect(doc).not.toContain("bad");
  });

  it("treats non-object or malformed input as an empty handoff, and refuses oversized input", () => {
    expect(readHandoffInput("")).toEqual({});
    expect(readHandoffInput("[1,2]")).toEqual({});
    expect(readHandoffInput(JSON.stringify({ done: 7, repo: "r" })).repo).toBe("r");
    expect(() => readHandoffInput("x".repeat(70 * 1024))).toThrow(/over 64 KB/);
  });

  it("file names follow the timestamp shape", () => {
    const name = handoffFileName(new Date("2026-10-27T20:15:00.123Z"));
    expect(name).toBe("20261027T201500123Z.md");
    expect(HANDOFF_NAME_RE.test(name)).toBe(true);
  });
});

describe("handoff writer — redaction masks, never blocks (FR-004)", () => {
  const PLANTED = {
    key: "sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWx",
    yca: "yca_9fZq2LmX8vB3nT7k",
    conn: "postgres://user:pass@host/db",
    bearer: "Bearer abcdef1234567890ghijkl",
    password: "password=hunter2-correct-horse",
  };

  it("masks each of the five planted patterns, counting five", () => {
    const text = [
      `api key ${PLANTED.key}`,
      `room token ${PLANTED.yca}`,
      `db at ${PLANTED.conn}`,
      `header Authorization: ${PLANTED.bearer}`,
      `env ${PLANTED.password}`,
    ].join("\n");
    const { text: out, masked } = redactSecrets(text);
    expect(masked).toBe(5);
    expect(out).not.toContain("sk-ant-api03");
    expect(out).not.toContain("yca_9fZq");
    expect(out).not.toContain("user:pass@host");
    expect(out).not.toContain("abcdef1234567890ghijkl");
    expect(out).not.toContain("hunter2");
    expect(out).toContain("password=[redacted]");
    expect(out).toContain("Bearer [redacted]");
  });

  it("leaves commit SHAs, UUIDs and plain words alone", () => {
    const text = "commit 2227bbfc1e0a4f5b6c7d8e9f0a1b2c3d4e5f6a7b, task 2db64da9-d468-4e14-9946-fbb1eaa91a56, the old table";
    const { text: out, masked } = redactSecrets(text);
    expect(masked).toBe(0);
    expect(out).toBe(text);
  });

  it("does not read a dollar sign in a secret as a replacement pattern", () => {
    const { text: out, masked } = redactSecrets("password=$&$1$$ and then");
    expect(masked).toBe(1);
    expect(out).toBe("password=[redacted] and then");
  });

  it("masks a bare kit-style token", () => {
    const { masked } = redactSecrets("token Xk3pQ9rT2vW8yZ1aB4cD6eF7gH0jK5mN-oP_sR");
    expect(masked).toBe(1);
  });
});

describe("handoff writer — run: exactly one file, nothing else (FR-001, FR-005)", () => {
  let root: string;
  beforeEach(() => {
    root = makeRepo();
    stubSettings(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it("writes exactly one .wxai/handoff/<timestamp>.md, masked, and reports path and count", async () => {
    holdLock(root);
    const before = listTree(root);
    const r = await runHandoff(
      { repo: "wxKanban", nextStep: "check postgres://user:pass@host/db with yca_9fZq2LmX8vB3nT7k" },
      { repoRoot: root, env: ENV, pidAlive: alive, now: () => new Date("2026-10-27T20:15:00.123Z") },
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.relPath).toBe(".wxai/handoff/20261027T201500123Z.md");
    expect(r.masked).toBe(2);
    expect(r.line).toBe(
      "Handoff written: .wxai/handoff/20261027T201500123Z.md (2 items masked). The Project Agent will post it to the room.",
    );
    const after = listTree(root);
    expect(after.filter((p) => !before.includes(p))).toEqual([".wxai/handoff/20261027T201500123Z.md"]);
    const body = readFileSync(join(root, ".wxai", "handoff", "20261027T201500123Z.md"), "utf-8");
    expect(body).toContain("masked: 2");
    expect(body).not.toContain("user:pass");
    expect(body).not.toContain("yca_9fZq");
  });

  // MODIFIED-BY: [SCOPE 149 / T003] — the write ensures the .gitignore entries (owner Option 2)
  it("ensures both .gitignore entries in an existing project when it writes, and only then", async () => {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    const blockedRun = await runHandoff({ done: "x" }, { repoRoot: root, env: ENV, pidAlive: alive });
    expect(blockedRun.ok).toBe(false);
    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe("node_modules/\n");
    holdLock(root);
    await runHandoff({ done: "x" }, { repoRoot: root, env: ENV, pidAlive: alive });
    await runHandoff({ done: "y" }, { repoRoot: root, env: ENV, pidAlive: alive });
    const gi = readFileSync(join(root, ".gitignore"), "utf-8").split(/\r?\n/);
    expect(gi.filter((l) => l === "**/.wxai/handoff/")).toHaveLength(1);
    expect(gi.filter((l) => l === "**/.wxai/project-agent-status.json")).toHaveLength(1);
  });

  it("a blocked run writes nothing and leaves .wxai/handoff/ unchanged", async () => {
    const before = listTree(root);
    const r = await runHandoff({ done: "x" }, { repoRoot: root, env: ENV, pidAlive: alive });
    expect(r.ok).toBe(false);
    expect(listTree(root)).toEqual(before);
  });

  it("logs a masked event with counts and never the content", async () => {
    holdLock(root);
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk: Buffer, _enc, cb) {
        lines.push(chunk.toString());
        cb();
      },
    });
    const logger = pino({ base: { component: "handoff" } }, sink);
    await runHandoff(
      { workingOn: "PLANTED-SUMMARY-TEXT", nextStep: "password=hunter2xyz" },
      { repoRoot: root, env: ENV, pidAlive: alive, logger },
    );
    expect(lines).toHaveLength(1);
    const rec = JSON.parse(lines[0]) as Record<string, unknown>;
    expect(rec.event).toBe("masked");
    expect(rec.masked).toBe(1);
    expect(typeof rec.createdAt).toBe("string");
    expect(lines[0]).not.toContain("PLANTED-SUMMARY-TEXT");
    expect(lines[0]).not.toContain("hunter2");
  });
});

describe("handoff writer — token kept only in the repo's .env (FR-002, amended 2026-10-28)", () => {
  let root: string;
  beforeEach(() => {
    root = makeRepo({ token: false });
    writeFileSync(
      join(root, ".env"),
      [
        'WXKANBAN_API_TOKEN="dotenv-kit-token"',
        "WXKANBAN_APP_BASE_URL=http://stub.invalid # comment",
        "DATABASE_URL=postgres://u:p@h/db",
        "YAPPCHATT_API_KEY=not-for-the-writer",
      ].join("\n"),
    );
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    rmSync(root, { recursive: true, force: true });
  });

  it("finds the token the agent finds, so the preflight passes", async () => {
    stubSettings(true);
    holdLock(root);
    expect((await preflight({ repoRoot: root, env: {}, pidAlive: alive })).ok).toBe(false);
    expect(await preflight({ repoRoot: root, env: preflightEnv(root, {}), pidAlive: alive })).toEqual({ ok: true });
  });

  it("reads only the three preflight keys and strips quotes and comments", () => {
    const env = preflightEnv(root, {});
    expect(env).toEqual({ WXKANBAN_API_TOKEN: "dotenv-kit-token", WXKANBAN_APP_BASE_URL: "http://stub.invalid" });
  });

  it("lets a real environment variable win and leaves the given env unchanged", () => {
    const given = { WXKANBAN_API_TOKEN: "real-env-token" } as NodeJS.ProcessEnv;
    expect(preflightEnv(root, given).WXKANBAN_API_TOKEN).toBe("real-env-token");
    expect(given).toEqual({ WXKANBAN_API_TOKEN: "real-env-token" });
  });

  it("returns the env as given when the repo has no .env", () => {
    rmSync(join(root, ".env"));
    expect(preflightEnv(root, { A: "1" })).toEqual({ A: "1" });
  });
});
// [SCOPE 149 / T002] END
