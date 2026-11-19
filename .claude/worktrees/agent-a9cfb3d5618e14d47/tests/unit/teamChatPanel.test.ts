/**
 * SPEC-144 / T012 (FR-001, FR-002; contract C3 rows 1-2) — Company page "Team chat (YappChatt)" panel.
 *
 * No DOM test runner is installed (vitest runs `environment: "node"`; jsdom and
 * @testing-library/react are absent — see scope122-stack-picker-position.test.ts). So:
 *   - the response readers are tested with a fake fetch (no network, no server),
 *   - the presentational view is rendered with react-dom/server and its markup asserted.
 * The click-through (open dialog → confirm → POST) is covered by the readers plus the view's
 * open-dialog render; the live run belongs to T015.
 */
import { describe, it, expect } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  TeamChatPanelView,
  TEAM_CHAT_API,
  TEAM_CHAT_UNAVAILABLE_MESSAGE,
  createTeamChatAccount,
  loadTeamChatStatus,
  previewTeamChatAccount,
  tallyCount,
  type TeamChatCreateResponse,
  type TeamChatFetcher,
  type TeamChatPanelViewProps,
  type TeamChatStatus,
} from "../../src/client/components/company/TeamChatPanel";

describe("SPEC-144 T012 — Team chat (YappChatt) panel", () => {
  const calls: Array<{ path: string; init?: RequestInit }> = [];

  const fakeFetch = (status: number, body: unknown): TeamChatFetcher => {
    return async (path, init) => {
      calls.push({ path, init });
      return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });
    };
  };

  const notConnected: TeamChatStatus = {
    connected: false,
    email: null,
    contactEmail: "info@acme.com",
    yappchattUserId: null,
    groupId: null,
    linkedAt: null,
    canManage: true,
  };

  const connectedStatus: TeamChatStatus = {
    connected: true,
    email: "info@acme.com",
    contactEmail: "info@acme.com",
    yappchattUserId: "0192f0aa-1111-7000-8000-000000000001",
    groupId: "0192f0aa-2222-7000-8000-000000000002",
    linkedAt: "2026-10-24T12:00:00.000Z",
    canManage: true,
  };

  const created = (outcome: TeamChatCreateResponse["outcome"]): TeamChatCreateResponse => ({
    connected: true,
    outcome,
    email: "info@acme.com",
    yappchattUserId: "0192f0aa-1111-7000-8000-000000000001",
    groupId: "0192f0aa-2222-7000-8000-000000000002",
    members: { added: 5, updated: 0, removed: 0, failed: [] },
  });

  const noop = (): void => undefined;

  const render = (overrides: Partial<TeamChatPanelViewProps>): string =>
    renderToStaticMarkup(
      createElement(TeamChatPanelView, {
        loading: false,
        status: notConnected,
        loadError: null,
        unavailable: false,
        lastResult: null,
        createError: null,
        preview: null,
        confirmOpen: false,
        linkedNoticeOpen: false,
        pending: false,
        onOpenConfirm: noop,
        onCancelConfirm: noop,
        onConfirm: noop,
        onCloseLinkedNotice: noop,
        ...overrides,
      }),
    );

  describe("readers", () => {
    it("GET reads the status shape from C3", async () => {
      calls.length = 0;
      const result = await loadTeamChatStatus(fakeFetch(200, connectedStatus));
      expect(calls[0].path).toBe(TEAM_CHAT_API);
      expect(calls[0].init?.method).toBe("GET");
      expect(result).toEqual({ kind: "ok", data: connectedStatus });
    });

    it("GET treats a 200 without `connected` as an error, not as not-connected", async () => {
      const result = await loadTeamChatStatus(fakeFetch(200, { ok: true }));
      expect(result.kind).toBe("error");
    });

    it("GET defaults canManage to false when absent", async () => {
      const result = await loadTeamChatStatus(fakeFetch(200, { connected: false, email: null }));
      expect(result.kind === "ok" && result.data.canManage).toBe(false);
    });

    it("POST sends { confirm: true } and returns the create response", async () => {
      calls.length = 0;
      const result = await createTeamChatAccount(fakeFetch(200, created("created")));
      expect(calls[0].path).toBe(TEAM_CHAT_API);
      expect(calls[0].init?.method).toBe("POST");
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ confirm: true });
      expect(result).toEqual({ kind: "ok", data: created("created") });
    });

    it("GET reads contactEmail; email stays null until linked", async () => {
      const result = await loadTeamChatStatus(fakeFetch(200, notConnected));
      expect(result).toEqual({ kind: "ok", data: notConnected });
    });

    it("preview POSTs { confirm: false } and reads wouldLink (D5)", async () => {
      calls.length = 0;
      const result = await previewTeamChatAccount(
        fakeFetch(200, { wouldLink: { email: "info@acme.com", exists: true, displayName: "Acme" } }),
      );
      expect(calls[0].init?.method).toBe("POST");
      expect(JSON.parse(String(calls[0].init?.body))).toEqual({ confirm: false });
      expect(result).toEqual({ kind: "ok", data: { email: "info@acme.com", exists: true, displayName: "Acme" } });
    });

    it("preview: 503 is unavailable, 403 the ADMIN-only error, a body without wouldLink an error", async () => {
      expect(await previewTeamChatAccount(fakeFetch(503, { error: "companion_unavailable" }))).toEqual({ kind: "unavailable" });
      const forbidden = await previewTeamChatAccount(fakeFetch(403, { error: "forbidden" }));
      expect(forbidden.kind === "error" && forbidden.message).toMatch(/ADMIN/);
      expect((await previewTeamChatAccount(fakeFetch(200, { connected: true }))).kind).toBe("error");
    });

    it("POST 503 companion_unavailable reports unavailable", async () => {
      const result = await createTeamChatAccount(fakeFetch(503, { error: "companion_unavailable" }));
      expect(result).toEqual({ kind: "unavailable" });
    });

    it("POST 403 reports the ADMIN-only error", async () => {
      const result = await createTeamChatAccount(fakeFetch(403, { error: "forbidden" }));
      expect(result.kind).toBe("error");
      expect(result.kind === "error" && result.message).toMatch(/ADMIN/);
    });

    it("POST fills a missing members.failed with an empty list", async () => {
      const body = { ...created("already"), members: { added: 0, updated: 0, removed: 0 } };
      const result = await createTeamChatAccount(fakeFetch(200, body));
      expect(result.kind === "ok" && result.data.members.failed).toEqual([]);
    });

    it("tallyCount accepts a count or a list of ids", () => {
      expect(tallyCount(3)).toBe(3);
      expect(tallyCount(["a", "b"])).toBe(2);
    });
  });

  describe("view", () => {
    it("not connected, ADMIN: shows the status and the Create button", () => {
      const html = render({});
      expect(html).toContain("Team chat (YappChatt)");
      expect(html).toContain("YappChatt account: not connected");
      expect(html).toContain("Create YappChatt account");
    });

    it("not connected, not ADMIN: no Create button", () => {
      const html = render({ status: { ...notConnected, canManage: false } });
      expect(html).toContain("YappChatt account: not connected");
      expect(html).not.toContain("Create YappChatt account");
    });

    it("confirm dialog, no existing account: names the email and says a new account and welcome email (D5)", () => {
      const html = render({ confirmOpen: true, preview: { email: "info@acme.com", exists: false, displayName: null } });
      expect(html).toContain('role="alertdialog"');
      expect(html).toContain("info@acme.com");
      expect(html).toContain("No YappChatt account exists for");
      expect(html).toContain("welcome email");
      expect(html).toContain("Create account");
      expect(html).toContain("Cancel");
    });

    it("confirm dialog, existing account: names it and says it is linked, no email (D5)", () => {
      const html = render({ confirmOpen: true, preview: { email: "info@acme.com", exists: true, displayName: "Acme Ops" } });
      expect(html).toContain("Link the existing YappChatt account?");
      expect(html).toContain("info@acme.com");
      expect(html).toContain("(Acme Ops)");
      expect(html).toContain("no email is sent");
      expect(html).toContain("Link account");
      expect(html).not.toContain("Create account");
    });

    it("confirm dialog stays closed until the preview is known", () => {
      const html = render({ confirmOpen: true, preview: null });
      expect(html).not.toContain('role="alertdialog"');
    });

    it("connected: shows the email and the YappChatt id", () => {
      const html = render({ status: connectedStatus });
      expect(html).toContain("Connected: <span");
      expect(html).toContain("info@acme.com");
      expect(html).toContain(connectedStatus.yappchattUserId as string);
      expect(html).not.toContain("not connected");
      expect(html).not.toContain("Create YappChatt account");
    });

    it("linked outcome: says it was linked to an existing account, with the notice dialog", () => {
      const html = render({ lastResult: created("linked"), linkedNoticeOpen: true });
      expect(html).toContain("Linked to an existing YappChatt account");
      expect(html).toContain("No new account was");
    });

    it("created outcome: does not claim a link", () => {
      const html = render({ lastResult: created("created") });
      expect(html).toContain("Connected: <span");
      expect(html).not.toContain("Linked to an existing");
      expect(html).toContain("5 added");
    });

    it("shows members.failed reasons", () => {
      const result = created("created");
      result.members.failed = [{ userid: "u-1", reason: "seat_limit_reached" }];
      const html = render({ lastResult: result });
      expect(html).toContain("1 member was");
      expect(html).toContain("u-1");
      expect(html).toContain("seat_limit_reached");
    });

    it("503 companion_unavailable: shows the not-ready message and keeps the panel unchanged", () => {
      const html = render({ unavailable: true });
      // The not-ready message shows; the status is still "not connected" — nothing flipped.
      expect(html).toContain(TEAM_CHAT_UNAVAILABLE_MESSAGE.replace("'", "&#x27;"));
      expect(html).toContain("YappChatt account: not connected");
      expect(html).not.toContain("Connected: <span");
    });
  });
});
