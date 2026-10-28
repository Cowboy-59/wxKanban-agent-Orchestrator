// SPEC-149 T010 (FR-002) — the project agent records why it refused to start, in a local file.
// Real temp directory; no network, no real repo paths.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { clearRefusal, readRefusal, recordRefusal, statusPath } from "../../apps/remote-bridge/src/agent-status";

// [SCOPE 149 / T010] BEGIN — agent status file tests
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "agent-status-"));
});

afterEach(() => {
  vi.restoreAllMocks();
  rmSync(root, { recursive: true, force: true });
});

describe("recordRefusal", () => {
  it("writes exactly { refused, at } and leaves nothing else behind", () => {
    const now = new Date("2026-10-27T12:00:00.000Z");
    expect(recordRefusal(root, "remote_not_allowed", now)).toBe(true);
    const parsed = JSON.parse(readFileSync(statusPath(root), "utf-8")) as Record<string, unknown>;
    expect(Object.keys(parsed).sort()).toEqual(["at", "refused"]);
    expect(parsed).toEqual({ refused: "remote_not_allowed", at: "2026-10-27T12:00:00.000Z" });
    expect(readdirSync(join(root, ".wxai"))).toEqual(["project-agent-status.json"]);
  });

  it("records an invalid code as unknown", () => {
    expect(recordRefusal(root, "has spaces and $ymbols")).toBe(true);
    expect(readRefusal(root)?.refused).toBe("unknown");
    expect(recordRefusal(root, "user@example.com")).toBe(true);
    expect(readRefusal(root)?.refused).toBe("unknown");
  });

  it("returns false and does not throw when the write fails", () => {
    writeFileSync(join(root, ".wxai"), "a file where the folder should be");
    expect(() => recordRefusal(root, "worktree_locked")).not.toThrow();
    expect(recordRefusal(root, "worktree_locked")).toBe(false);
  });

  it("returns false, removes the temp file and does not throw when the rename fails", () => {
    // A non-empty directory where the status file belongs makes the rename fail.
    mkdirSync(join(root, ".wxai", "project-agent-status.json"), { recursive: true });
    writeFileSync(join(root, ".wxai", "project-agent-status.json", "keep"), "x");
    expect(recordRefusal(root, "worktree_locked")).toBe(false);
    expect(readdirSync(join(root, ".wxai")).filter((f) => f.endsWith(".tmp"))).toEqual([]);
  });
});

describe("clearRefusal", () => {
  it("removes the file", () => {
    recordRefusal(root, "http_502");
    expect(existsSync(statusPath(root))).toBe(true);
    clearRefusal(root);
    expect(existsSync(statusPath(root))).toBe(false);
  });

  it("is a no-op when nothing is there", () => {
    expect(() => clearRefusal(root)).not.toThrow();
    expect(existsSync(statusPath(root))).toBe(false);
  });
});

describe("readRefusal", () => {
  const put = (text: string) => {
    mkdirSync(join(root, ".wxai"), { recursive: true });
    writeFileSync(statusPath(root), text);
  };

  it("round-trips a recorded refusal", () => {
    recordRefusal(root, "no_company_account", new Date("2026-10-27T01:02:03.000Z"));
    expect(readRefusal(root)).toEqual({ refused: "no_company_account", at: "2026-10-27T01:02:03.000Z" });
  });

  it("returns only the two fields", () => {
    put(JSON.stringify({ refused: "x_code", at: "2026-10-27T00:00:00.000Z", token: "secret" }));
    expect(readRefusal(root)).toEqual({ refused: "x_code", at: "2026-10-27T00:00:00.000Z" });
  });

  it("returns null for missing, garbage, wrong types, bad code and bad date", () => {
    expect(readRefusal(root)).toBeNull();
    put("not json {");
    expect(readRefusal(root)).toBeNull();
    put("[]");
    expect(readRefusal(root)).toBeNull();
    put("null");
    expect(readRefusal(root)).toBeNull();
    put(JSON.stringify({ refused: 5, at: "2026-10-27T00:00:00.000Z" }));
    expect(readRefusal(root)).toBeNull();
    put(JSON.stringify({ refused: "ok_code", at: 12345 }));
    expect(readRefusal(root)).toBeNull();
    put(JSON.stringify({ refused: "bad code!", at: "2026-10-27T00:00:00.000Z" }));
    expect(readRefusal(root)).toBeNull();
    put(JSON.stringify({ refused: "ok_code", at: "not a date" }));
    expect(readRefusal(root)).toBeNull();
  });
});

describe("main.ts wiring", () => {
  // main.ts runs main() on import, so the order is asserted from the source text.
  const src = readFileSync(join(__dirname, "../../apps/remote-bridge/src/main.ts"), "utf-8");

  it("records the worktree-lock refusal before exit 3", () => {
    const rec = src.indexOf("recordRefusal(REPO_ROOT, WORKTREE_LOCKED)");
    const exit = src.indexOf("process.exit(3)");
    expect(rec).toBeGreaterThan(-1);
    expect(rec).toBeLessThan(exit);
  });

  it("records the connect refusal code before exit 4", () => {
    // SPEC-151: an agent_already_connected refusal keeps its own code; every other cause still maps through refusalCode.
    const code = src.indexOf("const code = err instanceof AgentAlreadyConnectedError ? err.code : refusalCode(err)");
    const rec = src.indexOf("recordRefusal(REPO_ROOT, code)");
    const exit = src.indexOf("process.exit(4)");
    expect(code).toBeGreaterThan(-1);
    expect(rec).toBeGreaterThan(code);
    expect(rec).toBeLessThan(exit);
  });

  it("SPEC-151: opens the connection record after the room binds and before the refusal is cleared", () => {
    const connect = src.indexOf("await connectProjectAgent(");
    const open = src.indexOf("await record.open()");
    const clear = src.indexOf("clearRefusal(REPO_ROOT)");
    expect(open).toBeGreaterThan(connect);
    expect(clear).toBeGreaterThan(open);
  });

  it("SPEC-151: heartbeats with the bridge's state and closes the record inside the shutdown bound", () => {
    expect(src).toContain("record?.startHeartbeat(() => bridge.connectionState())");
    expect(src).toContain("Promise.allSettled([bridge.shutdown(), record?.close()])");
  });

  it("clears the status after the room connects", () => {
    const connect = src.indexOf("await connectProjectAgent(");
    const clear = src.indexOf("clearRefusal(REPO_ROOT)");
    expect(clear).toBeGreaterThan(connect);
  });
});
// [SCOPE 149 / T010] END

// [SCOPE 149 / T003] BEGIN — recordRefusal keeps the status file and handoff folder gitignored (FR-005)
describe("recordRefusal and .gitignore", () => {
  it("appends both entries to an existing .gitignore, once", () => {
    writeFileSync(join(root, ".gitignore"), "node_modules/\n");
    expect(recordRefusal(root, "remote_not_allowed")).toBe(true);
    expect(recordRefusal(root, "remote_not_allowed")).toBe(true);
    const lines = readFileSync(join(root, ".gitignore"), "utf-8").split(/\r?\n/);
    expect(lines[0]).toBe("node_modules/");
    expect(lines.filter((l) => l === "**/.wxai/handoff/")).toHaveLength(1);
    expect(lines.filter((l) => l === "**/.wxai/project-agent-status.json")).toHaveLength(1);
  });

  it("never creates a .gitignore", () => {
    expect(recordRefusal(root, "remote_not_allowed")).toBe(true);
    expect(existsSync(join(root, ".gitignore"))).toBe(false);
  });

  it("leaves a .gitignore that ignores .wxai/ wholesale untouched", () => {
    writeFileSync(join(root, ".gitignore"), ".wxai/\n");
    expect(recordRefusal(root, "remote_not_allowed")).toBe(true);
    expect(readFileSync(join(root, ".gitignore"), "utf-8")).toBe(".wxai/\n");
  });
});
// [SCOPE 149 / T003] END
