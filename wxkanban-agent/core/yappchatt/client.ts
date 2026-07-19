import WebSocket from "ws";

// [SCOPE 102 / T001] BEGIN — YappChatt client (plain-Node port of SCOPE-079 chatSocket)
// Ported from vscode-extension/src/services/chatSocket.ts (ChatSocket, SCOPE-079/T006)
// into the kit core so the Remote Session Bridge can reuse the exact same transport
// without any VS Code dependency.
//
// HYBRID auth (YappChat spec 091 slice #1): the two directions now use DIFFERENT
// identities.
//   READ  (inbound control from the phone): broker-minted yc_session over the WS —
//         history + ws-token + subscribe. Requires WXKANBAN_CHAT_EMAIL. Reading still
//         needs a user session; the agent token cannot read.
//   WRITE (status/output to the room): per-room agent token (yca_…) over REST POST —
//         authored server-side as "Claude" (isagent), rendered on the left. No broker
//         session, no 🤖 prefix. Requires WXKANBAN_YAPPCHAT_TOKEN.
//
// The target conversation is an EXPLICIT input (the operator's private room,
// WXKANBAN_REMOTE_ROOM_ID) rather than the broker's returned community default. We keep
// session.userid + the isagent flag for "mine"/self-echo detection.

export interface YappchattConfig {
  /** wxKanban app base (session broker for READING), e.g. https://wxkanban.wxperts.com */
  wxkanbanBaseUrl: string;
  /** YappChat Next app base, e.g. https://www.yappchatt.com */
  yappchatBaseUrl: string;
  /** shared realtime engine, e.g. wss://ws.wxperts.com */
  wsUrl: string;
  /** the private room to bind to (WXKANBAN_REMOTE_ROOM_ID) — NOT the broker default */
  conversationId: string;
  /**
   * Per-room agent token (`yca_…`) used to POST as the Claude agent (YappChat
   * spec 091 slice #1). Posting no longer uses the broker session cookie; the
   * token is the identity and messages are authored server-side as "Claude".
   */
  yappchatToken: string;
}

export interface YappchattUser {
  email: string;
  displayName: string;
}

export type YappchattStatus = "connecting" | "connected" | "reconnecting" | "closed" | "error";

export interface YappchattMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  /** true when this message was authored by our own session (echo of what we sent) */
  mine: boolean;
  /**
   * true when authored by the Claude agent user (`isagent`). The bridge drops
   * these inbound so it never re-feeds its own posts into the session — robust
   * against YappChat's prose translation, which defeats text-match echo removal.
   */
  isAgent: boolean;
}

export interface YappchattHandlers {
  onStatus(status: YappchattStatus, detail?: string): void;
  onHistory(messages: YappchattMessage[]): void;
  onMessage(message: YappchattMessage): void;
  onTyping(from: string, typing: boolean): void;
  onError(message: string): void;
}

interface ConsumerSession {
  sessionToken: string;
  userid: string;
  communityId: string;
  spaceId: string;
  conversationId: string;
}

// Injectable seams keep this testable without a live server/socket.
export type FetchImpl = typeof fetch;
export type SocketFactory = (url: string) => WebSocket;

const HEARTBEAT_MS = 30_000;
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 15_000;

export class YappchattClient {
  private ws?: WebSocket;
  private session?: ConsumerSession;
  private lastEventId?: string;
  private readonly seen = new Set<string>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private disposed = false;

  constructor(
    private readonly cfg: YappchattConfig,
    private readonly user: YappchattUser,
    private readonly handlers: YappchattHandlers,
    private readonly fetchImpl: FetchImpl = fetch,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  /** The room this client is bound to (the explicit private conversation). */
  get conversationId(): string {
    return this.cfg.conversationId;
  }

  /** The resolved YappChatt user id, once the session is provisioned. */
  get userid(): string | undefined {
    return this.session?.userid;
  }

  /** Provision the session, load history, then open the live socket. */
  async start(): Promise<void> {
    this.handlers.onStatus("connecting");
    try {
      this.session = await this.provisionSession();
    } catch (err) {
      this.handlers.onStatus("error", (err as Error).message);
      this.handlers.onError(`Could not start the chat session — ${(err as Error).message}`);
      return;
    }
    // History is best-effort — a live socket is more important than backfill.
    try {
      this.handlers.onHistory(await this.loadHistory());
    } catch {
      /* ignore — the socket still connects */
    }
    await this.connect();
  }

  /**
   * Send a message into the bound room. REST post authenticated with the per-room
   * agent token (`Authorization: Bearer yca_…`); the message is authored server-side
   * as "Claude" (YappChat spec 091). Independent of the read session — posting works
   * even if the WS/read side is down. Returns true on a 2xx (201). The echo arrives
   * over the WS with `isagent: true` and is dropped there, so nothing is appended
   * locally (that avoids a duplicate render/relay).
   */
  async send(text: string): Promise<boolean> {
    const body = text.trim();
    if (!body) return false;
    const res = await this.fetchImpl(
      `${this.cfg.yappchatBaseUrl}/api/engine/conversations/${this.cfg.conversationId}/messages`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.cfg.yappchatToken}`,
        },
        body: JSON.stringify({ content: body }),
      },
    );
    if (!res.ok) {
      const detail = await safeText(res);
      this.handlers.onError(`Message not sent (${res.status}) ${detail}`);
      return false;
    }
    return true;
  }

  dispose(): void {
    this.disposed = true;
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.session = undefined;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = undefined;
  }

  // ── handshake steps ────────────────────────────────────────────────────────
  // Provision via the wxKanban broker (SCOPE-079 Amendment C): the server holds
  // the consumer secret and calls YappChat for us, so this request carries only
  // the user's email — no secret ever touches the bridge.
  private async provisionSession(): Promise<ConsumerSession> {
    const res = await this.fetchImpl(`${this.cfg.wxkanbanBaseUrl}/api/community/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: this.user.email, displayName: this.user.displayName }),
    });
    if (!res.ok) {
      throw new Error(`community/session ${res.status}: ${await safeText(res)}`);
    }
    const data = (await res.json()) as Partial<ConsumerSession>;
    if (!data.sessionToken || !data.userid) {
      throw new Error("community/session returned an incomplete payload");
    }
    return data as ConsumerSession;
  }

  private async loadHistory(): Promise<YappchattMessage[]> {
    if (!this.session) return [];
    const res = await this.fetchImpl(
      `${this.cfg.yappchatBaseUrl}/api/engine/conversations/${this.cfg.conversationId}/messages`,
      { headers: { cookie: this.sessionCookie() } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: unknown[] };
    const rows = Array.isArray(data.messages) ? data.messages : [];
    return rows.map((m) => this.toMessage(m)).filter((m): m is YappchattMessage => m !== null);
  }

  private async wsToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.yappchatBaseUrl}/api/ws/token`, {
      headers: { cookie: this.sessionCookie() },
    });
    if (!res.ok) throw new Error(`ws/token ${res.status}`);
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error("ws/token returned no token");
    return data.token;
  }

  // ── socket lifecycle ─────────────────────────────────────────────────────────
  private async connect(): Promise<void> {
    if (this.disposed || !this.session) return;
    let token: string;
    try {
      token = await this.wsToken();
    } catch (err) {
      this.scheduleReconnect(`token: ${(err as Error).message}`);
      return;
    }

    const ws = this.socketFactory(`${this.cfg.wsUrl}?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    const scope = `conversation:${this.cfg.conversationId}`;

    ws.on("open", () => {
      ws.send(JSON.stringify({ action: "subscribe", scope }));
      // After a reconnect, replay anything missed within the engine's 5-min window.
      if (this.lastEventId) ws.send(JSON.stringify({ action: "resume", lastEventId: this.lastEventId }));
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.handlers.onStatus("connected");
    });
    ws.on("message", (data: WebSocket.RawData) => this.onFrame(String(data)));
    ws.on("close", () => {
      this.stopHeartbeat();
      if (!this.disposed) this.scheduleReconnect("socket closed");
    });
    ws.on("error", (err: Error) => {
      // 'close' fires after 'error' and drives the reconnect; just surface it.
      this.handlers.onStatus("error", err.message);
    });
  }

  private onFrame(raw: string): void {
    let msg: { type?: string; event?: { id?: string; type?: string; payload?: unknown } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case "connected":
      case "subscribed":
      case "heartbeat_ack":
      case "replay_start":
      case "replay_end":
        return;
      case "error":
        this.handlers.onError(`Engine: ${(msg as { error?: string }).error ?? "unknown"}`);
        return;
      case "event": {
        const ev = msg.event;
        if (!ev || typeof ev.type !== "string") return;
        if (ev.id) this.lastEventId = ev.id;
        this.handleEvent(ev.type, ev.payload, ev.id);
        return;
      }
      default:
        return;
    }
  }

  private handleEvent(type: string, payload: unknown, id?: string): void {
    if (type === "message.inbound" || type === "message.outbound") {
      const m = this.toMessage(payload);
      if (!m) return;
      if (id && this.seen.has(m.id)) return; // dedupe replay overlap
      this.seen.add(m.id);
      this.handlers.onMessage(m);
      return;
    }
    if (type === "message.typing_start" || type === "message.typing_stop") {
      const p = (payload ?? {}) as { userid?: string };
      this.handlers.onTyping(p.userid ?? "", type === "message.typing_start");
    }
    // message.deleted and other types are ignored for this first pass.
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.ws?.send(JSON.stringify({ action: "heartbeat" }));
      } catch {
        /* ignore — a dead socket triggers close/reconnect */
      }
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(detail: string): void {
    if (this.disposed || this.reconnectTimer) return;
    this.handlers.onStatus("reconnecting", detail);
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private sessionCookie(): string {
    return `yc_session=${this.session?.sessionToken ?? ""}`;
  }

  /** Best-effort map of a YappChat message row/payload to our shape. */
  private toMessage(raw: unknown): YappchattMessage | null {
    if (!raw || typeof raw !== "object") return null;
    const m = raw as Record<string, unknown>;
    const id = str(m.id) ?? str(m.messageid);
    if (!id) return null;
    const authorId = str(m.authorid) ?? str(m.userid);
    const from =
      str(m.authorname) ??
      str(m.authordisplayname) ??
      str((m.author as Record<string, unknown> | undefined)?.displayname) ??
      authorId ??
      "someone";
    const tsRaw = m.createdat ?? m.ts;
    const ts = typeof tsRaw === "number" ? tsRaw : tsRaw ? Date.parse(String(tsRaw)) : Date.now();
    const isAgent = m.isagent === true;
    return {
      id,
      from,
      text: str(m.content) ?? str(m.text) ?? "",
      ts: Number.isFinite(ts) ? ts : Date.now(),
      // The Claude agent's posts ARE ours; so is anything the read session authored.
      mine: isAgent || (!!authorId && authorId === this.session?.userid),
      isAgent,
    };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}
// [SCOPE 102 / T001] END

// [SCOPE 102 / T001] BEGIN — YappChatt config + identity resolver (env-driven)
// Base URLs mirror SCOPE-079's resolveChatConfig (same env names + hosted defaults).
// The conversation and identity are new for SCOPE-102: the private room id and the
// operator identity the broker mints a session from. Per-project falls out because
// each repo has its own .env (see SCOPE-102 FR-001).
export interface YappchattResolved {
  config: YappchattConfig;
  user: YappchattUser;
}

export class YappchattConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "YappchattConfigError";
  }
}

export function resolveYappchattConfig(env: NodeJS.ProcessEnv = process.env): YappchattResolved {
  const wxkanbanBaseUrl =
    (typeof env.WXKANBAN_APP_BASE_URL === "string" && env.WXKANBAN_APP_BASE_URL) ||
    "https://wxkanban.wxperts.com";
  // Accept the newer short names (WXKANBAN_YAPPCHAT_URL / _ROOM) and fall back to the
  // original ones (WXKANBAN_YAPPCHAT_BASE_URL / WXKANBAN_REMOTE_ROOM_ID) for compat.
  const yappchatBaseUrl =
    (typeof env.WXKANBAN_YAPPCHAT_URL === "string" && env.WXKANBAN_YAPPCHAT_URL) ||
    (typeof env.WXKANBAN_YAPPCHAT_BASE_URL === "string" && env.WXKANBAN_YAPPCHAT_BASE_URL) ||
    "https://www.yappchatt.com";
  const wsUrl =
    (typeof env.WXKANBAN_WS_URL === "string" && env.WXKANBAN_WS_URL) || "wss://ws.wxperts.com";

  const conversationId =
    (typeof env.WXKANBAN_YAPPCHAT_ROOM === "string" && env.WXKANBAN_YAPPCHAT_ROOM.trim()) ||
    (typeof env.WXKANBAN_REMOTE_ROOM_ID === "string" && env.WXKANBAN_REMOTE_ROOM_ID.trim()) ||
    "";
  if (!conversationId) {
    throw new YappchattConfigError(
      "WXKANBAN_YAPPCHAT_ROOM (or WXKANBAN_REMOTE_ROOM_ID) is not set. Provision a private " +
        "YappChat room and set its conversationId in this project's .env before going remote.",
    );
  }

  // WRITE identity — the per-room agent token (yca_…). Posting is authored as "Claude".
  const yappchatToken =
    (typeof env.WXKANBAN_YAPPCHAT_TOKEN === "string" && env.WXKANBAN_YAPPCHAT_TOKEN.trim()) || "";
  if (!yappchatToken) {
    throw new YappchattConfigError(
      "WXKANBAN_YAPPCHAT_TOKEN is not set. In the YappChat web app, open this project's room, " +
        "click 'Connect Claude', and copy the yca_ token into this project's .env (YappChat spec 091).",
    );
  }

  // READ identity — the broker-minted user session (kept for inbound control from the
  // phone; the agent token cannot read history/subscribe).
  const email = (typeof env.WXKANBAN_CHAT_EMAIL === "string" && env.WXKANBAN_CHAT_EMAIL.trim()) || "";
  if (!email) {
    throw new YappchattConfigError(
      "WXKANBAN_CHAT_EMAIL is not set. It mints the read session used for inbound control " +
        "(steering / push approval from the phone). Posting uses WXKANBAN_YAPPCHAT_TOKEN instead.",
    );
  }
  const displayName =
    (typeof env.WXKANBAN_CHAT_DISPLAY_NAME === "string" && env.WXKANBAN_CHAT_DISPLAY_NAME.trim()) || email;

  return {
    config: {
      wxkanbanBaseUrl: wxkanbanBaseUrl.replace(/\/$/, ""),
      yappchatBaseUrl: yappchatBaseUrl.replace(/\/$/, ""),
      wsUrl,
      conversationId,
      yappchatToken,
    },
    user: { email, displayName },
  };
}
// [SCOPE 102 / T001] END
