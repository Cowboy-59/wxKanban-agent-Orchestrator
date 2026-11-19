# Specification: FAQ System

**Spec**: 066
**Feature**: FAQ System
**Status**: planned
**Phase**: design → implementation
**Created**: 2026-06-21
**Scope**: [`specs/Project-Scope/066-faq.md`](../Project-Scope/066-faq.md)
**Depends on**: SCOPE-048 (`marketingassets` + `category` column already shipped), SCOPE-065 (`MarketingAIService`/`generateOnce`), SCOPE-042 (Dev Cockpit + hosted MCP)

---

## Summary

A curated, global product FAQ for wxKanban, stored as `marketingassets` rows (`category='faq'`, `companyid=NULL`) — no new table. `title`=question, `content`=answer, `fileurl`=optional video, `status`=draft/published; an **unanswered question** is a faq row with empty `content`. A SYSADMIN curates FAQs (write, AI-seed drafts, answer submitted questions) from a new Marketing → FAQ tab; authenticated users read published FAQs on the User Dashboard, Project Detail, and a VS Code Cockpit tab, and can submit questions that feed the admin's unanswered queue. Nothing AI-written or user-submitted is shown live until a SYSADMIN publishes it.

This is a **single spec** covering the whole scope, with tasks ordered **SysAdmin-first → web read/ask → Cockpit**. The Cockpit portion carries one unresolved dependency (data-path / DB-reachability) that gates only its tasks.

## Requirements (from SCOPE-066)

- **FR-001** — `'faq'` added to the category set (server zod + client constants) alongside `open|training`.
- **FR-002** — SysAdmin FAQ management (list/create/edit/delete; SYSADMIN-gated) over `category='faq'`, `companyid=NULL`.
- **FR-003** — Unanswered-questions queue = `category='faq' AND (content IS NULL OR content='')`; answerable and deletable.
- **FR-004** — Admin-only "Generate default FAQs" → `status='draft'` rows via the shared marketing-AI service; fail-open, SYSADMIN-gated, soft-throttled.
- **FR-005** — Visibility gate: only `published` rows with non-empty `content` reach non-admin users; drafts/unanswered never leak.
- **FR-006** — User Dashboard FAQ read panel (read-only).
- **FR-007** — Project Detail FAQ read (same global list, read-only).
- **FR-008** — Authenticated question submission (Dashboard + Project Detail) → unanswered row + acknowledgement; abuse guard.
- **FR-009** — Cockpit FAQ section via read-only `faq.list` MCP tool (registered in `PERMISSION_MATRIX`); read-only v1.
- **FR-010** — Optional answer video (`fileurl`) rendered when present, omitted cleanly when absent.
- **FR-011** — Cockpit Videos: keep existing docs how-to videos **and** add Open/Training subtrees from `marketingassets` videos (`type='video'`, grouped by `category`; `faq` videos excluded).

## Acceptance

The eight Success Criteria in SCOPE-066 are the acceptance bar; the per-FR acceptance criteria in the scope are inherited verbatim. Key gates: **no draft/unanswered leak to users** (FR-005), the **ask-loop round-trip** (FR-008→003→005), and **AI seed fail-open** (FR-004).

## Out of Scope

Public/marketing-site FAQ rendering; project-specific FAQs (global only); asking from the Cockpit (read-only v1); FAQ search; voting/analytics; AI auto-answering of submitted questions.

## Open Dependency (gates Cockpit tasks only)

The Cockpit reads via the hosted MCP, whose DB may differ from the app DB where `marketingassets` lives. Before T007/T008, decide: (a) the MCP reads the app DB for `faq.list` + categorized-videos, or (b) the tool proxies the new `GET /api/faq` (and an equivalent categorized-videos) app endpoint. Does **not** block SysAdmin/web tasks (T001–T006).
