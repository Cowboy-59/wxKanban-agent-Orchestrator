/**
 * SPEC-145 (SCOPE-132 Amendment B) T005 — the "Allow remote" switch on the project's Kit tab.
 *
 * No DOM test runner is installed (vitest runs `environment: "node"`), so, as in
 * teamChatPanel.test.ts: the Switch is rendered with react-dom/server and its markup asserted,
 * and the request helper is driven with a fake fetch.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { Switch } from "../../src/client/components/ui/Switch";
import { putAllowRemote, type RemoteAccessFetcher } from "../../src/client/components/Settings/ProjectAgentAccessPanel";

// [SCOPE 145 / T005] BEGIN — Allow remote switch tests
describe("Switch (shadcn/ui style)", () => {
  it("renders a role=switch button reflecting checked", () => {
    const on = renderToStaticMarkup(createElement(Switch, { checked: true, "aria-label": "Allow remote" }));
    expect(on).toContain('role="switch"');
    expect(on).toContain('aria-checked="true"');
    expect(on).toContain('data-state="checked"');
    const off = renderToStaticMarkup(createElement(Switch, { checked: false }));
    expect(off).toContain('aria-checked="false"');
    expect(off).toContain('data-state="unchecked"');
  });

  it("is a non-submitting button and honours disabled", () => {
    const html = renderToStaticMarkup(createElement(Switch, { checked: false, disabled: true }));
    expect(html).toContain('type="button"');
    expect(html).toContain("disabled");
  });
});

describe("putAllowRemote (FR-002)", () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];
  const fake = (status: number, body: unknown): RemoteAccessFetcher => async (path, init) => {
    calls.push({ path, init });
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  };

  it("PUTs { allowRemote } to the project's remote-access route and returns null on success", async () => {
    calls.length = 0;
    expect(await putAllowRemote("p-1", true, fake(200, { allowRemote: true, changed: true }))).toBeNull();
    expect(calls[0].path).toBe("/api/projects/p-1/remote-access");
    expect(calls[0].init?.method).toBe("PUT");
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ allowRemote: true });
  });

  it("returns the server's own refusal message (who may change it)", async () => {
    const msg = "Only a company ADMIN or this project's TEAM_MANAGER can change Allow remote.";
    expect(await putAllowRemote("p-1", true, fake(403, { error: "forbidden", message: msg }))).toBe(msg);
  });

  it("falls back to the error code, then a plain message", async () => {
    expect(await putAllowRemote("p-1", false, fake(404, { error: "Project not found" }))).toBe("Project not found");
    expect(await putAllowRemote("p-1", false, fake(500, {}))).toBe("could not change Allow remote");
  });
});
// [SCOPE 145 / T005] END
