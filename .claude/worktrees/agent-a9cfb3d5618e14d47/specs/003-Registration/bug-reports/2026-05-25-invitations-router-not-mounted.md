# Bug report: `/api/invitations/*` routes never mounted — every UI-driven invite returns `{ error: "Not found" }`

**Date filed**: 2026-05-25
**Filed against**: spec 003 (Registration — Personnel Invitation System)
**Also touches**: spec 002 (admin-Management) FR-061…FR-068
**Surfaced during**: Production smoke test — admin at wxperts attempted to invite `andy@ccscowboy.com` as a consultant to do a project
**Severity**: high — blocks **every** invite path reachable from the production UI (single send, bulk CSV, resend, revoke, role change, accept)
**Status**: partially fixed 2026-05-25 — `invitations.ts` and `team-role.ts` now mounted (commit pending). `users.ts` left unmounted because of separate broken imports (see below). APP_VERSION bumped to 1.5.43.

---

## Summary

`src/server/routes/invitations.ts` declares the canonical `POST /send`, `POST /send-bulk`, `GET /status/:batchId`, `POST /accept/:token`, `GET /`, `POST /:id/revoke`, and `POST /:id/resend` handlers — matching the OpenAPI contract at [specs/003-Registration/contracts/invitations.openapi.json:15](../../../specs/003-Registration/contracts/invitations.openapi.json#L15). `src/server/app.ts` lists every other route module (auth, company, team, admin, tokens, …) but **never imports or `app.use()`'s `invitationsRoutes`**. The same omission applies to `src/server/routes/users.ts` (which owns `POST /api/company/users`) and `src/server/routes/team-role.ts` (which owns `POST /api/company/users/:userId/role`).

Result: every frontend invitation call falls through to the global 404 handler at [src/server/app.ts:113-115](../../../src/server/app.ts#L113-L115), which returns `{ error: "Not found" }`. The production user sees "not found" the moment they click **Send Invitation**.

This is the same class of regression as BUG-20 (route file existed, never mounted, silent 404 in production — see [reference_server_entrypoint](../../../specs/019-agent-orchestrator-kit/bug-reports/2026-05-20-bug-20-followup.md) and commit `8425447 fix(028): mount adminTokensRoutes on the actual server`).

## Reproduce

1. Log in to production wxKanban as an ADMIN user.
2. Navigate to `/invite-team` (or open the InviteUserModal from the admin dashboard).
3. Enter any valid email and a role (e.g. `andy@ccscowboy.com`, `TEAM_MEMBER`).
4. Click **Send Invitation**.

Expected: 200 with `{ success: true, results: { successful: [...], failed: [] } }` per the OpenAPI contract.

Actual: 404 with `{ error: "Not found" }`. The form displays "not found" via [SingleInviteForm.tsx:48](../../../src/client/components/SingleInviteForm.tsx#L48) / [InviteTeamTab.tsx:121](../../../src/client/components/Dashboard/InviteTeamTab.tsx#L121).

Confirmed via `git log -S "invitations.js" -- src/server/app.ts` → empty history. The route module has never been wired.

## Root cause

| Location | Issue |
| --- | --- |
| [`src/server/app.ts:7-34`](../../../src/server/app.ts#L7-L34) | Imports `companyRoutes`, `teamRoutes`, `adminRoutes`, etc. — **no import** for `./routes/invitations.js`, `./routes/users.js`, or `./routes/team-role.js` |
| [`src/server/app.ts:71-97`](../../../src/server/app.ts#L71-L97) | `app.use(...)` calls for every other module — **no mount** for `/api/invitations` |
| [`src/server/app.ts:113-115`](../../../src/server/app.ts#L113-L115) | Global 404 fallback returns `{ error: "Not found" }` — what the user sees |

## What the UI calls vs. what exists

| UI surface | Call | Mounted? |
| --- | --- | --- |
| [SingleInviteForm.tsx:38](../../../src/client/components/SingleInviteForm.tsx#L38) | `POST /api/invitations/send` | ❌ |
| [InviteTeamTab.tsx:100](../../../src/client/components/Dashboard/InviteTeamTab.tsx#L100) | `POST /api/invitations/send` | ❌ |
| [InviteUserModal.tsx:39](../../../src/client/components/admin/InviteUserModal.tsx#L39) | `POST /api/company/users` (in unmounted `users.ts`) | ❌ |
| [BulkInviteUpload.tsx:45](../../../src/client/components/BulkInviteUpload.tsx#L45) | `POST /api/invitations/send-bulk` | ❌ |
| [PersonnelManagementPage.tsx:103,120](../../../src/client/pages/PersonnelManagementPage.tsx#L103) | `POST /api/invitations/:id/revoke` & `/resend` | ❌ |
| [InvitePage.tsx:78](../../../src/client/pages/InvitePage.tsx#L78) | `POST /api/invitations/accept/:token` | ❌ |

A separate working invite route exists at [`POST /api/team/invite`](../../../src/server/routes/team.ts#L731) (in `team.ts`, which IS mounted) — but no UI calls it.

## Proposed fix

Two-line wire-up in `src/server/app.ts`:

```ts
// at top of file, with the other route imports
import invitationsRoutes from "./routes/invitations.js";
import usersRoutes from "./routes/users.js";
import teamRoleRoutes from "./routes/team-role.js";

// inside createApp(), with the other app.use() mounts
app.use("/api/invitations", invitationsRoutes);
app.use("/api", usersRoutes);       // file declares "/company/users" internally — mounting at /api yields /api/company/users
app.use("/api", teamRoleRoutes);    // same shape for "/company/users/:userId/role"
```

After mounting, the existing handlers already cover the spec 003 acceptance criteria (User Story 3, 7 criteria) and FR-061…FR-068 in spec 002. No new logic is needed.

## Verification

Once mounted, the following must succeed against production:

1. `POST /api/invitations/send` with `{ emails: ["test@example.com"], usertype: "TEAM_MEMBER" }` → 200 with `success: true` and an `invitationId`; row appears in `userinvitations` with `status='pending'`.
2. The recipient receives the invitation email with `${CLIENT_URL}/invite/${token}`.
3. Clicking the link loads `InviteAcceptPage`, which calls the already-working `GET /api/team/invite/:token` (in mounted `team.ts`) and displays the company name.
4. `POST /api/invitations/:id/resend` and `/revoke` succeed from `PersonnelManagementPage`.
5. `POST /api/invitations/accept/:token` creates the user account.
6. CSV bulk via `POST /api/invitations/send-bulk` succeeds.

Bump `APP_VERSION` from 1.5.42 → 1.5.43 and redeploy via App Runner.

## Why this slipped past CI

- No integration test exercises the mounted route surface — unit tests cover handler logic in isolation, not router wiring.
- TypeScript happily type-checks an unmounted route module; the absence of `app.use()` is not a compile-time error.
- Manual QA last passed against a build where the routes were still mounted (or against `/api/team/invite` directly) — current divergence between UI client and server mount table went undetected.

Suggested follow-up (separate scope, not blocking this fix): add a smoke test that boots the app, enumerates `app._router.stack`, and asserts every route imported by any client `fetch()` call resolves to a mounted handler.
