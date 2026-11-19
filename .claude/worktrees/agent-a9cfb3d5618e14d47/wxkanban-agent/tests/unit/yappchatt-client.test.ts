// YappChatt spec 091 slice #1 — hybrid auth for the remote bridge.
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
  type YappchattConnection,
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

// [SCOPE 150 / T005] BEGIN — the resolver takes the project agent's in-memory connection (FR-011, FR-013)
describe('resolveYappchattConfig — the project agent connection', () => {
  const conn: YappchattConnection = {
    conversationId: 'room-1',
    yappchatToken: 'yca_x',
    email: 'op@example.com',
    displayName: 'wxKanban',
  };

  it('resolves the agent token (write), the operator email (read) and the post prefix', () => {
    const { config, user: u } = resolveYappchattConfig(conn, {});
    expect(config.conversationId).toBe('room-1');
    expect(config.yappchatToken).toBe('yca_x');
    expect(config.postPrefix).toBe('wxKanban');
    expect(u).toEqual({ email: 'op@example.com', displayName: 'wxKanban' });
  });

  it('uses the hosted endpoints unless the canonical overrides are set', () => {
    expect(resolveYappchattConfig(conn, {}).config).toMatchObject({
      wxkanbanBaseUrl: 'https://wxkanban.wxperts.com',
      yappchatBaseUrl: 'https://www.yappchatt.com',
      wsUrl: 'wss://ws.wxperts.com',
    });
    const env = {
      WXKANBAN_APP_BASE_URL: 'https://app.example/',
      YAPPCHATT_URL: 'https://yc.example/',
      YAPPCHATT_WS_URL: 'wss://ws.example',
    } as NodeJS.ProcessEnv;
    expect(resolveYappchattConfig(conn, env).config).toMatchObject({
      wxkanbanBaseUrl: 'https://app.example',
      yappchatBaseUrl: 'https://yc.example',
      wsUrl: 'wss://ws.example',
    });
  });

  it('never reads the room from the environment: the retired keys and aliases are ignored', () => {
    const env = {
      YAPPCHATT_ROOM: 'env-room',
      YAPPCHATT_TOKEN: 'yca_env',
      YAPPCHATT_EMAIL: 'env@example.com',
      WXKANBAN_REMOTE_ROOM_ID: 'alias-room',
      WXKANBAN_YAPPCHAT_TOKEN: 'yca_alias',
      WXKANBAN_CHAT_EMAIL: 'alias@example.com',
      WXKANBAN_YAPPCHAT_BASE_URL: 'https://alias.example',
    } as NodeJS.ProcessEnv;
    const r = resolveYappchattConfig(conn, env);
    expect(r.config.conversationId).toBe('room-1');
    expect(r.config.yappchatToken).toBe('yca_x');
    expect(r.user.email).toBe('op@example.com');
    expect(r.config.yappchatBaseUrl).toBe('https://www.yappchatt.com');
    expect(() => resolveYappchattConfig(undefined, env)).toThrow(YappchattConfigError);
  });

  it('names the missing parts and points at the Project Agent when the connection is incomplete', () => {
    expect(() => resolveYappchattConfig(undefined, {})).toThrow(/conversationId, yappchatToken, email.*Project Agent/);
    expect(() => resolveYappchattConfig({ ...conn, yappchatToken: '  ' }, {})).toThrow(/\(yappchatToken\)/);
    expect(() => resolveYappchattConfig({ ...conn, email: '' }, {})).toThrow(YappchattConfigError);
  });

  it('falls back to the email only when no display name is given', () => {
    expect(resolveYappchattConfig({ ...conn, displayName: ' ' }, {}).user.displayName).toBe('op@example.com');
  });
});
// [SCOPE 150 / T005] END

// ---------------------------------------------------------------------------
// Content tagging (option 2 for per-project identity).
//
// The post AUTHOR is server-side from the yca_ token, so every project renders as
// the same "Claude". Tagging the content is the only lever on this side. The
// bridge drops its own echoes by exact text match, so the tagged string has to be
// what send() posts AND what the bridge records — formatOutgoing() is the single
// source of that string.
describe('outgoing post prefix', () => {
  const cfg = (postPrefix?: string): YappchattConfig => ({
    wxkanbanBaseUrl: 'https://app.example.com',
    yappchatBaseUrl: 'https://chat.example.com',
    wsUrl: 'wss://ws.example.com',
    conversationId: 'room-1',
    yappchatToken: 'yca_x',
    postPrefix,
  });
  const handlers = {
    onStatus: () => {}, onHistory: () => {}, onMessage: () => {},
    onTyping: () => {}, onError: () => {},
  };
  const make = (postPrefix?: string, fetchImpl?: unknown) =>
    new YappchattClient(cfg(postPrefix), { email: 'a@b.c', displayName: 'x' }, handlers,
      fetchImpl as never, (() => ({}) as never));

  it('tags the content with the project name', () => {
    expect(make('wxKanban').formatOutgoing('build finished')).toBe('[wxKanban] build finished');
  });

  it('is idempotent, so a retry cannot stack tags', () => {
    const c = make('wxKanban');
    expect(c.formatOutgoing('[wxKanban] already tagged')).toBe('[wxKanban] already tagged');
    expect(c.formatOutgoing(c.formatOutgoing('once'))).toBe('[wxKanban] once');
  });

  it('leaves text untouched when no prefix is configured', () => {
    expect(make(undefined).formatOutgoing('plain')).toBe('plain');
    expect(make('   ').formatOutgoing('plain')).toBe('plain');
  });

  it('tags only the first line of a multi-line post', () => {
    const NL = String.fromCharCode(10);
    expect(make('wxKanban').formatOutgoing(`line one${NL}line two`)).toBe(
      `[wxKanban] line one${NL}line two`,
    );
  });

  it('still refuses an empty post', async () => {
    const spy = vi.fn();
    expect(await make('wxKanban', spy).send('   ')).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts exactly what formatOutgoing returns', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, status: 201 }));
    const c = make('wxKanban', fetchImpl);
    await c.send('hello');
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, { body: string }])[1].body);
    expect(body.content).toBe('[wxKanban] hello');
    expect(body.content).toBe(c.formatOutgoing('hello'));
  });
});
