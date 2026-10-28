// [SCOPE 148 / T012] BEGIN — the bound MCP token holder (SPEC-148 FR-016, SCOPE-132 FR-057)
//
// The bound MCP token the project agent gets on connect lives 12 hours, and every mint revokes
// the one before it. A bridge that runs past a day would call the MCP with a dead token at 06:00,
// so the token is never read directly: callers ask the holder, which renews it by re-calling the
// room route when it is close to expiry. One holder per bridge, shared by triage and
// recordOverride, so a renewal for one never silently revokes the other's copy.
//
// Expiry is the predictable case. The other is a token that dies early — revoked by hand, or by
// a second mint somewhere else — which the clock cannot see. The MCP answers that with a 401
// (missing-token, invalid-token, grant-revoked), so `withToken` renews once on a 401 and retries
// once. Once, not in a loop: a 401 straight after a fresh mint means the grant itself is gone,
// and retrying cannot fix that.

export interface HeldToken {
  token: string;
  /** ISO timestamp, as the room route returns it. */
  expiresAt: string;
}

export interface McpTokenHolderOptions {
  initial: HeldToken;
  /** Mints a fresh token (re-calls POST /api/project-agent/room). Revokes the previous one. */
  renew: () => Promise<HeldToken>;
  /** Told once per failure streak, with the reason. Never given the token. */
  onRenewFailed?: (reason: string) => void;
  now?: () => number;
}

/** Renew when less than this is left (FR-016). */
export const RENEW_MARGIN_MS = 15 * 60 * 1000;

/** A triage run starts only with at least this much left, so no renewal lands mid-run. */
export const TRIAGE_MIN_VALID_MS = 3 * 60 * 60 * 1000;

/** True for an error whose message carries an HTTP 401, as the kit's MCP callers format them. */
export function isUnauthorizedError(err: unknown): boolean {
  return err instanceof Error && /\(401\)/.test(err.message);
}

export class McpTokenHolder {
  private held: HeldToken;
  private inFlight?: Promise<string>;
  private failureReported = false;
  private readonly now: () => number;

  constructor(private readonly opts: McpTokenHolderOptions) {
    this.held = opts.initial;
    this.now = opts.now ?? Date.now;
  }

  /** Milliseconds left on the held token; negative once expired, 0 if the expiry is unreadable. */
  remainingMs(): number {
    const at = Date.parse(this.held.expiresAt);
    return Number.isNaN(at) ? 0 : at - this.now();
  }

  /**
   * The token to call with. Renewed first when fewer than `minValidMs` are left. Concurrent
   * callers share one renewal. A failed renewal falls back to the held token: the call then
   * fails at the server with a reason the caller already reports, and the next use tries again.
   */
  async get(minValidMs: number = RENEW_MARGIN_MS): Promise<string> {
    if (this.remainingMs() > minValidMs) return this.held.token;
    return this.renew();
  }

  /**
   * The server refused `rejected` with a 401. Renew, unless another caller already replaced it —
   * then the current token is the answer and no second mint happens. Returns `rejected` itself
   * when the renewal failed, which the caller reads as "nothing new to retry with".
   */
  async renewAfterRejection(rejected: string): Promise<string> {
    if (this.held.token !== rejected) return this.held.token;
    return this.renew();
  }

  /**
   * Make one MCP call with the held token; on a 401 renew and make it once more. A 401 is either
   * a returned result `isRejected` recognizes or a thrown error naming the status. If the renewal
   * yields nothing new, the first outcome stands, so the caller reports the original failure.
   */
  async withToken<T>(
    call: (token: string) => Promise<T>,
    opts: { isRejected?: (result: T) => boolean; minValidMs?: number } = {},
  ): Promise<T> {
    const token = await this.get(opts.minValidMs);
    let first: T;
    try {
      first = await call(token);
    } catch (err) {
      if (!isUnauthorizedError(err)) throw err;
      const fresh = await this.renewAfterRejection(token);
      if (fresh === token) throw err;
      return call(fresh);
    }
    if (!opts.isRejected?.(first)) return first;
    const fresh = await this.renewAfterRejection(token);
    return fresh === token ? first : call(fresh);
  }

  private renew(): Promise<string> {
    if (!this.inFlight) {
      this.inFlight = this.opts
        .renew()
        .then((fresh) => {
          this.held = fresh;
          this.failureReported = false;
          return fresh.token;
        })
        .catch((err: unknown) => {
          if (!this.failureReported) {
            this.failureReported = true;
            this.opts.onRenewFailed?.(err instanceof Error ? err.message : String(err));
          }
          return this.held.token;
        })
        .finally(() => {
          this.inFlight = undefined;
        });
    }
    return this.inFlight;
  }
}
// [SCOPE 148 / T012] END
