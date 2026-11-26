/**
 * Client-side pacing for hosted-MCP calls.
 *
 * The hosted MCP rate-limits per token: 60 req/min sustained, 70-request bucket, Retry-After 1s
 * (mcp-server/src/middleware/rate-limit.ts). A big dbpush sends hundreds of calls, so a purely
 * reactive retry exhausts itself: parallel callers all see 429 and all retry in the same instant.
 *
 * This is ONE process-wide budget every MCP call takes from before it is sent:
 *   - a token bucket that refills a little slower than the server (default 1 per 1100 ms, burst 8);
 *   - a shared cooldown: after any 429 every waiting caller holds off until it passes.
 * Set WXKANBAN_MCP_PACING=off to disable (tests); WXKANBAN_MCP_MIN_INTERVAL_MS tunes the refill.
 */

const DEFAULT_INTERVAL_MS = 1100;
const BURST = 8;

let tokens = BURST;
let lastRefillMs = Date.now();
let cooldownUntilMs = 0;
let chain: Promise<void> = Promise.resolve();

function intervalMs(): number {
  const parsed = Number.parseInt(process.env['WXKANBAN_MCP_MIN_INTERVAL_MS'] ?? '', 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INTERVAL_MS;
}

function pacingOn(): boolean {
  return (process.env['WXKANBAN_MCP_PACING'] ?? '').toLowerCase() !== 'off';
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function refill(now: number, interval: number): void {
  if (interval <= 0) {
    tokens = BURST;
    lastRefillMs = now;
    return;
  }
  const add = Math.floor((now - lastRefillMs) / interval);
  if (add > 0) {
    tokens = Math.min(BURST, tokens + add);
    lastRefillMs += add * interval;
  }
}

/** Wait until this process may send one MCP request. Callers are released one at a time, in order. */
export function acquireMcpSlot(): Promise<void> {
  if (!pacingOn()) return Promise.resolve();
  const next = chain.then(async () => {
    for (;;) {
      const now = Date.now();
      if (now < cooldownUntilMs) {
        await sleep(cooldownUntilMs - now);
        continue;
      }
      const interval = intervalMs();
      refill(now, interval);
      if (tokens >= 1) {
        tokens -= 1;
        return;
      }
      await sleep(Math.max(1, lastRefillMs + interval - now));
    }
  });
  chain = next.catch(() => undefined);
  return next;
}

/** A 429 came back: empty the bucket and make every caller wait out the server's Retry-After (plus jitter). */
export function noteMcpThrottled(retryAfterSec: number): void {
  const waitMs = Math.max(1, retryAfterSec) * 1000 + Math.floor(Math.random() * 400);
  cooldownUntilMs = Math.max(cooldownUntilMs, Date.now() + waitMs);
  tokens = 0;
  lastRefillMs = Date.now();
}

export function resetMcpPacerForTests(): void {
  tokens = BURST;
  lastRefillMs = Date.now();
  cooldownUntilMs = 0;
  chain = Promise.resolve();
}
