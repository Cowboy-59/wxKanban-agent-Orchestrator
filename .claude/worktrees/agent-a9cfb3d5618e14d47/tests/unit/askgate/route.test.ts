import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

// @ts-expect-error plain .mjs kit script, no types
import * as route from '../../../_wxAI/askgate/route.mjs';

const blocker = { outcome: 'queued', class: 'blocker', ledgerId: null, score: null, reason: 't' };
const ctx = { question: 'May a refund exceed the charge?', unit: 'S06', command: '/implement', blocks: ['S06', 'S08'] };

let root: string;
const events: Array<Record<string, unknown>> = [];
const log = async (_r: string, e: Record<string, unknown>) => {
  events.push(e);
};

// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
function writeState(state: unknown) {
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'docs', 'GOD-State.json'), JSON.stringify(state));
}
// [SCOPE 142 / T010] END
// [SCOPE 142 / T010] BEGIN — Blocker routing: decision queue, bridge room, or pass-throu…
function writeLock(pid: number) {
  mkdirSync(join(root, '.wxai'), { recursive: true });
  writeFileSync(join(root, '.wxai', 'remote-session.lock'), JSON.stringify({ pid, owner: 'x', since: 'now' }));
}
// [SCOPE 142 / T010] END

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'route-test-'));
  events.length = 0;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('decideRoute (pure)', () => {
  it('create run queues, with room when a session is live', () => {
    expect(route.decideRoute({ createActive: true, liveSession: false })).toMatchObject({ route: 'queue', alsoRoom: false, passThrough: false });
    expect(route.decideRoute({ createActive: true, liveSession: true })).toMatchObject({ route: 'queue', alsoRoom: true });
  });
  it('live session without create posts and passes through', () => {
    expect(route.decideRoute({ createActive: false, liveSession: true })).toMatchObject({ route: 'room-and-developer', alsoRoom: true, passThrough: true });
  });
  it('neither passes through', () => {
    expect(route.decideRoute({ createActive: false, liveSession: false })).toMatchObject({ route: 'pass-through', alsoRoom: false, passThrough: true });
  });
});

describe('nextDqId', () => {
  it('continues the numbering', () => {
    expect(route.nextDqId([])).toBe('DQ-01');
    expect(route.nextDqId([{ id: 'DQ-01' }, { id: 'DQ-07' }])).toBe('DQ-08');
  });
});

describe('detection', () => {
  it('create run needs mode create and phase not done', () => {
    expect(route.detectCreateRun(root).active).toBe(false);
    writeState({ mode: 'new-project' });
    expect(route.detectCreateRun(root).active).toBe(false);
    writeState({ mode: 'create', phase: 'done' });
    expect(route.detectCreateRun(root).active).toBe(false);
    writeState({ mode: 'create', phase: 'execute' });
    expect(route.detectCreateRun(root).active).toBe(true);
  });
  it('live session needs a lock with a live pid', () => {
    expect(route.detectLiveSession(root).live).toBe(false);
    writeLock(4242);
    expect(route.detectLiveSession(root, () => true).live).toBe(true);
    expect(route.detectLiveSession(root, () => false).live).toBe(false);
  });
});

describe('routeBlocker', () => {
  it('ignores non-blockers', async () => {
    const r = await route.routeBlocker(root, { ...blocker, class: 'assumption' }, ctx, { log });
    expect(r.route).toBe('not-a-blocker');
    expect(events).toHaveLength(0);
  });

  it('create run: queues, parks units, mirrors md, no room without a session', async () => {
    writeState({ mode: 'create', phase: 'execute', scopes: [{ key: 'S06', implement: 'running' }, { key: 'S08', implement: 'waiting' }, { key: 'S01', implement: 'running' }] });
    writeFileSync(join(root, 'docs', 'GOD-Decisions.md'), '## Parked — waiting for you\n| # | Unit |\n|---|------|\n\n## Assumed\n');
    const posts: string[] = [];
    const r = await route.routeBlocker(root, blocker, ctx, { log, postToRoom: async (t: string) => (posts.push(t), true) });
    expect(r).toMatchObject({ route: 'queue', dqId: 'DQ-01', parked: ['S06', 'S08'], postedToRoom: false });
    expect(posts).toHaveLength(0);
    const st = JSON.parse(readFileSync(join(root, 'docs', 'GOD-State.json'), 'utf8'));
    expect(st.decisionQueue[0]).toMatchObject({ id: 'DQ-01', kind: 'parked', status: 'open' });
    expect(st.scopes.map((s: { implement: string }) => s.implement)).toEqual(['parked', 'parked', 'running']);
    expect(readFileSync(join(root, 'docs', 'GOD-Decisions.md'), 'utf8')).toContain('| DQ-01 | S06 |');
    expect(events[0]).toMatchObject({ outcome: 'queued', class: 'blocker', dqId: 'DQ-01' });
  });

  it('create run with live session: queues and posts to the room', async () => {
    writeState({ mode: 'create', phase: 'execute', scopes: [] });
    writeLock(1);
    const posts: string[] = [];
    const r = await route.routeBlocker(root, blocker, ctx, { log, pidAlive: () => true, postToRoom: async (t: string) => (posts.push(t), true) });
    expect(r).toMatchObject({ route: 'queue', postedToRoom: true });
    expect(posts[0]).toContain('DQ-01');
  });

  it('live session, no create: posts and lets the question through', async () => {
    writeLock(1);
    const posts: string[] = [];
    const r = await route.routeBlocker(root, blocker, ctx, { log, pidAlive: () => true, postToRoom: async (t: string) => (posts.push(t), true) });
    expect(r).toMatchObject({ route: 'room-and-developer', passThrough: true, postedToRoom: true });
    expect(existsSync(join(root, 'docs', 'GOD-State.json'))).toBe(false);
  });

  it('neither: passes through unchanged and logs once', async () => {
    const r = await route.routeBlocker(root, blocker, ctx, { log });
    expect(r).toMatchObject({ route: 'pass-through', passThrough: true, dqId: null, postedToRoom: false });
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ outcome: 'passed-through', route: 'pass-through' });
  });

  it('default poster writes an outbox line and reports not delivered', async () => {
    writeLock(1);
    const r = await route.routeBlocker(root, blocker, ctx, { log, pidAlive: () => true });
    expect(r.postedToRoom).toBe(false);
    expect(r.roomQueued).toBe(true);
    expect(readFileSync(join(root, '.wxai', 'room-outbox.jsonl'), 'utf8')).toContain('Decision needed');
  });
});

describe('applyOwnerAnswer', () => {
  beforeEach(() => {
    writeState({
      mode: 'create',
      phase: 'execute',
      decisionQueue: [
        { id: 'DQ-01', kind: 'parked', unit: 'S06', question: 'Q1?', blocks: ['S06'], resumeAt: 'implement', status: 'open' },
        { id: 'DQ-02', kind: 'parked', unit: 'S07', question: 'Q2?', blocks: ['S07'], status: 'open', dataLoss: true },
      ],
    });
  });

  it('calls the ledger CLI with approved_by owner and marks the item answered', async () => {
    let seen: { entry?: Record<string, unknown> } = {};
    const runLedger = (_r: string, file: string) => {
      seen.entry = JSON.parse(readFileSync(file, 'utf8'));
      return 'appended D-0012\n';
    };
    const r = await route.applyOwnerAnswer(root, 'DQ-01', 'Cap at the charge', {}, { runLedger, now: () => '2026-10-22T10:00:00Z' });
    expect(r).toMatchObject({ ok: true, ledgerId: 'D-0012', releases: ['S06'] });
    expect(seen.entry).toMatchObject({ question: 'Q1?', decision: 'Cap at the charge', kind: 'Agreed', evidence: 'confirmed', date: '2026-10-22', supersedes: null });
    const st = JSON.parse(readFileSync(join(root, 'docs', 'GOD-State.json'), 'utf8'));
    expect(st.decisionQueue[0]).toMatchObject({ status: 'answered', ledgerId: 'D-0012' });
  });

  it('refuses all-recommended for data-loss items and leaves the item open', async () => {
    const runLedger = () => {
      throw new Error('must not be called');
    };
    const r = await route.applyOwnerAnswer(root, 'DQ-02', 'yes', { viaAllRecommended: true }, { runLedger });
    expect(r.ok).toBe(false);
    const st = JSON.parse(readFileSync(join(root, 'docs', 'GOD-State.json'), 'utf8'));
    expect(st.decisionQueue[1].status).toBe('open');
  });

  it('keeps the item open when the ledger refuses', async () => {
    const r = await route.applyOwnerAnswer(root, 'DQ-01', 'x', {}, { runLedger: () => { throw new Error('refused'); } });
    expect(r.ok).toBe(false);
    const st = JSON.parse(readFileSync(join(root, 'docs', 'GOD-State.json'), 'utf8'));
    expect(st.decisionQueue[0].status).toBe('open');
  });

  it('rejects unknown ids and already-answered items', async () => {
    expect((await route.applyOwnerAnswer(root, 'DQ-99', 'x', {}, { runLedger: () => '' })).ok).toBe(false);
    await route.applyOwnerAnswer(root, 'DQ-01', 'x', {}, { runLedger: () => 'D-0001' });
    expect((await route.applyOwnerAnswer(root, 'DQ-01', 'y', {}, { runLedger: () => 'D-0002' })).ok).toBe(false);
  });

  // SPEC-144 FR-008 (T010): a Room Approver's answer is recorded under their name.
  it('passes the Room Approver as approved_by, and defaults to owner', async () => {
    const seen: string[] = [];
    const runLedger = (_r: string, _f: string, by: string) => {
      seen.push(by);
      return 'D-0003';
    };
    const r = await route.applyOwnerAnswer(root, 'DQ-01', 'no', { approvedBy: '  Jane Manager ' }, { runLedger });
    expect(r).toMatchObject({ ok: true, approvedBy: 'Jane Manager' });
    expect(JSON.parse(readFileSync(join(root, 'docs', 'GOD-State.json'), 'utf8')).decisionQueue[0]).toMatchObject({ approvedBy: 'Jane Manager' });
    writeState({ mode: 'create', phase: 'execute', decisionQueue: [{ id: 'DQ-01', kind: 'parked', unit: 'S06', question: 'Q1?', blocks: ['S06'], status: 'open' }] });
    await route.applyOwnerAnswer(root, 'DQ-01', 'no', {}, { runLedger });
    expect(seen).toEqual(['Jane Manager', 'owner']);
  });

  it('the answer CLI takes --approved-by and the ledger records that name', () => {
    mkdirSync(join(root, '.git'));
    const script = join(process.cwd(), '_wxAI', 'askgate', 'route.mjs');
    const r = spawnSync(process.execPath, [script, 'answer', '--dq', 'DQ-01', '--answer', 'no, seeded data', '--approved-by', 'Jane Manager', '--root', root], { encoding: 'utf8' });
    expect(JSON.parse(r.stdout)).toMatchObject({ ok: true, approvedBy: 'Jane Manager' });
    expect(readFileSync(join(root, 'decisions', 'ledger.yaml'), 'utf8')).toMatch(/approved_by: "Jane Manager"/);
  });
});
