import { describe, it, expect } from 'vitest';
import { ActivityTracker, ACTIVITY_MAX_CHARS } from '../../apps/remote-bridge/src/agent-activity';

describe('ActivityTracker', () => {
  it('starts idle with no entries', () => {
    const s = new ActivityTracker().snapshot();
    expect(s.state).toBe('idle');
    expect(s.entries).toEqual([]);
    expect(s.lastEventAt).toBeNull();
  });

  it('goes working on a received message and a tool, idle on a result', () => {
    const t = new ActivityTracker();
    t.note('received', 'Andy: fix the docs');
    expect(t.snapshot().state).toBe('working');
    t.note('tool', 'Bash: npm test');
    expect(t.snapshot().current).toBe('Bash: npm test');
    t.note('reply', 'Andy. Done.');
    expect(t.snapshot().state).toBe('working');
    t.note('result', 'success');
    const s = t.snapshot();
    expect(s.state).toBe('idle');
    expect(s.current).toBe('');
    expect(s.entries.map((e) => e.kind)).toEqual(['received', 'tool', 'reply', 'result']);
  });

  it('keeps only the newest entries', () => {
    const t = new ActivityTracker({ max: 3 });
    for (let i = 0; i < 5; i++) t.note('reply', `line ${i}`);
    expect(t.snapshot().entries.map((e) => e.text)).toEqual(['line 2', 'line 3', 'line 4']);
  });

  it('flattens, caps and masks text', () => {
    const t = new ActivityTracker();
    t.note('reply', `a\n\nb ${'x'.repeat(500)}`);
    const text = t.snapshot().entries[0]!.text;
    expect(text.startsWith('a b ')).toBe(true);
    expect(text.length).toBeLessThanOrEqual(ACTIVITY_MAX_CHARS);
    const secret = ['xox', 'b-', '1234567890-1234567890-abcdefghijklmnopqrstuvwx'].join('');
    t.note('tool', `curl -H "Authorization: Bearer ${secret}"`);
    expect(JSON.stringify(t.snapshot())).not.toContain(secret);
  });

  it('link events set the room link and do not change working state', () => {
    const t = new ActivityTracker();
    t.note('link', 'connected');
    const s = t.snapshot();
    expect(s.roomLink).toBe('connected');
    expect(s.state).toBe('idle');
  });
});
