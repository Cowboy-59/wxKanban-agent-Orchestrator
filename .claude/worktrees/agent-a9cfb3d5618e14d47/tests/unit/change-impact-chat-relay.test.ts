// SCOPE-137 / T022 — Amendment C: Impact Boundary and agree-panel prompts also post to chat (FR-010a).
//
// The self-opening agree panel and the unattended crossing logger are not themselves a
// PreToolUse call, so neither can use FR-008's deny-with-reason trick directly. Instead each
// queues the same content here, and the NEXT hook invocation (any tool call) drains the queue
// and hands it to Claude as additionalContext — or folds it into whatever the hook was already
// about to say — so it reaches chat the same way FR-008 already does. Answering through
// acknowledge.mjs (either surface) marks the hash resolved so the other surface's own answer
// for the same hash is a no-op, never a second agreement-log entry.
//
// Written directly: the fencer rejects test files with no top-level declaration.
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  drainChatRelay,
  isRelayResolved,
  markRelayResolved,
  queueChatRelay,
  renderChatRelay,
} from "../../_wxAI/impact/lib/chat-relay.mjs";

// Never reach the real wxKanban from a test (see change-impact-unattended.test.ts for why).
for (const k of ["WXKANBAN_API_TOKEN", "WXKANBAN_PROJECT_ID"]) delete process.env[k];
process.env.WXKANBAN_MCP_URL = "http://127.0.0.1:9/mcp";

let root = "";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "impact-chat-relay-"));
  mkdirSync(join(root, ".wxai"), { recursive: true });
});
afterEach(() => {
  rmSync(root, { recursive: true, force: true });
});

const report = {
  summary: { affected: 1 },
  links: [{ direction: "dependent", to: "b.ts", type: "import", confidence: "Confirmed" }],
  classification: { reasons: [{ detail: "reaches SCOPE-137 code (1 file)" }] },
};

describe("chat relay queue (Amendment C, FR-010a)", () => {
  it("drains what was queued, exactly once", () => {
    queueChatRelay(root, { source: "hand", file: "a.ts", files: ["a.ts"], hash: "h1", report });
    const first = drainChatRelay(root);
    expect(first).toHaveLength(1);
    expect(first[0].file).toBe("a.ts");

    const second = drainChatRelay(root);
    expect(second).toHaveLength(0);
  });

  it("renders the affected list and confidence labels, in FR-008's shape", () => {
    queueChatRelay(root, { source: "hand", file: "a.ts", files: ["a.ts"], hash: "h1", report });
    const text = renderChatRelay(drainChatRelay(root));
    expect(text).toMatch(/Impact Boundary/);
    expect(text).toMatch(/Affected files: 1/);
    expect(text).toMatch(/b\.ts \(import, Confirmed\)/);
    expect(text).toMatch(/acknowledge\.mjs --answer agree --hash h1/);
  });

  it("marks an unattended crossing informational — never asks, never a wait", () => {
    queueChatRelay(root, { source: "unattended", files: ["a.ts"], hash: "h2", report });
    const text = renderChatRelay(drainChatRelay(root));
    expect(text).toMatch(/Informational only/);
    expect(text).toMatch(/0 waits/);
    expect(text).not.toMatch(/acknowledge\.mjs/);
  });

  it("is unresolved until marked, then resolved for later checks", () => {
    expect(isRelayResolved(root, "h3")).toBe(false);
    markRelayResolved(root, "h3");
    expect(isRelayResolved(root, "h3")).toBe(true);
    // A different hash is unaffected: each change is checked on its own.
    expect(isRelayResolved(root, "h4")).toBe(false);
  });
});
