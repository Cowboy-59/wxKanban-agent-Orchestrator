// [SCOPE 144 / T002] BEGIN — read login sends the kit token; refusals shown as is; messages carry authorId (C4)
// SPEC-144 FR-009: POST /api/community/session requires the project's kit token as
// "Authorization: Bearer". The bridge's read login sends config.kitApiToken, and a
// server refusal ("This email isn't a member of your company") reaches the operator
// in the server's own words. C4: every YappchattMessage carries the poster's id.
import { describe, it, expect, vi } from "vitest";
import {
  YappchattClient,
  type YappchattConfig,
  type YappchattUser,
  type FetchImpl,
  type SocketFactory,
} from "../../core/yappchatt";

const baseCfg: YappchattConfig = {
  wxkanbanBaseUrl: "https://app.example",
  yappchatBaseUrl: "https://yc.example",
  wsUrl: "wss://ws.example",
  conversationId: "room-1",
  yappchatToken: "yca_secret_token",
};
const user: YappchattUser = { email: "op@example.com", displayName: "Op" };

function handlers() {
  return {
    onStatus: vi.fn(),
    onHistory: vi.fn(),
    onMessage: vi.fn(),
    onTyping: vi.fn(),
    onError: vi.fn(),
  };
}

interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

// Routes by URL. ws/token fails, so start() stops before any socket opens.
function routedFetch(session: Reply, history: unknown[] = []): FetchImpl {
  return vi.fn(async (input: string | URL | Request) => {
    const url = String(input);
    const reply: Reply = url.endsWith("/api/community/session")
      ? session
      : url.includes("/messages")
        ? { ok: true, status: 200, body: { messages: history } }
        : { ok: false, status: 503, body: {} };
    const text = typeof reply.body === "string" ? reply.body : JSON.stringify(reply.body);
    return {
      ok: reply.ok,
      status: reply.status,
      async text() {
        return text;
      },
      async json() {
        return JSON.parse(text) as unknown;
      },
    };
  }) as unknown as FetchImpl;
}

const noSocket: SocketFactory = () => {
  throw new Error("no socket in this test");
};

const SESSION_OK: Reply = {
  ok: true,
  status: 200,
  body: { sessionToken: "s-1", userid: "me-1", communityId: "c", spaceId: "sp", conversationId: "x" },
};

function sessionCall(fetchMock: FetchImpl): RequestInit & { headers: Record<string, string> } {
  const calls = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls;
  const call = calls.find((c) => String(c[0]).endsWith("/api/community/session"));
  if (!call) throw new Error("no community/session call");
  return call[1] as RequestInit & { headers: Record<string, string> };
}

describe("read login — kit token as Bearer (SPEC-144 FR-009)", () => {
  it("sends Authorization: Bearer <kit token> with the email", async () => {
    const fetchMock = routedFetch(SESSION_OK);
    const client = new YappchattClient({ ...baseCfg, kitApiToken: "kit-tok-1" }, user, handlers(), fetchMock, noSocket);
    await client.start();
    expect(client.userid).toBe("me-1");
    client.dispose();

    const init = sessionCall(fetchMock);
    expect(init.method).toBe("POST");
    expect(init.headers.authorization).toBe("Bearer kit-tok-1");
    expect(JSON.parse(init.body as string)).toEqual({ email: "op@example.com", displayName: "Op" });
  });

  it("sends no Authorization header when no kit token was supplied", async () => {
    const fetchMock = routedFetch(SESSION_OK);
    const client = new YappchattClient(baseCfg, user, handlers(), fetchMock, noSocket);
    await client.start();
    client.dispose();
    expect(sessionCall(fetchMock).headers.authorization).toBeUndefined();
  });

  it("shows the server's 403 refusal as is and opens no session", async () => {
    const h = handlers();
    const fetchMock = routedFetch({
      ok: false,
      status: 403,
      body: { error: "not_company_member", message: "This email isn't a member of your company" },
    });
    const client = new YappchattClient({ ...baseCfg, kitApiToken: "kit-tok-1" }, user, h, fetchMock, noSocket);
    await client.start();
    client.dispose();

    expect(h.onError).toHaveBeenCalledOnce();
    expect(h.onError.mock.calls[0][0] as string).toContain("This email isn't a member of your company");
    expect(h.onError.mock.calls[0][0] as string).not.toContain("not_company_member");
    expect(h.onHistory).not.toHaveBeenCalled();
    expect(client.userid).toBeUndefined();
  });

  it("falls back to status + body for an error with no message", async () => {
    const h = handlers();
    const fetchMock = routedFetch({ ok: false, status: 401, body: { error: "invalid-token" } });
    const client = new YappchattClient({ ...baseCfg, kitApiToken: "bad" }, user, h, fetchMock, noSocket);
    await client.start();
    client.dispose();
    expect(h.onError.mock.calls[0][0] as string).toContain("community/session 401");
  });
});

describe("YappchattMessage.authorId (SPEC-144 C4)", () => {
  it("is set from authorid, else userid, and absent when neither is present", async () => {
    const h = handlers();
    const fetchMock = routedFetch(SESSION_OK, [
      { id: "m1", authorid: "yc-user-a", content: "DQ-01 yes" },
      { id: "m2", userid: "yc-user-b", content: "hello" },
      { id: "m3", content: "anonymous" },
    ]);
    const client = new YappchattClient({ ...baseCfg, kitApiToken: "kit-tok-1" }, user, h, fetchMock, noSocket);
    await client.start();
    client.dispose();

    expect(h.onHistory).toHaveBeenCalledOnce();
    const msgs = h.onHistory.mock.calls[0][0] as Array<{ id: string; authorId?: string }>;
    expect(msgs.map((m) => [m.id, m.authorId])).toEqual([
      ["m1", "yc-user-a"],
      ["m2", "yc-user-b"],
      ["m3", undefined],
    ]);
  });
});
// [SCOPE 144 / T002] END
