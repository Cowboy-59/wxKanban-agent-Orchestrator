// [SCOPE 151 / T004] BEGIN — the project agent's connection record (SCOPE-132 Amendment D, FR-059 – FR-061)
//
// KAIN learns which project agents are connected from one server-side record per connection, not
// from any project folder: the agent opens it after binding its room, refreshes it every heartbeat
// with what it is doing, and closes it on a clean stop. Everything here is best-effort except one
// answer: another machine already running this project's agent (409) stops the start, because two
// agents in one room would both act on every message.
//
// The kit token is sent, never logged. Nothing here writes to disk.

export type ConnectionState = "idle" | "working" | "waiting";

/** FR-059: the fixed refusal code when another machine holds the project's open record. */
export const AGENT_ALREADY_CONNECTED = "agent_already_connected";

export class AgentAlreadyConnectedError extends Error {
  readonly code = AGENT_ALREADY_CONNECTED;
  constructor(readonly machine: string, readonly lastSeenAt: string | null) {
    super(
      `This project's agent is already connected from ${machine}${lastSeenAt ? ` (last seen ${lastSeenAt})` : ""}. ` +
        "Stop it there first, or wait 3 minutes if that machine is gone.",
    );
  }
}

export interface ConnectionRecordConfig {
  appBaseUrl: string;
  /** The project's kit API token. Never logged. */
  projectToken: string;
  supervisor: string;
}

export interface ConnectionInfo {
  machine: string;
  /** The repo folder's name only, never a path. */
  repo: string;
  agentTag: string;
  kitVersion: string | null;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal }) => Promise<{ status: number; ok: boolean; text(): Promise<string> }>;

/** A close that hangs must not eat the 5 s shutdown bound (SPEC-145 FR-007). */
const CLOSE_TIMEOUT_MS = 2000;
const DEFAULT_HEARTBEAT_SECONDS = 60;

export class ConnectionRecord {
  private connectionId: string | null = null;
  private heartbeatSeconds = DEFAULT_HEARTBEAT_SECONDS;
  private timer: ReturnType<typeof setInterval> | undefined;
  private reopened = false;

  constructor(
    private readonly cfg: ConnectionRecordConfig,
    private readonly info: ConnectionInfo,
    private readonly warn: (line: string) => void = (line) => console.warn(line),
    private readonly fetchImpl: FetchLike = fetch as unknown as FetchLike,
  ) {}

  get id(): string | null {
    return this.connectionId;
  }

  private async call(path: string, body: unknown, signal?: AbortSignal): Promise<{ status: number; text: string }> {
    const res = await this.fetchImpl(`${this.cfg.appBaseUrl}/api/project-agent/connections${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${this.cfg.projectToken}` },
      body: JSON.stringify(body),
      signal,
    });
    return { status: res.status, text: await res.text() };
  }

  /**
   * FR-059. True when a record was opened. Throws AgentAlreadyConnectedError on 409; any other
   * failure (unreachable, an older app without the route) warns once and returns false, and the
   * agent runs without a record.
   */
  async open(): Promise<boolean> {
    let r: { status: number; text: string };
    try {
      r = await this.call("", { ...this.info, supervisor: this.cfg.supervisor });
    } catch (err) {
      this.warn(`[project-agent] connection record unavailable (unreachable): ${(err as Error).message}`);
      return false;
    }
    if (r.status === 409) {
      let machine = "another machine";
      let lastSeenAt: string | null = null;
      try {
        const body = JSON.parse(r.text) as { machine?: unknown; lastSeenAt?: unknown };
        if (typeof body.machine === "string" && body.machine) machine = body.machine;
        if (typeof body.lastSeenAt === "string") lastSeenAt = body.lastSeenAt;
      } catch {
        /* keep the generic wording */
      }
      throw new AgentAlreadyConnectedError(machine, lastSeenAt);
    }
    if (r.status !== 201 && r.status !== 200) {
      this.warn(`[project-agent] connection record unavailable (http_${r.status}); running without one`);
      return false;
    }
    try {
      const body = JSON.parse(r.text) as { connectionId?: unknown; heartbeatSeconds?: unknown };
      if (typeof body.connectionId !== "string") throw new Error("no connectionId");
      this.connectionId = body.connectionId;
      if (typeof body.heartbeatSeconds === "number" && body.heartbeatSeconds >= 10) this.heartbeatSeconds = body.heartbeatSeconds;
      return true;
    } catch {
      this.warn("[project-agent] connection record unavailable (unreadable reply); running without one");
      return false;
    }
  }

  /** FR-060: refresh the record with the agent's state on a timer that never keeps the process alive. */
  startHeartbeat(state: () => ConnectionState): void {
    if (!this.connectionId || this.timer) return;
    this.timer = setInterval(() => void this.beat(state()), this.heartbeatSeconds * 1000);
    this.timer.unref?.();
  }

  /** One heartbeat. Exposed for tests; a failure changes nothing and the next tick tries again. */
  async beat(state: ConnectionState): Promise<void> {
    if (!this.connectionId) return;
    let r: { status: number; text: string };
    try {
      r = await this.call(`/${this.connectionId}/heartbeat`, { state });
    } catch {
      return;
    }
    if (r.status !== 410 || this.reopened) return;
    // The record was closed under us (a stale sweep while this machine slept). Open a new one, once.
    this.reopened = true;
    this.connectionId = null;
    try {
      if (!(await this.open())) this.stopHeartbeat();
    } catch (err) {
      // Another machine took the project while this one slept. Keep running, but stop claiming it.
      this.warn(`[project-agent] ${(err as Error).message}`);
      this.stopHeartbeat();
    }
  }

  stopHeartbeat(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  /** FR-061: close on a clean stop. Best-effort and bounded. */
  async close(): Promise<void> {
    this.stopHeartbeat();
    const id = this.connectionId;
    if (!id) return;
    this.connectionId = null;
    const ac = new AbortController();
    const t = setTimeout(() => ac.abort(), CLOSE_TIMEOUT_MS);
    t.unref?.();
    try {
      await this.call(`/${id}/close`, {}, ac.signal);
    } catch {
      /* best-effort: the row reads as not live after 3 minutes and is closed stale */
    } finally {
      clearTimeout(t);
    }
  }
}
// [SCOPE 151 / T004] END
