// SPEC-142 T005 / FR-003: the wxBrainstorm close writes the decision ledger.
//
// The close is an instruction to the agent (conduct.md § Writing the ledger), so this test follows
// that instruction as written: it reads the summary-group mapping from conduct.md itself, builds one
// entry file per row of an approved summary, and runs the real ledger script once per row. The
// failures this guards: the mapping in the instructions drifting from what the script accepts, a
// parked row answering questions later, and the command copies drifting apart.
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { isAnswerEligible, readLedger } from "../../../_wxAI/askgate/ledger.mjs";

const REPO = process.cwd();
const LEDGER_CLI = join(REPO, "_wxAI", "askgate", "ledger.mjs");
const CONDUCT = join(REPO, ".claude", "skills", "wxBrainstorm", "references", "conduct.md");
const temps: string[] = [];
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

function tmp(prefix: string): string {
  const d = mkdtempSync(join(tmpdir(), prefix));
  temps.push(d);
  return d;
}

/** The "Summary group | kind | evidence" table from conduct.md § Writing the ledger. */
function mappingFromConduct(): Record<string, { kind: string; evidence: string }> {
  const text = readFileSync(CONDUCT, "utf-8");
  const section = text.slice(text.indexOf("## Writing the ledger"));
  const map: Record<string, { kind: string; evidence: string }> = {};
  for (const line of section.split(/\r?\n/)) {
    const m = /^\|\s*(Agreed|Added|Changed|Declined|Parked)\s*\|\s*(\w+)\s*\|\s*(\w+)\s*\|$/.exec(line.trim());
    if (m) map[m[1]] = { kind: m[2], evidence: m[3] };
  }
  return map;
}

const SUMMARY = [
  { group: "Agreed", question: "How long do invitations last?", decision: "Seven days from sending." },
  { group: "Added", question: "Should expired invitations be resendable?", decision: "Yes, from the invitations list." },
  { group: "Changed", question: "Who may send invitations?", decision: "Company admins and project owners." },
  { group: "Declined", question: "Should invitations go out by SMS?", decision: "No; email only." },
  { group: "Parked", question: "Should a customer approve each bulk invitation batch?", decision: "Open: the customer answers." },
];

function closeWrites(root: string, approvedBy = "owner") {
  const map = mappingFromConduct();
  const dir = tmp("brainstorm-close-entries-");
  return SUMMARY.map((row, i) => {
    const { kind, evidence } = map[row.group];
    const file = join(dir, `entry-${i + 1}.json`);
    writeFileSync(file, JSON.stringify({
      scope: "SCOPE-142", question: row.question, decision: row.decision,
      rationale: row.group === "Parked" ? "Needs the customer's sign-off." : "",
      kind, evidence, source: `docs/brainstorms/2026-10-23-invitations.md#${i + 1}`, date: "2026-10-23",
    }));
    return spawnSync(process.execPath, [LEDGER_CLI, "append", "--file", file, "--approved-by", approvedBy, "--root", root], { encoding: "utf-8" });
  });
}

function repo(): string {
  const root = tmp("brainstorm-close-");
  mkdirSync(join(root, ".git"));
  return root;
}

describe("wxBrainstorm close writes the ledger (FR-003)", () => {
  it("conduct.md maps every summary group, and Parked to evidence unknown", () => {
    const map = mappingFromConduct();
    expect(Object.keys(map).sort()).toEqual(["Added", "Agreed", "Changed", "Declined", "Parked"]);
    expect(map.Parked).toEqual({ kind: "Parked", evidence: "unknown" });
    for (const g of ["Agreed", "Added", "Changed", "Declined"]) expect(map[g]).toEqual({ kind: g, evidence: "confirmed" });
  });

  it("an approved summary of 4 decisions and 1 parked item writes 5 entries and check passes", () => {
    const root = repo();
    for (const r of closeWrites(root)) expect(r.status, r.stderr).toBe(0);
    const entries = readLedger(root);
    expect(entries).toHaveLength(5);
    expect(entries.every((e: { approved_by: string }) => e.approved_by === "owner")).toBe(true);
    const check = spawnSync(process.execPath, [LEDGER_CLI, "check", "--root", root], { encoding: "utf-8" });
    expect(check.status, check.stdout + check.stderr).toBe(0);
  });

  it("the parked entry names who answers it and can never answer a question", () => {
    const root = repo();
    closeWrites(root);
    const entries = readLedger(root);
    const parked = entries.find((e: { kind: string }) => e.kind === "Parked");
    expect(parked.evidence).toBe("unknown");
    expect(parked.decision).toMatch(/the (owner|customer) answers/);
    expect(isAnswerEligible(parked, entries)).toBe(false);
    expect(isAnswerEligible(entries.find((e: { kind: string }) => e.kind === "Agreed"), entries)).toBe(true);
  });

  it("an empty approver is refused, so nothing is written without an approval", () => {
    const root = repo();
    const results = closeWrites(root, "");
    expect(results.every((r) => r.status !== 0)).toBe(true);
    expect(readLedger(root)).toHaveLength(0);
  });

  it("the command copies match by md5, and the skill and command both describe the ledger step", () => {
    const md5 = (p: string) => createHash("md5").update(readFileSync(join(REPO, p))).digest("hex");
    expect(md5(".claude/commands/wxBrainstorm.md")).toBe(md5("_wxAI/commands/wxBrainstorm.md"));
    expect(readFileSync(join(REPO, ".claude/commands/wxBrainstorm.md"), "utf-8")).toMatch(/decisions\/ledger\.yaml/);
    expect(readFileSync(join(REPO, ".claude/skills/wxBrainstorm/SKILL.md"), "utf-8")).toMatch(/Writing the ledger/);
    expect(readFileSync(CONDUCT, "utf-8")).toMatch(/Nothing is written when the summary is not approved/);
  });
});
