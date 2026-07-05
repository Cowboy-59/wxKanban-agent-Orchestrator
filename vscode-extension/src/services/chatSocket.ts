import WebSocket from 'ws';

// [SCOPE 079 / T006] BEGIN — extension-host YappChat community-chat relay
// Owns the whole server-to-server handshake and the WebSocket, so the webview
// never sees the consumer secret or the yc_session. Flow:
//   1. POST /api/consumer/session  (consumer secret) -> { sessionToken, conversationId, ... }
//   2. GET  /api/engine/conversations/{id}/messages  (yc_session cookie) -> history
//   3. GET  /api/ws/token  (yc_session cookie) -> 60s WS token
//   4. wss://ws.wxperts.com?token=...  subscribe conversation:{id}  -> live events
//   5. send: POST /api/engine/conversations/{id}/messages  (yc_session cookie)  [host-proxied]
// Receive over WS, send over REST — mirrors the live YappChat web client.

export interface ChatConfig {
  /** YappChat Next app base, e.g. https://www.yappchatt.com */
  yappchatBaseUrl: string;
  /** shared realtime engine, e.g. wss://ws.wxperts.com */
  wsUrl: string;
}

export interface ChatUserInput {
  email: string;
  displayName: string;
}

export type ChatStatus = 'connecting' | 'connected' | 'reconnecting' | 'closed' | 'error';

export interface ChatMessage {
  id: string;
  from: string;
  text: string;
  ts: number;
  mine: boolean;
}

export interface ChatSocketHandlers {
  onStatus(status: ChatStatus, detail?: string): void;
  onHistory(messages: ChatMessage[]): void;
  onMessage(message: ChatMessage): void;
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

export class ChatSocket {
  private ws?: WebSocket;
  private session?: ConsumerSession;
  private lastEventId?: string;
  private readonly seen = new Set<string>();
  private heartbeatTimer?: ReturnType<typeof setInterval>;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private reconnectAttempts = 0;
  private disposed = false;

  constructor(
    private readonly cfg: ChatConfig,
    private readonly consumerSecret: string,
    private readonly user: ChatUserInput,
    private readonly handlers: ChatSocketHandlers,
    private readonly fetchImpl: FetchImpl = fetch,
    private readonly socketFactory: SocketFactory = (url) => new WebSocket(url),
  ) {}

  /** Provision the session, load history, then open the live socket. */
  async start(): Promise<void> {
    this.handlers.onStatus('connecting');
    try {
      this.session = await this.provisionSession();
    } catch (err) {
      this.handlers.onStatus('error', (err as Error).message);
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

  /** Send a visitor message. Host-proxied REST so the session never leaves the host. */
  async send(text: string): Promise<void> {
    const body = text.trim();
    if (!body || !this.session) return;
    const res = await this.fetchImpl(
      `${this.cfg.yappchatBaseUrl}/api/engine/conversations/${this.session.conversationId}/messages`,
      {
        method: 'POST',
        headers: { 'content-type': 'application/json', cookie: this.sessionCookie() },
        body: JSON.stringify({ content: body }),
      },
    );
    if (!res.ok) {
      const detail = await safeText(res);
      this.handlers.onError(`Message not sent (${res.status}) ${detail}`);
    }
    // The echo arrives over the WS (message.inbound/outbound), so we don't append
    // locally here — that avoids a duplicate render.
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
  private async provisionSession(): Promise<ConsumerSession> {
    const res = await this.fetchImpl(`${this.cfg.yappchatBaseUrl}/api/consumer/session`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.consumerSecret}` },
      body: JSON.stringify({ email: this.user.email, displayName: this.user.displayName }),
    });
    if (!res.ok) {
      throw new Error(`consumer/session ${res.status}: ${await safeText(res)}`);
    }
    const data = (await res.json()) as Partial<ConsumerSession>;
    if (!data.sessionToken || !data.conversationId || !data.userid) {
      throw new Error('consumer/session returned an incomplete payload');
    }
    return data as ConsumerSession;
  }

  private async loadHistory(): Promise<ChatMessage[]> {
    if (!this.session) return [];
    const res = await this.fetchImpl(
      `${this.cfg.yappchatBaseUrl}/api/engine/conversations/${this.session.conversationId}/messages`,
      { headers: { cookie: this.sessionCookie() } },
    );
    if (!res.ok) return [];
    const data = (await res.json()) as { messages?: unknown[] };
    const rows = Array.isArray(data.messages) ? data.messages : [];
    return rows.map((m) => this.toMessage(m)).filter((m): m is ChatMessage => m !== null);
  }

  private async wsToken(): Promise<string> {
    const res = await this.fetchImpl(`${this.cfg.yappchatBaseUrl}/api/ws/token`, {
      headers: { cookie: this.sessionCookie() },
    });
    if (!res.ok) throw new Error(`ws/token ${res.status}`);
    const data = (await res.json()) as { token?: string };
    if (!data.token) throw new Error('ws/token returned no token');
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
    const scope = `conversation:${this.session.conversationId}`;

    ws.on('open', () => {
      ws.send(JSON.stringify({ action: 'subscribe', scope }));
      // After a reconnect, replay anything missed within the engine's 5-min window.
      if (this.lastEventId) ws.send(JSON.stringify({ action: 'resume', lastEventId: this.lastEventId }));
      this.reconnectAttempts = 0;
      this.startHeartbeat();
      this.handlers.onStatus('connected');
    });
    ws.on('message', (data: WebSocket.RawData) => this.onFrame(String(data)));
    ws.on('close', () => {
      this.stopHeartbeat();
      if (!this.disposed) this.scheduleReconnect('socket closed');
    });
    ws.on('error', (err: Error) => {
      // 'close' fires after 'error' and drives the reconnect; just surface it.
      this.handlers.onStatus('error', err.message);
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
      case 'connected':
      case 'subscribed':
      case 'heartbeat_ack':
      case 'replay_start':
      case 'replay_end':
        return;
      case 'error':
        this.handlers.onError(`Engine: ${(msg as { error?: string }).error ?? 'unknown'}`);
        return;
      case 'event': {
        const ev = msg.event;
        if (!ev || typeof ev.type !== 'string') return;
        if (ev.id) this.lastEventId = ev.id;
        this.handleEvent(ev.type, ev.payload, ev.id);
        return;
      }
      default:
        return;
    }
  }

  private handleEvent(type: string, payload: unknown, id?: string): void {
    if (type === 'message.inbound' || type === 'message.outbound') {
      const m = this.toMessage(payload);
      if (!m) return;
      if (id && this.seen.has(m.id)) return; // dedupe replay overlap
      this.seen.add(m.id);
      this.handlers.onMessage(m);
      return;
    }
    if (type === 'message.typing_start' || type === 'message.typing_stop') {
      const p = (payload ?? {}) as { userid?: string };
      this.handlers.onTyping(p.userid ?? '', type === 'message.typing_start');
    }
    // message.deleted and other types are ignored for this first pass.
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      try {
        this.ws?.send(JSON.stringify({ action: 'heartbeat' }));
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
    this.handlers.onStatus('reconnecting', detail);
    const delay = Math.min(RECONNECT_BASE_MS * 2 ** this.reconnectAttempts, RECONNECT_MAX_MS);
    this.reconnectAttempts++;
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      void this.connect();
    }, delay);
  }

  // ── helpers ────────────────────────────────────────────────────────────────
  private sessionCookie(): string {
    return `yc_session=${this.session?.sessionToken ?? ''}`;
  }

  /** Best-effort map of a YappChat message row/payload to the panel's shape. */
  private toMessage(raw: unknown): ChatMessage | null {
    if (!raw || typeof raw !== 'object') return null;
    const m = raw as Record<string, unknown>;
    const id = str(m.id) ?? str(m.messageid);
    if (!id) return null;
    const authorId = str(m.authorid) ?? str(m.userid);
    const from =
      str(m.authorname) ??
      str(m.authordisplayname) ??
      str((m.author as Record<string, unknown> | undefined)?.displayname) ??
      authorId ??
      'someone';
    const tsRaw = m.createdat ?? m.ts;
    const ts = typeof tsRaw === 'number' ? tsRaw : tsRaw ? Date.parse(String(tsRaw)) : Date.now();
    return {
      id,
      from,
      text: str(m.content) ?? str(m.text) ?? '',
      ts: Number.isFinite(ts) ? ts : Date.now(),
      mine: !!authorId && authorId === this.session?.userid,
    };
  }
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v ? v : undefined;
}

async function safeText(res: { text(): Promise<string> }): Promise<string> {
  try {
    return (await res.text()).slice(0, 200);
  } catch {
    return '';
  }
}
// [SCOPE 079 / T006] END

// [SCOPE 079 / T02] BEGIN — chat config resolver (env override, hosted default)
// Mirrors projectContext / videosCatalog: an env override wins, else the hosted
// default. Lets staging point at a different YappChat/WS without a code change.
export function resolveChatConfig(): ChatConfig {
  const yappchatBaseUrl =
    (typeof process.env.WXKANBAN_YAPPCHAT_BASE_URL === 'string' && process.env.WXKANBAN_YAPPCHAT_BASE_URL) ||
    'https://www.yappchatt.com';
  const wsUrl =
    (typeof process.env.WXKANBAN_WS_URL === 'string' && process.env.WXKANBAN_WS_URL) || 'wss://ws.wxperts.com';
  return { yappchatBaseUrl: yappchatBaseUrl.replace(/\/$/, ''), wsUrl };
}
// [SCOPE 079 / T02] END
