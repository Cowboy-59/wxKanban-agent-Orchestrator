// YappChat spec 091 slice #1 — hybrid auth for the remote bridge.
//
// Verifies the WRITE-path change (post as the Claude agent via a per-room yca_
// bearer token) and the hybrid config resolution (token for writing, email for
// the kept read session). Reading over the WS is unchanged and not covered here.

import { describe, it, expect, vi } from 'vitest';
import {
  YappchattClient,
  resolveYappchattConfig,
  YappchattConfigError,
  type YappchattConfig,
  type YappchattUser,
  type FetchImpl,
} from '../../core/yappchatt';

const cfg: YappchattConfig = {
  wxkanbanBaseUrl: 'https://app.example',
  yappchatBaseUrl: 'https://yc.example',
  wsUrl: 'wss://ws.example',
  conversationId: 'room-1',
  yappchatToken: 'yca_secret_token',
};
const user: YappchattUser = { email: 'op@example.com', displayName: 'Op' };

function handlers() {
  return {
    onStatus: vi.fn(),
    onHistory: vi.fn(),
    onMessage: vi.fn(),
    onTyping: vi.fn(),
    onError: vi.fn(),
  };
}

function fetchReturning(res: { ok: boolean; status: number; body?: string }): FetchImpl {
  return vi.fn(async () => ({
    ok: res.ok,
    status: res.status,
    async text() {
      return res.body ?? '';
    },
  })) as unknown as FetchImpl;
}

describe('YappchattClient.send — agent-token posting', () => {
  it('POSTs to the room messages endpoint with Authorization: Bearer <token>', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 201 });
    const client = new YappchattClient(cfg, user, handlers(), fetchMock);

    const ok = await client.send('  on project wxKanban is connected  ');

    expect(ok).toBe(true);
    const calls = (fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls;
    expect(calls).toHaveLength(1);
    const [url, init] = calls[0] as [string, RequestInit & { headers: Record<string, string> }];
    expect(url).toBe('https://yc.example/api/engine/conversations/room-1/messages');
    expect(init.method).toBe('POST');
    expect(init.headers.authorization).toBe('Bearer yca_secret_token');
    // The broker session cookie must NOT be sent on the write path anymore.
    expect(init.headers.cookie).toBeUndefined();
    expect(JSON.parse(init.body as string)).toEqual({ content: 'on project wxKanban is connected' });
  });

  it('does not require a read session to post (token is the write identity)', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 201 });
    const client = new YappchattClient(cfg, user, handlers(), fetchMock);
    // start() was never called, so there is no yc_session — posting still works.
    expect(await client.send('status')).toBe(true);
  });

  it('reports and returns false on a non-2xx (e.g. 403 wrong room)', async () => {
    const h = handlers();
    const fetchMock = fetchReturning({ ok: false, status: 403, body: 'forbidden' });
    const client = new YappchattClient(cfg, user, h, fetchMock);

    expect(await client.send('x')).toBe(false);
    expect(h.onError).toHaveBeenCalledOnce();
    expect((h.onError.mock.calls[0][0] as string)).toContain('403');
  });

  it('rejects empty content without a network call', async () => {
    const fetchMock = fetchReturning({ ok: true, status: 201 });
    const client = new YappchattClient(cfg, user, handlers(), fetchMock);
    expect(await client.send('   ')).toBe(false);
    expect((fetchMock as unknown as { mock: { calls: unknown[][] } }).mock.calls).toHaveLength(0);
  });
});

describe('resolveYappchattConfig — hybrid identities', () => {
  const full = {
    WXKANBAN_REMOTE_ROOM_ID: 'room-1',
    WXKANBAN_YAPPCHAT_TOKEN: 'yca_x',
    WXKANBAN_CHAT_EMAIL: 'op@example.com',
  } as NodeJS.ProcessEnv;

  it('resolves the agent token (write) and the operator email (read)', () => {
    const { config, user: u } = resolveYappchattConfig(full);
    expect(config.yappchatToken).toBe('yca_x');
    expect(config.conversationId).toBe('room-1');
    expect(u.email).toBe('op@example.com');
  });

  it('throws when the agent token is missing (cannot post)', () => {
    const env = { WXKANBAN_REMOTE_ROOM_ID: 'room-1', WXKANBAN_CHAT_EMAIL: 'op@example.com' } as NodeJS.ProcessEnv;
    expect(() => resolveYappchattConfig(env)).toThrow(YappchattConfigError);
  });

  it('throws when the read email is missing (cannot be driven from the phone)', () => {
    const env = { WXKANBAN_REMOTE_ROOM_ID: 'room-1', WXKANBAN_YAPPCHAT_TOKEN: 'yca_x' } as NodeJS.ProcessEnv;
    expect(() => resolveYappchattConfig(env)).toThrow(YappchattConfigError);
  });
});
