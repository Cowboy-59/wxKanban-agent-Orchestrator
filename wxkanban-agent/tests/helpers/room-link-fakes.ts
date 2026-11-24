// [SCOPE 144 / T022] BEGIN — fake socket and scripted YappChatt server for the Room Link tests
// SPEC-144 Amendment B. No live YappChatt: every URL the client calls is answered here, and the
// socket is a plain event emitter the test opens, feeds frames into, or leaves silent.
import type WebSocket from "ws";
import type { FetchImpl, SocketFactory, YappchattConfig } from "../../core/yappchatt";

export interface Reply {
  ok: boolean;
  status: number;
  body: unknown;
}

export const ok = (body: unknown): Reply => ({ ok: true, status: 200, body });
export const fail = (status: number, body: unknown = {}): Reply => ({ ok: false, status, body });

export class FakeSocket {
  readonly sent: string[] = [];
  terminated = false;
  closed = false;
  private readonly listeners = new Map<string, Array<(...a: unknown[]) => void>>();
  constructor(readonly url: string) {}
  on(ev: string, fn: (...a: unknown[]) => void): this {
    const list = this.listeners.get(ev) ?? [];
    list.push(fn);
    this.listeners.set(ev, list);
    return this;
  }
  emit(ev: string, ...args: unknown[]): void {
    for (const fn of this.listeners.get(ev) ?? []) fn(...args);
  }
  send(data: string): void {
    this.sent.push(data);
  }
  close(): void {
    this.closed = true;
  }
  terminate(): void {
    this.terminated = true;
  }
  frame(obj: unknown): void {
    this.emit("message", Buffer.from(JSON.stringify(obj)));
  }
  heartbeats(): number {
    return this.sent.filter((s) => s.includes('"heartbeat"')).length;
  }
}

export interface ScriptedServer {
  fetchImpl: FetchImpl;
  socketFactory: SocketFactory;
  sockets: FakeSocket[];
  calls: string[];
  /** The agent's room posts (POST .../messages), as sent. */
  posts: string[];
  sessions: Reply[];
  wsToken: () => Reply;
  history: () => Reply;
  post: () => Reply;
}

/** Routes by URL: community/session (a queue), ws/token, history, and the agent's room posts. */
export function scriptedServer(sessions: Reply[]): ScriptedServer {
  const s: ScriptedServer = {
    sockets: [],
    calls: [],
    posts: [],
    sessions,
    wsToken: () => ok({ token: "ws-token-0001" }),
    history: () => ok({ messages: [] }),
    post: () => ({ ok: true, status: 201, body: {} }),
    fetchImpl: undefined as unknown as FetchImpl,
    socketFactory: undefined as unknown as SocketFactory,
  };
  s.fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    s.calls.push(url);
    let reply: Reply;
    if (url.endsWith("/api/community/session")) reply = s.sessions.shift() ?? fail(500, { message: "no session scripted" });
    else if (url.endsWith("/api/ws/token")) reply = s.wsToken();
    else if (url.includes("/messages") && init?.method === "POST") {
      s.posts.push(String((JSON.parse(String(init.body)) as { content?: string }).content ?? ""));
      reply = s.post();
    } else if (url.includes("/messages")) reply = s.history();
    else reply = fail(404);
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
  s.socketFactory = (url: string) => {
    const sock = new FakeSocket(url);
    s.sockets.push(sock);
    return sock as unknown as WebSocket;
  };
  return s;
}

export const sessionOk = (token: string): Reply =>
  ok({ sessionToken: token, userid: "me-1", communityId: "c", spaceId: "sp", conversationId: "x" });

export const roomLinkCfg: YappchattConfig = {
  wxkanbanBaseUrl: "https://app.example",
  yappchatBaseUrl: "https://yc.example",
  wsUrl: "wss://ws.example",
  conversationId: "room-1",
  yappchatToken: "yca_room_agent_token",
  kitApiToken: "kit-api-token-0001",
};
// [SCOPE 144 / T022] END
