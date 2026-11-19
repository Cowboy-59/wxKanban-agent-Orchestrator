// [SCOPE 043 / T021] The privilege boundary, proven without a database.
//
// WHY THIS EXISTS: authority here is SINK OWNERSHIP, not row ownership — the vendor is
// SUPPOSED to modify rows submitted by other companies. That makes "the gate ran, and ran
// before any write" the only thing standing between a vendor tool and a cross-tenant write.
// SCOPE-043 has already shipped one cross-tenant disclosure; this pins the replacement.
import { describe, it, expect, vi } from 'vitest';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import {
  updateFeedbackStatus,
  type UpdateFeedbackStatusDeps,
} from '../src/utils/feedback-status-update.js';
import type { McpScope } from '../src/middleware/auth.js';
import type { ScopedDb } from '../src/db/scoped-query.js';
import { UpdateFeedbackStatusInputSchema } from '../src/utils/schemas.js'; // [SCOPE 148 / T003]

const SINK_PROJECT = 'sink-project-uuid';
const VENDOR: McpScope = {
  userId: 'vendor-user-uuid',
  customerId: 'vendor-company-uuid',
  projectId: 'vendor-project-uuid',
} as McpScope;

/** A row submitted by a DIFFERENT company than the caller — the vendor case. */
const foreignRow = (over: Record<string, unknown> = {}) => ({
  id: 'feedback-uuid',
  userId: 'customer-user-uuid',
  companyId: 'OTHER-company-uuid',
  title: 'Export button does nothing',
  status: 'new',
  internalNotes: null,
  declineReason: null,
  clarificationQuestion: null,
  reopenedAt: null,
  firstTriagedAt: null,
  notificationChannel: 'inapp',
  ...over,
});

/**
 * Records every call so tests can assert what did and did not reach the database.
 * MODIFIED-BY: [SCOPE 148 / T002] — the status change now runs in `raw.transaction`
 * with its audit row (FR-013); the fake tx pushes the status `set` into `updates`, as
 * updateScoped did, and the audit row into `audits`. `committed` stays false when the
 * transaction callback throws, which is what Postgres would roll back.
 */
function stubSink(row: unknown, opts: { insertThrows?: boolean; auditThrows?: boolean } = {}) {
  const calls = {
    selects: 0,
    updates: [] as unknown[],
    inserts: [] as unknown[],
    audits: [] as Array<Record<string, unknown>>,
    committed: false,
  };
  const tx = {
    update: () => ({
      set: (set: unknown) => ({
        where: () => ({
          returning: async () => {
            calls.updates.push(set);
            return row ? [{ ...(row as object), ...(set as object) }] : [];
          },
        }),
      }),
    }),
    insert: () => ({
      values: async (v: Record<string, unknown>) => {
        if (opts.auditThrows) throw new Error('audit insert failed');
        calls.audits.push(v);
      },
    }),
  };
  const sink = {
    scope: { projectId: SINK_PROJECT, customerId: 'vendor-company-uuid' },
    raw: {
      transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => {
        const out = await fn(tx);
        calls.committed = true;
        return out;
      }),
    },
    selectScoped: vi.fn(async () => {
      calls.selects += 1;
      return row ? [row] : [];
    }),
    updateScoped: vi.fn(async (_t: unknown, set: unknown) => {
      calls.updates.push(set);
      return [{ ...(row as object), ...(set as object) }];
    }),
    insertScoped: vi.fn(async (_t: unknown, values: unknown) => {
      if (opts.insertThrows) throw new Error('inbox write failed');
      calls.inserts.push(values);
      return [values];
    }),
  } as unknown as ScopedDb;
  return { sink, calls };
}

function deps(sink: ScopedDb, over: Partial<UpdateFeedbackStatusDeps> = {}): UpdateFeedbackStatusDeps {
  return {
    assertCallerCanViewProject: vi.fn(async () => undefined),
    resolveSinkScope: vi.fn(async () => sink),
    sinkProjectId: () => SINK_PROJECT,
    ...over,
  };
}

const input = (over: Record<string, unknown> = {}) => ({
  projectId: 'vendor-project-uuid',
  feedbackId: 'feedback-uuid',
  status: 'inprogress',
  ...over,
}) as never;

describe('updateFeedbackStatus — the privilege boundary', () => {
  it('REJECTS a caller whose company does not own the sink, and writes NOTHING', async () => {
    const { sink, calls } = stubSink(foreignRow());
    const d = deps(sink, {
      assertCallerCanViewProject: vi.fn(async () => {
        throw new McpError(ErrorCode.InvalidParams, 'caller company does not own this project');
      }),
    });

    await expect(updateFeedbackStatus(VENDOR, input(), d)).rejects.toThrow(/does not own/);

    // The point of the test: not merely that it threw, but that no write escaped.
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it('gates BEFORE resolving the sink or reading anything', async () => {
    const order: string[] = [];
    const { sink } = stubSink(foreignRow());
    const d: UpdateFeedbackStatusDeps = {
      assertCallerCanViewProject: vi.fn(async () => { order.push('gate'); }),
      resolveSinkScope: vi.fn(async () => { order.push('resolveSink'); return sink; }),
      sinkProjectId: () => SINK_PROJECT,
    };

    await updateFeedbackStatus(VENDOR, input(), d);

    expect(order[0]).toBe('gate');
    expect(d.assertCallerCanViewProject).toHaveBeenCalledWith(VENDOR, SINK_PROJECT);
  });

  it('ALLOWS a sink owner to move a row submitted by a different company', async () => {
    const { sink, calls } = stubSink(foreignRow());
    const res = await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));

    expect(res.status).toBe('resolved');
    expect(calls.updates.length).toBeGreaterThan(0);
  });

  it('requires a user-scoped token', async () => {
    const { sink } = stubSink(foreignRow());
    const anon = { ...VENDOR, userId: undefined } as unknown as McpScope;
    await expect(updateFeedbackStatus(anon, input(), deps(sink))).rejects.toThrow(/user-scoped/);
  });

  it('reports not-found without writing', async () => {
    const { sink, calls } = stubSink(null);
    await expect(updateFeedbackStatus(VENDOR, input(), deps(sink))).rejects.toThrow(/not found/);
    expect(calls.updates).toHaveLength(0);
  });
});

describe('updateFeedbackStatus — transition semantics', () => {
  it('stamps firstTriagedAt on first touch', async () => {
    const { sink, calls } = stubSink(foreignRow({ firstTriagedAt: null }));
    await updateFeedbackStatus(VENDOR, input(), deps(sink));
    expect((calls.updates[0] as { firstTriagedAt: Date }).firstTriagedAt).toBeInstanceOf(Date);
  });

  it('does NOT overwrite firstTriagedAt on a later transition', async () => {
    const original = new Date('2026-01-01T00:00:00.000Z');
    const { sink, calls } = stubSink(foreignRow({ firstTriagedAt: original }));
    await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    expect((calls.updates[0] as { firstTriagedAt: Date }).firstTriagedAt).toEqual(original);
  });

  it('writes the note to BOTH internalNotes and declineReason when declining (FR-018)', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(
      VENDOR,
      input({ status: 'declined', note: '  works as designed  ' }),
      deps(sink),
    );
    const set = calls.updates[0] as { internalNotes: string; declineReason: string };
    expect(set.declineReason).toBe('works as designed');
    expect(set.internalNotes).toContain('works as designed');
  });

  it('appends a note to existing history rather than replacing it', async () => {
    const { sink, calls } = stubSink(foreignRow({ internalNotes: 'earlier note' }));
    await updateFeedbackStatus(VENDOR, input({ note: 'later note' }), deps(sink));
    const set = calls.updates[0] as { internalNotes: string };
    expect(set.internalNotes).toBe('earlier note\n---\nlater note');
  });

  it('writes the note to clarificationQuestion when requesting more info, replacing any stale value', async () => {
    const { sink, calls } = stubSink(foreignRow({ clarificationQuestion: 'stale prior question' }));
    await updateFeedbackStatus(
      VENDOR,
      input({ status: 'needsinfo', note: '  which browser?  ' }),
      deps(sink),
    );
    const set = calls.updates[0] as { clarificationQuestion: string };
    expect(set.clarificationQuestion).toBe('which browser?');
  });
});

describe('updateFeedbackStatus — notification is best-effort', () => {
  it('still returns the new status with notified:false when the inbox write throws', async () => {
    // The status change is already the source of truth; a failed inbox write must not
    // undo it, and must not be swallowed silently either.
    const { sink } = stubSink(foreignRow(), { insertThrows: true });
    const res = await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    expect(res.status).toBe('resolved');
    expect(res.notified).toBe(false);
  });

  it('reports notified:true and writes an inbox row on the happy path', async () => {
    const { sink, calls } = stubSink(foreignRow());
    const res = await updateFeedbackStatus(VENDOR, input(), deps(sink));
    expect(res.notified).toBe(true);
    expect(calls.inserts).toHaveLength(1);
    expect((calls.inserts[0] as { type: string }).type).toBe('feedback_status');
    expect((calls.inserts[0] as { userid: string }).userid).toBe('customer-user-uuid');
  });

  it('builds the inbox message from the NEW status, not the pre-update row', async () => {
    // The row passed to buildStatusMessage must be the post-update row: it starts
    // at status:'new', and the transition here is to 'inprogress'. If the message
    // were built from the pre-update row, it would tell the submitter about the
    // OLD status instead of the one they're actually being notified of.
    const { sink, calls } = stubSink(foreignRow({ status: 'new' }));
    await updateFeedbackStatus(VENDOR, input({ status: 'inprogress' }), deps(sink));
    expect((calls.inserts[0] as { message: string }).message).toContain('is now in progress');
  });

  it("reconciles notifyStatus to 'done' after a successful notification to an inapp submitter", async () => {
    const { sink, calls } = stubSink(foreignRow({ notificationChannel: 'inapp' }));
    await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    // calls.updates[0] is the status transition; calls.updates[1] is the notifyStatus reconcile.
    expect(calls.updates).toHaveLength(2);
    expect((calls.updates[1] as { notifyStatus: string }).notifyStatus).toBe('done');
  });

  it("reconciles notifyStatus to 'failed' after a successful notification to an email submitter", async () => {
    // MCP has no SES leg: the in-app row is written, but email is still owed, so
    // notifyStatus must land on 'failed' (the only value SysAdmin's retry button
    // reacts to) even though notified:true — deleting or mis-valuing this reconcile
    // would leave an email-channel submitter silently unnotified.
    const { sink, calls } = stubSink(foreignRow({ notificationChannel: 'email' }));
    const res = await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    expect(res.notified).toBe(true);
    expect((calls.updates[1] as { notifyStatus: string }).notifyStatus).toBe('failed');
  });

  it("best-effort writes notifyStatus:'failed' when the inbox insert throws, without losing the status change", async () => {
    const { sink, calls } = stubSink(foreignRow(), { insertThrows: true });
    const res = await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    expect(res.status).toBe('resolved');
    expect(res.notified).toBe(false);
    // calls.updates[0] is the status transition; calls.updates[1] is the best-effort
    // notifyStatus='failed' write from the catch block.
    expect(calls.updates).toHaveLength(2);
    expect((calls.updates[1] as { notifyStatus: string }).notifyStatus).toBe('failed');
  });

  it('does not throw, and still returns the result, when the notifyStatus=failed reconcile itself fails', async () => {
    // Guard on the guard: a second failure writing notifyStatus='failed' must not
    // escape the handler either — the caller must still get its result back.
    const { sink } = stubSink(foreignRow(), { insertThrows: true });
    // The status change runs in the transaction now (SCOPE-148 T002), so the FIRST
    // updateScoped call is the notifyStatus='failed' reconcile.
    let updateCalls = 0;
    (sink.updateScoped as ReturnType<typeof vi.fn>).mockImplementation(async (_t: unknown, set: unknown) => {
      updateCalls += 1;
      if (updateCalls === 1) throw new Error('notifyStatus reconcile failed too');
      return [{ ...foreignRow(), ...(set as object) }];
    });
    const res = await updateFeedbackStatus(VENDOR, input({ status: 'resolved' }), deps(sink));
    expect(res.status).toBe('resolved');
    expect(res.notified).toBe(false);
  });
});

// [SCOPE 148 / T002] BEGIN — every MCP status change is audited, in the same transaction (FR-013)
const AGENT: McpScope = { ...VENDOR, tokenName: 'project-agent:KAIN' } as McpScope;
const PERSON: McpScope = { ...VENDOR, tokenName: 'Token 2026-09-25' } as McpScope;

describe('updateFeedbackStatus — audit row (SPEC-148 FR-013)', () => {
  it('writes exactly one feedback.status.changed row naming the actor, old and new status', async () => {
    const { sink, calls } = stubSink(foreignRow({ status: 'new' }));
    await updateFeedbackStatus(PERSON, input({ status: 'inprogress' }), deps(sink));
    expect(calls.audits).toHaveLength(1);
    const row = calls.audits[0];
    expect(row.action).toBe('feedback.status.changed');
    expect(row.changedby).toBe('vendor-user-uuid');
    expect(row.companyid).toBe('vendor-company-uuid');
    expect(row.previousvalue).toEqual({ status: 'new' });
    expect(row.newvalue).toMatchObject({ resourceId: 'feedback-uuid', status: 'inprogress', via: 'manual' });
  });

  it('derives via from the token name: project-agent for a minted agent token', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(AGENT, input({ status: 'triaged' }), deps(sink));
    expect(calls.audits[0].newvalue).toMatchObject({ via: 'project-agent' });
  });

  it('cannot be told its via by the caller', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(PERSON, input({ status: 'triaged', via: 'project-agent' }), deps(sink));
    expect(calls.audits[0].newvalue).toMatchObject({ via: 'manual' });
  });

  it('records the template and version when a template is sent', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(
      AGENT,
      input({ status: 'resolved', resolutionTemplate: 'kit', fixedInVersion: '1.7.78' }),
      deps(sink),
    );
    expect(calls.audits[0].newvalue).toMatchObject({ resolutionTemplate: 'kit', fixedInVersion: '1.7.78' });
  });

  it('a failed audit insert fails the whole change: nothing commits and no one is notified', async () => {
    const { sink, calls } = stubSink(foreignRow(), { auditThrows: true });
    await expect(updateFeedbackStatus(PERSON, input({ status: 'resolved' }), deps(sink))).rejects.toThrow(
      /audit insert failed/,
    );
    expect(calls.committed).toBe(false);
    expect(calls.inserts).toHaveLength(0);
  });

  it('runs the status update and the audit row inside one transaction', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(PERSON, input(), deps(sink));
    expect(sink.raw.transaction).toHaveBeenCalledTimes(1);
    expect(calls.updates[0]).toMatchObject({ status: 'inprogress' });
    expect(calls.audits).toHaveLength(1);
    expect(calls.committed).toBe(true);
  });
});
// [SCOPE 148 / T002] END

// [SCOPE 148 / T003] BEGIN — server-rendered resolved templates (FR-010)
describe('updateFeedbackStatus — resolved templates (SPEC-148 FR-010)', () => {
  const message = (calls: { inserts: unknown[] }) => (calls.inserts[0] as { message: string }).message;

  it('kit: the server writes the whole message, naming the version and how to check it', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(
      AGENT,
      input({ status: 'resolved', resolutionTemplate: 'kit', fixedInVersion: '1.7.78' }),
      deps(sink),
    );
    expect(message(calls)).toBe(
      'Your report "Export button does nothing" (feedback): ' +
        'Your issue has been resolved in a previous release. Check your kit release: it should be 1.7.78 or later. ' +
        'Run wxkanban-agent --version in a terminal to see yours. Thanks for your patience.',
    );
  });

  it('cockpit points at the Extensions view; hosted says the fix is live', async () => {
    const a = stubSink(foreignRow());
    await updateFeedbackStatus(AGENT, input({ status: 'resolved', resolutionTemplate: 'cockpit', fixedInVersion: 'v0.2.45' }), deps(a.sink));
    expect(message(a.calls)).toContain('it should be 0.2.45 or later');
    expect(message(a.calls)).toContain("VS Code's Extensions view");

    const b = stubSink(foreignRow());
    await updateFeedbackStatus(AGENT, input({ status: 'resolved', resolutionTemplate: 'hosted' }), deps(b.sink));
    expect(message(b.calls)).toBe(
      'Your report "Export button does nothing" (feedback): Your issue has been resolved. The fix is live in wxKanban now. Thanks for your patience.',
    );
  });

  it('REFUSES a project-agent resolve without a template, writing nothing', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await expect(updateFeedbackStatus(AGENT, input({ status: 'resolved' }), deps(sink))).rejects.toThrow(
      /template_required/,
    );
    expect(sink.raw.transaction).not.toHaveBeenCalled();
    expect(calls.audits).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it('a person resolving without a template behaves exactly as before', async () => {
    const { sink, calls } = stubSink(foreignRow());
    await updateFeedbackStatus(PERSON, input({ status: 'resolved', note: 'fixed in 1.5.350' }), deps(sink));
    expect(message(calls)).toBe('Your report "Export button does nothing" (feedback) has been resolved: fixed in 1.5.350');
  });
});
// [SCOPE 148 / T003] END

// [SCOPE 148 / T004] BEGIN — the recurrence guard (FR-012)
describe('updateFeedbackStatus — recurrence_suspected (SPEC-148 FR-012)', () => {
  const resolveKit = (fixedInVersion: string) =>
    input({ status: 'resolved', resolutionTemplate: 'kit', fixedInVersion });

  it.each([
    ['1.7.80', '1.7.78'],
    ['1.7.78', '1.7.78'],
  ])('REFUSES when the report records kit %s and the fix is %s — nothing written, no one notified', async (recorded, fix) => {
    const { sink, calls } = stubSink(foreignRow({ context: { kitversion: recorded } }));
    await expect(updateFeedbackStatus(AGENT, resolveKit(fix), deps(sink))).rejects.toThrow(/recurrence_suspected/);
    expect(sink.raw.transaction).not.toHaveBeenCalled();
    expect(calls.updates).toHaveLength(0);
    expect(calls.inserts).toHaveLength(0);
  });

  it('resolves when the recorded version is below the fix', async () => {
    const { sink } = stubSink(foreignRow({ context: { kitversion: '1.7.70' } }));
    const res = await updateFeedbackStatus(AGENT, resolveKit('1.7.78'), deps(sink));
    expect(res.status).toBe('resolved');
  });

  it('does not refuse when the report records no version (the filing-date rule is the agent\'s)', async () => {
    const { sink } = stubSink(foreignRow({ context: { os: 'win32' } }));
    await expect(updateFeedbackStatus(AGENT, resolveKit('1.7.78'), deps(sink))).resolves.toMatchObject({ status: 'resolved' });
  });

  it('cockpit compares the Cockpit version, not the kit one', async () => {
    const row = foreignRow({ context: { kitversion: '9.9.9', extensionversion: '0.2.40' } });
    const { sink } = stubSink(row);
    await expect(
      updateFeedbackStatus(AGENT, input({ status: 'resolved', resolutionTemplate: 'cockpit', fixedInVersion: '0.2.45' }), deps(sink)),
    ).resolves.toMatchObject({ status: 'resolved' });
  });

  it('hosted has no version check', async () => {
    const { sink } = stubSink(foreignRow({ context: { kitversion: '9.9.9', extensionversion: '9.9.9' } }));
    await expect(
      updateFeedbackStatus(AGENT, input({ status: 'resolved', resolutionTemplate: 'hosted' }), deps(sink)),
    ).resolves.toMatchObject({ status: 'resolved' });
  });
});
// [SCOPE 148 / T004] END

// [SCOPE 148 / T003] BEGIN — input refusals (FR-010)
describe('UpdateFeedbackStatusInputSchema — template refusals (SPEC-148 FR-010)', () => {
  const base = { projectId: '00000000-0000-4000-8000-000000000001', feedbackId: '00000000-0000-4000-8000-000000000002' };

  it.each([
    ['a template with a note', { status: 'resolved', resolutionTemplate: 'hosted', note: 'hi' }],
    ['kit without fixedInVersion', { status: 'resolved', resolutionTemplate: 'kit' }],
    ['cockpit without fixedInVersion', { status: 'resolved', resolutionTemplate: 'cockpit' }],
    ['a non-semver fixedInVersion', { status: 'resolved', resolutionTemplate: 'kit', fixedInVersion: 'latest' }],
    ['a pre-release fixedInVersion', { status: 'resolved', resolutionTemplate: 'kit', fixedInVersion: '1.7.78-beta' }],
    ['a template on a status other than resolved', { status: 'triaged', resolutionTemplate: 'hosted' }],
    ['fixedInVersion without a template', { status: 'resolved', fixedInVersion: '1.7.78' }],
  ])('refuses %s', (_label, over) => {
    expect(UpdateFeedbackStatusInputSchema.safeParse({ ...base, ...over }).success).toBe(false);
  });

  it.each([
    ['kit with a version', { status: 'resolved', resolutionTemplate: 'kit', fixedInVersion: '1.7.78' }],
    ['hosted alone', { status: 'resolved', resolutionTemplate: 'hosted' }],
    ['a plain resolve with a note', { status: 'resolved', note: 'fixed' }],
  ])('accepts %s', (_label, over) => {
    expect(UpdateFeedbackStatusInputSchema.safeParse({ ...base, ...over }).success).toBe(true);
  });
});
// [SCOPE 148 / T003] END
