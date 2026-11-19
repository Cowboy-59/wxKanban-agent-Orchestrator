# wxKanban — Marketing Feature Set

> Derived from `specs/Project-Scope/*.md` + `specs/main/spec.md` (82 FRs). Point-in-time snapshot —
> regenerate after scopes change. **Rank = "biggest bang"** score (reach + differentiation +
> pain-urgency + proof-now, max 20). 18 customer-facing features distilled from ~70 scopes + the FRs;
> internal dev/kit/cockpit/ops/plumbing scopes were excluded.

> **One gap to close:** the #1 feature (WinDev→AI conversion) is the marketed beachhead but has **no
> `specs/Project-Scope` doc** — it's sourced from the positioning memory and the shipped
> `wx/vb/cwConversion` skills. Consider writing a scope so the product's headline capability is
> formally specified.

---

## Top of the ranking — lead with these

1. **Cross From WinDev to AI-Built Software You Own** — the beachhead; only wxKanban does this for WINDEV/PCSoft shops. *(score 19)*
2. **Ship Nothing Untested — the 6-Phase Lifecycle** — the signature, enforced methodology. *(18)*
3. **One Board for Every PM Tool** — the broadest daily pain, solved. *(18)*
4. **Bill Every Minute — Timers to Invoices** — the consultant's revenue core. *(17)*
5. **Generate Code in YOUR Stack & Style** — AI that matches your stack, not ours. *(17)*

Audience split: **windev** ×2 (conversion, language), **careerchanger** ×1 (methodology), **broad** ×15.

---

## Cross to AI

### 1. Cross From WinDev to AI-Built Software You Own — score 19
- **Value:** A guided bridge that converts your WINDEV / WEBDEV (also VB6, Clarion) app into a modern React + Tailwind stack you own outright.
- **For:** WinDev shops (beachhead)
- **Benefit:** Escape proprietary lock-in without a risky big-bang rewrite — done with you, screen by screen.
- **Rank:** 1 — reach 4 · differentiation 5 · pain 5 · proof-now 5
- _Source: marketing positioning, `wxConversion` / `vbConversion` / `cwConversion` skills — **no Project-Scope doc yet**_

## Methodology & Lifecycle

### 2. Ship Nothing Untested — the 6-Phase Lifecycle — score 18
- **Value:** Every project moves through Design → Implementation → QA → Human Testing → Beta → Release, with gates that won't let unfinished work advance.
- **For:** Career-changers
- **Benefit:** Build the judgment and habits of a senior engineer — the methodology is enforced, not optional.
- **Rank:** 2 — reach 4 · differentiation 5 · pain 4 · proof-now 5
- _Source: SCOPE-007, SCOPE-008, SCOPE-012, FR-057..082_

### 11. Design by Conversation — score 16
- **Value:** Talk through what you're building; AI writes the scope in real time, catches overlaps with existing scopes, and produces a complete project overview in minutes.
- **For:** Broad
- **Benefit:** Go from idea to a real, conflict-checked spec without a blank page.
- **Rank:** 11 — reach 4 · differentiation 4 · pain 3 · proof-now 5
- _Source: SCOPE-009, SCOPE-025_

## Work Management

### 3. One Board for Every PM Tool — score 18
- **Value:** See and work every task from Jira, Monday, Asana, and Trello — plus your own internal tasks — in a single board, changes syncing back.
- **For:** Broad
- **Benefit:** Stop paying the context-switch tax across five tools.
- **Rank:** 3 — reach 5 · differentiation 3 · pain 5 · proof-now 5
- _Source: SCOPE-007, SCOPE-008, FR-005..015, FR-016..022_

### 9. AI That Finds the Work You Forgot — score 16
- **Value:** wxKanban reads your project context and proposes the additional tasks it implies — you accept or reject each one.
- **For:** Broad
- **Benefit:** Fewer missed steps and forgotten edge cases before they bite.
- **Rank:** 9 — reach 4 · differentiation 3 · pain 4 · proof-now 5
- _Source: SCOPE-009, FR-041..046_

## Time & Billing

### 4. Bill Every Minute — Timers to Invoices — score 17
- **Value:** Track billable time per task with pause/resume, then generate timesheets and invoices that mark time as billed so you never double-charge.
- **For:** Broad
- **Benefit:** Turn tracked hours into paid invoices without spreadsheet reconciliation.
- **Rank:** 4 — reach 4 · differentiation 3 · pain 5 · proof-now 5
- _Source: SCOPE-005, FR-023..029, FR-035..040_

### 7. The Consultant's Command Center — score 17
- **Value:** One work surface for every client: consolidated task queue, billable time, earnings, and external PM connections — hire or be hired inside the platform.
- **For:** Broad
- **Benefit:** Run a whole consulting practice from a single pane.
- **Rank:** 7 — reach 3 · differentiation 4 · pain 5 · proof-now 5
- _Source: SCOPE-017, SCOPE-020, SCOPE-037_

## Build Your Way

### 5. Generate Code in YOUR Stack & Style — score 17
- **Value:** Point wxKanban at your real tech stack and a design you admire; generated scopes, specs, and code match it — never a silent default.
- **For:** Broad
- **Benefit:** A non-designer ships a coherent, on-stack app by pointing at an example.
- **Rank:** 5 — reach 4 · differentiation 4 · pain 4 · proof-now 5
- _Source: SCOPE-047_

### 14. Pick Your Product's Look — score 12
- **Value:** Choose a preset, an app you admire, or your brand; wxKanban turns it into a previewable, accessible theme that executes to real styling artifacts.
- **For:** Broad
- **Benefit:** A coherent, accessible visual identity without a designer.
- **Rank:** 14 — reach 3 · differentiation 3 · pain 3 · proof-now 3 _(drafted, not fully shipped)_
- _Source: SCOPE-062_

### 17. Bring Your Own LLM — Your Data Stays Home — score 11
- **Value:** Point wxKanban's AI at your own LLM and embeddings endpoint so your code and data are processed by your model and never leave your environment.
- **For:** Broad (enterprise)
- **Benefit:** Adopt AI development under strict data-residency requirements.
- **Rank:** 17 — reach 2 · differentiation 4 · pain 4 · proof-now 1 _(charter stub — sell as roadmap/enterprise)_
- _Source: SCOPE-076_

## In Your Editor

### 6. Your Work, Live in VS Code — score 17
- **Value:** An AI-ready kit and a Dev Cockpit put your project's remaining work, health, and next step right in VS Code — no flipping to a web app.
- **For:** Broad
- **Benefit:** Stay in your editor; the methodology and status come to you.
- **Rank:** 6 — reach 4 · differentiation 4 · pain 4 · proof-now 5
- _Source: SCOPE-011, SCOPE-042, SCOPE-091, SCOPE-094_

### 18. Live Community Help in Your Editor — score 12
- **Value:** A real-time community chat panel inside the VS Code Cockpit connects you to other builders without leaving your editor.
- **For:** Broad
- **Benefit:** Get unstuck fast — help is one panel away, not a context switch.
- **Rank:** 18 — reach 3 · differentiation 3 · pain 2 · proof-now 4
- _Source: SCOPE-079_

## Reach & Language

### 8. Use It in Your Language — French-First — score 16
- **Value:** The app, the public sites, and AI-generated guidance all speak your language (French, German, Spanish, Italian, Portuguese) — while you still pick up English software vocabulary.
- **For:** WinDev shops (French beachhead)
- **Benefit:** Adopt AI-built development without an English wall in the way.
- **Rank:** 8 — reach 4 · differentiation 3 · pain 4 · proof-now 5
- _Source: SCOPE-046, SCOPE-084, SCOPE-092_

### 15. Help That's Always Right for Your Plan — score 13
- **Value:** Plan-aware, always-current in-app help and FAQs explain every area and whether your subscription includes it — in your language.
- **For:** Broad
- **Benefit:** Answers where you work, never stale, never wrong for your tier.
- **Rank:** 15 — reach 3 · differentiation 2 · pain 3 · proof-now 5
- _Source: SCOPE-016, SCOPE-066, SCOPE-084, SCOPE-092_

## Trust & Quality

### 10. Compliance Built Into the Workflow — score 15
- **Value:** Load SOC 2, HIPAA, HITRUST, or GDPR requirements once; wxKanban extracts audit tasks and runs automated code audits as you build.
- **For:** Broad
- **Benefit:** Pass audits because compliance was continuous, not a last-minute scramble.
- **Rank:** 10 — reach 3 · differentiation 4 · pain 4 · proof-now 4
- _Source: SCOPE-013_

### 12. Catch Your App's Bugs Automatically — score 15
- **Value:** Install bug-trapping into your project and silent runtime failures land in your own wxKanban board — grouped, de-duped, with an AI-proposed cause and fix.
- **For:** Broad
- **Benefit:** Find the errors your users hit but never report.
- **Rank:** 12 — reach 4 · differentiation 3 · pain 4 · proof-now 4
- _Source: SCOPE-063, SCOPE-061_

### 13. Reuse What You've Already Built — score 14
- **Value:** At scoping time, wxKanban shows what your other projects already do and recommends build-new, extend-existing, or extract-shared — grounded in a semantic capability index.
- **For:** Broad
- **Benefit:** Stop rebuilding capabilities your team already shipped elsewhere.
- **Rank:** 13 — reach 3 · differentiation 4 · pain 3 · proof-now 4
- _Source: SCOPE-074, SCOPE-075_

## Marketplace

### 16. Hire a Consulting Firm Inside the Platform — score 12
- **Value:** Bring on a consulting company with scoped collaboration, time tracking, and B2B billing — without handing over team-member access. (Discovery marketplace, pre-sales, and in-platform payments are on the roadmap.)
- **For:** Broad
- **Benefit:** Engage outside help with the guardrails and billing already in place.
- **Rank:** 16 — reach 3 · differentiation 4 · pain 3 · proof-now 2 _(engagement core shipped; marketplace/payments are charter stubs)_
- _Source: SCOPE-037, SCOPE-038, SCOPE-039, SCOPE-040, SCOPE-041_

---

_Regenerate the PDF: `node .claude/skills/marketing-feature-set/scripts/build-catalog-pdf.mjs`._
_Banners + carousel: `node .claude/skills/marketing-feature-set/scripts/generate-banners.mjs`._
_Seed the marketing engine (drafts): `node .claude/skills/marketing-feature-set/scripts/import-feature-set.mjs`._
