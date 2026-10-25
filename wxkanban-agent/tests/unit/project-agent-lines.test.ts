// SPEC-145 (SCOPE-132 Amendment B) T006 — the fixed lines the Cockpit reads from the project
// agent's output: the ready line, the refusal line, and the refusal code for each way a
// project-agent start can fail. Pure functions; no network, no room.
import { describe, expect, it } from "vitest";
import { readyLine, refusalCode, refusedLine, WORKTREE_LOCKED } from "../../apps/remote-bridge/src/agent-mode";

// [SCOPE 145 / T006] BEGIN — project agent output line tests
const refused = (status: number, body: string) => new Error(`project agent room refused (${status}): ${body}`);

describe("readyLine / refusedLine", () => {
  it("are fixed and carry no token", () => {
    expect(readyLine("wxKanban Development")).toBe("[bridge] ready project=wxKanban Development");
    expect(refusedLine("remote_not_allowed")).toBe("[project-agent] refused remote_not_allowed");
    expect(refusedLine(WORKTREE_LOCKED)).toBe("[project-agent] refused worktree_locked");
  });
});

describe("refusalCode (FR-005)", () => {
  it("uses the server's own code when the room route answered", () => {
    expect(refusalCode(refused(403, '{"error":"remote_not_allowed","message":"Remote is not allowed"}'))).toBe("remote_not_allowed");
    expect(refusalCode(refused(409, '{"error":"no_company_account","contactEmail":"info@acme.com"}'))).toBe("no_company_account");
    expect(refusalCode(refused(401, '{"error":"invalid-token"}'))).toBe("invalid-token");
  });

  it("falls back to http_<status> when the body names no usable code", () => {
    expect(refusalCode(refused(502, "<html>Bad Gateway</html>"))).toBe("http_502");
    expect(refusalCode(refused(500, '{"message":"no code here"}'))).toBe("http_500");
    expect(refusalCode(refused(400, '{"error":"has spaces and $ymbols"}'))).toBe("http_400");
  });

  it("is unreachable when no answer came back at all", () => {
    expect(refusalCode(new TypeError("fetch failed"))).toBe("unreachable");
    expect(refusalCode("socket hang up")).toBe("unreachable");
  });
});
// [SCOPE 145 / T006] END
