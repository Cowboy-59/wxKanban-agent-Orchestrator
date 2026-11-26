import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { acquireMcpSlot, noteMcpThrottled, resetMcpPacerForTests } from '../../core/orchestrator/mcp-pacer';

describe('mcp-pacer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    delete process.env['WXKANBAN_MCP_PACING'];
    delete process.env['WXKANBAN_MCP_MIN_INTERVAL_MS'];
    resetMcpPacerForTests();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('lets a burst of 8 through at once, then spaces the rest ~1.1s apart', async () => {
    const times: number[] = [];
    const start = Date.now();
    const all = Promise.all(
      Array.from({ length: 11 }, () => acquireMcpSlot().then(() => times.push(Date.now() - start))),
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(times.length).toBe(8);
    await vi.advanceTimersByTimeAsync(1100 * 3);
    await all;
    expect(times.length).toBe(11);
    expect(times[10]! - times[7]!).toBeGreaterThanOrEqual(3300 - 5);
  });

  it('a throttle makes every waiting caller hold off for the Retry-After', async () => {
    let released = 0;
    noteMcpThrottled(2);
    const p = acquireMcpSlot().then(() => released++);
    await vi.advanceTimersByTimeAsync(1900);
    expect(released).toBe(0);
    await vi.advanceTimersByTimeAsync(2500);
    await p;
    expect(released).toBe(1);
  });

  it('WXKANBAN_MCP_PACING=off never waits', async () => {
    process.env['WXKANBAN_MCP_PACING'] = 'off';
    noteMcpThrottled(30);
    await expect(acquireMcpSlot()).resolves.toBeUndefined();
  });
});
