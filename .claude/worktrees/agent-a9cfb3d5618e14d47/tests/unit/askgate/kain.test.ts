// SPEC-142 Amendment A (T024, T026, T027): KAIN answers as the owner, and the owner reviews.
//
// The failures these guard: a KAIN answer reaching the ledger or answering a later question
// before the owner approved it, KAIN reviewing its own answer, a verdict that never reaches the
// room (so KAIN never learns), and an agent editing the review list.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { appendEntry, readLedger } from "../../../_wxAI/askgate/ledger.mjs";
import { pendingReplies, readReplies, reviewReply, verdictText } from "../../../_wxAI/askgate/kain.mjs";
import { applyKainAnswer, applyOwnerAnswer } from "../../../_wxAI/askgate/route.mjs";
import { search } from "../../../_wxAI/askgate/search.mjs";
import { decideLedgerGuard } from "../../../_wxAI/askgate/hook-ledger-guard.mjs";

const REPO = process.cwd();
const QUESTION = "May I load the production customer data into the test database for S06?";
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "kain-test-"));
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "docs"));
  writeFileSync(join(root, "docs", "GOD-State.json"), JSON.stringify({
    mode: "create", phase: "implement",
    scopes: [{ key: "S06", implement: "parked" }, { key: "S07", implement: "implementing" }],
    decisionQueue: [
      { id: "DQ-01", kind: "parked", unit: "S06", question: QUESTION, blocks: ["S06"], resumeAt: "implement", status: "open" },
      { id: "DQ-02", kind: "parked", unit: "S07", question: "Drop the old invoices table?", blocks: ["S07"], resumeAt: "implement", status: "open", dataLoss: true },
    ],
  }));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
function outboxLines(): string[] {
  const f = join(root, ".wxai", "room-outbox.jsonl");
  return existsSync(f) ? readFileSync(f, "utf-8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l).text) : [];
}
// [SCOPE 142 / T024] END

// [SCOPE 142 / T024] BEGIN — KAIN reply list and the review script (FR-022, FR-023)
function state() {
  return JSON.parse(readFileSync(join(root, "docs", "GOD-State.json"), "utf-8"));
}
// [SCOPE 142 / T024] END

describe("a KAIN answer (FR-022)", () => {
  it("releases the unit, joins the review list, and leaves the ledger alone", async () => {
    const r = await applyKainAnswer(root, "DQ-01", "No, use the seeded test data.");
    expect(r).toMatchObject({ ok: true, krId: "KR-0001", ledgerId: null, releases: ["S06"] });
    expect(readLedger(root)).toHaveLength(0);
    expect(pendingReplies(root)).toMatchObject([{ id: "KR-0001", dq: "DQ-01", by: "KAIN", answer: "No, use the seeded test data.", status: "pending", blocks: "S06" }]);
    expect(state().decisionQueue[0]).toMatchObject({ status: "answered-by-kain", krId: "KR-0001" });
    const log = readFileSync(join(root, "decisions", "gate-log.jsonl"), "utf-8");
    expect(log).toMatch(/"outcome":"kain-answered"/);
  });

  it("never answers the same question later, until the owner approves it", async () => {
    await applyKainAnswer(root, "DQ-01", "No, use the seeded test data.");
    expect((await search(QUESTION, { root })).status).not.toBe("answered");
    reviewReply(root, "KR-0001", "approve");
    const after = await search(QUESTION, { root });
    expect(after.status).toBe("answered");
    expect(after.hit.text).toMatch(/seeded test data/);
  });

  it("a data-loss item is the owner's alone", async () => {
    expect(await applyKainAnswer(root, "DQ-02", "Yes, drop it.")).toMatchObject({ ok: false, error: expect.stringMatching(/only the owner/) });
  });

  it("after KAIN answered, an owner answer to the DQ is pointed at the review instead", async () => {
    await applyKainAnswer(root, "DQ-01", "No.");
    expect(await applyOwnerAnswer(root, "DQ-01", "Yes.", {}, { runLedger: () => "D-0001" })).toMatchObject({ ok: false, error: expect.stringMatching(/review KR-0001/) });
  });
});

describe("the owner's review (FR-023, FR-024)", () => {
  it("approve writes one owner ledger entry with KAIN's answer and one room post", async () => {
    await applyKainAnswer(root, "DQ-01", "No, use the seeded test data.");
    const r = reviewReply(root, "KR-0001", "approve");
    expect(r).toMatchObject({ ok: true, verdict: "approved", recheck: [] });
    const [e] = readLedger(root);
    expect(e).toMatchObject({ id: r.ledgerId, approved_by: "owner", decision: "No, use the seeded test data.", source: "decisions/kain-replies.yaml#KR-0001" });
    expect(outboxLines()).toEqual([expect.stringMatching(/^KR-0001 \(DQ-01\) .* KAIN answered "No, use the seeded test data."; the owner approved it\.$/)]);
  });

  it("change writes the owner's answer, lists the units to recheck, and tells KAIN in one post", async () => {
    await applyKainAnswer(root, "DQ-01", "Yes, load it.");
    const r = reviewReply(root, "KR-0001", "change", { ownerAnswer: "No. Never load production data into test." });
    expect(r).toMatchObject({ ok: true, verdict: "changed", recheck: ["S06"] });
    expect(readLedger(root)[0]).toMatchObject({ approved_by: "owner", decision: "No. Never load production data into test." });
    expect(readReplies(root)[0]).toMatchObject({ status: "changed", ownerAnswer: "No. Never load production data into test.", ledgerId: r.ledgerId });
    const posts = outboxLines();
    expect(posts).toHaveLength(1);
    expect(posts[0]).toMatch(/changed it to: "No\. Never load production data into test\."\. Check the work done under it: S06\./);
  });

  it("reject writes nothing to the ledger and still tells KAIN", async () => {
    await applyKainAnswer(root, "DQ-01", "Yes, load it.");
    expect(reviewReply(root, "KR-0001", "reject")).toMatchObject({ ok: true, verdict: "rejected", ledgerId: null, recheck: ["S06"] });
    expect(readLedger(root)).toHaveLength(0);
    expect(outboxLines()[0]).toMatch(/the owner rejected it/);
  });

  it("KAIN never reviews itself; a reply is reviewed once; change needs the owner's words", async () => {
    await applyKainAnswer(root, "DQ-01", "No.");
    expect(reviewReply(root, "KR-0001", "approve", { by: "KAIN" })).toMatchObject({ ok: false, error: expect.stringMatching(/only the owner/) });
    expect(reviewReply(root, "KR-0001", "change", { ownerAnswer: "  " })).toMatchObject({ ok: false });
    expect(reviewReply(root, "KR-0001", "approve")).toMatchObject({ ok: true });
    expect(reviewReply(root, "KR-0001", "reject")).toMatchObject({ ok: false, error: expect.stringMatching(/already approved/) });
    expect(readLedger(root)).toHaveLength(1);
  });

  // SPEC-144 FR-008 (T010): a Room Approver reviews under their own name; KAIN still never reviews.
  it("a Room Approver's review is recorded under their name", async () => {
    await applyKainAnswer(root, "DQ-01", "Yes, load it.");
    const r = reviewReply(root, "KR-0001", "change", { ownerAnswer: "No, seeded data only.", approvedBy: "Jane Manager" });
    expect(r).toMatchObject({ ok: true, verdict: "changed", reviewedBy: "Jane Manager" });
    expect(readLedger(root)[0]).toMatchObject({ approved_by: "Jane Manager", decision: "No, seeded data only." });
    expect(readReplies(root)[0]).toMatchObject({ status: "changed", reviewedBy: "Jane Manager" });
    expect(outboxLines()[0]).toMatch(/the owner \(Jane Manager\) changed it to: "No, seeded data only\."/);
  });

  it("without a name the review stays the owner's, and KAIN cannot be named as the reviewer", async () => {
    await applyKainAnswer(root, "DQ-01", "No.");
    expect(reviewReply(root, "KR-0001", "approve", { approvedBy: "KAIN" })).toMatchObject({ ok: false, error: expect.stringMatching(/only the owner/) });
    expect(readLedger(root)).toHaveLength(0);
    expect(reviewReply(root, "KR-0001", "approve")).toMatchObject({ ok: true, reviewedBy: "owner" });
    expect(readLedger(root)[0]).toMatchObject({ approved_by: "owner" });
  });

  it("the review CLI takes --approved-by", async () => {
    await applyKainAnswer(root, "DQ-01", "No.");
    const r = spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", "kain.mjs"), "review", "KR-0001", "change", "No,", "seeded", "data.", "--approved-by", "Jane Manager", "--root", root], { encoding: "utf-8" });
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, verdict: "changed", reviewedBy: "Jane Manager" });
    expect(readLedger(root)[0]).toMatchObject({ approved_by: "Jane Manager", decision: "No, seeded data." });
  });

  it("verdictText reads plainly for each verdict", () => {
    const base = { id: "KR-0002", dq: "DQ-03", by: "KAIN", question: "Q?", answer: "A", blocks: "S1,S2" };
    expect(verdictText({ ...base, status: "approved" })).toBe('KR-0002 (DQ-03) "Q?" — KAIN answered "A"; the owner approved it.');
    expect(verdictText({ ...base, status: "rejected" })).toMatch(/rejected it\. Check the work done under it: S1, S2\.$/);
  });
});

describe("guarantees around the review list", () => {
  it("the ledger refuses an agent as approver", () => {
    expect(() => appendEntry(root, { scope: "S06", question: "q", decision: "d", rationale: "", kind: "Agreed", evidence: "confirmed", source: "", date: "2026-10-24", supersedes: null }, "KAIN")).toThrow(/cannot be KAIN/);
  });

  it("the ledger guard denies direct agent writes to the review list, and allows the review script", () => {
    const deny = (tool: string, input: Record<string, unknown>) => decideLedgerGuard({ hook_event_name: "PreToolUse", tool_name: tool, tool_input: input })?.hookSpecificOutput?.permissionDecision;
    expect(deny("Write", { file_path: join(root, "decisions", "kain-replies.yaml"), content: "x" })).toBe("deny");
    expect(deny("Bash", { command: "echo '- id: KR-9' >> decisions/kain-replies.yaml" })).toBe("deny");
    expect(deny("Bash", { command: "node _wxAI/askgate/kain.mjs review KR-0001 approve" })).toBeUndefined();
    expect(deny("Bash", { command: "cat decisions/kain-replies.yaml" })).toBeUndefined();
  });

  it("ledger check and kain.mjs list both show what is awaiting review (FR-025)", async () => {
    const cli = (script: string, ...args: string[]) => spawnSync(process.execPath, [join(REPO, "_wxAI", "askgate", script), ...args, "--root", root], { encoding: "utf-8" });
    expect(cli("ledger.mjs", "check").stdout).toMatch(/KAIN replies awaiting your review: 0/);
    await applyKainAnswer(root, "DQ-01", "No.");
    expect(cli("ledger.mjs", "check").stdout).toMatch(/KAIN replies awaiting your review: 1 \(KR-0001/);
    expect(cli("kain.mjs", "list").stdout).toMatch(/KR-0001[\s\S]*KAIN answered: No\./);
    const r = cli("kain.mjs", "review", "KR-0001", "change", "No,", "seeded", "data", "only.");
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, verdict: "changed" });
    expect(readLedger(root)[0].decision).toBe("No, seeded data only.");
    expect(cli("kain.mjs", "list").stdout).toMatch(/No KAIN replies awaiting review/);
  });
});
