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
    const env = { YAPPCHATT_ROOM: 'room-1', YAPPCHATT_TOKEN: 'yca_x' } as NodeJS.ProcessEnv;
    expect(() => resolveYappchattConfig(env)).toThrow(YappchattConfigError);
  });
});

// ---------------------------------------------------------------------------
// Canonical env names (two Ts, matching the product and yappchatt.com).
//
// Every original name spelled YappChatt with one T. The canonical names are now
// WXKANBAN_YAPPCHATT_*, with the one-T spellings accepted as deprecated
// fallbacks so no existing .env breaks. Both halves need pinning: a regression
// that dropped the fallbacks would break every deployed consumer .env silently,
// and one that dropped canonical precedence would make a corrected .env behave
// differently from a stale one for no visible reason.
describe('canonical vs deprecated env names', () => {
  const base = { YAPPCHATT_EMAIL: 'a@b.c' };

  it('prefers the bare canonical names and reports nothing deprecated', () => {
    const r = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'canonical-room',
      YAPPCHATT_TOKEN: 'yca_canonical',
      YAPPCHATT_URL: 'https://canonical.example.com',
    } as NodeJS.ProcessEnv);
    expect(r.config.conversationId).toBe('canonical-room');
    expect(r.config.yappchatToken).toBe('yca_canonical');
    expect(r.config.yappchatBaseUrl).toBe('https://canonical.example.com');
    expect(r.deprecated).toEqual([]);
  });

  it('still resolves a fully legacy .env, and says which names are stale', () => {
    const r = resolveYappchattConfig({
      WXKANBAN_CHAT_EMAIL: 'old@example.com',
      WXKANBAN_REMOTE_ROOM_ID: 'legacy-room',
      WXKANBAN_YAPPCHAT_TOKEN: 'yca_legacy',
      WXKANBAN_YAPPCHAT_BASE_URL: 'https://legacy.example.com',
    } as NodeJS.ProcessEnv);
    expect(r.config.conversationId).toBe('legacy-room');
    expect(r.config.yappchatToken).toBe('yca_legacy');
    expect(r.config.yappchatBaseUrl).toBe('https://legacy.example.com');
    expect(r.user.email).toBe('old@example.com');
    expect(r.deprecated).toContain('WXKANBAN_REMOTE_ROOM_ID -> YAPPCHATT_ROOM');
    expect(r.deprecated).toContain('WXKANBAN_YAPPCHAT_TOKEN -> YAPPCHATT_TOKEN');
    expect(r.deprecated).toContain('WXKANBAN_YAPPCHAT_BASE_URL -> YAPPCHATT_URL');
    expect(r.deprecated).toContain('WXKANBAN_CHAT_EMAIL -> YAPPCHATT_EMAIL');
  });

  it('lets canonical win when both spellings are present', () => {
    // The state every migrating .env passes through. Silently preferring the
    // legacy value here would make a corrected .env do nothing.
    const r = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'wins',
      WXKANBAN_YAPPCHATT_ROOM: 'loses',
      WXKANBAN_YAPPCHAT_ROOM: 'loses-more',
      WXKANBAN_REMOTE_ROOM_ID: 'loses-hardest',
      YAPPCHATT_TOKEN: 'yca_wins',
      WXKANBAN_YAPPCHAT_TOKEN: 'yca_loses',
    } as NodeJS.ProcessEnv);
    expect(r.config.conversationId).toBe('wins');
    expect(r.config.yappchatToken).toBe('yca_wins');
    expect(r.deprecated).toEqual([]);
  });

  it('honours the middle fallback before the oldest one', () => {
    const r = resolveYappchattConfig({
      ...base,
      WXKANBAN_YAPPCHATT_ROOM: 'middle',
      WXKANBAN_YAPPCHAT_ROOM: 'older',
      WXKANBAN_REMOTE_ROOM_ID: 'oldest',
      YAPPCHATT_TOKEN: 'yca_x',
    } as NodeJS.ProcessEnv);
    expect(r.config.conversationId).toBe('middle');
  });

  it('names the CANONICAL variable when a required one is missing', () => {
    // The error is the only documentation an operator reads at 2am, so it must
    // point at the name they should add, not the one being retired.
    expect(() => resolveYappchattConfig({ ...base } as NodeJS.ProcessEnv))
      .toThrow(/YAPPCHATT_ROOM is not set/);
    expect(() => resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r',
    } as NodeJS.ProcessEnv)).toThrow(/YAPPCHATT_TOKEN is not set/);
  });

  it('takes the display name from the canonical name, then the alias, then the email', () => {
    const both = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r', YAPPCHATT_TOKEN: 'yca_x',
      YAPPCHATT_DISPLAY_NAME: 'Canonical Name',
      WXKANBAN_CHAT_DISPLAY_NAME: 'Legacy Name',
    } as NodeJS.ProcessEnv);
    expect(both.user.displayName).toBe('Canonical Name');
    expect(both.deprecated).toEqual([]);

    const legacyOnly = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r', YAPPCHATT_TOKEN: 'yca_x',
      WXKANBAN_CHAT_DISPLAY_NAME: 'Legacy Name',
    } as NodeJS.ProcessEnv);
    expect(legacyOnly.user.displayName).toBe('Legacy Name');
    expect(legacyOnly.deprecated).toContain('WXKANBAN_CHAT_DISPLAY_NAME -> YAPPCHATT_DISPLAY_NAME');

    // Neither set: falls back to the PROJECT NAME, so several bridges do not all
    // identify as the same person. Reports nothing stale — no deprecated name
    // supplied the value, it is just the default.
    const byProject = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r', YAPPCHATT_TOKEN: 'yca_x',
      WXKANBAN_PROJECT_NAME: 'wxKanban',
    } as NodeJS.ProcessEnv);
    expect(byProject.user.displayName).toBe('wxKanban');
    expect(byProject.deprecated).toEqual([]);

    // Only with no project name at all does it fall back to the email.
    const lastResort = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r', YAPPCHATT_TOKEN: 'yca_x',
    } as NodeJS.ProcessEnv);
    expect(lastResort.user.displayName).toBe('a@b.c');

    // An explicit name still beats the project name.
    const explicit = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: 'r', YAPPCHATT_TOKEN: 'yca_x',
      WXKANBAN_PROJECT_NAME: 'wxKanban',
      YAPPCHATT_DISPLAY_NAME: 'Chosen',
    } as NodeJS.ProcessEnv);
    expect(explicit.user.displayName).toBe('Chosen');
  });

  it('ignores a whitespace-only value rather than treating it as set', () => {
    const r = resolveYappchattConfig({
      ...base,
      YAPPCHATT_ROOM: '   ',
      WXKANBAN_REMOTE_ROOM_ID: 'real-room',
      YAPPCHATT_TOKEN: 'yca_x',
    } as NodeJS.ProcessEnv);
    expect(r.config.conversationId).toBe('real-room');
    expect(r.deprecated).toContain('WXKANBAN_REMOTE_ROOM_ID -> YAPPCHATT_ROOM');
  });
});

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
