// SPEC-142 Amendment A (T025): the bridge records queue answers and review verdicts by author.
// The failure this guards: the supervisor's answer stamped as the owner's, because the session
// never sees who wrote a room message.
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  decisionReplyFor,
  handleDecisionReply,
  nodeRunner,
  parseDecisionReply,
  type Runner,
} from "../../apps/remote-bridge/src/decision-reply";

const KIT = join(__dirname, "..", "..", "..", "_wxAI", "askgate");
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "decision-reply-"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "_wxAI"), { recursive: true });
  cpSync(KIT, join(root, "_wxAI", "askgate"), { recursive: true });
  mkdirSync(join(root, "docs"));
  writeFileSync(
    join(root, "docs", "GOD-State.json"),
    JSON.stringify({
      mode: "create",
      phase: "implement",
      scopes: [{ key: "S06", implement: "parked" }],
      decisionQueue: [{ id: "DQ-01", kind: "parked", unit: "S06", question: "May I load production data into test?", blocks: ["S06"], resumeAt: "implement", status: "open" }],
    }),
  );
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// [SCOPE 142 / T025] BEGIN — Bridge attributes DQ answers and KR verdicts by author (FR-021, FR-023)
function fakeRunner(stdout: string, calls: Array<{ script: string; args: string[] }>): Runner {
  return async (script, args) => {
    calls.push({ script, args });
    return { code: 0, stdout, stderr: "" };
  };
}
// [SCOPE 142 / T025] END

describe("parseDecisionReply", () => {
  it.each([
    ["DQ-01: no, use seeded data", { kind: "answer", dq: "DQ-01", answer: "no, use seeded data" }],
    ["dq-01 no", { kind: "answer", dq: "DQ-01", answer: "no" }],
    ["DQ-12 — yes, go ahead", { kind: "answer", dq: "DQ-12", answer: "yes, go ahead" }],
    ["KR-0003 approve", { kind: "review", kr: "KR-0003", verdict: "approve", ownerAnswer: "" }],
    ["KR-0003 approved.", { kind: "review", kr: "KR-0003", verdict: "approve" }],
    ["KR-0003 reject", { kind: "review", kr: "KR-0003", verdict: "reject" }],
    ["KR-0003 change: never in production", { kind: "review", kr: "KR-0003", verdict: "change", ownerAnswer: "never in production" }],
    ["KR-0003 change to seeded data", { kind: "review", kr: "KR-0003", verdict: "change", ownerAnswer: "seeded data" }],
  ])("%s", (text, want) => {
    expect(parseDecisionReply(text)).toMatchObject(want);
  });

  it.each(["DQ-01", "KR-0003 change", "please look at DQ-01", "STATUS", "KR-0003 maybe"])("not a decision reply: %s", (text) => {
    expect(parseDecisionReply(text)).toBeUndefined();
  });
});

describe("decisionReplyFor: only items this project has", () => {
  it("a DQ that exists is ours; an unknown DQ, or no kit, is relayed as before", () => {
    expect(decisionReplyFor(root, "DQ-01: no")).toMatchObject({ dq: "DQ-01" });
    expect(decisionReplyFor(root, "DQ-09: no")).toBeUndefined();
    rmSync(join(root, "_wxAI"), { recursive: true });
    expect(decisionReplyFor(root, "DQ-01: no")).toBeUndefined();
  });
});

describe("handleDecisionReply: who answered decides what is recorded", () => {
  it("the owner's answer goes to the ledger path (no --by)", async () => {
    const calls: Array<{ script: string; args: string[] }> = [];
    const o = await handleDecisionReply({ kind: "answer", dq: "DQ-01", answer: "no" }, "owner", fakeRunner('{"ok":true,"ledgerId":"D-0004","releases":["S06"]}', calls));
    expect(calls[0]).toEqual({ script: "route.mjs", args: ["answer", "--dq", "DQ-01", "--answer", "no"] });
    expect(o.roomText).toMatch(/Recorded your answer to DQ-01 as D-0004/);
    expect(o.sessionText).toMatch(/The owner answered DQ-01/);
  });

  it("the supervisor's answer is passed --by and reported as pending review", async () => {
    const calls: Array<{ script: string; args: string[] }> = [];
    const o = await handleDecisionReply({ kind: "answer", dq: "DQ-01", answer: "no" }, "KAIN", fakeRunner('{"ok":true,"krId":"KR-0001","releases":["S06"]}', calls));
    expect(calls[0].args).toEqual(["answer", "--dq", "DQ-01", "--answer", "no", "--by", "KAIN"]);
    expect(o.roomText).toMatch(/KR-0001 for the owner's review\. It is not a ledger decision/);
    expect(o.sessionText).toMatch(/acting for the owner[\s\S]*never reused/);
  });

  it("the supervisor cannot review; nothing runs", async () => {
    const calls: Array<{ script: string; args: string[] }> = [];
    const o = await handleDecisionReply({ kind: "review", kr: "KR-0001", verdict: "approve", ownerAnswer: "" }, "KAIN", fakeRunner("{}", calls));
    expect(calls).toHaveLength(0);
    expect(o.roomText).toMatch(/only the owner reviews/);
  });

  it("a script refusal is reported in the room", async () => {
    const o = await handleDecisionReply({ kind: "answer", dq: "DQ-01", answer: "no" }, "owner", fakeRunner('{"ok":false,"error":"DQ-01 is already answered"}', []));
    expect(o.roomText).toBe("Could not record DQ-01: DQ-01 is already answered");
  });
});

describe("end to end through the real kit scripts", () => {
  it("KAIN answers, the owner changes it in the room: one owner ledger entry, the verdict queued for KAIN", async () => {
    const run = nodeRunner(root);
    const kain = await handleDecisionReply({ kind: "answer", dq: "DQ-01", answer: "Yes, load it." }, "KAIN", run);
    expect(kain.roomText).toMatch(/KR-0001/);
    expect(readFileSync(join(root, "decisions", "kain-replies.yaml"), "utf8")).toMatch(/status: "pending"/);
    expect(decisionReplyFor(root, "KR-0001 change: No, seeded data only.")).toMatchObject({ verdict: "change" });
    const review = await handleDecisionReply({ kind: "review", kr: "KR-0001", verdict: "change", ownerAnswer: "No, seeded data only." }, "owner", run);
    expect(review.roomText).toBeUndefined(); // the verdict post comes from the outbox, once
    expect(review.sessionText).toMatch(/Check the work done under it and correct it: S06/);
    const ledger = readFileSync(join(root, "decisions", "ledger.yaml"), "utf8");
    expect(ledger).toMatch(/decision: "No, seeded data only\."/);
    expect(ledger).toMatch(/approved_by: "owner"/);
    const outbox = readFileSync(join(root, ".wxai", "room-outbox.jsonl"), "utf8").trim().split("\n");
    expect(outbox).toHaveLength(1);
    expect(JSON.parse(outbox[0]).text).toMatch(/KR-0001 .* the owner changed it to: "No, seeded data only\."/);
  });
});
