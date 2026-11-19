# Spec 091: Cockpit Tree — Grouped Headers (Unfinished Scopes + Commits to Push)

**Spec Number**: 091
**Scope**: SCOPE-091 (`specs/Project-Scope/091-cockpit-commits-to-push.md`)
**Status**: planned
**Phase**: design
**Priority**: medium
**Created**: 2026-07-06
**Spec ID**: d3115fd1-d2f8-425e-bc74-3114894e349e

## Overview

A developer cannot tell from the Dev Cockpit that they have local commits which have not been deployed. App Runner builds/deploys the app (and MCP) only on a push to main, so committed-but-unpushed work is invisible in production, and nothing in the IDE signals that a push is pending. This caused live confusion on 2026-07-06: production reported the expected version number (1.5.205), but localization changes were absent because three SPEC-052 commits were sitting unpushed, with no surface anywhere in the Cockpit indicating that unshipped work existed.

This scope adds a local, read-only Cockpit section that shows how many commits are ahead of origin (unpushed) and lists their subject lines, so a developer sees "you have work that hasn't shipped yet" at a glance. It follows the exact pattern of the existing local Cockpit sections (Kit-update, Install-commands): a cheap local check, rendered as its own collapsible group, refreshed on the Cockpit's normal poll cycle, and silent when there is nothing to show.

The same grouped-header idea also tidies the existing scope rows: today the unfinished scopes render flat at the tree root; this scope moves them under a single collapsible "<nn> Scopes unfinished" header (nn = count of scopes with remaining work), collapsed by default. Together the two changes give the Cockpit root a consistent set of counted, collapsible group headers.

## Business Problem

The team's deploy model is push-to-deploy on main, and the standing rule is that commits accrue locally until the developer explicitly pushes. That is deliberate, but it means the gap between committed and deployed is real and routinely non-empty, and the Cockpit gives no indication of it. A developer (or the AI assisting them) can look at the running version, see it matches, and wrongly conclude their changes are live. The only current way to know is to run git log origin/main..main by hand. A passive, always-visible indicator removes that trap: the moment there are unpushed commits, the Cockpit says so and names them, and its tooltip states the consequence (these deploy only after a push to main).

## Actors

- Primary: A developer working in VS Code with the wxKanban Dev Cockpit open, who needs to know whether local commits have been pushed and deployed.
- Secondary: Local git (source of truth for ahead-of-upstream state); the Cockpit tree provider (cockpitTreeProvider) and its poll/refresh cycle (renders and updates the section); App Runner (the downstream that only deploys on push, named in the tooltip, not called).

## Success Metrics

- Visibility: with 1 or more unpushed commits, the "Git — N commits to push" section appears on the next refresh/poll in 100% of git-repo workspaces with an upstream, and the count exactly matches git rev-list --count @{u}..HEAD.
- No noise: the section renders 0 rows at 0 unpushed commits and appears in 0 non-git / no-upstream workspaces, with no error and no empty row.
- Non-blocking: the git computation adds no perceptible delay (target under ~200ms typical), and a hanging git call degrades to "no section" with the rest of the Cockpit still rendering.

## Scope Boundary

IN: a local service computing unpushed commits (ahead of upstream/origin) in the workspace root; a collapsible "Git — N commits to push" section listing subject lines (newest first, capped at 10 with a "…and N more" row); read-only; refreshed on the existing poll cycle; best-effort and silent when not a git repo, no upstream, or git unavailable. Also grouping the existing unfinished-scope rows under one collapsible "<nn> Scopes unfinished" header (collapsed by default), preserving active-scope-first ordering. Built exactly like the existing local Kit-update / Install-commands sections (cheap local check + withXxxSection + node factories + poll signature), independent of the hosted MCP.

## Out of Scope

Uncommitted-changes count; behind-count / full ahead-behind vs origin; local-vs-deployed version display or prod version lookup; any push/commit/stage action or button (view-only); multi-repo/submodule handling beyond the workspace root; any hosted-MCP involvement.

## Open Questions

None outstanding. Label ("Git — ") and cap (10 with "…and N more") were decided during scoping. Git-icon choice and exact ThemeIcon are an implement-time detail.

## Functional Requirements

FR-001 Local unpushed-commit computation: a local service MUST compute the set of commits on the current branch that are ahead of its upstream/origin, by running git in the workspace root. It MUST be best-effort: when the folder is not a git repo, git is unavailable, or there is no upstream, it returns an empty result and surfaces no error. Count matches git rev-list --count @{u}..HEAD; a non-git / no-upstream / git-missing workspace yields an empty result and no thrown error.

FR-002 "Git — N commits to push" section: when there is 1 or more unpushed commits, the Cockpit MUST show a collapsible section labelled with the count (prefix "Git — "). Expanding it MUST list each unpushed commit's subject line newest-first, capped at 10 with a trailing "…and N more" row when there are more than 10. The section MUST be omitted entirely when the count is 0. E.g. 3 commits → "Git — 3 commits to push" expanding to 3 subjects; 25 → 10 subjects + "…and 15 more"; 0 → no section.

FR-003 Read-only: the section MUST be read-only — count + subjects + a tooltip explaining that these commits build/deploy only after a push to main. It MUST expose no push/commit/stage action. No command/button performs a git write or push.

FR-004 Refresh on the existing cycle: the indicator MUST refresh on the Cockpit's existing refresh/poll cycle (the path that repaints the local Kit-update / Install-commands sections), updating after the developer commits or pushes without a manual reload. After a commit the next poll shows the incremented count; after a successful push the next poll removes the section.

FR-005 Cheap and non-blocking: the computation MUST be cheap and MUST NOT stall the tree render or the MCP load path; a slow or hanging git call MUST degrade to "no section" rather than blocking the Cockpit. Tree renders normally with git unavailable/slow; no perceptible delay under normal conditions.

FR-006 Unfinished-scopes group header: the unfinished scope rows (currently flat at the tree root) MUST be grouped under a single collapsible header labelled "<nn> Scopes unfinished" (nn = count of scopes with remaining work), collapsed by default. Expanding it MUST list the scope rows exactly as today (same node, tooltip, decorations, context menu), preserving active-scope-first ordering. When nn = 0 the existing "All caught up — no remaining work" empty state MUST show instead (no empty header). Other tree sections are unaffected.
