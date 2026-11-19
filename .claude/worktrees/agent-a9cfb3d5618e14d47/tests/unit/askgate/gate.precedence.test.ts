// SPEC-142 T013 (unit half) / FR-012: the SCOPE-137 impact hook's decision always applies.
//
// Shared fixture: the REAL _wxAI/impact/hook.mjs, the Ask Gate's hook-tool.mjs and (when present)
// the Ledger area's hook-ledger-guard.mjs are each spawned on the SAME PreToolUse input, the way
// Claude Code runs every matching hook. Claude Code applies the most restrictive answer (a deny from
// any hook wins), so precedence holds when: (1) the impact hook's data-loss/boundary deny is there,
// and (2) the Ask Gate never answers "allow" and never has an opinion on a call it does not own.
// `combine` below models that rule; it is NOT a substitute for the live runs in each permission
// mode, which the managing agent records separately.
import { spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, describe, expect, it } from "vitest";

const REPO = process.cwd();
const temps: string[] = [];
afterAll(() => {
  for (const t of temps) rmSync(t, { recursive: true, force: true });
});

const HOOKS = [
  "_wxAI/impact/hook.mjs",
  "_wxAI/askgate/hook-tool.mjs",
  ...(existsSync(join(REPO, "_wxAI", "askgate", "hook-ledger-guard.mjs")) ? ["_wxAI/askgate/hook-ledger-guard.mjs"] : []),
];

type Out = { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string } } | null;

function project(): string {
  const root = mkdtempSync(join(tmpdir(), "askgate-prec-"));
  const home = mkdtempSync(join(tmpdir(), "askgate-prec-home-"));
  temps.push(root, home);
  mkdirSync(join(root, ".git"));
  mkdirSync(join(root, "db"));
  mkdirSync(join(root, "decisions"));
  writeFileSync(join(root, "decisions", "settings.yaml"), "gate:\n  mode: enforce\n  matchThreshold: 0.5\n");
  writeFileSync(join(root, "notes.txt"), "alpha\n");
  writeFileSync(join(root, ".home"), home);
  return root;
}

function runAll(root: string, input: Record<string, unknown>): Record<string, Out> {
  const home = readFileSync(join(root, ".home"), "utf-8");
  const env = { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: home, USERPROFILE: home };
  delete env.WXAI_UNATTENDED;
  delete env.OPENVIKING_URL;
  const out: Record<string, Out> = {};
  for (const h of HOOKS) {
    const r = spawnSync(process.execPath, [join(REPO, h)], {
      input: JSON.stringify({ session_id: "s-prec", hook_event_name: "PreToolUse", cwd: root, ...input }), env, encoding: "utf-8", timeout: 60_000,
    });
    expect(r.status, `${h} exit code`).toBe(0);
    out[h] = r.stdout.trim() ? JSON.parse(r.stdout) : null;
  }
  return out;
}

/** Claude Code's rule for several PreToolUse hooks on one call: deny > ask > allow > no opinion. */
function combine(outs: Record<string, Out>): { decision: string; by: string[] } {
  for (const d of ["deny", "ask", "allow"]) {
    const by = Object.entries(outs).filter(([, o]) => o?.hookSpecificOutput?.permissionDecision === d).map(([h]) => h);
    if (by.length) return { decision: d, by };
  }
  return { decision: "none", by: [] };
}

const decisionOf = (o: Out) => o?.hookSpecificOutput?.permissionDecision ?? null;

describe("hook precedence fixture (FR-012)", () => {
  it("Write with possible data loss: the impact deny applies; the Ask Gate has no opinion", () => {
    const root = project();
    const outs = runAll(root, { tool_name: "Write", tool_input: { file_path: join(root, "db", "0007_drop.sql"), content: "DROP TABLE invoices;\n" } });
    expect(decisionOf(outs["_wxAI/impact/hook.mjs"])).toBe("deny");
    expect(outs["_wxAI/impact/hook.mjs"]!.hookSpecificOutput!.permissionDecisionReason).toMatch(/possible data loss/);
    expect(outs["_wxAI/askgate/hook-tool.mjs"]).toBeNull();
    const c = combine(outs);
    expect(c.decision).toBe("deny");
    expect(c.by).toContain("_wxAI/impact/hook.mjs");
  });

  it("Bash sending DROP TABLE through psql: the impact deny applies; the Ask Gate has no opinion", () => {
    const root = project();
    const outs = runAll(root, { tool_name: "Bash", tool_input: { command: 'psql "$DATABASE_URL" -c "DROP TABLE invoices;"' } });
    expect(decisionOf(outs["_wxAI/impact/hook.mjs"])).toBe("deny");
    expect(outs["_wxAI/askgate/hook-tool.mjs"]).toBeNull();
    expect(combine(outs)).toMatchObject({ decision: "deny" });
  });

  it("a benign Edit: nobody has an opinion, so the normal permission flow decides", () => {
    const root = project();
    const outs = runAll(root, { tool_name: "Edit", tool_input: { file_path: join(root, "notes.txt"), old_string: "alpha", new_string: "beta" } });
    for (const h of HOOKS) expect(decisionOf(outs[h]), h).toBeNull();
    expect(combine(outs).decision).toBe("none");
  });

  it("no Ask Gate hook ever answers allow on any of these inputs", () => {
    const root = project();
    const inputs = [
      { tool_name: "Write", tool_input: { file_path: join(root, "db", "x.sql"), content: "DROP TABLE a;" } },
      { tool_name: "Bash", tool_input: { command: "rm -rf db" } },
      { tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "Should I drop the invoices table?", options: [] }] } },
      { tool_name: "AskUserQuestion", tool_input: { questions: [{ question: "Tabs or spaces in the new helper file?", options: [] }] } },
    ];
    for (const input of inputs) {
      const outs = runAll(root, input);
      for (const h of HOOKS.filter((x) => x.includes("askgate"))) expect(decisionOf(outs[h]), `${h} on ${input.tool_name}`).not.toBe("allow");
    }
  });

  it.runIf(HOOKS.includes("_wxAI/askgate/hook-ledger-guard.mjs"))("a direct Write to decisions/ledger.yaml is denied whatever the impact hook says", () => {
    const root = project();
    const outs = runAll(root, { tool_name: "Write", tool_input: { file_path: join(root, "decisions", "ledger.yaml"), content: "- id: D-0001\n" } });
    expect(decisionOf(outs["_wxAI/askgate/hook-ledger-guard.mjs"])).toBe("deny");
    expect(combine(outs).decision).toBe("deny");
  });
});
