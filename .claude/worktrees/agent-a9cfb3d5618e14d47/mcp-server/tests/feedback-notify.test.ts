// [SCOPE 043 / T020] Gate + formatting are pure, so they are pinned here without
// a network or a DB. The transport itself is one fetch and is verified live.
import { describe, it, expect } from 'vitest';
import {
  shouldNotify,
  normalizeMailgunBase,
  buildNotification,
  readNotifyConfig,
  type NotifiableFeedback,
} from '../src/utils/feedback-notify.js';

const row = (over: Partial<NotifiableFeedback> = {}): NotifiableFeedback => ({
  id: '11111111-1111-1111-1111-111111111111',
  type: 'bug',
  title: 'Something broke',
  severity: 'high',
  classification: 'bug',
  companyId: '22222222-2222-2222-2222-222222222222',
  context: { originProjectId: '33333333-3333-3333-3333-333333333333' },
  ...over,
});

describe('shouldNotify — severity gate', () => {
  it('notifies at and above the configured floor', () => {
    expect(shouldNotify(row({ severity: 'high' }), 'high')).toBe(true);
    expect(shouldNotify(row({ severity: 'critical' }), 'high')).toBe(true);
  });

  it('stays silent below the floor — 53 open rows must not become 53 emails', () => {
    expect(shouldNotify(row({ severity: 'low' }), 'high')).toBe(false);
    expect(shouldNotify(row({ severity: 'medium' }), 'high')).toBe(false);
  });

  it('respects a lowered floor', () => {
    expect(shouldNotify(row({ severity: 'low' }), 'low')).toBe(true);
    expect(shouldNotify(row({ severity: 'medium' }), 'low')).toBe(true);
  });

  it('NOTIFIES when triage did not classify the row', () => {
    // Deliberate: null means triage failed, timed out, or has no LLM key. An
    // unclassified report is unknown risk, and a dead triage pipeline is itself
    // worth hearing about. Silence on the failure path is the defect this fixes.
    expect(shouldNotify(row({ severity: null }), 'critical')).toBe(true);
  });

  it('notifies on an unrecognised severity rather than dropping it', () => {
    expect(shouldNotify(row({ severity: 'catastrophic' }), 'critical')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(shouldNotify(row({ severity: 'CRITICAL' }), 'high')).toBe(true);
    expect(shouldNotify(row({ severity: 'Low' }), 'high')).toBe(false);
  });
});

describe('normalizeMailgunBase', () => {
  it('accepts the full-URL shape this deployment actually stores', () => {
    expect(normalizeMailgunBase('https://api.mailgun.net/v3/mg.wxperts.com/')).toBe(
      'https://api.mailgun.net/v3/mg.wxperts.com/',
    );
  });

  it('adds the trailing slash so `${base}messages` composes', () => {
    expect(normalizeMailgunBase('https://api.mailgun.net/v3/mg.wxperts.com')).toBe(
      'https://api.mailgun.net/v3/mg.wxperts.com/',
    );
  });

  it('accepts a bare domain too', () => {
    expect(normalizeMailgunBase('mg.wxperts.com')).toBe(
      'https://api.mailgun.net/v3/mg.wxperts.com/',
    );
  });

  it('returns null when unset or blank', () => {
    expect(normalizeMailgunBase(undefined)).toBeNull();
    expect(normalizeMailgunBase('   ')).toBeNull();
  });
});

describe('readNotifyConfig', () => {
  it('is OFF by default — the leg ships dark and is enabled deliberately', () => {
    expect(readNotifyConfig({} as NodeJS.ProcessEnv).to).toBeNull();
  });

  it('defaults the floor to high and rejects a bogus value', () => {
    expect(readNotifyConfig({} as NodeJS.ProcessEnv).minSeverity).toBe('high');
    expect(
      readNotifyConfig({ FEEDBACK_NOTIFY_MIN_SEVERITY: 'banana' } as NodeJS.ProcessEnv)
        .minSeverity,
    ).toBe('high');
  });

  it('honours a configured floor', () => {
    expect(
      readNotifyConfig({ FEEDBACK_NOTIFY_MIN_SEVERITY: 'LOW' } as NodeJS.ProcessEnv).minSeverity,
    ).toBe('low');
  });
});

describe('buildNotification', () => {
  it('leads with severity and type so the subject is triageable at a glance', () => {
    const { subject } = buildNotification(row(), 'Acme Ltd');
    expect(subject).toBe('[wxKanban high] bug: Something broke');
  });

  it('names the company and origin project in the body', () => {
    const { text } = buildNotification(row(), 'Acme Ltd');
    expect(text).toContain('Acme Ltd');
    expect(text).toContain('33333333-3333-3333-3333-333333333333');
  });

  it('falls back to the company id, then to a readable placeholder', () => {
    expect(buildNotification(row(), null).text).toContain(
      '22222222-2222-2222-2222-222222222222',
    );
    expect(buildNotification(row({ companyId: null }), null).text).toContain('unknown company');
  });

  it('flags an untriaged row in the body rather than hiding it', () => {
    const { subject, text } = buildNotification(row({ severity: null }), 'Acme Ltd');
    expect(subject).toContain('untriaged');
    expect(text).toContain('triage did not classify');
  });

  it('caps the subject so a long title cannot break the header', () => {
    const { subject } = buildNotification(row({ title: 'x'.repeat(500) }), 'Acme Ltd');
    expect(subject.length).toBeLessThanOrEqual(200);
  });
});
