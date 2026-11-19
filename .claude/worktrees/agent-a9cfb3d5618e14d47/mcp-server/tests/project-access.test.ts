/**
 * [SCOPE 043] Cross-tenant feedback disclosure.
 *
 * list_my_feedback took `projectId` from the caller and never checked it against
 * the caller's own token. Because resolveSinkScope rebinds ANY caller's scope to
 * the central sink, the scoped-query guard enforced `projectid = sink` — true for
 * every tenant's row — leaving tenancy to a post-fetch filter driven by that
 * unvalidated input.
 *
 * Verified against production 2026-08-02: a token bound to project A returned
 * project B's feedback in full; passing the sink's own (hardcoded, public) id
 * returned 81 items across 15 origin projects belonging to 8 companies.
 *
 * These pin the default-deny decision. Every branch that is not an explicit
 * company match must deny.
 */
import { describe, it, expect, vi } from 'vitest';
import { ErrorCode, McpError } from '@modelcontextprotocol/sdk/types.js';

// The scoped-query module opens a DB connection on import, so it is cut here: these
// tests are about the DECISION, and the rows it reads are the only input that matters.
const stub = vi.hoisted(() => ({ rows: [] as Array<{ companyId: string | null }> }));
vi.mock('../src/db/scoped-query.js', () => ({
  withScope: () => ({ selectScoped: async () => stub.rows }),
}));

import {
  decideProjectAccess,
  isProjectAccessDenial,
  assertCallerCanViewProject,
  callerCanViewProject,
  ProjectAccessError,
  PROJECT_ACCESS_DENIED,
  PROJECT_ACCESS_DENIAL_MARKER,
} from '../src/utils/project-access.js';
import type { McpScope } from '../src/middleware/auth.js';

const tokenScope = (customerId: string | null): McpScope =>
  ({ tokenId: 't', customerId, projectId: 'p', tokenPrefix: null, userId: 'u', authMode: 'token' }) as McpScope;

const ACME = 'company-acme-uuid';
const OTHER = 'company-other-uuid';

describe('decideProjectAccess', () => {
  it('allows a project owned by the caller company', () => {
    const d = decideProjectAccess({
      callerCompanyId: ACME,
      authMode: 'token',
      projectOwnerCompanyId: ACME,
    });
    expect(d.allowed).toBe(true);
  });

  it('DENIES another company\'s project — the disclosure (token bound to A, asked for B)', () => {
    const d = decideProjectAccess({
      callerCompanyId: ACME,
      authMode: 'token',
      projectOwnerCompanyId: OTHER,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/different company/);
  });

  it('DENIES the sink itself when the caller company does not own it', () => {
    // The sink id is a hardcoded public constant, so "knows the id" must confer
    // nothing. This is the path that returned every tenant's feedback at once.
    const d = decideProjectAccess({
      callerCompanyId: OTHER,
      authMode: 'token',
      projectOwnerCompanyId: ACME, // sink owned by Wxperts
    });
    expect(d.allowed).toBe(false);
  });

  it('DENIES when the project does not exist — no existence oracle', () => {
    const d = decideProjectAccess({
      callerCompanyId: ACME,
      authMode: 'token',
      projectOwnerCompanyId: null,
    });
    expect(d.allowed).toBe(false);
  });

  it('DENIES when the token resolved no company', () => {
    const d = decideProjectAccess({
      callerCompanyId: null,
      authMode: 'token',
      projectOwnerCompanyId: ACME,
    });
    expect(d.allowed).toBe(false);
  });

  it('DENIES dev-bypass — unauthenticated must not inherit access', () => {
    const d = decideProjectAccess({
      callerCompanyId: null,
      authMode: 'dev-bypass',
      projectOwnerCompanyId: ACME,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toMatch(/dev-bypass/);
  });

  it('DENIES dev-bypass even if a company somehow rides along', () => {
    const d = decideProjectAccess({
      callerCompanyId: ACME,
      authMode: 'dev-bypass',
      projectOwnerCompanyId: ACME,
    });
    expect(d.allowed).toBe(false);
  });

  it('does not treat two nulls as a match', () => {
    // The failure mode that would reopen it: null === null passing as "same company".
    const d = decideProjectAccess({
      callerCompanyId: null,
      authMode: 'token',
      projectOwnerCompanyId: null,
    });
    expect(d.allowed).toBe(false);
  });
});

/**
 * [SCOPE 043 / T023] Amendment D (FR-021) — a denial must be classified as a
 * refusal, not a server fault.
 *
 * The incident: `ProjectAccessError` is a plain Error, so the tool-call catch
 * rethrew it as InternalError and /call returned HTTP 500. Three consumer projects
 * polling the vendor-only incoming queue twice a minute produced 5,396 "errors" on
 * 2026-08-04 for the correct, permanent answer "no" — with nothing alerting.
 *
 * The predicate has to survive the tool layer converting the error, which is why
 * the marker rides in McpError's `data` rather than being matched on the message.
 */
describe('isProjectAccessDenial', () => {
  it('recognises the raw error thrown by assertCallerCanViewProject', () => {
    expect(isProjectAccessDenial(new ProjectAccessError(PROJECT_ACCESS_DENIED))).toBe(true);
  });

  it('recognises the converted form the HTTP layer actually sees', () => {
    // What server.ts rethrows once it has classified the denial. The HTTP layer no
    // longer has the class, so this shape is the whole contract between them.
    const converted = new McpError(ErrorCode.InvalidRequest, PROJECT_ACCESS_DENIED, {
      reason: PROJECT_ACCESS_DENIAL_MARKER,
    });
    expect(isProjectAccessDenial(converted)).toBe(true);
  });

  it('does NOT classify a genuine fault as a denial', () => {
    // The dangerous direction. A false positive here turns a real 500 into a quiet
    // 403 and hides an outage — the same blindness Amendment D exists to remove.
    expect(isProjectAccessDenial(new Error('connect ECONNREFUSED'))).toBe(false);
    expect(isProjectAccessDenial(new McpError(ErrorCode.InternalError, 'boom'))).toBe(false);
  });

  it('does not mistake a denial-shaped message for a denial', () => {
    // Message text is caller-visible and deliberately opaque; only the marker counts.
    expect(isProjectAccessDenial(new Error(PROJECT_ACCESS_DENIED))).toBe(false);
  });

  it('survives non-object throws without throwing itself', () => {
    for (const v of [null, undefined, 'scope-violation', 42, { data: null }, { data: 'x' }]) {
      expect(isProjectAccessDenial(v)).toBe(false);
    }
  });
});

/**
 * [SCOPE 043 / T024] Amendment D (FR-022) — the advertised capability and the
 * enforced gate must be the same decision.
 *
 * `cockpit_summary` now tells the Cockpit whether it may ask for the incoming queue,
 * so the extension stops asking ~2,880 times a day per consumer project just to be
 * refused. The risk that introduces is drift: a capability that says "yes" where the
 * gate says "no" produces a request that is refused anyway, and one that says "no"
 * where the gate says "yes" silently hides the vendor's queue. These pin them
 * together over the same inputs.
 */
describe('callerCanViewProject / assertCallerCanViewProject agree', () => {
  const ACME_SCOPE = tokenScope(ACME);

  const cases: Array<{ name: string; owner: string | null; expected: boolean }> = [
    { name: 'own company owns the project', owner: ACME, expected: true },
    { name: 'another company owns it', owner: OTHER, expected: false },
    { name: 'project carries no company', owner: null, expected: false },
  ];

  for (const c of cases) {
    it(`${c.name} → ${c.expected}, and the gate matches`, async () => {
      stub.rows = c.owner === null ? [] : [{ companyId: c.owner }];

      await expect(callerCanViewProject(ACME_SCOPE, 'sink-id')).resolves.toBe(c.expected);

      const gate = assertCallerCanViewProject(ACME_SCOPE, 'sink-id');
      if (c.expected) {
        await expect(gate).resolves.toBeUndefined();
      } else {
        await expect(gate).rejects.toBeInstanceOf(ProjectAccessError);
      }
    });
  }

  it('a dev-bypass caller is advertised no capability, matching the gate', async () => {
    stub.rows = [{ companyId: ACME }];
    const devScope = { ...tokenScope(ACME), authMode: 'dev-bypass' } as McpScope;

    await expect(callerCanViewProject(devScope, 'sink-id')).resolves.toBe(false);
    await expect(assertCallerCanViewProject(devScope, 'sink-id')).rejects.toBeInstanceOf(
      ProjectAccessError,
    );
  });
});

// [SCOPE 043 / T025] BEGIN — denial reaches the audit row on the JSON-RPC transports
//
// FR-021 requires a denied call to AUDIT as a denial. On /call that falls out of the
// 403, which auditFinishMiddleware maps. /mcp and /messages never produce a 4xx —
// JSON-RPC errors ride inside HTTP 200/202 — so on those transports the status-code
// mapping cannot fire and the denial would still be recorded as `success`. The tool
// layer therefore reports it directly, through the one server-owned channel that is
// already proven to reach the handler: `_meta`.
describe('recordDenialFromMeta', () => {
  it('marks the audit record a scope-violation', async () => {
    const { recordDenialFromMeta } = await import('../src/utils/project-access.js');
    const audit = { outcome: 'success' as string, errorcode: null as string | null };
    recordDenialFromMeta({ recordDenial: () => { audit.outcome = 'scope-violation'; } });
    expect(audit.outcome).toBe('scope-violation');
  });

  it('ignores a forged recordDenial — a client cannot send a function, only a value', async () => {
    const { recordDenialFromMeta } = await import('../src/utils/project-access.js');
    // JSON cannot carry a function, so anything a caller puts under this key is a
    // non-callable. Calling it blindly would turn a denial into a TypeError — i.e.
    // a 500 — which is the exact failure FR-021 exists to remove.
    for (const forged of ['not-a-function', 42, null, {}, []]) {
      expect(() => recordDenialFromMeta({ recordDenial: forged })).not.toThrow();
    }
  });

  it('tolerates absent or malformed _meta', async () => {
    const { recordDenialFromMeta } = await import('../src/utils/project-access.js');
    for (const meta of [undefined, null, 'string', 7, {}]) {
      expect(() => recordDenialFromMeta(meta)).not.toThrow();
    }
  });
});
// [SCOPE 043 / T025] END
