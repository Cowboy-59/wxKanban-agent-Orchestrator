// [SCOPE 144 / T002] FR-009 — Community Help sends the project's kit token and shows
// the server's refusal as is. Pure (no vscode), per the cockpit test convention; the
// fetch seam stands in for the wxKanban server, and the socket is never opened.
import { describe, it, expect, vi } from 'vitest';
import { ChatSocket, type ChatSocketHandlers, type FetchImpl } from '../src/services/chatSocket.js';

const CFG = {
  wxkanbanBaseUrl: 'https://wxkanban.test',
  yappchatBaseUrl: 'https://yappchatt.test',
  wsUrl: 'wss://ws.test',
};

function handlers(): ChatSocketHandlers & { errors: string[] } {
  const errors: string[] = [];
  return {
    errors,
    onStatus: () => undefined,
    onHistory: () => undefined,
    onMessage: () => undefined,
    onTyping: () => undefined,
    onError: (m) => errors.push(m),
  };
}

function refusingFetch(status: number, body: string) {
  return vi.fn(async () => new Response(body, { status })) as unknown as FetchImpl & ReturnType<typeof vi.fn>;
}

describe('ChatSocket session request (SPEC-144 FR-009)', () => {
  it('sends the kit token as the Bearer, and never in the body', async () => {
    const fetchImpl = refusingFetch(503, '{}');
    const sock = new ChatSocket(CFG, { email: 'dev@acme.com', displayName: 'Dev', apiToken: ' kit-123 ' }, handlers(), fetchImpl);
    await sock.start();
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://wxkanban.test/api/community/session');
    expect((init.headers as Record<string, string>).authorization).toBe('Bearer kit-123');
    expect(String(init.body)).not.toContain('kit-123');
  });

  it('sends no Authorization header when there is no token', async () => {
    const fetchImpl = refusingFetch(401, '{"error":"token_required"}');
    const sock = new ChatSocket(CFG, { email: 'dev@acme.com', displayName: 'Dev' }, handlers(), fetchImpl);
    await sock.start();
    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).authorization).toBeUndefined();
  });

  it("shows the server's refusal message as is", async () => {
    const h = handlers();
    const fetchImpl = refusingFetch(
      403,
      JSON.stringify({ error: 'not_company_member', message: "This email isn't a member of your company" }),
    );
    await new ChatSocket(CFG, { email: 'x@other.com', displayName: 'X', apiToken: 't' }, h, fetchImpl).start();
    expect(h.errors).toEqual(["Could not start the chat session — This email isn't a member of your company"]);
  });

  it('falls back to the status line when the body has no message', async () => {
    const h = handlers();
    await new ChatSocket(CFG, { email: 'dev@acme.com', displayName: 'Dev', apiToken: 't' }, h, refusingFetch(401, '{"error":"invalid-token"}')).start();
    expect(h.errors[0]).toContain('community/session 401');
  });
});
