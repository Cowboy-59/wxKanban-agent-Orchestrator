// SPEC-142 / T002, T006 — the decision ledger script, settings, log, and search.
//
// The failures these guard: an agent-authored or unapproved entry reaching the ledger, an old entry
// rewritten, a superseded or unknown-evidence entry answering a question, and another repo's
// ledger being read without a link. Written directly: the fencer rejects test files with no
// top-level declaration.
import { spawn, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

import { appendEntry, checkLedger, isAnswerEligible, readLedger, scanGlobalText } from "../../../_wxAI/askgate/ledger.mjs";
import { logOutcome } from "../../../_wxAI/askgate/log.mjs";
import { search } from "../../../_wxAI/askgate/search.mjs";
import { readSettings } from "../../../_wxAI/askgate/settings.mjs";

const REPO = process.cwd();
const LEDGER_CLI = join(REPO, "_wxAI", "askgate", "ledger.mjs");
const temps: string[] = [];

// [SCOPE 142 / T006] BEGIN — Search interface, file-search backend, and the answer rules…
function tmp(): string {
  const d = mkdtempSync(join(tmpdir(), "ledger-test-"));
  temps.push(d);
  return d;
}
// [SCOPE 142 / T006] END
afterAll(() => {
  for (const d of temps) rmSync(d, { recursive: true, force: true });
});

const base = {
  scope: "SCOPE-142",
  question: "How are endorsements prorated?",
  decision: "Daily, on the endorsement effective date.",
  rationale: "Matches the carrier's billing.",
  kind: "Agreed",
  evidence: "confirmed",
  source: "docs/x.md#4",
  date: "2026-10-22",
};

describe("appendEntry", () => {
  it("assigns D-0001, writes approved_by, and the file reads back", () => {
    const root = tmp();
    const e = appendEntry(root, base, "owner");
    expect(e.id).toBe("D-0001");
    const back = readLedger(root);
    expect(back).toHaveLength(1);
    expect(back[0]).toMatchObject({ ...base, id: "D-0001", approved_by: "owner", supersedes: null });
    expect(checkLedger(root).ok).toBe(true);
  });

  it("round-trips text with quotes, colons, hashes and newlines", () => {
    const root = tmp();
    const hard = { ...base, question: 'Is "a: b" # ok?\nsecond line', decision: "Use 'x' - yes: really" };
    appendEntry(root, hard, "owner");
    expect(readLedger(root)[0]).toMatchObject({ question: hard.question, decision: hard.decision });
  });

  it("leaves existing entries byte-for-byte unchanged after an append", () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    const file = join(root, "decisions", "ledger.yaml");
    const before = readFileSync(file);
    appendEntry(root, { ...base, question: "Another question?", decision: "Another answer." }, "owner");
    const after = readFileSync(file);
    expect(after.subarray(0, before.length).equals(before)).toBe(true);
    expect(after.length).toBeGreaterThan(before.length);
    expect(readLedger(root).map((e) => e.id)).toEqual(["D-0001", "D-0002"]);
  });

  it("refuses an empty approved_by and writes nothing", () => {
    const root = tmp();
    for (const who of ["", "   ", undefined as unknown as string]) {
      expect(() => appendEntry(root, base, who)).toThrow(/approved_by/);
    }
    expect(readLedger(root)).toEqual([]);
  });

  it("refuses a bad kind, bad evidence, missing question, bad date", () => {
    const root = tmp();
    expect(() => appendEntry(root, { ...base, kind: "Maybe" }, "owner")).toThrow(/kind/);
    expect(() => appendEntry(root, { ...base, evidence: "sure" }, "owner")).toThrow(/evidence/);
    expect(() => appendEntry(root, { ...base, question: "" }, "owner")).toThrow(/question/);
    expect(() => appendEntry(root, { ...base, date: "yesterday" }, "owner")).toThrow(/date/);
    expect(() => appendEntry(root, { ...base, extra: "x" } as never, "owner")).toThrow(/unknown field/);
  });

  it("refuses a duplicate id and a duplicate of the same content", () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    expect(() => appendEntry(root, { ...base, question: "Different?", id: "D-0001" }, "owner")).toThrow(/duplicate id/);
    expect(() => appendEntry(root, base, "owner")).toThrow(/duplicate of D-0001/);
  });

  it("refuses a dangling supersedes, accepts a real one", () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    expect(() => appendEntry(root, { ...base, decision: "New.", supersedes: "D-0099" }, "owner")).toThrow(/not in the ledger/);
    const e = appendEntry(root, { ...base, decision: "New.", kind: "Changed", supersedes: "D-0001" }, "owner");
    expect(e.supersedes).toBe("D-0001");
  });

  it("gives simultaneous appends from separate processes distinct ids", async () => {
    const root = tmp();
    const runs = [1, 2, 3, 4, 5].map((n) => {
      const f = join(root, `e${n}.json`);
      writeFileSync(f, JSON.stringify({ ...base, question: `Question number ${n}?`, decision: `Answer ${n}.` }));
      return new Promise<number | null>((done) => {
        const p = spawn(process.execPath, [LEDGER_CLI, "append", "--file", f, "--approved-by", "owner", "--root", root]);
        p.on("close", done);
      });
    });
    expect(await Promise.all(runs)).toEqual([0, 0, 0, 0, 0]);
    expect(readLedger(root).map((e) => e.id).sort()).toEqual(["D-0001", "D-0002", "D-0003", "D-0004", "D-0005"]);
    expect(checkLedger(root).ok).toBe(true);
  });
});

describe("check", () => {
  it("fails on a duplicate id, a missing approver, and a dangling supersedes in a hand-edited file", () => {
    const root = tmp();
    mkdirSync(join(root, "decisions"));
    const one = (id: string, extra = "") =>
      `- id: ${id}\n  scope: "S"\n  question: "Q ${id}"\n  decision: "D"\n  rationale: ""\n  kind: Agreed\n  evidence: confirmed\n  source: ""\n  approved_by: ${extra || '"owner"'}\n  date: 2026-10-22\n  supersedes: null\n`;
    writeFileSync(join(root, "decisions", "ledger.yaml"), one("D-0001") + one("D-0001") + one("D-0002", '""') + one("D-0003").replace("supersedes: null", "supersedes: D-0077"));
    const r = checkLedger(root);
    expect(r.ok).toBe(false);
    const all = r.errors.join("\n");
    expect(all).toMatch(/duplicate id/);
    expect(all).toMatch(/approved_by/);
    expect(all).toMatch(/D-0077/);
  });

  it("CLI check exits 0 on a clean ledger and 1 on a broken one", () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    expect(spawnSync(process.execPath, [LEDGER_CLI, "check", "--root", root]).status).toBe(0);
    writeFileSync(join(root, "decisions", "ledger.yaml"), "- id: nope\n  kind: Agreed\n");
    expect(spawnSync(process.execPath, [LEDGER_CLI, "check", "--root", root]).status).toBe(1);
  });

  it("CLI append refuses without --approved-by (exit 1) and appends with it (exit 0)", () => {
    const root = tmp();
    const f = join(root, "e.json");
    writeFileSync(f, JSON.stringify(base));
    expect(spawnSync(process.execPath, [LEDGER_CLI, "append", "--file", f, "--root", root]).status).toBe(1);
    const ok = spawnSync(process.execPath, [LEDGER_CLI, "append", "--file", f, "--approved-by", "owner", "--root", root], { encoding: "utf8" });
    expect(ok.status).toBe(0);
    expect(JSON.parse(ok.stdout)).toMatchObject({ ok: true, id: "D-0001" });
  });
});

describe("check --global", () => {
  it("flags paths, SCOPE/SPEC numbers and emails, and passes clean text", () => {
    const hits = scanGlobalText("Use idempotent keys.\nSee SCOPE-136 and src/db/schema.ts\nmail andy@wxperts.com or C:\\Users\\x\\a.txt\n");
    expect(hits.map((h) => h.kind).sort()).toEqual(["email", "file path", "file path", "scope-or-spec-number"].sort());
    expect(scanGlobalText("Invitations expire in about 7 days.\nPrefer small steps.\n")).toEqual([]);
  });

  it("CLI exits 1 on a dirty global file and 0 on a clean one", () => {
    const dir = tmp();
    const dirty = join(dir, "dirty.md");
    const clean = join(dir, "clean.md");
    writeFileSync(dirty, "Learned in SPEC-047.\n");
    writeFileSync(clean, "Ask once, record once.\n");
    expect(spawnSync(process.execPath, [LEDGER_CLI, "check", "--global", "--global-file", dirty]).status).toBe(1);
    expect(spawnSync(process.execPath, [LEDGER_CLI, "check", "--global", "--global-file", clean]).status).toBe(0);
  });
});

describe("isAnswerEligible", () => {
  const e = (o: object) => ({ id: "D-0001", kind: "Agreed", evidence: "confirmed", approved_by: "owner", ...o });
  it("accepts Agreed, Added, Changed", () => {
    for (const kind of ["Agreed", "Added", "Changed"]) expect(isAnswerEligible(e({ kind }), [e({ kind })])).toBe(true);
  });
  it("rejects Declined, Parked, unknown evidence, empty approver", () => {
    expect(isAnswerEligible(e({ kind: "Declined" }), [])).toBe(false);
    expect(isAnswerEligible(e({ kind: "Parked" }), [])).toBe(false);
    expect(isAnswerEligible(e({ evidence: "unknown" }), [])).toBe(false);
    expect(isAnswerEligible(e({ approved_by: "" }), [])).toBe(false);
  });
  it("rejects an entry that a later entry supersedes", () => {
    const old = e({});
    expect(isAnswerEligible(old, [old, e({ id: "D-0002", supersedes: "D-0001" })])).toBe(false);
  });
});

describe("settings and log", () => {
  it("gives the C3 defaults when the file is missing", () => {
    const s = readSettings(tmp());
    expect(s).toEqual({ gate: { mode: "observe", matchThreshold: 0.75 }, minimalCode: { level: "on" }, links: [] });
  });
  it("reads values, ignores invalid ones", () => {
    const root = tmp();
    mkdirSync(join(root, "decisions"));
    writeFileSync(join(root, "decisions", "settings.yaml"), "gate:\n  mode: enforce\n  matchThreshold: 0.9\nminimalCode:\n  level: lite\nlinks:\n  - ../other\n");
    expect(readSettings(root)).toEqual({ gate: { mode: "enforce", matchThreshold: 0.9 }, minimalCode: { level: "lite" }, links: ["../other"] });
    writeFileSync(join(root, "decisions", "settings.yaml"), "gate:\n  mode: sometimes\n  matchThreshold: 7\nlinks: []\n");
    expect(readSettings(root).gate).toEqual({ mode: "observe", matchThreshold: 0.75 });
  });
  it("log appends one line per event and never rewrites earlier ones", () => {
    const root = tmp();
    logOutcome(root, { session: "s", intercept: "tool", question: "q1", outcome: "observed" });
    const file = join(root, "decisions", "gate-log.jsonl");
    const first = readFileSync(file, "utf8");
    logOutcome(root, { session: "s", intercept: "tool", question: "q2", outcome: "answered", ledgerId: "D-0001" });
    const all = readFileSync(file, "utf8");
    expect(all.startsWith(first)).toBe(true);
    const lines = all.trim().split("\n").map((l) => JSON.parse(l));
    expect(lines).toHaveLength(2);
    expect(lines[0].time).toBeTruthy();
    expect(lines[1].ledgerId).toBe("D-0001");
  });
});

describe("search", () => {
  const seed = (root: string) => {
    appendEntry(root, base, "owner");
    appendEntry(root, { ...base, question: "Which date format goes in a log line?", decision: "ISO 8601.", evidence: "unknown" }, "owner");
    appendEntry(root, { ...base, question: "Is the beta open to all customers?", decision: "No, invited only.", kind: "Declined" }, "owner");
  };

  it("answers a covered question with the full text and id, from the repo tier", async () => {
    const root = tmp();
    seed(root);
    const r = await search("How are endorsements prorated?", { root, globalRoot: tmp() });
    expect(r.status).toBe("answered");
    expect(r.hit).toMatchObject({ id: "D-0001", tier: "repo", score: 1 });
    expect(r.hit?.text).toContain("Daily, on the endorsement effective date.");
    expect(r.backend).toBe("file");
    expect(r.fellBack).toBe(false);
  });

  it("matches a reworded question at or above the threshold, and not an unrelated one", async () => {
    const root = tmp();
    seed(root);
    expect((await search("how do we prorate endorsements", { root, globalRoot: tmp() })).status).toBe("answered");
    const none = await search("what colour is the login button", { root, globalRoot: tmp() });
    expect(none.status).toBe("none");
    expect(none.hit).toBeNull();
  });

  it("never answers from evidence:unknown; it comes back as context", async () => {
    const root = tmp();
    seed(root);
    const r = await search("Which date format goes in a log line?", { root, globalRoot: tmp() });
    expect(r.status).toBe("context");
    expect(r.hit).toBeNull();
    expect(r.context[0].id).toBe("D-0002");
  });

  it("never answers from a Declined entry", async () => {
    const root = tmp();
    seed(root);
    const r = await search("Is the beta open to all customers?", { root, globalRoot: tmp() });
    expect(r.hit).toBeNull();
  });

  it("never returns a superseded entry, even as context", async () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    appendEntry(root, { ...base, decision: "Monthly, on the first.", kind: "Changed", supersedes: "D-0001" }, "owner");
    const r = await search("How are endorsements prorated?", { root, globalRoot: tmp() });
    expect(r.hit?.id).toBe("D-0002");
    expect(r.context.map((c) => c.id)).not.toContain("D-0001");
  });

  it("respects the threshold option", async () => {
    const root = tmp();
    seed(root);
    const r = await search("endorsements", { root, globalRoot: tmp(), threshold: 0.99 });
    expect(r.status).not.toBe("answered");
  });

  it("falls back to the global tier, and does not leak another repo without a link", async () => {
    const repoA = tmp();
    const repoB = tmp();
    const global = tmp();
    appendEntry(repoA, { ...base, question: "What is the customer pricing tier?", decision: "Gold for acme." }, "owner");
    appendEntry(global, { ...base, scope: "global", question: "How long do invitations last?", decision: "About 7 days." }, "owner");
    const inv = await search("How long do invitations last?", { root: repoB, globalRoot: global });
    expect(inv.hit).toMatchObject({ id: "D-0001", tier: "global" });
    const price = await search("What is the customer pricing tier?", { root: repoB, globalRoot: global });
    expect(price.hit).toBeNull();
    expect(price.status).toBe("none");
  });

  it("reads a linked repo only when settings.links names it", async () => {
    const repoA = tmp();
    const repoB = tmp();
    appendEntry(repoA, { ...base, question: "What is the customer pricing tier?", decision: "Gold for acme." }, "owner");
    mkdirSync(join(repoB, "decisions"), { recursive: true });
    writeFileSync(join(repoB, "decisions", "settings.yaml"), `links:\n  - ${repoA.replace(/\\/g, "/")}\n`);
    const r = await search("What is the customer pricing tier?", { root: repoB, globalRoot: tmp() });
    expect(r.hit?.text).toContain("Gold for acme.");
  });

  it("reads the ledger from mainRepoRoot, not the working root", async () => {
    const main = tmp();
    const worktree = tmp();
    appendEntry(main, base, "owner");
    const r = await search("How are endorsements prorated?", { root: worktree, mainRepoRoot: main, globalRoot: tmp() });
    expect(r.hit?.id).toBe("D-0001");
  });

  it("falls back to file search when a backend is down, errors or is slow", async () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    const down = { name: "openviking", available: () => false, search: () => [] };
    const boom = { name: "openviking", available: () => true, search: () => Promise.reject(new Error("x")) };
    const slow = { name: "openviking", available: () => true, search: () => new Promise(() => undefined) };
    for (const b of [down, boom, slow]) {
      const t = Date.now();
      const r = await search("How are endorsements prorated?", { root, globalRoot: tmp(), backends: [b], budgetMs: 150 });
      expect(r.fellBack).toBe(true);
      expect(r.backend).toBe("file");
      expect(r.hit?.id).toBe("D-0001");
      expect(Date.now() - t).toBeLessThan(1500);
    }
  });

  it("passes namespace strings to a non-file backend and re-derives eligibility from the real ledger", async () => {
    const root = tmp();
    appendEntry(root, base, "owner");
    appendEntry(root, { ...base, question: "Old rule?", decision: "Old." }, "owner");
    appendEntry(root, { ...base, question: "Old rule?", decision: "New.", kind: "Changed", supersedes: "D-0002" }, "owner");
    appendEntry(root, { ...base, question: "Unsure thing?", decision: "Maybe.", evidence: "unknown" }, "owner");
    let seen: unknown;
    const bare = (id: string, score: number) => ({ id, tier: "repo", score, text: `ov ${id}` });
    const ov = {
      name: "openviking",
      available: () => true,
      search: (_q: string, names: unknown) => {
        seen = names;
        return [bare("D-0002", 0.99), bare("D-0001", 0.9), bare("D-0004", 0.95), bare("D-0777", 0.98)];
      },
    };
    const r = await search("anything at all", { root, globalRoot: tmp(), backends: [ov] });
    expect(Array.isArray(seen) && (seen as unknown[]).every((n) => typeof n === "string")).toBe(true);
    expect(seen).toContain("global");
    expect(r).toMatchObject({ backend: "openviking", fellBack: false, status: "answered" });
    expect(r.hit?.id).toBe("D-0001");
    const ids = r.context.map((c) => c.id);
    expect(ids).not.toContain("D-0002"); // superseded
    expect(ids).not.toContain("D-0777"); // unknown id dropped
    expect(ids).toContain("D-0004"); // evidence unknown: context only
  });
});
