// SPEC-145 (SCOPE-132 Amendment B) T007 – T010 — remote auto-start in the Cockpit.
//
// The pure half (settings, decision, line parsing, failure words) runs directly. The process
// half drives ProjectAgentProcess with a fake child process and injected deps: no real spawn,
// no network, no timers left running.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'events';
import { PassThrough } from 'stream';
import type { ChildProcess } from 'child_process';
import { __messages } from './stubs/vscode';
import {
  LineSplitter,
  decideAutoStart,
  failureText,
  fetchRemoteSettings,
  parseAgentLine,
  type Fetcher,
} from '../src/services/remoteStartup';
import { ProjectAgentProcess, remoteStatusText, killTree, type ProjectAgentDeps } from '../src/services/projectAgent';

// [SCOPE 145 / T007] BEGIN — settings and start decision tests
describe('fetchRemoteSettings (FR-004)', () => {
  const fake = (status: number, body: unknown): Fetcher => async () =>
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

  it('sends the kit token and reads allowRemote and projectName', async () => {
    let seen: { url: string; auth?: string } | undefined;
    const fetcher: Fetcher = async (url, init) => {
      seen = { url, auth: (init?.headers as Record<string, string>).authorization };
      return new Response(JSON.stringify({ allowRemote: true, projectName: 'Billing' }), { status: 200 });
    };
    expect(await fetchRemoteSettings('https://app.example/', 'kit-token', fetcher)).toEqual({
      kind: 'ok',
      allowRemote: true,
      projectName: 'Billing',
    });
    expect(seen).toEqual({ url: 'https://app.example/api/project-agent/settings', auth: 'Bearer kit-token' });
  });

  it('401 is unauthorized; any other failure, a bad body or a network error is unreachable', async () => {
    expect(await fetchRemoteSettings('https://a', 't', fake(401, { error: 'invalid-token' }))).toEqual({ kind: 'unauthorized' });
    expect((await fetchRemoteSettings('https://a', 't', fake(500, {}))).kind).toBe('unreachable');
    expect((await fetchRemoteSettings('https://a', 't', fake(200, { connected: true }))).kind).toBe('unreachable');
    const down: Fetcher = async () => {
      throw new Error('fetch failed');
    };
    expect(await fetchRemoteSettings('https://a', 't', down)).toEqual({ kind: 'unreachable', detail: 'fetch failed' });
  });
});

describe('decideAutoStart (FR-001)', () => {
  const ok = (allowRemote: boolean) => ({ kind: 'ok' as const, allowRemote, projectName: 'P' });
  it('starts only when switched on and the project allows remote', () => {
    expect(decideAutoStart(true, ok(true))).toEqual({ start: true });
  });
  it('names the reason otherwise', () => {
    expect(decideAutoStart(false, ok(true))).toEqual({ start: false, reason: 'switched_off' });
    expect(decideAutoStart(true, ok(false))).toEqual({ start: false, reason: 'not_allowed' });
    expect(decideAutoStart(true, null)).toEqual({ start: false, reason: 'no_token' });
    expect(decideAutoStart(true, { kind: 'unauthorized' })).toEqual({ start: false, reason: 'unauthorized' });
    expect(decideAutoStart(true, { kind: 'unreachable', detail: 'x' })).toEqual({ start: false, reason: 'unreachable' });
  });
});
// [SCOPE 145 / T007] END

// [SCOPE 145 / T008] BEGIN — agent line, failure words and process tests
describe('parseAgentLine and LineSplitter (FR-005)', () => {
  it('reads the ready line and the refusal line, nothing else', () => {
    expect(parseAgentLine('[bridge] ready project=Billing')).toEqual({ type: 'ready' });
    expect(parseAgentLine('[project-agent] refused remote_not_allowed')).toEqual({ type: 'refused', code: 'remote_not_allowed' });
    expect(parseAgentLine('[room] connected')).toBeNull();
    expect(parseAgentLine('[project-agent] refused remote not allowed')).toBeNull();
  });

  it('joins a line split across chunks and keeps a partial line for later', () => {
    const s = new LineSplitter();
    expect(s.push('[bridge] rea')).toEqual([]);
    expect(s.push('dy project=X\r\n[room] conn')).toEqual(['[bridge] ready project=X']);
    expect(s.push('ected\n')).toEqual(['[room] connected']);
  });

  it('names each cause with its next step', () => {
    expect(failureText('no_company_account')).toMatch(/link the company YappChatt account on the Company page/);
    expect(failureText('remote_not_allowed')).toMatch(/Allow remote in the project's Kit tab/);
    expect(failureText('worktree_locked')).toMatch(/Another session is running on this folder/);
    expect(failureText('http_502')).toMatch(/http_502/);
  });
});

describe('remoteStatusText (FR-006)', () => {
  it('has one text per state, and Off carries the reason', () => {
    expect(remoteStatusText({ kind: 'off', reason: 'not_allowed' })).toMatchObject({ text: expect.stringContaining('off'), tooltip: expect.stringContaining('not allowed') });
    expect(remoteStatusText({ kind: 'starting' }).text).toContain('starting');
    expect(remoteStatusText({ kind: 'live' }).text).toContain('live');
    expect(remoteStatusText({ kind: 'failed', code: 'timeout' }).text).toContain('failed');
    expect(remoteStatusText({ kind: 'stopped' }).text).toContain('stopped');
  });
});

class FakeChild extends EventEmitter {
  stdout = new PassThrough();
  stderr = new PassThrough();
  stdin = new PassThrough();
  exitCode: number | null = null;
  killed = false;
  pid = 4242;
  stdinEnded = false;
  constructor() {
    super();
    this.stdin.on('finish', () => {
      this.stdinEnded = true;
    });
  }
  say(line: string): void {
    this.stdout.write(`${line}\n`);
  }
  exit(code: number): void {
    this.exitCode = code;
    this.emit('exit', code);
  }
}

const flush = () => new Promise((r) => setImmediate(r));

describe('ProjectAgentProcess (FR-005 – FR-007)', () => {
  let child: FakeChild;
  let spawned: { env?: NodeJS.ProcessEnv; stdio?: unknown } | undefined;
  let killed: ChildProcess[];
  let deps: ProjectAgentDeps;

  beforeEach(() => {
    __messages.info.length = 0;
    __messages.warning.length = 0;
    child = new FakeChild();
    spawned = undefined;
    killed = [];
    deps = {
      spawn: (_cmd, _args, options) => {
        spawned = { env: options.env, stdio: options.stdio };
        return child as unknown as ChildProcess;
      },
      killTree: (c) => killed.push(c),
      launcherExists: () => true,
      readyTimeoutMs: () => 50,
      autoStartEnabled: () => true,
    };
  });
  afterEach(() => vi.useRealTimers());

  it('starts with a stdin pipe and the stop-on-stdin-close flag', () => {
    const agent = new ProjectAgentProcess(deps);
    expect(agent.start('/repo')).toBe(true);
    expect(spawned?.env?.WXKANBAN_STOP_ON_STDIN_CLOSE).toBe('1');
    expect(spawned?.stdio).toEqual(['pipe', 'pipe', 'pipe']);
    expect(agent.currentState).toEqual({ kind: 'starting' });
  });

  it('the ready line makes it Live with one notification', async () => {
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    child.say('[project-agent] Billing bound to room 01a172c1...');
    child.say('[bridge] ready project=Billing');
    child.say('[bridge] ready project=Billing');
    await flush();
    expect(agent.currentState).toEqual({ kind: 'live', sharing: true }); // [SCOPE 155 / T007]
    expect(__messages.info.filter((m) => m.includes('Remote is live'))).toHaveLength(1);
  });

  it('a refusal then exit is Failed with that cause', async () => {
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    child.say('[project-agent] refused no_company_account');
    await flush();
    child.exit(4);
    expect(agent.currentState).toEqual({ kind: 'failed', code: 'no_company_account' });
    expect(__messages.warning.some((m) => m.includes('link the company YappChatt account'))).toBe(true);
  });

  it('an exit before ready with no refusal line is Failed (exited)', () => {
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    child.exit(1);
    expect(agent.currentState).toEqual({ kind: 'failed', code: 'exited' });
  });

  it('no ready line within the timeout is Failed (timeout); a late ready line still makes it Live', async () => {
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    await new Promise((r) => setTimeout(r, 80));
    expect(agent.currentState).toEqual({ kind: 'failed', code: 'timeout' });
    child.say('[bridge] ready project=Billing');
    await flush();
    expect(agent.currentState).toEqual({ kind: 'live', sharing: true }); // [SCOPE 155 / T007]
  });

  it('stop closes stdin first, and a clean exit is Stopped with no tree kill', async () => {
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    child.say('[bridge] ready project=Billing');
    await flush();
    expect(agent.stop()).toBe(true);
    await flush();
    expect(child.stdinEnded).toBe(true);
    child.exit(0);
    expect(agent.currentState).toEqual({ kind: 'stopped' });
    expect(killed).toHaveLength(0);
  });

  it('a stop that does not finish within the grace period ends the whole tree', async () => {
    vi.useFakeTimers();
    const agent = new ProjectAgentProcess(deps);
    agent.start('/repo');
    agent.stop();
    vi.advanceTimersByTime(6000);
    expect(killed).toEqual([child]);
  });

  it('autoStart does nothing and says why when switched off', async () => {
    const agent = new ProjectAgentProcess({ ...deps, autoStartEnabled: () => false });
    const secrets = { get: async () => undefined } as unknown as import('vscode').SecretStorage;
    await agent.autoStart({ projectRoot: '/repo', projectId: 'p', mcpBaseUrl: '' }, secrets);
    expect(spawned).toBeUndefined();
    expect(agent.currentState).toEqual({ kind: 'off', reason: 'switched_off' });
    expect(__messages.warning).toHaveLength(0);
  });
});

describe('killTree (FR-007)', () => {
  it('does nothing for a process that already exited', () => {
    const c = new FakeChild();
    c.exitCode = 0;
    const kill = vi.fn();
    (c as unknown as { kill: typeof kill }).kill = kill;
    killTree(c as unknown as ChildProcess, 'linux');
    expect(kill).not.toHaveBeenCalled();
  });

  it('kills a live process with SIGKILL off Windows', () => {
    const c = new FakeChild();
    const kill = vi.fn();
    (c as unknown as { kill: typeof kill }).kill = kill;
    killTree(c as unknown as ChildProcess, 'linux');
    expect(kill).toHaveBeenCalledWith('SIGKILL');
  });
});
// [SCOPE 145 / T008] END
