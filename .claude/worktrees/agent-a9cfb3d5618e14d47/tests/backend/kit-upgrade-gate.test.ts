/**
 * [SCOPE 121 / T011] Kit upgrade preservation gate.
 *
 * The decision logic and the message budget are tested without a database: the
 * gate's job is to be correct about who is vulnerable, and its message has to
 * survive a truncation in code we do not control and cannot change, because it
 * is already installed on every consumer's disk.
 */
import { describe, it, expect } from 'vitest';
import {
  KIT_GATE_MESSAGE,
  KIT_GATE_SUNSET,
  KIT_PRESERVATION_RELEASE,
  compareKitVersions,
  decideGate,
  extractAcknowledgement,
} from '../../src/server/services/KitUpgradeGateService';

describe('gate message budget', () => {
  it('survives the shipped client\'s body.slice(0, 300) intact', () => {
    // The pre-fix client does: `HTTP ${status} from wxKanban: ${text.slice(0, 300)}`.
    // Anything past 300 characters is silently cut, and the instruction is at the
    // end of the sentence — so a message that overruns loses the actionable part
    // and reads as an outage. This is a hard limit, not a style preference.
    expect(KIT_GATE_MESSAGE.length).toBeLessThanOrEqual(300);
    expect(KIT_GATE_MESSAGE.slice(0, 300)).toBe(KIT_GATE_MESSAGE);
  });

  it('still contains the instruction after truncation', () => {
    const seen = KIT_GATE_MESSAGE.slice(0, 300);
    expect(seen).toContain('run the same');
    expect(seen).toContain('BACK UP');
  });
});

describe('version comparison', () => {
  it('orders kit versions numerically, not lexically', () => {
    expect(compareKitVersions('1.7.9', '1.7.10')).toBeLessThan(0);
    expect(compareKitVersions('1.7.56', '1.7.56')).toBe(0);
    expect(compareKitVersions('1.8.0', '1.7.56')).toBeGreaterThan(0);
    expect(compareKitVersions('v1.7.49', '1.7.56')).toBeLessThan(0);
  });

  it('treats an unparseable version as older, never newer', () => {
    expect(compareKitVersions('garbage', KIT_PRESERVATION_RELEASE)).toBeLessThan(0);
  });
});

describe('acknowledgement', () => {
  it('accepts the +ack version suffix and strips it', () => {
    // The only value a pre-fix client forwards from the operator is the
    // positional version argument, so this suffix is the whole mechanism.
    expect(extractAcknowledgement('v1.7.56+ack', undefined)).toEqual({
      acknowledged: true,
      version: 'v1.7.56',
    });
  });

  it('accepts a bare +ack with no version', () => {
    expect(extractAcknowledgement('+ack', undefined)).toEqual({ acknowledged: true, version: undefined });
  });

  it('accepts ack=1 for newer clients', () => {
    expect(extractAcknowledgement(undefined, '1').acknowledged).toBe(true);
    expect(extractAcknowledgement(undefined, 'true').acknowledged).toBe(true);
  });

  it('does not acknowledge on an ordinary request', () => {
    expect(extractAcknowledgement('v1.7.56', undefined).acknowledged).toBe(false);
    expect(extractAcknowledgement(undefined, '0').acknowledged).toBe(false);
  });
});

describe('gate decision', () => {
  const base = { acknowledged: false, alreadyWarned: false };

  it('gates a client below the fix release', () => {
    const d = decideGate({ ...base, fromVersion: '1.7.49' });
    expect(d.gated).toBe(true);
    expect(d.reason).toBe('below-fix');
  });

  it('gates an unknown version, failing safe', () => {
    expect(decideGate({ ...base, fromVersion: 'unknown' }).gated).toBe(true);
    expect(decideGate({ ...base, fromVersion: undefined }).gated).toBe(true);
  });

  it('never gates a client already carrying the fix', () => {
    expect(decideGate({ ...base, fromVersion: KIT_PRESERVATION_RELEASE }).gated).toBe(false);
    expect(decideGate({ ...base, fromVersion: '1.8.2' }).gated).toBe(false);
  });

  it('fires once — a project that has been warned is let through', () => {
    expect(decideGate({ ...base, fromVersion: '1.7.49', alreadyWarned: true }).gated).toBe(false);
  });

  it('lets an acknowledged request through', () => {
    expect(decideGate({ ...base, fromVersion: '1.7.49', acknowledged: true }).gated).toBe(false);
  });

  it('stops firing after the sunset, whatever else is true', () => {
    const after = new Date(KIT_GATE_SUNSET.getTime() + 86_400_000);
    const d = decideGate({ ...base, fromVersion: 'unknown', now: after });
    expect(d.gated).toBe(false);
    expect(d.reason).toBe('sunset');
  });

  it('still fires the day before the sunset', () => {
    const before = new Date(KIT_GATE_SUNSET.getTime() - 86_400_000);
    expect(decideGate({ ...base, fromVersion: '1.7.49', now: before }).gated).toBe(true);
  });
});
