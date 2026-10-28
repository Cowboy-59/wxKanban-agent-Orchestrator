import WebSocket from "ws";

// [SCOPE 102 / T001] BEGIN — YappChatt client (plain-Node port of SCOPE-079 chatSocket)
// MODIFIED-BY: [SCOPE 144 / T002] — read login sends the kit token as Bearer; messages carry authorId (C4)
// MODIFIED-BY: [SCOPE 150 / T007] — the identities come from the project agent's connection, not .env (FR-011)
// Ported from vscode-extension/src/services/chatSocket.ts (ChatSocket, SCOPE-079/T006)
// into the kit core so the Remote Session Bridge can reuse the exact same transport
// without any VS Code dependency.
//
// HYBRID auth (YappChatt spec 091 slice #1): the two directions now use DIFFERENT
// identities.
//   READ  (inbound control from the phone): broker-minted yc_session over the WS —
//         history + ws-token + subscribe. Needs the operator email. Reading still
//         needs a user session; the agent token cannot read.
//   WRITE (status/output to the room): per-room agent token (yca_…) over REST POST —
//         authored server-side as "Claude" (isagent), rendered on the left. No broker
//         session, no 🤖 prefix.
//
// The target conversation is an EXPLICIT input (the project's company-owned room, which the
// project agent fetches) rather than the broker's returned community default. We keep
// session.userid + the isagent flag for "mine"/self-echo detection.

export interface YappchattConfig {
  /** wxKanban app base (session broker for READING), e.g. https://wxkanban.wxperts.com */
  wxkanbanBaseUrl: string;
  /** YappChatt Next app base, e.g. https://www.yappchatt.com */
  yappchatBaseUrl: string;
  /** shared realtime engine, e.g. wss://ws.wxperts.com */
  wsUrl: string;
  /**
   * Prepended to every outgoing post as "[prefix] ". Exists because the AUTHOR of a
   * post is decided server-side from the yca_ agent token — every project's bridge
   * therefore renders as the same "Claude", and with a bridge per repo there is
   * nothing in the room to say which codebase is talking. Tagging the content is the
   * only lever this side of the API has.
   *
   * Empty or unset means no tagging.
   */
  postPrefix?: string;
  /** the project's company-owned room, fetched by the project agent — NOT the broker default */
  conversationId: string;
  /**
   * Per-room agent token (`yca_…`) used to POST as the Claude agent (YappChatt
   * spec 091 slice #1). Posting no longer uses the broker session cookie; the
   * token is the identity and messages are authored server-side as "Claude".
   */
  yappchatToken: string;
  /**
   * SPEC-144 FR-009: the project's wxKanban kit API token, sent as
   * "Authorization: Bearer" on POST /api/community/session (the READ login). The
   * server issues a session only for an email of this token's company. Never logged.
   */
  kitApiToken?: string;
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
   * against YappChatt's prose translation, which defeats text-match echo removal.
   */
  isAgent: boolean;
  /**
   * SPEC-144 C4: the poster's YappChatt user id (the message's `authorid` / `userid`).
   * The bridge sends it to GET /api/project-agent/approver before recording a decision.
   */
  authorId?: string;
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
   * as "Claude" (YappChatt spec 091). Independent of the read session — posting works
   * even if the WS/read side is down. Returns true on a 2xx (201). The echo arrives
   * over the WS with `isagent: true` and is dropped there, so nothing is appended
   * locally (that avoids a duplicate render/relay).
   */
  /**
   * The exact string send() will post, prefix included.
   *
   * Public because the bridge remembers what it posted to drop its own echoes by
   * exact text match. If the prefix were applied privately inside send(), the
   * bridge would record the untagged text, the echo would arrive tagged, the match
   * would silently stop working, and a legacy same-identity echo could be fed back
   * to Claude as if the operator had typed it.
   *
   * Idempotent: text already carrying the prefix is returned unchanged, so a retry
   * or a re-post cannot stack "[wxKanban] [wxKanban] …".
   */
  formatOutgoing(text: string): string {
    const body = text.trim();
    const prefix = this.cfg.postPrefix?.trim();
    if (!body || !prefix) return body;
    const tag = `[${prefix}]`;
    if (body.startsWith(tag)) return body;
    return `${tag} ${body}`;
  }

  async send(text: string): Promise<boolean> {
    const body = this.formatOutgoing(text);
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
  // the consumer secret and calls YappChatt for us — no secret ever touches the
  // bridge. SPEC-144 FR-009: the request carries the project's kit token as the
  // Bearer, and the server refuses an email outside that token's company.
  private async provisionSession(): Promise<ConsumerSession> {
    // Sent whenever the caller supplied it. Without one the request goes out as before,
    // and a gated server answers 401 token_required, surfaced below.
    const kitToken = this.cfg.kitApiToken?.trim();
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (kitToken) headers.authorization = `Bearer ${kitToken}`;
    const res = await this.fetchImpl(`${this.cfg.wxkanbanBaseUrl}/api/community/session`, {
      method: "POST",
      headers,
      body: JSON.stringify({ email: this.user.email, displayName: this.user.displayName }),
    });
    if (!res.ok) {
      const detail = await safeText(res);
      // The server's own words for a refusal (e.g. 403 "This email isn't a member of
      // your company"), shown as is.
      throw new Error(refusalMessage(detail) ?? `community/session ${res.status}: ${detail}`);
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

  /** Best-effort map of a YappChatt message row/payload to our shape. */
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
      authorId, // SPEC-144 C4
    };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === "string" && v ? v : undefined;
}

// SPEC-144 FR-009: pull the server's `message` out of a JSON error body, if any.
function refusalMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    return str(parsed.message);
  } catch {
    return undefined;
  }
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return "";
  }
}
// [SCOPE 102 / T001] END

// [SCOPE 150 / T003] BEGIN — YappChatt config from the project agent's connection (replaces 102/T001)
// The room, its agent token and the read identity come from the project agent, which fetches
// them with the project's kit token (SCOPE-134) and hands them over in memory. Nothing here
// reads them from the environment: the per-repo `.env` room keys and their aliases are retired
// (SPEC-150 FR-011). Only the optional endpoint overrides still come from the environment.
export interface YappchattConnection {
  /** the project's company-owned room (conversationId) */
  conversationId: string;
  /** WRITE identity: the per-room agent token (yca_…) */
  yappchatToken: string;
  /** READ identity: the operator email the broker mints the read session from */
  email: string;
  /** the read session's name and the post prefix; defaults to the project's name */
  displayName: string;
}

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

export function resolveYappchattConfig(
  connection: YappchattConnection | undefined,
  env: NodeJS.ProcessEnv = process.env,
): YappchattResolved {
  const conn: YappchattConnection = connection ?? { conversationId: "", yappchatToken: "", email: "", displayName: "" };
  const missing = (["conversationId", "yappchatToken", "email"] as const).filter((k) => !conn[k].trim());
  if (missing.length > 0) {
    throw new YappchattConfigError(
      `The project agent's room connection is incomplete (${missing.join(", ")}). ` +
        "Start the Project Agent from the Dev Cockpit, or run `npm run remote` in wxkanban-agent/.",
    );
  }
  const opt = (name: string, fallback: string): string => {
    const v = env[name];
    return (typeof v === "string" && v.trim() ? v.trim() : fallback).replace(/\/$/, "");
  };
  // The read session's name and the post prefix are one knob, so the room shows a single
  // identity per project. What appears as the AUTHOR of Claude's posts is decided
  // server-side from the yca_ agent token (send() carries no name field).
  const displayName = conn.displayName.trim() || conn.email;
  return {
    config: {
      wxkanbanBaseUrl: opt("WXKANBAN_APP_BASE_URL", "https://wxkanban.wxperts.com"),
      yappchatBaseUrl: opt("YAPPCHATT_URL", "https://www.yappchatt.com"),
      wsUrl: opt("YAPPCHATT_WS_URL", "wss://ws.wxperts.com"),
      conversationId: conn.conversationId.trim(),
      yappchatToken: conn.yappchatToken.trim(),
      postPrefix: displayName,
    },
    user: { email: conn.email.trim(), displayName },
  };
}
// [SCOPE 150 / T003] END
