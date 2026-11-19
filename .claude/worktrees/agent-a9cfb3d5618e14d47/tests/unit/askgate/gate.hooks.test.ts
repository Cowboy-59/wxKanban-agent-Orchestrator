// SPEC-142 T008 / T009: the two Ask Gate hooks, driven the way Claude Code drives them.
//
// The spawned tests run the real hook scripts as child processes with hook JSON on stdin, a
// throwaway project as CLAUDE_PROJECT_DIR, and HOME/USERPROFILE pointed at an empty directory so
// the developer's own global tier and memory-service key are never read.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { appendEntry } from "../../../_wxAI/askgate/ledger.mjs";
import { fileBackend } from "../../../_wxAI/askgate/file.mjs";
import { decideAskCall, questionsFrom } from "../../../_wxAI/askgate/hook-tool.mjs";
import { decideStop, finalAssistantText, nobodyToAnswer, trailingQuestions, withoutLeadIn } from "../../../_wxAI/askgate/hook-stop.mjs";

const REPO = process.cwd();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

const PRORATION = {
  scope: "SCOPE-142", question: "How are endorsements prorated?", decision: "Daily, on the endorsement effective date.",
  rationale: "Matches the carrier's billing.", kind: "Agreed", evidence: "confirmed", source: "x", date: "2026-10-22",
};

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function project(mode: "observe" | "enforce"): { root: string; home: string } {
// [SCOPE 142 / T008] END
  const root = mkdtempSync(join(tmpdir(), "askgate-hook-"));
  const home = mkdtempSync(join(tmpdir(), "askgate-home-"));
  temps.push(root, home);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "decisions"));
  writeFileSync(join(root, "decisions", "settings.yaml"), `gate:\n  mode: ${mode}\n  matchThreshold: 0.5\n`);
  appendEntry(root, PRORATION, "owner");
  return { root, home };
}

const logLines = (root: string) => {
  const f = join(root, "decisions", "gate-log.jsonl");
  return existsSync(f) ? readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)) : [];
};

// [SCOPE 142 / T008] BEGIN — Ask Gate PreToolUse hook on AskUserQuestion, installed besi…
function runHook(script: string, input: unknown, root: string, home: string) {
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: home, USERPROFILE: home };
  delete env.OPENVIKING_URL;
  delete env.OPENVIKING_API_KEY;
  const r = spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", script)], { input: JSON.stringify(input), env, encoding: "utf-8", timeout: 20_000 });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, json: r.stdout.trim() ? JSON.parse(r.stdout) : null };
}
// [SCOPE 142 / T008] END

const ask = (question: string, options: { label: string }[] = []) => ({
  session_id: "s-hook", hook_event_name: "PreToolUse", tool_name: "AskUserQuestion", cwd: "x",
  tool_input: { questions: [{ question, header: "Q", multiSelect: false, options }] },
});
const stop = (message: string, active = false, session = "s-stop") => ({
  session_id: session, hook_event_name: "Stop", stop_hook_active: active, last_assistant_message: message, transcript_path: "none",
});
const deps = { backends: [fileBackend], routeBlocker: null };

describe("hook-tool.mjs (PreToolUse on AskUserQuestion)", () => {
  it("reads the questions from tool_input", () => {
    expect(questionsFrom({ questions: [{ question: "A?", options: [{ label: "x" }] }, { question: "B?" }] })).toEqual([
      { text: "A?", options: [{ label: "x" }] }, { text: "B?", options: [] },
    ]);
    expect(questionsFrom({})).toEqual([]);
  });

  it("has no opinion on any other tool (so it can never override the impact hook)", async () => {
    const { root } = project("enforce");
    for (const tool_name of ["Bash", "Edit", "Write", "MultiEdit", "NotebookEdit", "Read"]) {
      expect(await decideAskCall({ hook_event_name: "PreToolUse", tool_name, tool_input: { command: "rm -rf decisions" } }, { root, deps })).toBeNull();
    }
    expect(logLines(root)).toHaveLength(0);
  });

  it("never answers allow", async () => {
    const { root } = project("enforce");
    for (const q of ["How are endorsements prorated?", "Should I push to main?", "Tabs or spaces in the new file?"]) {
      const out = await decideAskCall(ask(q), { root, deps });
      expect(out?.hookSpecificOutput?.permissionDecision).not.toBe("allow");
    }
  });

  it("spawned, enforce: a covered question is denied with the decision and ID", () => {
    const { root, home } = project("enforce");
    const r = runHook("hook-tool.mjs", ask("How are endorsements prorated?"), root, home);
    expect(r.code).toBe(0);
    expect(r.json.hookSpecificOutput).toMatchObject({ hookEventName: "PreToolUse", permissionDecision: "deny" });
    expect(r.json.hookSpecificOutput.permissionDecisionReason).toContain("D-0001");
    expect(r.json.systemMessage).toBe("Ask Gate: memory service not installed (file search) [enforce]");
    expect(logLines(root)).toMatchObject([{ intercept: "tool", outcome: "answered", session: "s-hook" }]);
  });

  it("spawned, enforce: a blocker gets no decision (it reaches the developer)", () => {
    const { root, home } = project("enforce");
    const r = runHook("hook-tool.mjs", ask("Should I deploy this to App Runner tonight?"), root, home);
    expect(r.code).toBe(0);
    expect(r.json.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(r.json.systemMessage).toMatch(/^Ask Gate: /);
    expect(logLines(root)).toHaveLength(1);
    expect(logLines(root)[0]).toMatchObject({ class: "blocker", outcome: "passed-through" });
  });

  it("enforce, uncovered non-blocker: assumed only when nobody is there to answer (found live)", async () => {
    const { root } = project("enforce");
    const q = ask("Which part of row 3 is wrong?", [{ label: "The decision" }, { label: "The reason" }]);
    const present = await decideAskCall(q, { root, deps, assume: false });
    expect(present?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
    expect(logLines(root).pop()).toMatchObject({ intercept: "tool", outcome: "passed-through", class: "assumption" });
    const unattended = await decideAskCall(q, { root, deps, assume: true });
    expect(unattended?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(unattended?.hookSpecificOutput?.permissionDecisionReason).toMatch(/most reasonable default/);
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(true);
  });

  it("spawned, enforce, WXAI_UNATTENDED=1: an uncovered non-blocker is assumed", () => {
    const { root, home } = project("enforce");
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: home, USERPROFILE: home, WXAI_UNATTENDED: "1" };
    delete env.WXAI_REMOTE;
    const r = spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", "hook-tool.mjs")], { input: JSON.stringify(ask("Should the log line use ISO 8601 or epoch milliseconds?")), env, encoding: "utf-8" });
    expect(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision).toBe("deny");
    expect(logLines(root)).toMatchObject([{ outcome: "assumed" }]);
  });

  it("spawned, observe: never denies", () => {
    const { root, home } = project("observe");
    const r = runHook("hook-tool.mjs", ask("How are endorsements prorated?"), root, home);
    expect(r.json.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(logLines(root)).toMatchObject([{ outcome: "observed", wouldHaveAnswered: true, ledgerId: "D-0001" }]);
  });

  it("spawned: garbage on stdin is no opinion, exit 0", () => {
    const { root, home } = project("enforce");
    const env = { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: home, USERPROFILE: home };
    const r = spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", "hook-tool.mjs")], { input: "not json", env, encoding: "utf-8" });
    expect(r.status).toBe(0);
    expect(r.stdout).toBe("");
  });
});

describe("hook-stop.mjs: finding the trailing question", () => {
  it("a final '?' line", () => {
    expect(trailingQuestions("I wrote the helper.\n\nHow are endorsements prorated?")).toMatchObject([{ text: "How are endorsements prorated?", detectedBy: "question-mark" }]);
  });
  it("classifies the question sentence; searches its line, paragraph and the whole message too", () => {
    const q = trailingQuestions("Intro line.\n\nDone with A. Done with B. Tests pass. Should I push?");
    expect(q[0].text).toBe("Should I push?");
    expect(q[0].searchTexts).toEqual([
      "Tests pass. Should I push?",
      "Done with A. Done with B. Tests pass. Should I push?",
      "Intro line.\n\nDone with A. Done with B. Tests pass. Should I push?",
    ]);
  });
  it("a request for a decision without a '?' (spike limit 4)", () => {
    for (const m of ["Please confirm which proration rule to use.", "Let me know which option you prefer.", "I'm waiting for your approval before I continue.", "I need your decision on the retention period."]) {
      expect(trailingQuestions(`Work is done.\n\n${m}`)).toMatchObject([{ detectedBy: "request" }]);
    }
  });
  it("an options list after the question becomes its options", () => {
    const q = trailingQuestions("Which format?\n\n1. ISO 8601\n2. Epoch ms\n");
    expect(q).toHaveLength(1);
    expect(q[0].options).toEqual([{ label: "ISO 8601" }, { label: "Epoch ms" }]);
  });
  it("several trailing questions, at most 4", () => {
    expect(trailingQuestions("Intro.\nA one?\nB two?\nC three?\nD four?\nE five?")).toHaveLength(4);
  });
  it("no question: nothing", () => {
    expect(trailingQuestions("All done. The tests pass.")).toEqual([]);
    expect(trailingQuestions("Is this right? I checked it. Everything passes.")).toEqual([]);
    expect(trailingQuestions("")).toEqual([]);
  });
  it("falls back to the transcript when last_assistant_message is absent", () => {
    const dir = mkdtempSync(join(tmpdir(), "askgate-tr-"));
    temps.push(dir);
    const f = join(dir, "t.jsonl");
    writeFileSync(f, [
      JSON.stringify({ type: "user", message: { role: "user", content: "hi" } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "text", text: "How are endorsements prorated?" }] } }),
      JSON.stringify({ type: "assistant", message: { role: "assistant", content: [{ type: "tool_use", name: "x" }] } }),
    ].join("\n"));
    expect(finalAssistantText({ transcript_path: f })).toBe("How are endorsements prorated?");
  });
});

describe("hook-stop.mjs: the decision", () => {
  it("enforce: a covered question blocks the stop with the decision and ID", async () => {
    const { root } = project("enforce");
    const out = await decideStop(stop("Before I continue: how are endorsements prorated?"), { root, deps });
    expect(out).toMatchObject({ decision: "block" });
    expect(out.reason).toContain("D-0001");
    expect(logLines(root)).toMatchObject([{ intercept: "stop", outcome: "answered", detectedBy: "question-mark" }]);
  });

  it("regression (found by hand): a lead-in before the question does not hide the decision", async () => {
    expect(withoutLeadIn("Before I write the calculation: how are endorsements prorated?")).toBe("How are endorsements prorated?");
    expect(withoutLeadIn("Quick one: ok?")).toBe("Quick one: ok?");
    const { root } = project("enforce");
    const out = await decideStop(stop("I wired the screen.\n\nBefore I write the calculation: how are endorsements prorated?"), { root, deps });
    expect(out).toMatchObject({ decision: "block" });
    expect(out.reason).toContain("D-0001");
  });

  it.each([
    "Insurance policies often involve mid-term changes that affect the premium calculation for the remainder of the policy period. How are endorsements prorated?",
    "I'm here and ready to help with your insurance questions. How are endorsements prorated?",
  ])("live regression: a preface sentence does not hide D-0001 (%s)", async (message) => {
    const { root } = project("enforce");
    const out = await decideStop(stop(message), { root, deps });
    expect(out).toMatchObject({ decision: "block" });
    expect(out.reason).toContain("D-0001");
    expect(logLines(root)).toMatchObject([{ intercept: "stop", outcome: "answered", ledgerId: "D-0001" }]);
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
  });

  it("an unrelated long message still does not answer from the ledger", async () => {
    const { root } = project("enforce");
    const out = await decideStop(stop("I refactored the task list component and moved the date helpers into a shared module. The build is green and the tests pass.\n\nShould the empty-state message say 'No tasks yet' or 'Nothing here yet'?"), { root, deps });
    expect(out.reason ?? "").not.toContain("D-0001");
    expect(logLines(root)).toMatchObject([{ ledgerId: null, wouldHaveAnswered: false }]);
  });

  it("enforce: a blocker lets the agent stop (the developer sees it)", async () => {
    const { root } = project("enforce");
    const out = await decideStop(stop("Should I drop the invoices_archive table?"), { root, deps });
    expect(out?.decision).toBeUndefined();
    expect(logLines(root)).toMatchObject([{ outcome: "passed-through", class: "blocker" }]);
  });

  it("no blanket stop_hook_active guard: a SECOND, different question is still gated", async () => {
    const { root } = project("enforce");
    const first = await decideStop(stop("How are endorsements prorated?", false), { root, deps });
    expect(first.decision).toBe("block");
    const second = await decideStop(stop("Thanks. Should the log line use ISO 8601 or epoch milliseconds?", true), { root, deps, assume: true });
    expect(second.decision).toBe("block");
    expect(second.reason).toMatch(/most reasonable default/);
  });

  it("regression (found live): with a person present, an uncovered question reaches them; it is not assumed", async () => {
    const { root } = project("enforce");
    const out = await decideStop(stop("What should row 3 of the summary say?", false), { root, deps, assume: false });
    expect(out?.decision).toBeUndefined();
    expect(existsSync(join(root, "decisions", "assumptions.yaml"))).toBe(false);
    const last = logLines(root).pop();
    expect(last).toMatchObject({ intercept: "stop", outcome: "passed-through", class: "assumption" });
  });

  it("with a person present, a covered question is still answered from the ledger", async () => {
    const { root } = project("enforce");
    const out = await decideStop(stop("How are endorsements prorated?", false), { root, deps, assume: false });
    expect(out?.decision).toBe("block");
    expect(out?.reason).toMatch(/D-0001/);
  });

  it("who answers: unattended env assumes, a remote bridge run and a plain session do not", async () => {
    const { root } = project("enforce");
    expect(await nobodyToAnswer(root, { WXAI_UNATTENDED: "1" })).toBe(true);
    expect(await nobodyToAnswer(root, { WXAI_UNATTENDED: "1", WXAI_REMOTE: "1" })).toBe(false);
    expect(await nobodyToAnswer(root, {})).toBe(false);
  });

  it("the SAME question again in the same turn is let through (loop guard), and logged", async () => {
    const { root } = project("enforce");
    expect((await decideStop(stop("How are endorsements prorated?", false), { root, deps })).decision).toBe("block");
    const again = await decideStop(stop("How are endorsements prorated?", true), { root, deps });
    expect(again.decision).toBeUndefined();
    expect(again.systemMessage).toMatch(/asked again/);
    const log = logLines(root);
    expect(log).toHaveLength(2);
    expect(log[1]).toMatchObject({ outcome: "passed-through", note: expect.stringMatching(/asked again/) });
  });

  it("a new turn (stop_hook_active false) starts a fresh set", async () => {
    const { root } = project("enforce");
    expect((await decideStop(stop("How are endorsements prorated?", false), { root, deps })).decision).toBe("block");
    expect((await decideStop(stop("How are endorsements prorated?", false), { root, deps })).decision).toBe("block");
  });

  it("sessions do not share the guard", async () => {
    const { root } = project("enforce");
    expect((await decideStop(stop("How are endorsements prorated?", false, "a"), { root, deps })).decision).toBe("block");
    expect((await decideStop(stop("How are endorsements prorated?", true, "b"), { root, deps })).decision).toBe("block");
  });

  it("observe: never blocks; request-phrased candidates are logged as such (the miss statistic)", async () => {
    const { root } = project("observe");
    const out = await decideStop(stop("Please confirm how endorsements are prorated."), { root, deps });
    expect(out?.decision).toBeUndefined();
    expect(logLines(root)).toMatchObject([{ outcome: "observed", detectedBy: "request" }]);
  });

  it("no question: no output, no log line", async () => {
    const { root } = project("enforce");
    expect(await decideStop(stop("All done; tests pass."), { root, deps })).toBeNull();
    expect(logLines(root)).toHaveLength(0);
  });

  it("spawned, enforce: block JSON on stdout, exit 0", () => {
    const { root, home } = project("enforce");
    const r = runHook("hook-stop.mjs", stop("How are endorsements prorated?"), root, home);
    expect(r.code).toBe(0);
    expect(r.json).toMatchObject({ decision: "block" });
    expect(r.json.reason).toContain("D-0001");
  });

  it("spawned: no question means empty stdout, exit 0 (the agent stops)", () => {
    const { root, home } = project("enforce");
    const r = runHook("hook-stop.mjs", stop("Finished."), root, home);
    expect(r.code).toBe(0);
    expect(r.stdout).toBe("");
  });
});
