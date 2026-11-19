// SCOPE-137 / T010 — unattended runs (FR-009, SC-4, SC-5).
//
// SC-4: an unattended run never waits on an ordinary boundary (0 denials), and 100% of its
// crossings are listed at the next checkpoint — each exactly once. SC-5: possible data loss
// still stops, and the stop is listed too. The marker that wxG-O-D --create writes is honored
// only for the session it bound to and only until it expires.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  crossingsSinceCheckpoint,
  logCrossingLine,
  MARKER_TTL_MS,
  renderCrossings,
  startUnattended,
  stopUnattended,
  unattendedState,
} from "../../_wxAI/impact/lib/unattended.mjs";
import { decideToolCall } from "../../_wxAI/impact/hook.mjs";
import { FIXTURES } from "../../_wxAI/impact/prove.mjs";

// Never reach the real wxKanban from a test. tests/setup.env.ts loads .env, which holds a real token
// and project id; on 2026-10-17 one run filed 7 test records into the production agreement log
// that way. Clear them, and point any stray send at an address nothing listens on.
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-unattended-"));
  for (const [file, content] of Object.entries(FIXTURES.native.files)) {
    mkdirSync(join(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), content);
  }
  mkdirSync(join(root, ".wxai"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
  delete process.env.WXAI_UNATTENDED;
  delete process.env.WXAI_REMOTE;
});

const NO_ENV = {} as Record<string, string>;

type Out = { hookSpecificOutput?: { permissionDecision?: string; permissionDecisionReason?: string; additionalContext?: string } } | null;

describe("SCOPE-137 T010 — knowing a run is unattended (FR-009)", () => {
  it("the environment says so; the bridge also says remote", () => {
    expect(unattendedState(root, null, { env: { WXAI_UNATTENDED: "1" } })).toMatchObject({ unattended: true, remote: false });
    expect(unattendedState(root, null, { env: { WXAI_UNATTENDED: "1", WXAI_REMOTE: "1" } })).toMatchObject({ unattended: true, remote: true, by: "remote-bridge" });
    expect(unattendedState(root, null, { env: NO_ENV }).unattended).toBe(false);
  });

  it("a marker binds to the first session that uses it; another session is asked as usual", () => {
    startUnattended(root, { by: "wxG-O-D" });
    expect(unattendedState(root, "session-a", { env: NO_ENV }).unattended).toBe(true);
    expect(unattendedState(root, "session-a", { env: NO_ENV }).unattended).toBe(true);
    const other = unattendedState(root, "session-b", { env: NO_ENV });
    expect(other.unattended).toBe(false);
    expect(other.note).toMatch(/another session/);
  });

  it("a marker expires, so a crashed run cannot silence a later session", () => {
    startUnattended(root, { by: "wxG-O-D", now: 0 });
    const later = unattendedState(root, "s", { env: NO_ENV, now: MARKER_TTL_MS + 1 });
    expect(later.unattended).toBe(false);
    expect(later.note).toMatch(/expired/);
  });

  it("stop removes the marker", () => {
    startUnattended(root, { by: "wxG-O-D" });
    expect(stopUnattended(root)).toBe(true);
    expect(unattendedState(root, "s", { env: NO_ENV }).unattended).toBe(false);
  });
});

describe("SCOPE-137 T010 — the checkpoint list (SC-4)", () => {
  it("lists each entry exactly once, and says 0 outright when there were none", () => {
    expect(renderCrossings(crossingsSinceCheckpoint(root, { advance: true }))).toMatch(/0 crossings, 0 stops/);
    logCrossingLine(root, { kind: "crossing", files: ["a.ts"], reasons: ["reaches SCOPE-002 code (1 file)"], affected: 3 });
    logCrossingLine(root, { kind: "stop", files: ["m.sql"], reasons: ["possible data loss: drop-column items.sku"] });
    const first = crossingsSinceCheckpoint(root, { advance: true });
    expect(first).toHaveLength(2);
    expect(renderCrossings(first)).toMatch(/1 crossing\(s\), 1 stop\(s\)/);
    expect(crossingsSinceCheckpoint(root, { advance: true })).toEqual([]);
  });

  it("an unattended run: 0 waits on boundaries, every crossing listed, and data loss still stops", async () => {
    process.env.WXAI_UNATTENDED = "1";
    const edits = [
      { old_string: "  bus.emit('item:saved', name);", new_string: "  bus.emit('item:saved', name.trim());" },
      // util.ts carries no fence and the project names no active scope, so reaching SCOPE-001 code is a boundary.
      { old_string: "return x.toLowerCase();", new_string: "return x.toLowerCase().trim();" },
    ];
    const files = ["src/server/service.ts", "src/lib/util.ts"];
    const outs: Out[] = [];
    for (let i = 0; i < edits.length; i++) {
      outs.push((await decideToolCall(
        { hook_event_name: "PreToolUse", tool_name: "Edit", session_id: "run-1", tool_input: { file_path: join(root, files[i]), ...edits[i] } },
        { root, deps: { conn: null } },
      )) as Out);
    }
    // 0 waits: no edit was denied.
    expect(outs.map((o) => o?.hookSpecificOutput?.permissionDecision)).toEqual([undefined, undefined]);
    expect(outs.every((o) => /crossed an Impact Boundary and was logged/.test(o?.hookSpecificOutput?.additionalContext ?? ""))).toBe(true);

    const stop = (await decideToolCall(
      { hook_event_name: "PreToolUse", tool_name: "Write", session_id: "run-1", tool_input: { file_path: join(root, "src/db/migrations/0002.sql"), content: "ALTER TABLE items DROP COLUMN sku;\n" } },
      { root, deps: { conn: null } },
    )) as Out;
    expect(stop?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(stop?.hookSpecificOutput?.permissionDecisionReason).toMatch(/nobody can approve this now/);

    // 100% listed at the next checkpoint: both crossings and the stop.
    const listed = crossingsSinceCheckpoint(root, { advance: true });
    expect(listed.filter((e) => e.kind === "crossing").map((e) => e.files[0]).sort()).toEqual([...files].sort());
    expect(listed.filter((e) => e.kind === "stop")).toHaveLength(1);
  });

  it("under the Remote Session Bridge, a data-loss stop tells Claude to ask in the room (the phone)", async () => {
    process.env.WXAI_UNATTENDED = "1";
    process.env.WXAI_REMOTE = "1";
    const out = (await decideToolCall(
      { hook_event_name: "PreToolUse", tool_name: "Write", tool_input: { file_path: join(root, "src/db/migrations/0003.sql"), content: "DROP TABLE orders;\n" } },
      { root, deps: { conn: null } },
    )) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBe("deny");
    expect(out?.hookSpecificOutput?.permissionDecisionReason).toMatch(/Remote Session Bridge: ask this question in the room/);
  });

  it("a marker-driven run (wxG-O-D --create) behaves the same as the environment", async () => {
    startUnattended(root, { by: "wxG-O-D" });
    const out = (await decideToolCall(
      { hook_event_name: "PreToolUse", tool_name: "Edit", session_id: "god-1", tool_input: { file_path: join(root, "src/server/service.ts"), old_string: "  bus.emit('item:saved', name);", new_string: "  bus.emit('item:saved', name.trim());" } },
      { root, deps: { conn: null } },
    )) as Out;
    expect(out?.hookSpecificOutput?.permissionDecision).toBeUndefined();
    expect(crossingsSinceCheckpoint(root)[0]).toMatchObject({ kind: "crossing", by: "wxG-O-D" });
  });
});
