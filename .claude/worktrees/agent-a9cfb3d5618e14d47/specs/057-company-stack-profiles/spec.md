# Spec 057: Company-Wide Stack Profiles

## Overview

This spec adds the **company tier** to the stack/style capability. An ADMIN can promote a project's captured stack/style to a **company-wide default for its application type** — at most one per type (Web / Desktop / Mobile → up to 3 per company). That company-wide profile is the **live default** for any project that has not set its own `stack.md`. The tier is managed via **both** a kit/MCP action (promote-to-company-wide from `/buildstack`) and a **web ADMIN screen** that lists and manages the up-to-three profiles with promote / replace / clear.

A project's own `stack.md` always wins: the company profile only fills in for projects that have not overridden. Profiles are **company-scoped and tenant-isolated** — Company A never sees Company B's profiles — and changes are **non-destructive**: updating a company profile changes only the live default for not-yet-overridden projects; existing projects that already have their own `stack.md` are never altered. The promote action and the ADMIN screen are restricted to company ADMINs; non-ADMINs are blocked (403). Reference: `specs/Project-Scope/047-stack-style.md`.

## Business Problem

Teams and consulting companies that build many projects on the same surface want to **standardize a stack + look once per surface** so every new project inherits it, without re-deciding the same stack and style for each project. Today nothing lets a company set a default: every project either runs the full `/buildstack` interview or silently falls back to the kit built-in default. This spec captures a reference project's deliberate stack/style choices as a company-wide default per application type, so a brand-new web/desktop/mobile project inherits the company's standard automatically — while any one project remains free to override with its own `stack.md`. Standardize once, inherit everywhere, override when needed.

## Actors

- Primary: Company ADMIN — promotes a project's stack/style to a company-wide default for its app type (via the kit/MCP action or the web ADMIN screen), and manages the up-to-three profiles (promote / replace / clear).
- Secondary: developers whose new projects inherit the company-wide default without running `/buildstack`; the kit resolving the live default (consuming the resolve-by-`apptype` lookup in spec 056's resolution chain); and the wxKanban server enforcing tenant isolation so Company A never sees Company B's profiles.

## Success Metrics

1. An ADMIN can promote the current project's stack/style to a company-wide default for its app type via both the kit/MCP action and the web ADMIN screen; a non-ADMIN attempt is blocked (403). *(criterion 6, FR-008)*
2. At most one profile exists per `(company, application type)`; re-promoting the same type overwrites that type's profile in place (≤ 3 profiles per company). *(FR-008)*
3. A project with no `stack.md` resolves to the company-wide profile for its app type as its live default; a project with its own `stack.md` always wins. *(FR-008)*
4. Tenant isolation holds: Company A's profiles are never visible to Company B in any kit action or web read path — 100% of cross-tenant reads return nothing. *(FR-008)*
5. Non-destructive change: updating a company profile leaves overriding projects' `stack.md` byte-for-byte untouched; only the live default for not-yet-overridden projects changes. *(FR-008)*

## Scope Boundary

IN: the new company-scoped `companystackprofiles` table (unique `(companyid, apptype)`) + migration; the ADMIN-gated promote-to-company-wide action (kit/MCP tool, resolving `companyid` from the project token, upserting the `(companyid, apptype)` profile from the current project's stack/style); the resolve/seed-by-`apptype` lookup (company-scoped, tenant-isolated) that supplies the live default in the resolution chain consumed by spec 056; the web ADMIN screen listing/managing the up-to-three company profiles (Web / Desktop / Mobile) with promote / replace / clear; ADMIN authorization + tenant-isolation enforcement (non-ADMIN blocked/403, Company A never sees Company B); and non-destructive change semantics (changing a company profile leaves overriding projects' `stack.md` untouched).

## Out of Scope

The `/buildstack` capture/interview and per-project `stack.md` persistence (spec 055); injection of the resolved stack/style into the `buildscope` / `createspecs` / `implement` generation templates (spec 056); propagate-to-existing-projects on a company-profile change (changes never push to projects that already overrode); multiple named profiles per application type (one profile per type only in v1); and non-UI application types (API / CLI) — Web / Desktop / Mobile only.

## Open Questions

None — buildscope 2026-06-13. All company-tier decisions (≤ 1 profile per app type, live-default resolution, project-always-wins, dual kit-action + web-screen management, tenant isolation, non-destructive semantics) were resolved in `specs/Project-Scope/047-stack-style.md`.

## Functional Requirements

### FR-008 — Company-wide stack/style profiles (per application type)

An ADMIN MUST be able to promote a project's stack/style to a company-wide default for its application type, via **both** a kit/MCP action (from `/buildstack`) and a web ADMIN screen. There is at most one profile per application type per company (Web / Desktop / Mobile → up to 3). Any project without its own `stack.md` uses the company-wide profile for its app type as its **live default**. Profiles are company-scoped and tenant-isolated; changing one affects only projects that have not overridden — existing projects with their own `stack.md` are never altered.

**Acceptance Criteria**:
- [ ] An ADMIN can promote the current project's stack/style to company-wide for its app type (kit action and ADMIN screen); a non-ADMIN cannot (403/blocked)
- [ ] At most one profile per `(company, application type)`; re-promoting overwrites that type's profile
- [ ] A project with no `stack.md` resolves to the company-wide profile for its app type as its live default
- [ ] Changing a company-wide profile leaves overriding projects' `stack.md` untouched (non-destructive)
- [ ] Company A's profiles are never visible to Company B

## Phase

**Current Phase**: design
**Priority**: high

## Status

- **Date**: 2026-06-13
- **Phase**: design
