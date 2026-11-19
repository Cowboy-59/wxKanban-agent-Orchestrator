# Task Breakdown: Company-Wide Stack Profiles

**Feature**: Company-Wide Stack Profiles
**Spec**: 057
**Date Generated**: 2026-06-13
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

> **Amendment A (2026-06-14):** Decisions confirmed with Andy. (1) **Promotion sources from an existing project** that has a captured stack — app type is read from that project's `ProjectStack` doc (`parseAppTypeFromStackMarkdown`), so there is no app-type ambiguity on the write side; an admin can also promote at project-creation time. (2) **Inheritance is seed-time**, not generation-time: the company profile seeds a new project's stack at creation/`/buildstack`; the `get_stack` company branch (wired in SPEC-056's resolver seam) stays a documented dormant tier because a doc-less project has no known app type. (3) **Deferred:** the kit/**MCP** promote + `get_company_stack` tools (T002/T003 kit half). The **web** ADMIN path is fully built (promote/list/clear + resolve); the MCP half needs the project-scoped MCP query layer extended to a company-scoped table **and** a separate `mcp.wxperts.com` deploy to be usable, so it is tracked as a follow-up rather than shipped half-wired. Not a silent cap.

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 companystackprofiles table + migration (0032, applied) | high | done |
| 2 | T002 Promote-to-company-wide action (ADMIN-gated) — web done; MCP deferred | high | done |
| 3 | T003 Resolve/seed company profile by apptype — web done; MCP deferred | high | done |
| 4 | T004 Web ADMIN screen — manage the up-to-3 profiles | high | done |
| 5 | T005 ADMIN authorization + tenant isolation enforcement | high | done |
| 6 | T006 Non-destructive change semantics | medium | done |

## Task Details

### T001 — companystackprofiles table + migration

Add the company-scoped `companystackprofiles` Drizzle table: `id` (UUID v7), `companyid` (FK), `apptype` (`web` | `desktop` | `mobile`), `content` (the stack/style markdown), `createdbyid`, `createdat`, `updatedat`, with a **unique index on `(companyid, apptype)`** so there is at most one profile per app type per company. Generate the migration in the next number after the current head `0030`. Follow DB naming conventions (plural lowercase, concatenated, no underscores).

### T002 — Promote-to-company-wide action (kit/MCP, ADMIN-gated)

Add the ADMIN-gated kit/MCP tool that promotes the current project's stack/style to a company-wide default, callable from `/buildstack`. It resolves `companyid` from the project API token, role-checks for ADMIN, and **upserts** the `(companyid, apptype)` profile from the current project's captured stack/style — re-promoting the same app type overwrites that type's profile in place. A non-ADMIN caller is blocked (403).

### T003 — Resolve/seed company profile by apptype

Add the company-scoped, tenant-isolated lookup that fetches the company-wide profile for a given `apptype`. This supplies the **live default** in the resolution chain (project `stack.md` → company-wide profile → kit built-in default) and is consumed by spec 056 at interview-seed and generation-injection time. The lookup is keyed on the caller's `companyid` so it can never return another company's profile.

### T004 — Web ADMIN screen — manage the up-to-3 profiles

Add the new ADMIN settings screen that lists the up-to-three company profiles (Web / Desktop / Mobile) and lets an ADMIN **promote / replace / clear** each one. It is the single genuinely-new UI for this spec; it reads via the resolve-by-`apptype` lookup (T003) and writes via the promote action (T002), and is restricted to company ADMINs. The screen shows, per app type, whether a profile is set and surfaces promote/replace/clear actions.

### T005 — ADMIN authorization + tenant isolation enforcement

Enforce that only a company ADMIN can promote, replace, or clear a company profile (non-ADMIN blocked with 403) and that every read/write is scoped to the caller's `companyid` so Company A never sees or affects Company B's profiles. This applies uniformly to the kit/MCP action (T002), the resolve lookup (T003), and the web ADMIN screen (T004) — authorization and tenant isolation are a single enforced floor across all entry points.

### T006 — Non-destructive change semantics

Guarantee that changing a company profile (promote / replace / clear) is non-destructive to projects that have overridden: existing projects with their own `stack.md` are never altered, and only the live default for not-yet-overridden projects changes. The company tier writes only the `companystackprofiles` row — it never touches any project's `stack.md` or `projectdocuments` — so overriding projects are structurally untouched by a company-profile change.
