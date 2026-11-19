/**
 * SCOPE-134 / T009 — the override record, and the one rule it exists to enforce.
 *
 * The constitution (amended 2026-09-23) holds one line above all others here: a tool may
 * REQUEST an override and may never SELF-APPROVE one. Everything below protects that.
 *
 * This tool is an audit sink, not a gate. The server cannot execute anything, so it
 * cannot authorize anything — enforcement is local, in the runtime that suspends the
 * action. The risk being guarded is therefore not "can it be bypassed" but "can a record
 * claim an approval that no human gave", which is the SCOPE-124/T021 failure class
 * applied to permission rather than to measurement.
 *
 * Schema assertions are REAL. Handler assertions are structural: the handler sits inside
 * a 5,000-line switch needing a database, an auth scope and a transport to reach, and
 * there is no test database. Comments are stripped before asserting, per T017.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { RecordOverrideInputSchema } from '../src/utils/schemas';
import { checkPermission } from '../src/auth/role-checker';
import type { AuthContext } from '../src/auth/auth-context';

// [SCOPE 134 / T009] BEGIN — override record guards
function executable(source: string): string {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
    })
    .join('\n');
}

function overrideCase(source: string): string {
  const start = source.indexOf("case 'project.record_override':");
  if (start === -1) throw new Error("case 'project.record_override' not found");
  const next = source.indexOf("\n      case 'project.", start + 40);
  return source.slice(start, next === -1 ? source.length : next);
}

const SERVER = executable(readFileSync(join(__dirname, '..', 'src', 'server.ts'), 'utf8'));
const handler = overrideCase(SERVER);

const PROJECT = '11111111-1111-4111-8111-111111111111';
const base = { projectId: PROJECT, agentName: 'KAIN', action: 'gitpush' as const };
const auth = (role: AuthContext['role']): AuthContext => ({ role, apiKey: 't', source: 't' });

describe('SCOPE-134 / T009 — a tool never self-approves', () => {
  it('REFUSES a grant with no human named', () => {
    // The single most important assertion in this file.
    const r = RecordOverrideInputSchema.safeParse({ ...base, outcome: 'granted' });
    expect(r.success).toBe(false);
  });

  it('accepts a grant that names one', () => {
    const r = RecordOverrideInputSchema.safeParse({
      ...base,
      outcome: 'granted',
      grantedBy: 'Andy',
    });
    expect(r.success).toBe(true);
  });

  it('does not require a grantor for denial, expiry or consumption', () => {
    // Only approval needs a human. A denial with nobody named is still a denial.
    for (const outcome of ['denied', 'expired', 'consumed'] as const) {
      expect(RecordOverrideInputSchema.safeParse({ ...base, outcome }).success).toBe(true);
    }
  });

  it('enforces the same rule a second time in the handler', () => {
    // Belt and braces: the schema refuses it, and so does the handler. The constitution's
    // whole position rests on this one condition, so it is checked twice on purpose.
    expect(handler).toContain("input.outcome === 'granted' && !input.grantedBy");
    expect(handler).toContain('no_grantor');
  });
});

describe('SCOPE-134 / T009 — the gated action list stays short', () => {
  it('admits only gitpush and prodatawrite', () => {
    expect(RecordOverrideInputSchema.safeParse({ ...base, outcome: 'denied' }).success).toBe(true);
    expect(
      RecordOverrideInputSchema.safeParse({
        ...base,
        action: 'readsecrets',
        outcome: 'denied',
      }).success,
    ).toBe(false);
  });

  it('rejects an unknown outcome', () => {
    expect(
      RecordOverrideInputSchema.safeParse({ ...base, outcome: 'maybe' }).success,
    ).toBe(false);
  });

  it('bounds an expiry to a day', () => {
    expect(RecordOverrideInputSchema.safeParse({ ...base, outcome: 'denied', expiresInMinutes: 1440 }).success).toBe(true);
    expect(RecordOverrideInputSchema.safeParse({ ...base, outcome: 'denied', expiresInMinutes: 1441 }).success).toBe(false);
    expect(RecordOverrideInputSchema.safeParse({ ...base, outcome: 'denied', expiresInMinutes: 0 }).success).toBe(false);
  });

  it('treats an absent expiry as single-use rather than unlimited', () => {
    const r = RecordOverrideInputSchema.parse({ ...base, outcome: 'granted', grantedBy: 'Andy' });
    expect(r.expiresInMinutes).toBeUndefined();
    expect(handler).toContain('singleUse: !input.expiresInMinutes');
  });
});

describe('SCOPE-134 / T009 — only a bound agent may file a record', () => {
  it('reuses the SCOPE-133 binding rather than a second identity check', () => {
    expect(handler).toContain('mcpapitokens.clientbinding');
    expect(handler).toContain('unbound_token');
    expect(handler).toContain('binding_mismatch');
  });

  it('is unavailable under dev-bypass', () => {
    expect(handler).toContain('no_token');
  });

  it('refuses a read_only caller', () => {
    expect(() => checkPermission('project.record_override', auth('read_only'))).toThrow();
    expect(() => checkPermission('project.record_override', auth('editor'))).not.toThrow();
  });
});

describe('SCOPE-134 / T009 — the record cannot be mistaken for permission', () => {
  it('says so in the response', () => {
    // A caller reading this response must not conclude it may now proceed.
    expect(handler).toMatch(/RECORD of a decision already made, not a grant/);
  });

  it('says so in the advertised description too', () => {
    const at = SERVER.indexOf("name: 'project.record_override'");
    const block = SERVER.slice(at, at + 1400);
    expect(block).toMatch(/audit record, NOT a grant/);
    expect(block).toMatch(/never self-approves/);
  });

  it('records what the human was actually shown', () => {
    // Verbatim, so the decision is judged on what was in front of them rather than on a
    // summary written afterwards.
    expect(handler).toContain('requestText');
  });

  it('writes an event rather than inventing a table', () => {
    expect(handler).toContain("type: 'agent_override'");
    expect(handler).toContain('scoped.insertScoped(events');
  });
});
// [SCOPE 134 / T009] END
