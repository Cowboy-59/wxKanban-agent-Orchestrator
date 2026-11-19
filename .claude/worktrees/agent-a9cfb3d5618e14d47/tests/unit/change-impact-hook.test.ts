// SCOPE-137 / T009 — the Claude Code PreToolUse hook for AI edits (FR-008).
//
// Drives decideToolCall with the JSON Claude Code sends, against the proof
// fixture project, with the network replaced. What must hold:
//   - a boundary is DENIED with the impact list as the reason (never "ask", never "allow");
//   - the developer's yes, recorded by approve.mjs, lets that exact edit through ONCE;
//   - an approval never covers a different change or file;
//   - possible data loss is denied in every mode, and needs an explicit data-loss approval;
//   - nothing to report means no output, so the normal permission flow is untouched.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { decideToolCall, proposedChange } from "../../_wxAI/impact/hook.mjs";
import { approve } from "../../_wxAI/impact/approve.mjs";
import { grantApproval, consumeApproval, APPROVAL_TTL_MS } from "../../_wxAI/impact/lib/approvals.mjs";
import { FIXTURES } from "../../_wxAI/impact/prove.mjs";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
const noNet = { conn: null };

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-hook-"));
  for (const [file, content] of Object.entries(FIXTURES.native.files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  mkdirSync(join(root, ".wxai"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.WXAI_UNATTENDED;
});

const call = (tool_name: string, tool_input: Record<string, unknown>) =>
  decideToolCall({ hook_event_name: "PreToolUse", tool_name, tool_input }, { root, deps: noNet });

/** An edit inside SCOPE-001's service: it reaches SCOPE-002's report through the items table. */
const serviceEdit = () => ({
  file_path: join(root, "src/server/service.ts"),
  old_string: "  bus.emit('item:saved', name);",
  new_string: "  bus.emit('item:saved', name.trim());",
});

type Out = { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string } } | null;

describe("SCOPE-137 T009 — the AI-edit hook (FR-008)", () => {
  it("works out the exact change an Edit, MultiEdit or Write would make", () => {
    const edit = proposedChange(root, "Edit", serviceEdit());
    expect(edit?.file).toBe("src/server/service.ts");
    expect(edit?.newSrc).toContain("name.trim()");
    expect(edit?.ranges).toEqual([[6, 6]]);
    const multi = proposedChange(root, "MultiEdit", {
      file_path: join(root, "src/lib/util.ts"),
      edits: [{ old_string: "x.trim()", new_string: "x.trim().toLowerCase()" }, { old_string: "x.toLowerCase()", new_string: "x.toUpperCase()" }],
    });
    expect(multi?.newSrc).toContain("toUpperCase");
    expect(proposedChange(root, "Write", { file_path: join(root, "src/new.ts"), content: "export const a = 1;\n" })?.isNew).toBe(true);
    expect(proposedChange(root, "Edit", { file_path: join(root, ".wxai/x.json"), old_string: "a", new_string: "b" })).toBeNull();
    expect(proposedChange(root, "Edit", { file_path: join(root, "src/lib/util.ts"), old_string: "not in the file", new_string: "b" })).toBeNull();
  });

  it("denies an edit that crosses an Impact Boundary, with the impact list as the reason", async () => {
    const out = (await call("Edit", serviceEdit())) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBe("deny");
    const reason = out?.hookSpecificOutput?.permissionDecisionReason ?? "";
    expect(reason).toMatch(/crosses an Impact Boundary/);
    expect(reason).toMatch(/SCOPE-002/);
    expect(reason).toMatch(/approve\.mjs --hash [0-9a-f]{64} --answer approve/);
    expect(reason).toMatch(/Human sign-offs: not checked/);
    expect(existsSync(join(root, ".wxai/impact.json"))).toBe(true);
  });

  it("the developer's yes lets that exact edit through once; the next identical try is asked again", async () => {
    const first = (await call("Edit", serviceEdit())) as Out;
    const hash = /--hash ([0-9a-f]{64})/.exec(first?.hookSpecificOutput?.permissionDecisionReason ?? "")?.[1] ?? "";
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a" }));
    const sent: Array<{ type: string; metadata: Record<string, unknown> }> = [];
    const recorded = await approve({ root, hash, answer: "approve", quote: "yes, go ahead", actor: "andy", send: async (e: { type: string; metadata: Record<string, unknown> }) => { sent.push(e); return {}; } });
    expect(recorded.ok).toBe(true);
    expect(recorded.logged).toMatchObject({ sent: true });
    expect(sent[0].type).toBe("change_impact_approval");
    expect(sent[0].metadata).toMatchObject({ kind: "approval", answer: "approve", quote: "yes, go ahead", attended: true });
    expect(await call("Edit", serviceEdit())).toBeNull();
    expect(((await call("Edit", serviceEdit())) as Out)?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("an approval never carries over to a different change or a different file", async () => {
    const first = (await call("Edit", serviceEdit())) as Out;
    const hash = /--hash ([0-9a-f]{64})/.exec(first?.hookSpecificOutput?.permissionDecisionReason ?? "")?.[1] ?? "";
    await approve({ root, hash, answer: "approve", quote: "ok", actor: "andy" });
    const different = { ...serviceEdit(), new_string: "  bus.emit('item:saved', name.toUpperCase());" };
    expect(((await call("Edit", different)) as Out)?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(consumeApproval(root, { hash, files: ["src/server/report.ts"] })).toBeNull();
  });

  it("an approval expires: it covers the retry, not a change made later", () => {
    grantApproval(root, { hash: "h", files: ["a.ts"], actor: "andy", quote: "ok", now: 0 });
    expect(consumeApproval(root, { hash: "h", files: ["a.ts"], now: APPROVAL_TTL_MS + 1 })).toBeNull();
  });

  it("a decline is recorded and allows nothing", async () => {
    const first = (await call("Edit", serviceEdit())) as Out;
    const hash = /--hash ([0-9a-f]{64})/.exec(first?.hookSpecificOutput?.permissionDecisionReason ?? "")?.[1] ?? "";
    expect((await approve({ root, hash, answer: "decline", quote: "no", actor: "andy" })).ok).toBe(true);
    expect(((await call("Edit", serviceEdit())) as Out)?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("approve refuses without the developer's words or for an unknown change", async () => {
    expect((await approve({ root, hash: "f".repeat(64), answer: "approve", quote: "yes" })).ok).toBe(false);
    expect((await approve({ root, hash: "f".repeat(64), answer: "approve", quote: " " })).ok).toBe(false);
  });

  it("SC-5: a drop-column migration is denied in notify mode too, and needs a data-loss approval", async () => {
    writeFileSync(join(root, ".wxai/project.json"), JSON.stringify({ impactMode: "notify" }));
    const write = { file_path: join(root, "src/db/migrations/0002_drop.sql"), content: 'ALTER TABLE "items" DROP COLUMN "sku";\n' };
    const out = (await call("Write", write)) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBe("deny");
    const reason = out?.hookSpecificOutput?.permissionDecisionReason ?? "";
    expect(reason).toMatch(/possible data loss/);
    expect(reason).toMatch(/--data-loss/);
    const hash = /--hash ([0-9a-f]{64})/.exec(reason)?.[1] ?? "";
    expect((await approve({ root, hash, answer: "approve", quote: "yes" })).ok).toBe(false);
    expect((await approve({ root, hash, answer: "approve", quote: "yes, drop sku", dataLoss: true })).ok).toBe(true);
    expect(await call("Write", write)).toBeNull();
  });

  it("SC-5: possible data loss stops an unattended run too", async () => {
    process.env.WXAI_UNATTENDED = "1";
    const out = (await call("Write", { file_path: join(root, "src/db/migrations/0003.sql"), content: "DROP TABLE orders;\n" })) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBe("deny");
  });

  it("unattended: a boundary is logged as a crossing and the edit continues (no deny)", async () => {
    process.env.WXAI_UNATTENDED = "1";
    const out = (await call("Edit", serviceEdit())) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(out?.hookSpecificOutput?.additionalContext).toMatch(/crossed an Impact Boundary and was logged/);
    const crossings = readFileSync(join(root, ".wxai/impact-crossings.jsonl"), "utf8").trim().split("\n");
    expect(crossings).toHaveLength(1);
  });

  it("notify: Claude is told what the edit affects; the edit is not blocked and not auto-approved", async () => {
    // The active scope owns the unfenced util.ts; it reaches only that scope's code: impact, no boundary.
    writeFileSync(join(root, ".wxai/project.json"), JSON.stringify({ activeScope: "001" }));
    const out = (await call("Edit", {
      file_path: join(root, "src/lib/util.ts"),
      old_string: "return x.toLowerCase();",
      new_string: "return x.toLowerCase().trim();",
    })) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(out?.hookSpecificOutput?.additionalContext).toMatch(/Change Impact \(notify\)/);
  });

  it("no impact: no output at all, so the normal permission flow is untouched", async () => {
    expect(await call("Write", { file_path: join(root, "README.md"), content: "# hi\n" })).toBeNull();
    expect(await call("Read", { file_path: join(root, "src/lib/util.ts") })).toBeNull();
  });

  it("never answers allow or ask", async () => {
    const outs = [
      await call("Edit", serviceEdit()),
      await call("Write", { file_path: join(root, "src/db/migrations/9.sql"), content: "TRUNCATE items;\n" }),
    ] as Out[];
    for (const o of outs) expect(["deny", undefined]).toContain(o?.hookSpecificOutput?.permissionDecision);
  });

  it("asks the read-only sign-off check, and a sign-off it names makes the change a boundary", async () => {
    writeFileSync(join(root, ".wxkanban-project.json"), JSON.stringify({ projectId: "ba924193-0335-4080-9fa6-33cd6b81300a" }));
    writeFileSync(join(root, ".wxai/project.json"), JSON.stringify({ activeScope: "001" }));
    const asked: Array<{ name: string; args: Record<string, unknown> }> = [];
    const out = (await decideToolCall(
      { hook_event_name: "PreToolUse", tool_name: "Edit", tool_input: { file_path: join(root, "src/lib/util.ts"), old_string: "return x.toLowerCase();", new_string: "return x.toLowerCase().trim();" } },
      {
        root,
        deps: {
          conn: { url: "http://example.invalid", token: "t" },
          mcpCall: async (_c: unknown, name: string, args: Record<string, unknown>) => {
            asked.push({ name, args });
            return { dryRun: true, matched: 1, wouldUndo: [{ itemKey: "UAT-7", title: "Slug editor" }] };
          },
        },
      },
    )) as Out;
    expect(asked[0].name).toBe("project.report_change_impact");
    expect(asked[0].args.dryRun).toBe(true);
    expect(out?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(out?.hookSpecificOutput?.permissionDecisionReason).toMatch(/would undo the human sign-off on Slug editor/);
    // The sign-off is the only reason: without it this edit would only notify.
    expect(out?.hookSpecificOutput?.permissionDecisionReason).not.toMatch(/reaches SCOPE-/);
  });
});

describe("SCOPE-137 T009 — installing the hook (FR-008)", () => {
  it("installs once, leaves the project's own hooks and settings alone, and uninstalls cleanly", async () => {
    const { installHook, hookEntry } = await import("../../_wxAI/impact/install-hook.mjs");
    const proj = mkdtempSync(join(tmpdir(), "impact-install-"));
    try {
      mkdirSync(join(proj, ".claude"), { recursive: true });
      const own = { matcher: "Bash", hooks: [{ type: "command", command: "guard.sh" }] };
      const original = { permissions: { allow: ["Read"] }, hooks: { PreToolUse: [own], SessionStart: [{ hooks: [{ type: "command", command: "hi" }] }] } };
      writeFileSync(join(proj, ".claude/settings.json"), JSON.stringify(original));
      expect(installHook(proj, { mode: "check" }).status).toBe("missing");
      expect(installHook(proj).changed).toBe(true);
      expect(installHook(proj).changed).toBe(false);
      const after = JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"));
      expect(after.permissions).toEqual(original.permissions);
      expect(after.hooks.SessionStart).toEqual(original.hooks.SessionStart);
      expect(after.hooks.PreToolUse).toEqual([own, hookEntry()]);
      expect(installHook(proj, { mode: "uninstall" }).changed).toBe(true);
      expect(JSON.parse(readFileSync(join(proj, ".claude/settings.json"), "utf8"))).toEqual(original);
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it("the installed command runs this hook in exec form, under the documented matcher", async () => {
    const { hookEntry } = await import("../../_wxAI/impact/install-hook.mjs");
    const entry = hookEntry();
    expect(entry.matcher).toBe("^(Edit|Write|MultiEdit|NotebookEdit|Bash)$");
    expect(entry.hooks[0].command).toBe('node "${CLAUDE_PROJECT_DIR}/_wxAI/impact/hook.mjs"');
  });

  it("a malformed settings file is refused, never overwritten", async () => {
    const { installHook } = await import("../../_wxAI/impact/install-hook.mjs");
    const proj = mkdtempSync(join(tmpdir(), "impact-install-"));
    try {
      mkdirSync(join(proj, ".claude"), { recursive: true });
      writeFileSync(join(proj, ".claude/settings.json"), "{ not json");
      expect(() => installHook(proj)).toThrow();
      expect(readFileSync(join(proj, ".claude/settings.json"), "utf8")).toBe("{ not json");
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});

describe("SCOPE-137 T016 — approvals never travel in a commit", () => {
  it("installing the hook makes .gitignore cover every per-developer state file, once, without touching other lines", async () => {
    const { installHook, IGNORED_STATE } = await import("../../_wxAI/impact/install-hook.mjs");
    const proj = mkdtempSync(join(tmpdir(), "impact-ignore-"));
    try {
      writeFileSync(join(proj, ".gitignore"), "node_modules/\n**/.wxai/impact.json\n");
      installHook(proj);
      installHook(proj);
      const lines = readFileSync(join(proj, ".gitignore"), "utf8").split("\n");
      expect(lines.slice(0, 2)).toEqual(["node_modules/", "**/.wxai/impact.json"]);
      for (const p of IGNORED_STATE) {
        const hits = lines.filter((l) => l === p || l === `**/${p}`);
        expect(hits, p).toHaveLength(1);
      }
      expect(IGNORED_STATE).toEqual(expect.arrayContaining([".wxai/impact-approvals.json", ".wxai/impact-pending.json"]));
    } finally {
      rmSync(proj, { recursive: true, force: true });
    }
  });
});
