# SCOPE-082: Generated-Output Watermark & Attribution

**Status:** Implemented (2026-07-10 — 14/14 tasks done)
**Stage:** Implementation
**Author:** Andy + orchestrator
**Depends on:** SCOPE-021, SCOPE-019 (see Dependencies)

---

## Overview

wxKanban generates a large volume of Markdown and PDF on a customer's behalf: the conversion
skills (`wxConversion`, `cwConversion`, `vbConversion`) emit per-element Markdown plus a
regenerated scaffold; the server and MCP emit project documents (lifecycle, devplan,
project-overview, scope-analysis); and several of those are rendered to PDF. None of these
artifacts currently carry any mark of origin once they leave the system.

SCOPE-082 stamps every generated artifact with a wxKanban attribution: a **visible** footer
("Generated with wxKanban — www.wxperts.com", or "Converted with wxKanban — www.wxperts.com"
for conversion outputs), a structured provenance block in the Markdown frontmatter, and an
**invisible zero-width-character watermark** embedded in the Markdown body. Rendered PDFs
additionally carry document metadata (Author/Producer = wxKanban) and a visible per-page
footer. The mark is centralised in one stamping helper that every generator calls, so the
behaviour is consistent and applied in exactly one place.

The mark is a **branding / funnel** mechanism, not a tamper-proof control. Its goal is reach:
when a generated artifact reaches a downstream reader (e.g. the end client of a reseller who
used the tool), that reader sees who produced the work and a route back to www.wxperts.com.

## Business Problem

A reseller can run wxKanban's conversion tooling cheaply and present the generated output to a
client as a finished deliverable, capturing the value without wxKanban earning credit, brand
exposure, or a return path to the source. wxKanban produces the artifact but gets nothing
downstream of the person who ran the tool. Stamping the output turns every generated artifact
into a self-identifying billboard that points the downstream reader back to www.wxperts.com —
converting third-party delivery into inbound reach. (This is explicitly a marketing lever, not
an anti-theft control; removal is possible and accepted.)

### Core Design

One shared stamping layer, two artifact types:

- **Markdown stamp (one helper):** injects (a) a frontmatter provenance block
  (`generator`, `wxkanbanVersion`, `generatedAt`), (b) a visible footer line linking to
  www.wxperts.com, and (c) an invisible zero-width signature in the body. Every Markdown
  generator — server-side TypeScript generators and the conversion skills — calls this single
  helper rather than hand-writing footers.
- **PDF stamp:** the PDF render path sets document metadata (Author/Producer = wxKanban, plus
  the URL in Subject/Keywords) and draws a visible per-page footer in the render template.

A companion **verify** utility recovers the zero-width signature from a suspect Markdown file,
so Andy can confirm "this came from our tool" for any artifact that still carries it. The
invisible watermark encodes only a non-identifying wxKanban signature + version — **no
customer identifiers** — to avoid embedding private data in customer-facing output.

---

## Actors

Primary: The developer / consultant who runs a wxKanban generator — a conversion skill (wxConversion / cwConversion / vbConversion) or a document generator (lifecycle, devplan, project-overview, scope-analysis) — and thereby produces the stamped artifact that is delivered downstream.

Secondary: The downstream reader of that artifact (for example, the end client of a reseller who used the tool), who sees the visible attribution and follows it to www.wxperts.com; and the wxKanban operator, who runs the verify utility to confirm the provenance of a suspect file.

## Scope Boundary

Included in this iteration:

- Stamping generated **Markdown** with all three marks (visible footer + frontmatter
  provenance block + invisible zero-width watermark) across the four server/MCP generators
  (lifecycle, devplan, project-overview, scope-analysis) and the three conversion skills
  (`wxConversion`, `cwConversion`, `vbConversion`).
- Stamping rendered **PDFs** with document metadata (Author/Producer = wxKanban) and a visible
  per-page footer linking to www.wxperts.com.
- A single shared stamping helper that every generator calls, applied fail-open and
  non-blocking.
- A verify / detect utility that recovers the zero-width signature from a Markdown file.

## Out of Scope

This iteration explicitly excludes the following:

- Tamper-resistance / DRM, HMAC content signing, and C2PA content credentials (deferred).
- License enforcement or any mechanism that *prevents* removal of the mark.
- Pricing / commercial-license tiers (the real arbitrage mitigation — tracked separately).
- Re-stamping or back-filling artifacts generated before this scope ships.

---

## User Scenarios & Testing

### US1 — Conversion output is attributed
A consultant runs `wxConversion` (or `cw`/`vb`). Every per-element Markdown file and the
scaffold README carry a visible "Converted with wxKanban — www.wxperts.com" footer, a
frontmatter provenance block, and an embedded zero-width signature.

### US2 — Generated project docs are attributed
Lifecycle, devplan, project-overview and scope-analysis documents carry the same visible
footer + frontmatter + zero-width signature.

### US3 — PDFs are attributed
A rendered PDF (lifecycle / devplan / overview / scope-analysis) opens with Author/Producer =
wxKanban in its document properties and a visible per-page footer linking to www.wxperts.com.

### US4 — Verify a suspect file
Andy runs the verify utility against a Markdown file found "in the wild"; it reports whether a
wxKanban zero-width signature is present and what version produced it.

### US5 — Downstream reader follows the mark
A downstream reader of a generated artifact sees the visible attribution and reaches
www.wxperts.com.

### US6 — Ships with the kit
A consumer project's conversion skills emit stamped output with no separate install — the
stamp travels with the kit like the rest of the skill tooling.

---

## Functional Requirements

### FR-001 — Shared Markdown stamp helper
A single helper stamps a Markdown string with: frontmatter provenance block, visible footer
line, and an embedded zero-width signature. All Markdown generators call it; no generator
hand-writes its own footer.

### FR-002 — Visible attribution wording + link
The visible footer reads "Generated with wxKanban — www.wxperts.com" for project documents and
"Converted with wxKanban — www.wxperts.com" for conversion outputs. The link target is
**www.wxperts.com** in all cases.

### FR-003 — Frontmatter provenance block
The Markdown frontmatter carries `generator`, `wxkanbanVersion`, and `generatedAt` (machine
-readable; human-editable; not relied on as tamper-proof).

### FR-004 — Invisible zero-width watermark
The helper embeds a zero-width-character signature in the Markdown body encoding a
non-identifying wxKanban marker + version. No customer identifiers are embedded. (Known
limitation: brittle under reformatting / strippable if detected — documented, accepted.)

### FR-005 — Verify / detect utility
A utility recovers the zero-width signature from a Markdown file and reports presence + encoded
version, surfaced as a developer command/CLI entry.

### FR-006 — Wire into server/MCP generators
The lifecycle, devplan, project-overview, and scope-analysis Markdown generators emit stamped
output via FR-001.

### FR-007 — Wire into conversion skills
The `wxConversion`, `cwConversion`, and `vbConversion` output writers emit stamped Markdown
(per-element files + scaffold README) via the same stamp logic, distributed through the kit.

### FR-008 — PDF stamping
The PDF render path sets document metadata (Author/Producer = wxKanban; URL in
Subject/Keywords) and renders a visible per-page footer linking to www.wxperts.com.

### FR-009 — Fail-open, non-blocking
Stamping never breaks or blocks generation; a stamp failure degrades to unstamped output
rather than failing the generate (logged via Pino).

### FR-010 — Packaging / release
Bump the relevant versions and re-cut the kit so the conversion-skill stamping travels to
consumers; rebuild any affected VSIX / app artifacts.

---

## Data Requirements

- No new tables. The frontmatter provenance block and zero-width signature are content within
  the generated artifacts; PDF metadata is a property of the rendered file.
- Version string sourced from the existing app/kit version (no new store).

## API Routes

- None required for the core stamp. (The verify utility is a local developer command, not an
  HTTP route.)

## Frontend Components

- None net-new. PDFs render through the existing PDF path; the visible footer is part of the
  render template, not a React surface.

---

## Success Criteria

1. **MD coverage.** 100% of newly generated Markdown artifacts across the four server/MCP
   generators **and** the three conversion skills carry all three marks (visible footer +
   frontmatter provenance block + embedded zero-width signature). *(FR-001, FR-006, FR-007)*
2. **PDF coverage.** 100% of rendered PDFs carry wxKanban Author/Producer metadata **and** a
   visible per-page footer linking to www.wxperts.com, with **0** render regressions on the
   existing lifecycle/devplan/overview/scope-analysis PDFs. *(FR-008)*
3. **Verifiability.** The verify utility recovers the embedded zero-width signature from an
   unmodified stamped file with **100%** accuracy and correctly reports **absence** on an
   unstamped file. *(FR-004, FR-005)*
4. **Never blocks.** **0** generation failures attributable to stamping; a stamp error
   degrades to unstamped output and is logged. *(FR-009)*

---

## Constraints & Notes

### Constraints
- **Branding, not DRM.** The mark is removable by design; this scope does not claim or attempt
  tamper-proofing. HMAC signing and C2PA content credentials are explicitly out (deferred).
- **No customer identifiers in the invisible watermark** — only a non-identifying wxKanban
  marker + version, to avoid embedding private data in customer-facing output.
- **Single stamping point.** Generators must not hand-write footers; all go through the shared
  helper (KISS / one place to change wording or link).
- `CLAUDE.md` conventions throughout (100% TypeScript, Pino logging, no hand-authored fences;
  the stamp helper itself is fenced via `implement`).
- **Consumer-output-facing by design.** Unlike builder-only docs, these marks intentionally
  appear in the customer's generated output and travel downstream — that is the point.

> Non-goals are stated in the top-level **Out of Scope** section above.

### Dependencies
- **Primary:** SCOPE-021 (Project Lifecycle PDF — the PDF render path the PDF stamp hooks into);
  SCOPE-019 (Orchestrator Kit — `.claude/skills` distribution that carries conversion-skill
  stamping to consumers).
- **Secondary:** SCOPE-048 (lifecycle generator), SCOPE-081 (devplan generator), SCOPE-025
  (project-overview generator), SCOPE-060 (scope-analysis) — the four Markdown generators wired
  in FR-006; the conversion skills (`wxConversion` / `cwConversion` / `vbConversion`) wired in
  FR-007.

### Open Questions
- Exact footer wording / styling (separator, version suffix, single line vs. block) — settle
  during clarify.
- Whether the conversion-skill stamp is a shared kit script the skills call vs. stamp logic
  inlined per skill (implementation choice; one mark format either way).

### Notes
- Numbered SCOPE-082 (after SCOPE-081 dev-plan integration).
- The honest framing from the originating discussion: the watermark is a **funnel**, not a
  fence; the real arbitrage mitigation is pricing/licensing + the "done-with-you" philosophy,
  tracked separately.
