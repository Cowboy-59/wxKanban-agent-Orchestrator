// [SCOPE 094 / T005] BEGIN — unit tests for the health probe
import { describe, it, expect } from 'vitest';
import { probeMcpHealth, checkSystemHealth } from '../src/services/healthCheck';

function fakeFetch(handler: (url: string) => Promise<Response> | Response): typeof fetch {
  return ((url: string) => Promise.resolve(handler(url))) as unknown as typeof fetch;
}

function jsonResponse(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
  } as unknown as Response;
}

describe('probeMcpHealth', () => {
  it('reports reachable with version + dbConnected on a healthy /health', async () => {
    const f = fakeFetch((url) => {
      expect(url).toBe('https://mcp.wxperts.com/health');
      return jsonResponse({ status: 'ok', version: '0.1.0', dbConnected: true });
    });
    const r = await probeMcpHealth('https://mcp.wxperts.com', f);
    expect(r).toMatchObject({ reachable: true, version: '0.1.0', dbConnected: true, error: null });
  });

  it('strips a trailing slash before appending /health', async () => {
    const f = fakeFetch((url) => {
      expect(url).toBe('https://mcp.wxperts.com/health');
      return jsonResponse({ version: '1', dbConnected: true });
    });
    await probeMcpHealth('https://mcp.wxperts.com/', f);
  });

  it('marks unreachable on a non-2xx response', async () => {
    const f = fakeFetch(() => jsonResponse({}, false, 503));
    const r = await probeMcpHealth('https://mcp.wxperts.com', f);
    expect(r.reachable).toBe(false);
    expect(r.error).toBe('HTTP 503');
  });

  it('surfaces a network error message', async () => {
    const f = fakeFetch(() => Promise.reject(new Error('ENOTFOUND')));
    const r = await probeMcpHealth('https://mcp.wxperts.com', f);
    expect(r.reachable).toBe(false);
    expect(r.error).toBe('ENOTFOUND');
  });

  it('reports timeout when the request aborts', async () => {
    const f = fakeFetch(() => Promise.reject(Object.assign(new Error('aborted'), { name: 'AbortError' })));
    const r = await probeMcpHealth('https://mcp.wxperts.com', f);
    expect(r.error).toBe('timeout');
  });

  it('leaves dbConnected null when the hub omits it', async () => {
    const f = fakeFetch(() => jsonResponse({ version: '2' }));
    const r = await probeMcpHealth('https://mcp.wxperts.com', f);
    expect(r.dbConnected).toBeNull();
  });
});

describe('checkSystemHealth verdict', () => {
  it('is unlinked when no project folder resolves', async () => {
    const r = await checkSystemHealth([], fakeFetch(() => jsonResponse({})));
    expect(r.overall).toBe('unlinked');
    expect(r.linked).toBe(false);
  });
});
// [SCOPE 094 / T005] END
