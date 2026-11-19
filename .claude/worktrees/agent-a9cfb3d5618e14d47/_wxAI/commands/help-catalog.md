---
description: help-catalog — regenerate the subscription-aware in-app Help (refresh per-area articles from the real UI, rebuild the standalone help page, run the tier drift + coverage tests).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# help-catalog — Subscription-aware Help

Keeps wxKanban's in-product Help truthful: it documents every app area/feature and shows each
feature's availability across the four public plans (Single User, Small/Medium Business, Consultant,
Enterprise), from **one catalog**.

This command runs the **`help-catalog` skill**. Invoke the skill, then follow its workflow:

1. **Refresh content (judgment)** — when app pages/controls change, re-read the real components and
   update the sources: `src/shared/help/catalog.ts` (features + per-plan `minPlan`),
   `src/shared/help/articles.ts` (deep per-area "controls & options" help), `src/shared/help/guides.ts`
   (quick steps). Document only controls that actually exist.
2. **Rebuild + verify (deterministic)** —
   `npx tsx scripts/build-help-html.mts` rebuilds `public/help.html`;
   `npx vitest run tests/unit/helpCatalog.test.ts` gates coverage, authoritative availability, tier
   drift, and guide/article completeness.
3. **(Optional) refresh the stored doc** — `POST /api/admin/help/regenerate { projectId }` (ADMIN)
   upserts the `doctype='help'` row. This is a production-DB write — do it deliberately.

## Where it shows up

- **In-app** — the **Help** nav item (all tiers) → `/help` (plan-aware grid) → `/help/:id`
  (per-feature "how to use it" page). Defaults the tier selector to the viewer's plan.
- **Standalone** — `public/help.html`, the public/prospect mirror with the same drill-down.
- **Stored doc** — a single canonical `doctype='help'` row.

## Authoritative mapping

Small/Medium Business is the baseline; **Time Tracking & Billing, Invoices, and Reports are
Consultant+** (not on Single User or Small Business). Where this disagrees with
`TierEnforcementService.TIER_CONFIG`, the catalog wins and `src/server/services/helpDrift.ts` records
the divergence as accepted until the code is reconciled.

## See also

- `/getting-started` sibling delivery pattern (self-contained `public/*.html`).
- `/dev-plan`, `/analyzescope` — other on-demand generated docs.

Full reference: `.claude/skills/help-catalog/SKILL.md`. Spec: SCOPE-084.
