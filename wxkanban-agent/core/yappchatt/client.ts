import WebSocket from "ws";

// [SCOPE 102 / T001] BEGIN — YappChatt client (plain-Node port of SCOPE-079 chatSocket)
// MODIFIED-BY: [SCOPE 144 / T002] — read login sends the kit token as Bearer; messages carry authorId (C4)
// MODIFIED-BY: [SCOPE 150 / T007] — the identities come from the project agent's connection, not .env (FR-011)
// MODIFIED-BY: [SCOPE 144 / T022] — two missed heartbeat_acks terminate the socket and reconnect (FR-013)
// MODIFIED-BY: [SCOPE 144 / T023] — a 401/403 on ws/token or history renews the session; a refused renewal stops retrying; secrets masked in every status and error (FR-014, FR-018)
// MODIFIED-BY: [SCOPE 144 / T024] — failed reconnects in a row and the outage start/end go with every status (RoomLinkInfo) (FR-016, FR-017)
// MODIFIED-BY: [SCOPE 144 / T026] — messages between replay_start and replay_end are marked replayed (FR-020)
// MODIFIED-BY: [SCOPE 144 / T030] — a new socket counts as reconnected only once its first heartbeat_ack comes back; the outage starts at the last proof of life (FR-013, FR-015, FR-017)
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
  /**
   * SPEC-144 FR-020: true when the message arrived between YappChatt's replay_start and
   * replay_end (a resume after a drop). It is discussion only: it never answers a gate.
   */
  replayed?: boolean;
}

/** SPEC-144 FR-016: the Room Link as the connection heartbeat and session status report it. */
export type RoomLinkState = "connected" | "reconnecting" | "error";

export interface RoomLinkInfo {
  roomLink: RoomLinkState;
  /** ISO time the link entered this state (for an outage, when it was first lost). */
  since: string;
  /** Failed reconnects in a row; 0 on the first loss and once connected. */
  failures: number;
  /** The last failure's reason, secrets masked, at most 200 characters. */
  reason?: string;
  /** On the "connected" status that ends an outage: when it started and ended (ISO). */
  outageStartedAt?: string;
  outageEndedAt?: string;
}

/** SPEC-144 FR-017: the failed reconnect in a row that raises the alert and sets error. */
export const ROOM_LINK_ALERT_FAILURES = 5;

export interface YappchattHandlers {
  onStatus(status: YappchattStatus, detail?: string, link?: RoomLinkInfo): void;
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
const MISSED_ACKS_DEAD = 2; // SPEC-144 FR-013
const REASON_MAX = 200;

// SPEC-144 FR-014: YappChatt refused the read session (401/403 on ws/token or history).
class SessionExpiredError extends Error {}
// SPEC-144 FR-014: /api/community/session answered with a refusal (not a network failure).
class SessionRefusedError extends Error {}

export class YappchattClient {
  private ws?: WebSocket;
  private session?: ConsumerSession;
  private lastEventId?: string;
  private readonly seen = new Set<string>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private disposed = false;
  // [SCOPE 144 / T022] heartbeat sent and not yet acked; ticks in a row with no ack.
  private awaitingAck = false;
  private missedAcks = 0;
  // [SCOPE 144 / T023] the session was just renewed (a second 401 does not renew again); a
  // refused renewal halts the client until restart. Every cookie and token value ever held,
  // so a dropped session's cookie is still masked.
  private justRenewed = false;
  private halted = false;
  private readonly secrets = new Set<string>();
  // [SCOPE 144 / T024] the Room Link: up or not, since when, failures in a row, last reason.
  private linkUp = false;
  private linkSince = Date.now();
  private failures = 0;
  private lastReason = "";
  private outageStartedAt?: number;
  // [SCOPE 144 / T026] between replay_start and replay_end.
  private replaying = false;
  // [SCOPE 144 / T030] The current socket has had a heartbeat_ack (FR-013: a heartbeat counts
  // only once acked), and the last time the link was proven alive (an ack, or any frame on a
  // proven socket). An open socket that never acks is still part of the outage.
  private proven = false;
  private lastAliveAt?: number;

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
      const msg = this.scrub((err as Error).message);
      this.handlers.onStatus("error", msg);
      this.handlers.onError(`Could not start the chat session — ${msg}`);
      return;
    }
    // History is best-effort — a live socket is more important than backfill.
    try {
      this.handlers.onHistory(await this.loadHistory());
    } catch (err) {
      // [SCOPE 144 / T023] A refused cookie here is renewed before the socket opens (FR-014).
      if (err instanceof SessionExpiredError) {
        this.session = undefined;
        if (!(await this.renewSession())) return;
      }
      /* otherwise ignore — the socket still connects */
    }
    await this.connect();
  }

  /** [SCOPE 144 / T023] Mask every cookie and token value this client has held (FR-018). */
  private scrub(text: string): string {
    let out = text.replace(/yc_session=[^;\s"']*/gi, "yc_session=[masked]");
    const known = [...this.secrets, this.cfg.kitApiToken ?? "", this.cfg.yappchatToken];
    for (const s of known) {
      const v = s.trim();
      if (v.length >= 4) out = out.split(v).join("[masked]");
    }
    return out;
  }

  /** [SCOPE 144 / T024] The Room Link as of now (FR-016, FR-017). */
  private linkInfo(): RoomLinkInfo {
    const roomLink: RoomLinkState =
      this.halted || this.failures >= ROOM_LINK_ALERT_FAILURES ? "error" : this.linkUp ? "connected" : "reconnecting";
    return {
      roomLink,
      since: new Date(this.linkSince).toISOString(),
      failures: this.failures,
      ...(this.lastReason ? { reason: this.lastReason } : {}),
    };
  }

  /**
   * [SCOPE 144 / T023] Drop the session and get a new one through /api/community/session with the
   * kit token (the FR-009 gate is unchanged). A refusal halts the client: one error status with the
   * server's own words, and no further retry until restart. A network failure retries as before.
   */
  private async renewSession(): Promise<boolean> {
    this.session = undefined;
    try {
      this.session = await this.provisionSession();
      this.justRenewed = true;
      return true;
    } catch (err) {
      if (err instanceof SessionRefusedError) {
        this.halt((err as Error).message);
        return false;
      }
      this.scheduleReconnect(`session: ${(err as Error).message}`);
      return false;
    }
  }

  /** [SCOPE 144 / T023] Stop for good (until restart): one error status, one error line. */
  private halt(reason: string): void {
    if (this.halted) return;
    this.halted = true;
    this.stopHeartbeat();
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
    this.reconnectTimer = undefined;
    const msg = this.scrub(reason).slice(0, REASON_MAX);
    this.linkUp = false;
    this.linkSince = Date.now();
    this.lastReason = msg;
    this.handlers.onStatus("error", msg, this.linkInfo());
    this.handlers.onError(`The chat session was refused — ${msg}. Restart the agent to try again.`);
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
      const detail = await safeText(res, (t) => this.scrub(t)); // [SCOPE 144 / T023] FR-018
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
      const detail = await safeText(res, (t) => this.scrub(t)); // [SCOPE 144 / T023] FR-018
      // The server's own words for a refusal (e.g. 403 "This email isn't a member of
      // your company"), shown as is.
      // [SCOPE 144 / T023] A refusal, not a network failure: a renewal stops on it (FR-014).
      throw new SessionRefusedError(refusalMessage(detail) ?? `community/session ${res.status}: ${detail}`);
    }
    const data = (await res.json()) as Partial<ConsumerSession>;
    if (!data.sessionToken || !data.userid) {
      throw new SessionRefusedError("community/session returned an incomplete payload");
    }
    this.secrets.add(data.sessionToken); // [SCOPE 144 / T023] FR-018
    return data as ConsumerSession;
  }

  private async loadHistory(): Promise<YappchattMessage[]> {
    if (!this.session) return [];
    const res = await this.fetchImpl(
      `${this.cfg.yappchatBaseUrl}/api/engine/conversations/${this.cfg.conversationId}/messages`,
      { headers: { cookie: this.sessionCookie() } },
    );
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError(`history ${res.status}`); // [SCOPE 144 / T023]
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: unknown[] };
    const rows = Array.isArray(data.messages) ? data.messages : [];
    return rows.map((m) => this.toMessage(m)).filter((m): m is YappchattMessage => m !== null);
  }

  private async wsToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.yappchatBaseUrl}/api/ws/token`, {
      headers: { cookie: this.sessionCookie() },
    });
    if (res.status === 401 || res.status === 403) throw new SessionExpiredError(`ws/token ${res.status}`); // [SCOPE 144 / T023]
    if (!res.ok) throw new Error(`ws/token ${res.status}`);
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error("ws/token returned no token");
    this.secrets.add(data.token); // [SCOPE 144 / T023] FR-018
    return data.token;
  }

  // ── socket lifecycle ─────────────────────────────────────────────────────────
  private async connect(): Promise<void> {
    if (this.disposed || this.halted) return;
    // [SCOPE 144 / T023] A session dropped after a 401/403 is renewed here, with no restart.
    if (!this.session && !(await this.renewSession())) return;
    if (this.disposed || this.halted) return;
    let token: string;
    try {
      token = await this.wsToken();
    } catch (err) {
      // [SCOPE 144 / T023] An expired cookie renews once; a fresh session refused again backs off.
      if (err instanceof SessionExpiredError && !this.justRenewed) {
        this.session = undefined;
        await this.connect();
        return;
      }
      // The fresh session was refused too: drop it, so the next attempt (after the back-off)
      // renews again instead of retrying a dead cookie forever. Each attempt counts as a failure.
      if (err instanceof SessionExpiredError) {
        this.session = undefined;
        this.justRenewed = false;
      }
      this.scheduleReconnect(`token: ${(err as Error).message}`);
      return;
    }

    const ws = this.socketFactory(`${this.cfg.wsUrl}?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    const scope = `conversation:${this.cfg.conversationId}`;

    ws.on("open", () => {
      if (this.ws !== ws) return; // [SCOPE 144 / T022] a terminated socket's late event
      ws.send(JSON.stringify({ action: "subscribe", scope }));
      // After a reconnect, replay anything missed within the engine's 5-min window.
      if (this.lastEventId) ws.send(JSON.stringify({ action: "resume", lastEventId: this.lastEventId }));
      this.justRenewed = false; // [SCOPE 144 / T023]
      this.replaying = false; // [SCOPE 144 / T026]
      this.startHeartbeat();
      // [SCOPE 144 / T030] Not connected yet: an open that drops at once must not reset the failure
      // count or end the outage (FR-017, FR-015). A probe heartbeat goes now; its ack proves the
      // socket (markProven). Unacked, it counts as the first missed beat, so a silent new socket is
      // still killed within FR-013's 90 s.
      this.proven = false;
      try {
        ws.send(JSON.stringify({ action: "heartbeat" }));
      } catch {
        /* ignore — a dead socket triggers close/reconnect */
      }
      this.awaitingAck = true;
    });
    ws.on("message", (data: WebSocket.RawData) => {
      if (this.ws === ws) this.onFrame(String(data)); // [SCOPE 144 / T022]
    });
    ws.on("close", () => {
      if (this.ws !== ws) return; // [SCOPE 144 / T022] already terminated and rescheduled
      this.ws = undefined;
      this.proven = false; // [SCOPE 144 / T030]
      this.stopHeartbeat();
      if (!this.disposed) this.scheduleReconnect("socket closed");
    });
    ws.on("error", (err: Error) => {
      if (this.ws !== ws) return; // [SCOPE 144 / T022]
      // 'close' fires after 'error' and drives the reconnect; just surface it.
      this.handlers.onStatus("error", this.scrub(err.message), this.linkInfo());
    });
  }

  /** [SCOPE 144 / T022] A socket that stopped acking is dead: kill it and reconnect (FR-013). */
  private killSocket(detail: string): void {
    const ws = this.ws;
    this.ws = undefined;
    this.proven = false; // [SCOPE 144 / T030]
    this.stopHeartbeat();
    try {
      if (typeof ws?.terminate === "function") ws.terminate();
      else ws?.close();
    } catch {
      /* ignore — it is being replaced */
    }
    this.scheduleReconnect(detail);
  }

  /**
   * [SCOPE 144 / T030] The new socket's first heartbeat_ack: only now is the link back. Reset the
   * failures in a row and report how long it was down (FR-013, FR-015, FR-016, FR-017).
   */
  private markProven(): void {
    this.proven = true;
    this.reconnectAttempts = 0;
    const now = Date.now();
    const started = this.outageStartedAt;
    this.outageStartedAt = undefined;
    this.linkUp = true;
    this.linkSince = now;
    this.failures = 0;
    this.lastReason = "";
    const link: RoomLinkInfo = {
      ...this.linkInfo(),
      ...(started !== undefined
        ? { outageStartedAt: new Date(started).toISOString(), outageEndedAt: new Date(now).toISOString() }
        : {}),
    };
    this.handlers.onStatus("connected", undefined, link);
  }

  private onFrame(raw: string): void {
    let msg: { type?: string; event?: { id?: string; type?: string; payload?: unknown } };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (this.proven) this.lastAliveAt = Date.now(); // [SCOPE 144 / T030] a proven socket spoke
    switch (msg.type) {
      case "connected":
      case "subscribed":
        return;
      case "heartbeat_ack": // [SCOPE 144 / T022] the socket is alive
        this.awaitingAck = false;
        this.missedAcks = 0;
        this.lastAliveAt = Date.now(); // [SCOPE 144 / T030]
        if (!this.proven) this.markProven(); // [SCOPE 144 / T030]
        return;
      case "replay_start": // [SCOPE 144 / T026]
        this.replaying = true;
        return;
      case "replay_end": // [SCOPE 144 / T026]
        this.replaying = false;
        return;
      case "error":
        this.handlers.onError(this.scrub(`Engine: ${(msg as { error?: string }).error ?? "unknown"}`)); // [SCOPE 144 / T023]
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
      this.handlers.onMessage(this.replaying ? { ...m, replayed: true } : m); // [SCOPE 144 / T026]
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
    this.awaitingAck = false; // [SCOPE 144 / T022]
    this.missedAcks = 0;
    this.heartbeatTimer = setInterval(() => {
      // [SCOPE 144 / T022] A heartbeat counts only once acked. Two ticks in a row with the last
      // one unacked kill the socket: a silent socket is reconnecting within 90 s (FR-013).
      if (this.awaitingAck) {
        this.missedAcks++;
        if (this.missedAcks >= MISSED_ACKS_DEAD) {
          this.killSocket("no heartbeat_ack");
          return;
        }
      }
      try {
        this.ws?.send(JSON.stringify({ action: "heartbeat" }));
      } catch {
        /* ignore — a dead socket triggers close/reconnect */
      }
      this.awaitingAck = true;
    }, HEARTBEAT_MS);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private scheduleReconnect(detail: string): void {
    if (this.disposed || this.halted || this.reconnectTimer) return;
    // [SCOPE 144 / T024] The first loss starts the outage; each later call is one more failed
    // reconnect in a row. The delay keeps its 15 s cap.
    const now = Date.now();
    if (this.outageStartedAt === undefined) {
      // [SCOPE 144 / T030] The outage began at the last proof of life, not at its detection (up to
      // 90 s later for a silent socket), so the notice's N and start time are right (FR-015). The
      // status's own `since` stays the moment the bridge knew (FR-016).
      this.outageStartedAt = Math.min(this.lastAliveAt ?? now, now);
      this.linkSince = now;
    }
    this.linkUp = false;
    this.failures = this.reconnectAttempts;
    const msg = this.scrub(detail).slice(0, REASON_MAX);
    this.lastReason = msg;
    this.handlers.onStatus("reconnecting", msg, this.linkInfo());
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

// MODIFIED-BY: [SCOPE 144 / T023] — masks before it cuts, so a secret at the 200-character edge is never half shown (FR-018)
async function safeText(res: { text(): Promise<string> }, mask: (text: string) => string = (t) => t): Promise<string> {
  try {
    return mask(await res.text()).slice(0, 200);
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
