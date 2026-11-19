import { describe, it, expect } from 'vitest';
import {
  capacityView,
  LOW_CAPACITY_THRESHOLD,
} from '../../src/shared/welcome-capacity.js';
import { welcomemessages } from '../../src/db/schema/welcomemessages.js';
import {
  welcomesends,
  WELCOME_SEND_STATUSES,
  WELCOME_SEND_TRIGGERS,
} from '../../src/db/schema/welcomesends.js';

/**
 * SPEC-109 (SCOPE-109) — Customer Welcome Message.
 *
 * Covers the parts that cannot be eyeballed: the capacity boundary arithmetic,
 * the table shapes, and — most importantly — that the migration carries the
 * PARTIAL unique index. A blanket unique index would make one transient SES
 * failure permanently bar a person from ever being welcomed, so that WHERE
 * clause is load-bearing and is asserted here rather than trusted.
 *
 * Live send/dedupe behaviour needs a test DB, which this repo does not yet have
 * (same constraint noted in the spec-025 schema tests).
 */

type DrizzleColumn = { name: string; columnType: string; notNull: boolean };

const getColumns = (table: unknown): Record<string, DrizzleColumn> => {
  const out: Record<string, DrizzleColumn> = {};
  if (typeof table !== 'object' || table === null) return out;
  for (const [k, v] of Object.entries(table)) {
    if (typeof v === 'object' && v !== null && 'columnType' in v && !k.startsWith('_')) {
      out[k] = v as DrizzleColumn;
    }
  }
  return out;
};

describe('FR-004 capacity boundaries', () => {
  it('reports remaining as capacity minus consumed', () => {
    const v = capacityView({ linkcapacity: 100, linkconsumed: 37 });
    expect(v.remaining).toBe(63);
    expect(v.low).toBe(false);
    expect(v.exhausted).toBe(false);
  });

  it('is NOT low at exactly the threshold', () => {
    const v = capacityView({ linkcapacity: 100, linkconsumed: 90 });
    expect(v.remaining).toBe(LOW_CAPACITY_THRESHOLD);
    expect(v.low).toBe(false);
  });

  it('is low one below the threshold', () => {
    const v = capacityView({ linkcapacity: 100, linkconsumed: 91 });
    expect(v.remaining).toBe(9);
    expect(v.low).toBe(true);
    expect(v.exhausted).toBe(false);
  });

  it('is exhausted — and NOT low — at zero remaining', () => {
    const v = capacityView({ linkcapacity: 50, linkconsumed: 50 });
    expect(v.remaining).toBe(0);
    expect(v.exhausted).toBe(true);
    // Distinct states: exhausted blocks, low only warns.
    expect(v.low).toBe(false);
  });

  it('never reports negative remaining if consumed overshoots', () => {
    const v = capacityView({ linkcapacity: 10, linkconsumed: 14 });
    expect(v.remaining).toBe(0);
    expect(v.exhausted).toBe(true);
  });

  it('an unconfigured link (capacity 0) is exhausted, so nothing is sent', () => {
    const v = capacityView({ linkcapacity: 0, linkconsumed: 0 });
    expect(v.exhausted).toBe(true);
  });
});

describe('T001 welcomemessages schema', () => {
  const cols = getColumns(welcomemessages);

  it('declares the standing-record columns', () => {
    for (const c of [
      'id',
      'subject',
      'body',
      'status',
      'joinlink',
      'linkcapacity',
      'linkconsumed',
      'publishedat',
      'updatedbyid',
      'createdat',
      'updatedat',
    ]) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it('capacity counters are NOT NULL so arithmetic is never against null', () => {
    expect(cols['linkcapacity']?.notNull).toBe(true);
    expect(cols['linkconsumed']?.notNull).toBe(true);
  });
});

describe('T001 welcomesends schema', () => {
  const cols = getColumns(welcomesends);

  it('declares the per-recipient columns', () => {
    for (const c of [
      'id',
      'welcomemessageid',
      'userid',
      'email',
      'status',
      'error',
      'trigger',
      'sentat',
      'createdat',
    ]) {
      expect(cols[c], `missing column ${c}`).toBeDefined();
    }
  });

  it('email and trigger are required; userid is nullable so records survive account deletion', () => {
    expect(cols['email']?.notNull).toBe(true);
    expect(cols['trigger']?.notNull).toBe(true);
    expect(cols['userid']?.notNull).toBe(false);
  });

  it('exports the status and trigger vocabularies', () => {
    expect(WELCOME_SEND_STATUSES).toEqual(['sent', 'failed']);
    expect(WELCOME_SEND_TRIGGERS).toEqual([
      'subscription',
      'invitation',
      'backfill',
      'retry',
    ]);
  });
});

describe('FR-007 migration carries the PARTIAL unique index', () => {
  const read = async (): Promise<string> => {
    const fs = await import('node:fs/promises');
    return fs.readFile('src/db/migrations/0051_scope109_welcome_message.sql', 'utf-8');
  };

  it('creates both tables', async () => {
    const sql = await read();
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "welcomemessages"/);
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS "welcomesends"/);
  });

  it('scopes the unique index to successful sends only', async () => {
    const sql = await read();
    // The WHERE clause is the whole point: without it, one failed send would
    // permanently bar that address from ever being welcomed (no queue retry).
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS "uq_welcomesends_email_sent"/);
    expect(sql).toMatch(/lower\("email"\)\s*\)\s*WHERE "status" = 'sent'/);
  });

  it('matches the address case-insensitively', async () => {
    const sql = await read();
    expect(sql).toMatch(/lower\("email"\)/);
  });

  it('keeps the standing message a singleton', async () => {
    const sql = await read();
    expect(sql).toMatch(/uq_welcomemessages_singleton/);
  });

  it('does not cascade-delete send history when an account is removed', async () => {
    const sql = await read();
    // welcomesends.userid must be SET NULL: cascading would erase the proof a
    // person was welcomed, so a re-created account would be welcomed twice.
    expect(sql).toMatch(
      /welcomesends_userid_userprofiles_id_fk[\s\S]*?ON DELETE SET NULL/,
    );
  });
});
