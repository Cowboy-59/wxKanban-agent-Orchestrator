/**
 * [SCOPE 154 / T003] The pure devplan-parsing and list-building logic (FR-002).
 */
import { describe, expect, it } from "vitest";
import {
  buildStartupList,
  fetchDevplanMarkdown,
  formatStartupList,
  NO_DEVPLAN_MESSAGE,
  NOTHING_TO_DO_MESSAGE,
  parseDevplanScopeOrder,
  type AutopilotMcpSource,
} from "../../apps/remote-bridge/src/autopilot-startup";

const SRC: AutopilotMcpSource = { mcpUrl: "https://mcp.test", mcpToken: "tok", projectId: "p-1" };

// [SCOPE 154 / T003] BEGIN — test helper stubbing an MCP tool-call fetch response
function mcpOk(payload: unknown): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { content: [{ type: "text", text: JSON.stringify(payload) }] } }), {
      status: 200,
    })) as unknown as typeof fetch;
}
// [SCOPE 154 / T003] END

const DEVPLAN_MD = `
### Phase 0

| Scope | Title |
|---|---|
| SCOPE-001 | Foundation |
| SCOPE-002 | Auth |

### Phase 1

| Scope | Title |
|---|---|
| SCOPE-010 | Billing |
`;

describe("parseDevplanScopeOrder", () => {
  it("extracts every SCOPE-NNN row in document order, de-duplicated", () => {
    const md = `| SCOPE-001 | Foundation |\nsome prose mentions SCOPE-001 again\n| SCOPE-002 | Auth |`;
    expect(parseDevplanScopeOrder(md)).toEqual([
      { num: "001", title: "Foundation" },
      { num: "002", title: "Auth" },
    ]);
  });

  it("returns an empty list for markdown with no scope rows", () => {
    expect(parseDevplanScopeOrder("# Dev Plan\n\nNothing here yet.\n")).toEqual([]);
  });
});

describe("fetchDevplanMarkdown", () => {
  it("finds the devplan document by title among other documents", async () => {
    const fetchImpl = mcpOk({
      documents: [
        { title: "Some Other Doc", bodyMarkdown: "irrelevant" },
        { title: "Development Plan", bodyMarkdown: DEVPLAN_MD },
      ],
    });
    expect(await fetchDevplanMarkdown(SRC, fetchImpl)).toBe(DEVPLAN_MD);
  });

  it("returns null when no document is titled Development Plan", async () => {
    const fetchImpl = mcpOk({ documents: [{ title: "Some Other Doc", bodyMarkdown: "x" }] });
    expect(await fetchDevplanMarkdown(SRC, fetchImpl)).toBeNull();
  });

  it("returns null when there are no documents at all", async () => {
    const fetchImpl = mcpOk({ documents: [] });
    expect(await fetchDevplanMarkdown(SRC, fetchImpl)).toBeNull();
  });
});

describe("buildStartupList (FR-002)", () => {
  it("returns null — no run starts — when no devplan document exists", async () => {
    const fetchImpl = mcpOk({ documents: [] });
    expect(await buildStartupList(SRC, fetchImpl)).toBeNull();
  });

  it("filters out scopes already in Release or inactive, keeping build order", async () => {
    let call = 0;
    const fetchImpl = (async (_url: unknown, init: unknown) => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: { content: [{ type: "text", text: JSON.stringify({ documents: [{ title: "Development Plan", bodyMarkdown: DEVPLAN_MD }] }) }] },
          }),
        );
      }
      const body = JSON.parse((init as { body: string }).body) as { params: { arguments: { specNumber: string } } };
      const num = body.params.arguments.specNumber;
      const scope =
        num === "001"
          ? { found: true, scope: { stage: "Release" } }
          : num === "002"
            ? { found: true, scope: { stage: "Implementation" } }
            : { found: true, scope: { stage: "Design", inactive: true } };
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: call, result: { content: [{ type: "text", text: JSON.stringify(scope) }] } }),
      );
    }) as unknown as typeof fetch;

    const result = await buildStartupList(SRC, fetchImpl);
    expect(result).toEqual([{ num: "002", title: "Auth", stage: "Implementation" }]);
  });

  it("drops a scope scope_stage does not find at all", async () => {
    let call = 0;
    const fetchImpl = (async () => {
      call++;
      if (call === 1) {
        return new Response(
          JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            result: {
              content: [
                {
                  type: "text",
                  text: JSON.stringify({ documents: [{ title: "Development Plan", bodyMarkdown: "| SCOPE-099 | Ghost |" }] }),
                },
              ],
            },
          }),
        );
      }
      return new Response(
        JSON.stringify({ jsonrpc: "2.0", id: call, result: { content: [{ type: "text", text: JSON.stringify({ found: false }) }] } }),
      );
    }) as unknown as typeof fetch;

    expect(await buildStartupList(SRC, fetchImpl)).toEqual([]);
  });
});

describe("formatStartupList", () => {
  it("numbers the scopes, singular/plural header, and asks for \"go\"", () => {
    const text = formatStartupList([{ num: "002", title: "Auth", stage: "Implementation" }]);
    expect(text).toContain("1 scope from the dev plan");
    expect(text).toContain("1. SCOPE-002 — Auth (Implementation)");
    expect(text).toContain('Reply "go" to start working this list.');
  });

  it("pluralizes for more than one scope", () => {
    const text = formatStartupList([
      { num: "002", title: "Auth", stage: "Implementation" },
      { num: "010", title: "Billing", stage: "Design" },
    ]);
    expect(text).toContain("2 scopes from the dev plan");
    expect(text).toContain("2. SCOPE-010 — Billing (Design)");
  });
});

describe("the fixed messages", () => {
  it("are distinct, explanatory lines", () => {
    expect(NO_DEVPLAN_MESSAGE).toMatch(/no server dev plan/i);
    expect(NOTHING_TO_DO_MESSAGE).toMatch(/Release or inactive/);
  });
});
