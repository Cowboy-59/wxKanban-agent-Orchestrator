# Vendor Feedback Status Transitions over MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `project.update_feedback_status` so the vendor can move any feedback report filed into a sink their company owns through the full status vocabulary from Claude, instead of leaving for the SysAdmin web screen.

**Architecture:** The MCP server has **zero imports from `src/`** — it is a separate App Runner deployment sharing one database — so it cannot call the app's `FeedbackTriageService.transitionStatus`. The transition is therefore re-implemented against the shared DB through the existing `ScopedDb` helpers, exactly as the four other feedback write-tools already do. Pure decision logic (vocabulary, decline rule, note append, notification wording, notify-status resolution) lives in one dependency-free module so it is unit-testable without a network or a DB; the handler is thin glue. A drift-guard test pins the MCP vocabulary to the app's.

**Tech Stack:** TypeScript (ESM, `.js` import specifiers), Drizzle ORM, Zod 3.25, Vitest 4.1, `@modelcontextprotocol/sdk`.

**Requirements source:** `specs/Project-Scope/043-user-feedback.md` → **Amendment C**, FR-017 … FR-020.

## Global Constraints

- **TypeScript 100%.** No `any`, no `@ts-ignore`.
- **Never hand-cast a DB row.** Use `as Array<typeof <table>.$inferSelect>`. A hand-written shape cast is what hid the missing `companies.name` column on 2026-08-03 — it typechecked, unit-passed, produced no `42703`, and silently yielded `undefined` forever.
- **`mcp-server/src/db/schema.ts` is a PARTIAL mirror.** Before reading any column, confirm it is declared there. Adding a column means Drizzle will `SELECT` it on *every* read of that table, so it must exist in production.
- **No direct `db.select/insert/update/delete`.** Use `sink.selectScoped` / `insertScoped` / `updateScoped`, or `sink.raw` for joins. Enforced by CI grep `scripts/check-no-direct-db.sh`.
- **Logging: Pino only** (`import logger from './logger.js'`). No `console.log`.
- **Fences are mandatory** on every top-level declaration: `// [SCOPE 043 / FR-0NN] BEGIN — <purpose>` … `// [SCOPE 043 / FR-0NN] END`. Hand-authored here because the orchestrator CLI is unavailable; **never edit an existing fence** — rewriting one silently reassigns authorship.
- **Status vocabulary is exactly:** `new`, `triaged`, `needsinfo`, `inprogress`, `resolved`, `declined`. No additions.
- **Verification bar:** unit-green plus build-green is **not** evidence. Task 5 exercises the tool against a real row on the real database before this is called done.
- **Never `git push`.** A push deploys production and auto-deploys the hosted MCP. Commits only.
- DB column names are lowercase with no underscores; the Drizzle property may be camelCase.

---

## File Structure

| File | Responsibility |
|---|---|
| `mcp-server/src/utils/feedback-status.ts` | **Create.** All pure decision logic. No imports except types. |
| `mcp-server/tests/feedback-status.test.ts` | **Create.** Unit tests for the above. |
| `mcp-server/tests/feedback-status-drift.test.ts` | **Create.** Fails if MCP and app vocabularies diverge. |
| `mcp-server/src/db/schema.ts` | **Modify.** Add the `notifications` mirror. |
| `mcp-server/src/utils/schemas.ts` | **Modify.** Add `UpdateFeedbackStatusInputSchema`. |
| `mcp-server/src/auth/role-checker.ts` | **Modify.** `PERMISSION_MATRIX` entry. |
| `mcp-server/src/server.ts` | **Modify.** Allowed-tools list, handler case, tool registration. |

---

### Task 1: Pure status module

**Files:**
- Create: `mcp-server/src/utils/feedback-status.ts`
- Test: `mcp-server/tests/feedback-status.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `FEEDBACK_STATUSES: readonly ['new','triaged','needsinfo','inprogress','resolved','declined']`; `type FeedbackStatus`; `appendInternalNote(existing: string | null, note: string): string`; `buildStatusMessage(row: StatusMessageRow): string`; `resolveNotifyStatus(channel: string | null): 'done' | 'failed'`; `interface StatusMessageRow { id: string; title: string; status: string; reopenedAt: Date | null; clarificationQuestion: string | null; declineReason: string | null }`.

- [ ] **Step 1: Write the failing test**

Create `mcp-server/tests/feedback-status.test.ts`:

```ts
// [SCOPE 043 / FR-017] Decision logic is pure so it is pinned without a DB.
import { describe, it, expect } from 'vitest';
import {
  FEEDBACK_STATUSES,
  appendInternalNote,
  buildStatusMessage,
  resolveNotifyStatus,
  type StatusMessageRow,
} from '../src/utils/feedback-status.js';

const row = (over: Partial<StatusMessageRow> = {}): StatusMessageRow => ({
  id: 'abcdef12-0000-0000-0000-000000000000',
  title: 'Export button does nothing',
  status: 'triaged',
  reopenedAt: null,
  clarificationQuestion: null,
  declineReason: null,
  ...over,
});

describe('FEEDBACK_STATUSES', () => {
  it('is the app vocabulary, in order', () => {
    expect(FEEDBACK_STATUSES).toEqual([
      'new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined',
    ]);
  });
});

describe('appendInternalNote', () => {
  it('uses the app separator when there is prior history', () => {
    expect(appendInternalNote('first', 'second')).toBe('first\n---\nsecond');
  });

  it('does not lead with a separator on the first note', () => {
    expect(appendInternalNote(null, 'first')).toBe('first');
    expect(appendInternalNote('', 'first')).toBe('first');
  });

  it('trims the incoming note', () => {
    expect(appendInternalNote(null, '  padded  ')).toBe('padded');
  });
});

describe('buildStatusMessage', () => {
  it('leads with the 8-char reference the submitter sees', () => {
    expect(buildStatusMessage(row())).toContain('abcdef12');
  });

  it('quotes the clarifying question for needsinfo', () => {
    const m = buildStatusMessage(row({ status: 'needsinfo', clarificationQuestion: 'Which browser?' }));
    expect(m).toContain('Which browser?');
  });

  it('quotes the decline reason', () => {
    const m = buildStatusMessage(row({ status: 'declined', declineReason: 'works as designed' }));
    expect(m).toContain('works as designed');
  });

  it('falls back when a declined row somehow has no reason', () => {
    expect(buildStatusMessage(row({ status: 'declined' }))).toContain('no reason given');
  });

  it('reports a reopened row as a regression, not a generic change', () => {
    // SCOPE-110: a closed error that recurred is returned to 'new' with reopenedAt set.
    const m = buildStatusMessage(row({ status: 'new', reopenedAt: new Date('2026-08-01') }));
    expect(m).toContain('recurred');
    expect(m).toContain('regression');
  });

  it('has distinct wording per status', () => {
    const seen = new Set(
      FEEDBACK_STATUSES.map((s) => buildStatusMessage(row({ status: s }))),
    );
    expect(seen.size).toBe(FEEDBACK_STATUSES.length);
  });
});

describe('resolveNotifyStatus', () => {
  it("marks inapp done - the in-app row IS the whole delivery", () => {
    expect(resolveNotifyStatus('inapp')).toBe('done');
    expect(resolveNotifyStatus(null)).toBe('done');
  });

  it("marks email failed so SysAdmin shows a retry button", () => {
    // Deliberate (FR-019): MCP has no SES. 'failed' is the only value the app's
    // retry affordance reacts to, so it means "in-app delivered, email still owed".
    expect(resolveNotifyStatus('email')).toBe('failed');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run tests/feedback-status.test.ts`
Expected: FAIL — `Failed to resolve import "../src/utils/feedback-status.js"`.

- [ ] **Step 3: Write minimal implementation**

Create `mcp-server/src/utils/feedback-status.ts`:

```ts
// [SCOPE 043 / FR-017] BEGIN — pure decision logic for vendor status transitions.
//
// WHY THIS IS ITS OWN MODULE: mcp-server has zero imports from src/, so the app's
// FeedbackTriageService is unreachable and these rules must be re-implemented.
// Keeping them dependency-free means they are unit-testable without a DB, and it
// gives the drift-guard test (FR-020) one obvious place to point at.
export const FEEDBACK_STATUSES = [
  'new',
  'triaged',
  'needsinfo',
  'inprogress',
  'resolved',
  'declined',
] as const;
export type FeedbackStatus = (typeof FEEDBACK_STATUSES)[number];

export interface StatusMessageRow {
  id: string;
  title: string;
  status: string;
  reopenedAt: Date | null;
  clarificationQuestion: string | null;
  declineReason: string | null;
}

/** Append using the app's separator so a history written by either surface reads the same. */
export function appendInternalNote(existing: string | null, note: string): string {
  const incoming = note.trim();
  return existing ? `${existing}\n---\n${incoming}` : incoming;
}

/**
 * Submitter-facing wording, mirroring the app's messageForStatus. This is a
 * deliberate duplicate: the alternative was a cross-deployment HTTP call. FR-020's
 * drift guard covers the vocabulary; wording drift is accepted and bounded here.
 */
export function buildStatusMessage(row: StatusMessageRow): string {
  const ref = row.id.slice(0, 8);
  // A row returned to 'new' carrying reopenedAt is a recurrence of a closed error
  // (SCOPE-110), not a generic status change — say so, or it reads as noise.
  if (row.status === 'new' && row.reopenedAt) {
    return `A previously closed error "${row.title}" (${ref}) has recurred and was reopened as a regression.`;
  }
  switch (row.status) {
    case 'needsinfo':
      return `Your report "${row.title}" (${ref}) needs more info: ${row.clarificationQuestion ?? 'please add details.'}`;
    case 'triaged':
      return `Your report "${row.title}" (${ref}) has been triaged.`;
    case 'inprogress':
      return `Your report "${row.title}" (${ref}) is now in progress.`;
    case 'resolved':
      return `Your report "${row.title}" (${ref}) has been resolved.`;
    case 'declined':
      return `Your report "${row.title}" (${ref}) was declined: ${row.declineReason ?? 'no reason given'}.`;
    default:
      return `Your report "${row.title}" (${ref}) status: ${row.status}.`;
  }
}

/**
 * MCP can write the in-app inbox row but cannot send email (no SES in this
 * deployment). The app surfaces a retry button ONLY for notifystatus='failed', so
 * 'pending' would leave an email-channel submitter with silence AND no way to fix
 * it. 'failed' here means "in-app delivered, email still owed" — a visible gap one
 * click from resolution beats an invisible one.
 */
export function resolveNotifyStatus(channel: string | null): 'done' | 'failed' {
  return channel === 'email' ? 'failed' : 'done';
}
// [SCOPE 043 / FR-017] END
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd mcp-server && npx vitest run tests/feedback-status.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/utils/feedback-status.ts mcp-server/tests/feedback-status.test.ts
git commit -m "feat(SCOPE-043): pure status-transition logic for FR-017"
```

---

### Task 2: Drift guard (FR-020)

**Files:**
- Create: `mcp-server/tests/feedback-status-drift.test.ts`

**Interfaces:**
- Consumes: `FEEDBACK_STATUSES` from Task 1.
- Produces: nothing consumed by later tasks.

**Why:** Re-implementing the transition means the rules exist twice. This test is the only thing preventing the two copies from diverging quietly.

- [ ] **Step 1: Write the failing test**

Create `mcp-server/tests/feedback-status-drift.test.ts`:

```ts
// [SCOPE 043 / FR-020] The MCP server cannot import from src/ (separate deployment),
// so the app's vocabulary is read off disk and compared. This is the standing cost
// of re-implementing the transition; without it the copies drift silently.
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { FEEDBACK_STATUSES } from '../src/utils/feedback-status.js';

const APP_SERVICE = join(
  process.cwd(), '..', 'src', 'server', 'services', 'FeedbackTriageService.ts',
);

describe('status vocabulary parity with the app', () => {
  it('matches FeedbackTriageService.FEEDBACK_STATUSES exactly', () => {
    // Kit consumers ship mcp-server without the app tree; skip rather than fail.
    if (!existsSync(APP_SERVICE)) {
      expect(true).toBe(true);
      return;
    }
    const src = readFileSync(APP_SERVICE, 'utf8');
    const block = /export const FEEDBACK_STATUSES = \[([\s\S]*?)\] as const;/.exec(src);
    expect(block, 'FEEDBACK_STATUSES not found - the app file was restructured').not.toBeNull();

    const appStatuses = [...block![1].matchAll(/"([a-z]+)"/g)].map((m) => m[1]);
    expect(appStatuses.length).toBeGreaterThan(0);
    expect(appStatuses).toEqual([...FEEDBACK_STATUSES]);
  });
});
```

- [ ] **Step 2: Run test to verify it passes immediately**

Run: `cd mcp-server && npx vitest run tests/feedback-status-drift.test.ts`
Expected: PASS. (This guard is written to pass now; its value is failing later.)

- [ ] **Step 3: Prove the guard actually bites**

Temporarily edit `mcp-server/src/utils/feedback-status.ts` and add `'archived',` to the array. Re-run the command from Step 2.
Expected: FAIL, showing the two arrays differing. **Revert the edit** and re-run to confirm PASS. A guard never seen failing is not known to work.

- [ ] **Step 4: Commit**

```bash
git add mcp-server/tests/feedback-status-drift.test.ts
git commit -m "test(SCOPE-043): pin MCP status vocabulary to the app (FR-020)"
```

---

### Task 3: Mirror `notifications`, input schema, permission entry

**Files:**
- Modify: `mcp-server/src/db/schema.ts` (append after the `companies` block, ~line 48)
- Modify: `mcp-server/src/utils/schemas.ts` (append after `TriageFeedbackInputSchema`, ~line 178)
- Modify: `mcp-server/src/auth/role-checker.ts` (~line 24, beside the other feedback tools)
- Modify: `mcp-server/src/server.ts` (allowed-tools list, ~line 281)
- Test: `mcp-server/tests/feedback-status.test.ts` (extend)

**Interfaces:**
- Consumes: `FEEDBACK_STATUSES` from Task 1.
- Produces: `notifications` Drizzle table; `UpdateFeedbackStatusInputSchema`; `type UpdateFeedbackStatusInput = { projectId: string; feedbackId: string; status: FeedbackStatus; note?: string }`.

- [ ] **Step 1: Write the failing test**

Append to `mcp-server/tests/feedback-status.test.ts`:

```ts
import { UpdateFeedbackStatusInputSchema } from '../src/utils/schemas.js';

describe('UpdateFeedbackStatusInputSchema', () => {
  const base = {
    projectId: '11111111-1111-1111-1111-111111111111',
    feedbackId: '22222222-2222-2222-2222-222222222222',
  };

  it('accepts a status with no note', () => {
    expect(UpdateFeedbackStatusInputSchema.parse({ ...base, status: 'inprogress' }).status)
      .toBe('inprogress');
  });

  it('REJECTS declined without a note - the note is the decline reason (FR-018)', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'declined' });
    expect(r.success).toBe(false);
  });

  it('rejects declined with a whitespace-only note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'declined', note: '   ' });
    expect(r.success).toBe(false);
  });

  it('accepts declined with a note', () => {
    const r = UpdateFeedbackStatusInputSchema.safeParse({
      ...base, status: 'declined', note: 'works as designed',
    });
    expect(r.success).toBe(true);
  });

  it('rejects a status outside the vocabulary', () => {
    expect(UpdateFeedbackStatusInputSchema.safeParse({ ...base, status: 'archived' }).success)
      .toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd mcp-server && npx vitest run tests/feedback-status.test.ts`
Expected: FAIL — `UpdateFeedbackStatusInputSchema` is not exported.

- [ ] **Step 3a: Add the `notifications` mirror**

In `mcp-server/src/db/schema.ts`, insert immediately after the `companies` table block:

```ts
// [SCOPE 043 / FR-019] BEGIN — notifications mirror (submitter's in-app inbox).
// Mirrored so an MCP-driven status change reaches the submitter, matching the web
// screen's always-on in-app leg. Column set verified against production before
// declaring: Drizzle SELECTs every declared column, so a wrong name breaks every
// read of this table.
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().defaultRandom(),
  userid: uuid('userid').notNull(),
  type: varchar('type', { length: 50 }).notNull(),
  entityid: uuid('entityid'),
  entitytype: varchar('entitytype', { length: 50 }),
  message: text('message').notNull(),
  read: boolean('read').default(false).notNull(),
  createdat: timestamp('createdat').defaultNow().notNull(),
});
// [SCOPE 043 / FR-019] END
```

Confirm `text`, `boolean`, `timestamp`, `varchar`, `uuid` are already in the file's `drizzle-orm/pg-core` import list; add any that are missing.

- [ ] **Step 3b: Add the input schema**

In `mcp-server/src/utils/schemas.ts`, append after the `TriageFeedbackInputSchema` block:

```ts
// [SCOPE 043 / FR-017] BEGIN — update_feedback_status input (vendor status transitions)
// FR-018: `note` is optional in general but REQUIRED when declining, because the
// web path rejects a reason-less decline and the submitter's notification quotes it.
// Without this rule `declined` would be unreachable over MCP.
export const UpdateFeedbackStatusInputSchema = z
  .object({
    projectId: z.string().uuid(),
    feedbackId: z.string().uuid(),
    status: z.enum(FEEDBACK_STATUSES),
    note: z.string().min(1).max(4000).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.status === 'declined' && !v.note?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['note'],
        message: 'note is required when declining; it is stored as the decline reason',
      });
    }
  });
export type UpdateFeedbackStatusInput = z.infer<typeof UpdateFeedbackStatusInputSchema>;
// [SCOPE 043 / FR-017] END
```

Add at the top of `schemas.ts`, beside the other imports:

```ts
import { FEEDBACK_STATUSES } from './feedback-status.js';
```

- [ ] **Step 3c: Permission matrix + allowed-tools list**

In `mcp-server/src/auth/role-checker.ts`, add beside the other feedback entries. A tool missing here fails at runtime as *"Unknown tool"*, not as a permission error:

```ts
  'project.update_feedback_status': ['editor', 'admin'], // [SCOPE 043 / FR-017] vendor status transitions; sink ownership enforced in handler
```

In `mcp-server/src/server.ts`, add to the allowed-tools list beside `'project.triage_feedback'` (~line 281):

```ts
  'project.update_feedback_status', // [SCOPE 043 / FR-017] vendor moves any sink row
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd mcp-server && npx vitest run tests/feedback-status.test.ts && npx tsc --noEmit`
Expected: PASS (17 tests), typecheck clean.

- [ ] **Step 5: Commit**

```bash
git add mcp-server/src/db/schema.ts mcp-server/src/utils/schemas.ts mcp-server/src/auth/role-checker.ts mcp-server/src/server.ts mcp-server/tests/feedback-status.test.ts
git commit -m "feat(SCOPE-043): notifications mirror + update_feedback_status input schema"
```

---

### Task 4: Handler and tool registration

**Files:**
- Modify: `mcp-server/src/server.ts` — new `case` after the `project.triage_feedback` block (which ends ~line 1482), and a registration entry after the `project.triage_feedback` registration (~line 3947)

**Interfaces:**
- Consumes: `UpdateFeedbackStatusInputSchema` (Task 3); `appendInternalNote`, `buildStatusMessage`, `resolveNotifyStatus` (Task 1); `notifications` (Task 3); existing `resolveSinkScope`, `sinkProjectId`, `assertCallerCanViewProject`, `feedbacksubmissions`.
- Produces: the `project.update_feedback_status` tool. Response JSON: `{ feedback: { id, status, firstTriagedAt, notified } }`.

- [ ] **Step 1: Add the imports**

In `mcp-server/src/server.ts`, beside the other feedback imports (~line 235):

```ts
import {
  appendInternalNote,
  buildStatusMessage,
  resolveNotifyStatus,
} from './utils/feedback-status.js'; // [SCOPE 043 / FR-017]
```

Add `notifications` to the existing `./db/schema.js` import list, and `UpdateFeedbackStatusInputSchema` to the existing `./utils/schemas.js` import list.

- [ ] **Step 2: Add the handler case**

Insert immediately after the `// [SCOPE 043 / T011b] END` line that closes `project.triage_feedback`:

```ts
      // [SCOPE 043 / FR-017] BEGIN — project.update_feedback_status (vendor transitions)
      // Deliberately NOT an extension of triage_feedback: that tool is owner-only
      // ("you can only triage your own feedback"), and widening it would silently
      // escalate an existing tool's privilege. Authority here is SINK OWNERSHIP —
      // the same gate list_my_feedback uses for incoming:true — so "may I read other
      // tenants' reports in this sink" and "may I move them" are one question with
      // one answer, and cannot drift apart into a hole.
      case 'project.update_feedback_status': {
        const input = UpdateFeedbackStatusInputSchema.parse(args);

        const callerId = scoped.scope.userId;
        if (!callerId) {
          throw new McpError(
            ErrorCode.InvalidParams,
            'update_feedback_status requires a user-scoped token.',
          );
        }

        await assertCallerCanViewProject(scoped.scope, sinkProjectId());
        const sink = await resolveSinkScope(scoped.scope);

        const rows = (await sink.selectScoped(
          feedbacksubmissions,
          eq(feedbacksubmissions.id, input.feedbackId),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const row = rows[0];
        if (!row) {
          throw new McpError(ErrorCode.InvalidParams, `Feedback not found: ${input.feedbackId}`);
        }

        // One UPDATE, so the row transition is atomic on its own. firstTriagedAt is
        // stamped on first touch only, matching the web path.
        const set: Record<string, unknown> = {
          status: input.status,
          firstTriagedAt: row.firstTriagedAt ?? new Date(),
          updatedAt: new Date(),
        };
        if (input.note) {
          set.internalNotes = appendInternalNote(row.internalNotes, input.note);
        }
        // FR-018: one field, both jobs — the note is also the decline reason.
        if (input.status === 'declined') {
          set.declineReason = input.note!.trim();
        }

        const updated = (await sink.updateScoped(
          feedbacksubmissions,
          set,
          eq(feedbacksubmissions.id, row.id),
        )) as Array<typeof feedbacksubmissions.$inferSelect>;
        const newRow = updated[0]!;

        // FR-019 — tell the submitter. Best-effort like every other fan-out leg in
        // this scope: the row is already the source of truth, so a failed inbox
        // write must not undo a real status change. `notified` is returned rather
        // than swallowed, so the caller is never guessing at silence.
        let notified = false;
        try {
          await sink.insertScoped(notifications, {
            userid: newRow.userId,
            type: 'feedback_status',
            entityid: newRow.id,
            entitytype: 'feedback',
            message: buildStatusMessage(newRow),
          });
          await sink.updateScoped(
            feedbacksubmissions,
            { notifyStatus: resolveNotifyStatus(newRow.notificationChannel) },
            eq(feedbacksubmissions.id, newRow.id),
          );
          notified = true;
        } catch (err) {
          logger.warn('Feedback status notification failed', {
            feedbackId: newRow.id,
            error: (err as Error).message,
          });
        }

        logger.info('Feedback status updated by vendor', {
          feedbackId: newRow.id,
          status: newRow.status,
          by: callerId,
          notified,
        });

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                feedback: {
                  id: newRow.id,
                  status: newRow.status,
                  firstTriagedAt: newRow.firstTriagedAt,
                  notified,
                },
              }),
            },
          ],
        };
      }
      // [SCOPE 043 / FR-017] END
```

- [ ] **Step 3: Add the tool registration**

Insert after the `project.triage_feedback` registration object (the one ending `required: ['projectId', 'feedbackId'],`):

```ts
      // [SCOPE 043 / FR-017] BEGIN — update_feedback_status registration
      {
        name: 'project.update_feedback_status',
        description:
          "Move a feedback report through the triage vocabulary (new, triaged, needsinfo, inprogress, resolved, declined). For the VENDOR: works on any report filed into a feedback sink your company owns, not just your own. Optionally appends an internal note; a note is REQUIRED when declining and is stored as the decline reason. Notifies the submitter's in-app inbox.",
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            feedbackId: { type: 'string', format: 'uuid', description: 'Feedback submission ID' },
            status: {
              type: 'string',
              enum: ['new', 'triaged', 'needsinfo', 'inprogress', 'resolved', 'declined'],
              description: 'New status',
            },
            note: {
              type: 'string',
              description:
                'Internal note appended to the triage history. Required when status is "declined" (stored as the decline reason).',
            },
          },
          required: ['projectId', 'feedbackId', 'status'],
        },
      },
      // [SCOPE 043 / FR-017] END
```

- [ ] **Step 4: Typecheck, build, and run the full suite**

Run: `cd mcp-server && npx tsc --noEmit && npm run build && npx vitest run`
Expected: typecheck clean; build clean; **17 new tests pass**; the pre-existing failures stay at **14 failed / 3 files** (`integration.test.ts` needs a live DB, `project-kit-scope-flow.test.ts` needs fixture files). If the failure count moves off 14, that is your regression — stop and fix it.

- [ ] **Step 5: Verify no direct-DB violation**

Run: `cd mcp-server && bash scripts/check-no-direct-db.sh`
Expected: exit 0. If the script is absent, confirm by hand that the new code calls only `sink.selectScoped` / `insertScoped` / `updateScoped`.

- [ ] **Step 6: Commit**

```bash
git add mcp-server/src/server.ts
git commit -m "feat(SCOPE-043): project.update_feedback_status handler + registration (FR-017/018/019)"
```

---

### Task 5: Real-database verification

**Files:**
- Create (temporary, deleted before commit): `mcp-server/verify-fr017.ts`

**Interfaces:**
- Consumes: everything from Tasks 1–4.
- Produces: evidence. No code ships from this task.

**Why:** Project rule — unit-green plus build-green is not evidence; that combination shipped two fatal bugs in one handler. On 2026-08-03 it also hid a missing mirror column that no test could see. The columns this handler writes (`internalNotes`, `declineReason`, `notifyStatus`, `firstTriagedAt`) and the whole `notifications` mirror are only proven by a real read/write.

- [ ] **Step 1: Write the harness**

Create `mcp-server/verify-fr017.ts`:

```ts
// TEMP verification harness for [SCOPE 043 / FR-017]. Deleted after the run.
// Writes to ONE row and restores it. Never committed.
import { eq } from 'drizzle-orm';
import db, { closeDatabase } from './src/db/connection.js';
import { feedbacksubmissions, notifications } from './src/db/schema.js';
import {
  appendInternalNote,
  buildStatusMessage,
  resolveNotifyStatus,
} from './src/utils/feedback-status.js';

async function main() {
  // 1. The notifications mirror must match production or every read of it breaks.
  const probe = await db.select().from(notifications).limit(1);
  console.log('1) notifications mirror OK; columns =',
    probe[0] ? Object.keys(probe[0]).join(',') : '(no rows, but SELECT succeeded)');

  // 2. Pick one real row and snapshot it so the run is reversible.
  const [target] = await db.select().from(feedbacksubmissions)
    .where(eq(feedbacksubmissions.status, 'new')).limit(1);
  if (!target) throw new Error('no row with status=new to exercise');
  const before = {
    status: target.status,
    internalNotes: target.internalNotes,
    notifyStatus: target.notifyStatus,
    firstTriagedAt: target.firstTriagedAt,
  };
  console.log('2) target', target.id.slice(0, 8), 'before =', JSON.stringify(before));

  // 3. Perform the exact writes the handler performs.
  const [after] = await db.update(feedbacksubmissions).set({
    status: 'inprogress',
    firstTriagedAt: target.firstTriagedAt ?? new Date(),
    internalNotes: appendInternalNote(target.internalNotes, 'FR-017 verification run'),
    updatedAt: new Date(),
  }).where(eq(feedbacksubmissions.id, target.id)).returning();
  console.log('3) after  =', JSON.stringify({
    status: after.status,
    notes: after.internalNotes?.slice(-40),
    firstTriagedAt: after.firstTriagedAt,
  }));

  // 4. The notification insert + notifystatus reconcile.
  const msg = buildStatusMessage(after);
  const [note] = await db.insert(notifications).values({
    userid: after.userId,
    type: 'feedback_status',
    entityid: after.id,
    entitytype: 'feedback',
    message: msg,
  }).returning();
  console.log('4) inbox row', note.id.slice(0, 8), '->', msg);
  console.log('   notifystatus would be:', resolveNotifyStatus(after.notificationChannel));

  // 5. Restore. The verification must leave production as it found it.
  await db.delete(notifications).where(eq(notifications.id, note.id));
  await db.update(feedbacksubmissions).set(before)
    .where(eq(feedbacksubmissions.id, target.id));
  const [restored] = await db.select().from(feedbacksubmissions)
    .where(eq(feedbacksubmissions.id, target.id));
  console.log('5) restored -> status =', restored.status,
    '| notes match =', restored.internalNotes === before.internalNotes);

  await closeDatabase();
}

main().catch(async (e) => {
  console.error('FAILED:', e);
  await closeDatabase();
  process.exit(1);
});
```

- [ ] **Step 2: Run it**

```bash
cd mcp-server
export WXKANBAN_MCP_DATABASE_URL="$(grep -m1 '^DATABASE_URL=' ../.env | cut -d= -f2- | tr -d '"'"'"'\r')"
export API_KEY="verify-fr017-local-only"
npx tsx verify-fr017.ts
```

Expected: all five lines print; step 5 reports `notes match = true`. Any `42703`/`42P01` means a mirrored column or table does not exist in production — fix the mirror, do not cast around it.

**Note:** `../.env` `DATABASE_URL` points at **production**. This harness writes to one real row and restores it. Do not extend it to loop over rows.

- [ ] **Step 3: Delete the harness**

```bash
rm mcp-server/verify-fr017.ts
```

- [ ] **Step 4: Confirm the tree is clean**

Run: `git status --short`
Expected: no `verify-fr017.ts`, no `dist/` entries.

- [ ] **Step 5: Update the spec status and commit**

In `specs/Project-Scope/043-user-feedback.md`, replace the Amendment C status line with the real outcome — tests passing, the pre-existing failure count, what was verified live, and that it is **not deployed** (a push deploys production).

```bash
git add specs/Project-Scope/043-user-feedback.md
git commit -m "docs(SCOPE-043): Amendment C implemented and verified against prod"
```

---

## Self-Review

**Spec coverage:**

| Requirement | Task |
|---|---|
| FR-017 tool contract, single row, no batch | 3 (schema), 4 (handler + registration) |
| FR-017 sink-ownership authority | 4 (`assertCallerCanViewProject`) |
| FR-017 `PERMISSION_MATRIX` entry | 3 |
| FR-017 firstTriagedAt on first touch, note append, updatedAt | 1 (`appendInternalNote`), 4 |
| FR-018 declining requires the note; written to both fields | 3 (Zod `superRefine`), 4 (`set.declineReason`) |
| FR-019 notifications mirror + in-app row | 3 (mirror), 4 (insert) |
| FR-019 notifystatus done/failed rationale | 1 (`resolveNotifyStatus`) |
| FR-020 drift guard | 2 |
| FR-020 real-DB verification | 5 |
| Non-goals (no batch, no email, `triage_feedback` untouched) | Honoured: schema takes one `feedbackId`; no mail code; no edit to that handler |

**Placeholder scan:** none — every code step carries the actual content.

**Type consistency:** `StatusMessageRow` (Task 1) is structurally satisfied by `typeof feedbacksubmissions.$inferSelect` (Task 4) — `id`, `title`, `status`, `reopenedAt`, `clarificationQuestion`, `declineReason` are all mirrored, verified at `schema.ts:300-303`. `resolveNotifyStatus(channel: string | null)` accepts `newRow.notificationChannel`, which is `notNull` with a default, so `string` — assignable. `FEEDBACK_STATUSES` is used by name in Tasks 1, 2 and 3 identically.

**One risk carried deliberately:** notification *wording* is duplicated from the app's `messageForStatus` and is not covered by the drift guard, which pins only the vocabulary. Wording drift degrades copy, not correctness; closing it would require the cross-deployment HTTP call this design rejected.
