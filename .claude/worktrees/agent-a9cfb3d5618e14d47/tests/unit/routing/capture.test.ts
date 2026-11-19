// SPEC-143 T004 / FR-003: run capture builds C1 records from Claude Code transcripts.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { appendRecords, buildSessionRecords, buildSubagentRecord, capture, deterministicId } from "../../../_wxAI/routing/capture-worker.mjs";
import { captureStatus, installCapture } from "../../../_wxAI/routing/install.mjs";

const dirs: string[] = [];
const tmp = (): string => {
  const d = mkdtempSync(join(tmpdir(), "capture-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

type L = Record<string, unknown>;
const T0 = Date.parse("2026-10-23T17:00:00.000Z");
const at = (sec: number): string => new Date(T0 + sec * 1000).toISOString();
const usage = (i: number, o: number, cr: number, cw: number) => ({ input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cw });
const asst = (sec: number, id: string, model: string, u: ReturnType<typeof usage>): L => ({ type: "assistant", timestamp: at(sec), uuid: `u-${sec}-${id}`, message: { id, model, role: "assistant", usage: u, content: [{ type: "text", text: "SECRET-REPLY" }] } });
const user = (sec: number, text: string): L => ({ type: "user", timestamp: at(sec), uuid: `p-${sec}`, message: { role: "user", content: text } });
const toolResult = (sec: number): L => ({ type: "user", timestamp: at(sec), uuid: `r-${sec}`, message: { role: "user", content: [{ type: "tool_result", tool_use_id: "t", content: "ok" }] } });
const write = (file: string, lines: L[]): string => {
  mkdirSync(join(file, ".."), { recursive: true });
  writeFileSync(file, lines.map((l) => JSON.stringify(l)).join("\n") + "\n");
  return file;
};

describe("subagent records", () => {
  const lines = [
    user(0, "do the thing"),
    asst(4, "m1", "claude-haiku-5-5", usage(10, 20, 1000, 50)),
    { ...asst(4, "m1", "claude-haiku-5-5", usage(10, 20, 1000, 50)), uuid: "dup" }, // same reply, second line
    toolResult(6),
    asst(9, "m2", "claude-haiku-5-5", usage(5, 7, 2000, 0)),
    asst(10, "syn", "<synthetic>", usage(99, 99, 99, 99)),
  ];

  it("sums per message id, ignores synthetic, takes the model from the transcript", () => {
    const f = write(join(tmp(), "agent-a1.jsonl"), lines);
    const r = buildSubagentRecord({ sessionId: "s1", agentId: "a1", agentType: "general-purpose", transcriptPath: f, projectid: null });
    expect(r).toMatchObject({
      kind: "subagent", command: "general-purpose", model: "claude-haiku-5-5", provider: "anthropic-subscription", route: "official",
      inputtokens: 15, outputtokens: 27, cachereadtokens: 3000, cachewritetokens: 50,
      difficulty: null, taskid: null, escalated: false, comparisonid: null,
      starttime: at(0), endtime: at(10),
    });
    expect(r.activeseconds + r.waitingseconds).toBe(10);
    expect(JSON.stringify(r)).not.toContain("SECRET");
    expect(JSON.stringify(r)).not.toContain("do the thing");
  });

  it("picks the model that served the most output tokens", () => {
    const f = write(join(tmp(), "agent-a2.jsonl"), [asst(1, "a", "claude-haiku-5-5", usage(1, 5, 0, 0)), asst(2, "b", "claude-sonnet-5-5", usage(1, 50, 0, 0))]);
    expect(buildSubagentRecord({ sessionId: "s1", agentId: "a2", agentType: null, transcriptPath: f, projectid: null }).model).toBe("claude-sonnet-5-5");
  });

  it("returns null for a missing transcript or one with no assistant usage", () => {
    expect(buildSubagentRecord({ sessionId: "s", agentId: "x", agentType: null, transcriptPath: join(tmp(), "nope.jsonl"), projectid: null })).toBeNull();
    const f = write(join(tmp(), "e.jsonl"), [user(0, "hi")]);
    expect(buildSubagentRecord({ sessionId: "s", agentId: "x", agentType: null, transcriptPath: f, projectid: null })).toBeNull();
  });
});

describe("active and waiting seconds", () => {
  it("counts gaps of at most 2 minutes as active and longer gaps as waiting; they add up to wall time", () => {
    const f = write(join(tmp(), "a.jsonl"), [
      asst(0, "a", "claude-haiku-5-5", usage(1, 1, 0, 0)),
      toolResult(120), // exactly 2 minutes: active
      asst(121 + 200, "b", "claude-haiku-5-5", usage(1, 1, 0, 0)), // 200 s gap: waiting
      asst(321 + 30, "c", "claude-haiku-5-5", usage(1, 1, 0, 0)), // 30 s: active
    ]);
    const r = buildSubagentRecord({ sessionId: "s", agentId: "a", agentType: null, transcriptPath: f, projectid: null });
    expect(r.activeseconds).toBe(150);
    expect(r.waitingseconds).toBe(201);
    expect(r.activeseconds + r.waitingseconds).toBe(351);
  });
});

describe("main-session turns", () => {
  const lines = [
    user(0, "plain prompt"),
    asst(5, "t1", "claude-opus-5-5", usage(100, 200, 5000, 300)),
    toolResult(7),
    asst(9, "t2", "claude-opus-5-5", usage(10, 30, 6000, 0)),
    user(600, "<command-message>dbpush</command-message>\n<command-name>/dbpush</command-name>\n<command-args>--dry-run</command-args>"),
    { ...user(600, "expanded skill text"), isMeta: true },
    asst(630, "t3", "claude-haiku-5-5", usage(7, 9, 100, 10)),
    toolResult(870), // 240 s gap: waiting
    asst(880, "t4", "claude-haiku-5-5", usage(3, 4, 200, 0)),
    user(900, "<local-command-stdout>noise</local-command-stdout>"),
    user(1000, "another prompt with no reply"),
  ];

  it("splits at real prompts, marks slash commands, skips turns without model output", () => {
    const f = write(join(tmp(), "main.jsonl"), lines);
    const recs = buildSessionRecords({ sessionId: "sess", transcriptPath: f, projectid: null });
    expect(recs).toHaveLength(2);
    expect(recs[0]).toMatchObject({ kind: "session", command: null, model: "claude-opus-5-5", inputtokens: 110, outputtokens: 230, cachereadtokens: 11000, cachewritetokens: 300 });
    expect(recs[1]).toMatchObject({ kind: "command", command: "dbpush", model: "claude-haiku-5-5", inputtokens: 10, outputtokens: 13, cachereadtokens: 300 });
    expect(recs[1].waitingseconds).toBe(240);
    expect(recs[1].activeseconds + recs[1].waitingseconds).toBe(900 - 600);
    expect(new Set(recs.map((r: { id: string }) => r.id)).size).toBe(2);
    expect(recs[0].id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
  });

  it("derives the same ids on every run", () => {
    expect(deterministicId("s|turn|0")).toBe(deterministicId("s|turn|0"));
    expect(deterministicId("s|turn|0")).not.toBe(deterministicId("s|turn|1"));
  });
});

describe("log writing", () => {
  it("is idempotent: capture twice writes each record once", () => {
    const root = tmp();
    const main = write(join(root, "t", "main.jsonl"), [user(0, "hi"), asst(2, "m", "claude-opus-5-5", usage(1, 2, 3, 4))]);
    const sub = write(join(root, "t", "sess", "subagents", "agent-q.jsonl"), [asst(1, "s", "claude-haiku-5-5", usage(1, 1, 1, 1))]);
    const stop = { event: "Stop", root, sessionId: "sess", transcriptPath: main };
    const subStop = { event: "SubagentStop", root, sessionId: "sess", agentId: "q", agentType: "Explore", agentTranscriptPath: sub };
    expect(capture(stop)).toHaveLength(1);
    expect(capture(stop)).toHaveLength(0);
    expect(capture(subStop)).toHaveLength(1);
    // the PostToolUse backstop derives the same sidecar path and the same id
    expect(capture({ event: "PostToolUse", root, sessionId: "sess", agentId: "q", agentType: "Explore", transcriptPath: main, status: "completed" })).toHaveLength(0);
    const log = readFileSync(join(root, "decisions", "agentrun-log.jsonl"), "utf8").trim().split("\n");
    expect(log).toHaveLength(2);
    expect(existsSync(join(root, "decisions", ".agentrun-log.lock"))).toBe(false);
  });

  it("appendRecords skips ids already in the log", () => {
    const root = tmp();
    expect(appendRecords(root, [{ id: "1" }, { id: "2" }])).toHaveLength(2);
    expect(appendRecords(root, [{ id: "2" }, { id: "3" }])).toHaveLength(1);
  });
});

describe("hook entry", () => {
  it("exits fast and the detached worker writes the record", async () => {
    const root = tmp();
    const hookFile = join(process.cwd(), "_wxAI", "routing", "capture-hook.mjs");
    const sub = write(join(root, "agent-z.jsonl"), [asst(1, "s", "claude-haiku-5-5", usage(4, 5, 6, 7)), asst(3, "s2", "claude-haiku-5-5", usage(1, 1, 1, 1))]);
    const input = JSON.stringify({ hook_event_name: "SubagentStop", session_id: "hs", agent_id: "z", agent_type: "general-purpose", agent_transcript_path: sub, cwd: root, transcript_path: join(root, "m.jsonl") });
    const t = Date.now();
    const res = spawnSync(process.execPath, [hookFile], { input, env: { ...process.env, CLAUDE_PROJECT_DIR: root }, encoding: "utf8" });
    expect(res.status).toBe(0);
    expect(res.stdout).toBe("");
    expect(Date.now() - t).toBeLessThan(3000);
    const log = join(root, "decisions", "agentrun-log.jsonl");
    for (let i = 0; i < 60 && !existsSync(log); i++) await new Promise((r) => setTimeout(r, 100));
    const rec = JSON.parse(readFileSync(log, "utf8").trim());
    expect(rec).toMatchObject({ kind: "subagent", inputtokens: 5, outputtokens: 6 });
  });
});

describe("installer", () => {
  it("installs its entries idempotently, leaves other hooks alone, and uninstalls cleanly", () => {
    const root = tmp();
    mkdirSync(join(root, ".claude"), { recursive: true });
    const other = { matcher: "^Bash$", hooks: [{ type: "command", command: 'node "${CLAUDE_PROJECT_DIR}/_wxAI/impact/hook.mjs"' }] };
    writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify({ model: "x", hooks: { PreToolUse: [other] } }));
    expect(installCapture(root).changed).toBe(true);
    expect(installCapture(root).changed).toBe(false);
    const s = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    // [SCOPE 143 / T025] SessionStart and a second Stop entry run the forwarder
    expect(Object.keys(s.hooks).sort()).toEqual(["PostToolUse", "PreToolUse", "SessionStart", "Stop", "SubagentStop"]);
    expect(s.hooks.Stop).toHaveLength(2);
    expect(JSON.stringify(s.hooks.SessionStart)).toContain("_wxAI/routing/forward-hook.mjs");
    expect(s.hooks.PreToolUse).toHaveLength(2);
    expect(s.hooks.PreToolUse[0]).toEqual(other);
    expect(s.model).toBe("x");
    expect(captureStatus(s)).toBe("current");
    expect(installCapture(root, { mode: "check" }).status).toBe("current");
    installCapture(root, { mode: "uninstall" });
    const after = JSON.parse(readFileSync(join(root, ".claude", "settings.json"), "utf8"));
    expect(after).toEqual({ model: "x", hooks: { PreToolUse: [other] } });
  });

  it("repairs a stale entry", () => {
    const root = tmp();
    mkdirSync(join(root, ".claude"), { recursive: true });
    writeFileSync(join(root, ".claude", "settings.json"), JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: 'node "x/_wxAI/routing/capture-hook.mjs"' }] }] } }));
    expect(installCapture(root, { mode: "check" }).status).toBe("stale");
    installCapture(root);
    expect(installCapture(root, { mode: "check" }).status).toBe("current");
  });
});
