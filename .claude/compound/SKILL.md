---
name: compound
description: Document a recently solved problem, decision, or pattern while context is fresh. Pushes to wxKanban DB (projectdocuments) and writes to specs/{scope}/learnings/. Creates searchable, compliance-ready audit evidence. Use after completing a scope, fixing a hard bug, or making a significant architectural decision.
---

# /compound

## Why This Matters

Every time you solve a hard problem, you have two choices: keep that knowledge in your head, or make it permanent. Knowledge in your head walks out the door, gets forgotten, and means the next developer solves the same problem from scratch. Knowledge in the system compounds — the second time takes minutes instead of days.

This is how senior developers build teams that get faster over time instead of staying stuck at the same pace. Every hard-won insight goes into the knowledge base. Every new developer inherits the work of everyone who came before them.

There's a second reason this matters: compliance. SOC 2, HIPAA, and HiTrust audits don't just ask "do you have security controls?" They ask "can you prove it?" A compound document written at the time of the work is exactly the kind of dated, specific, contextual evidence auditors need. It's not extra paperwork — it's the same thinking you already did, captured in a form that protects the business.

**This skill is tool-agnostic.** Write it after any significant piece of work, regardless of what tools or AI assistants were used to build it.

---

## Usage

```
/compound                    # Document the most recently completed work
/compound [brief context]    # Provide a hint about what to document
```

---

## When to Run This

- After a scope ships (run once per scope, linked to that scope's specid)
- After fixing a hard bug that took more than an hour to diagnose
- After making an architectural decision that will affect future work
- After discovering a security issue and implementing a fix
- After any work that involved a compliance-relevant decision (auth, data handling, encryption, access control)

---

## Compliance Context — Load Before Writing

Before assembling the document, check which frameworks are active:

1. Call `project.get_audit_config` MCP tool for this project
2. For each enabled framework, read the relevant rules file:
   - `soc2enabled` → `SOC2_SDLC_Compliance_Rules.md`
   - `hipaaenabled` → `HIPAA_SDLC_Compliance_Rules.md`
   - `hitrustenabled` → `HITRUST_SDLC_Compliance_Rules.md`
   - `gdprenabled` → `GDPR_SDLC_Compliance_Rules.md`
3. If no frameworks active → the Compliance Evidence section is optional
4. If one or more active → the Compliance Evidence section is **required** and must reference the specific rules from the active frameworks that apply to this work

---

## Phase 1 — Gather Context (Parallel)

Run these in parallel before writing anything:

**1. Extract the work summary**
- What problem was solved or decision was made?
- What was the approach taken and why?
- What alternatives were considered and rejected?
- What scope/specid does this belong to?

**2. Classify the document**
Choose one:
- `BUG` — A defect was found and fixed in production code
- `DECISION` — An architectural or design decision was made
- `PATTERN` — A reusable pattern or approach was established
- `COMPLIANCE` — A security control or compliance measure was implemented
- `KNOWLEDGE` — How-to, guide, or debugging reference

**3. Check for existing related documents**
- Search `specs/` for related learnings files
- Query wxKanban `projectdocuments` WHERE `doctype = 'CompoundLearning'` for existing learnings on this project
- Assess overlap: if high, update the existing doc instead of creating a new one

**4. Identify compliance relevance**
Does this work touch any of the following?
- Authentication, authorization, or access control
- Personal data (PII), health data (PHI), or financial data
- Encryption, key management, or secrets handling
- Audit logging or monitoring
- Data retention or deletion
- Third-party integrations or OAuth tokens

If yes, the Compliance Evidence section is required.

---

## Phase 2 — Assemble the Document

Write to: `specs/{scope-name}/learnings/{slug}-{YYYY-MM-DD}.md`

If no scope is associated, write to: `docs/learnings/{slug}-{YYYY-MM-DD}.md`

```markdown
---
title: "{descriptive title}"
type: BUG | DECISION | PATTERN | COMPLIANCE | KNOWLEDGE
scope: "{NNN-scope-name or null}"
date: "{YYYY-MM-DD}"
author: "{who did the work}"
compliance_relevant: true | false
compliance_frameworks: [SOC2, HIPAA, HiTrust]  # include only if relevant
status: current
related_docs: []
---

# {Title}

## What Was Solved / Decided

[1–3 sentences. Specific enough that someone who wasn't there understands the problem.]

## Context

[Why did this problem exist? What was the state of the system before this work?
What constraints or requirements drove the approach?]

## What Was Done

[The solution, decision, or pattern. Concrete. Include relevant code references 
with file paths and line numbers if applicable. This is not pseudocode — 
point to the actual implementation.]

## Why This Approach

[What alternatives were considered? Why was this one chosen? 
What would you tell the next developer who questions this decision?
This is the most important section for future developers and auditors.]

## Compliance Evidence

[REQUIRED if compliance_relevant: true]

### Controls Applied
- [Specific security control implemented, e.g. "JWT tokens use RS256 signing, 
  expires 24h, stored in httpOnly cookies — see src/server/middleware/auth.ts:42"]

### Data Handling
- [What data is processed, stored, or transmitted? How is it protected?]

### Access Control
- [Who can access what? What validates this?]

### Audit Trail
- [What is logged? Where? Retention period?]

### Risk Assessment
- [What risks were identified? How were they mitigated?
  What residual risk remains and is accepted?]

## What to Watch

[Known edge cases, follow-up items, or conditions that could make this break.
What should a future developer check before touching this area?]

## If This Ever Breaks

[How would you know? What would the symptoms look like?
What's the first thing to check?]
```

---

## Phase 3 — Push to wxKanban DB

After writing the file, push to the `projectdocuments` table:

```
doctype:    'CompoundLearning'
title:      [document title]
filepath:   [relative path to the .md file]
content:    [full markdown content]
specid:     [scope's spec ID, or null for project-level]
isgenerated: false
```

Use `ProjectDocumentService.upsertDocument()` or the equivalent MCP tool.

Confirm the push succeeded and report the document ID.

---

## Phase 4 — Discoverability Check

After writing, verify:

- [ ] `CLAUDE.md` mentions `docs/learnings/` or `specs/*/learnings/` as a knowledge source
- [ ] The wxKanban AI search index will pick this up (it will if the DB push succeeded)
- [ ] If this is a compliance document, it will appear in audit report generation for this project

---

## Success Criteria

- One file written with valid YAML frontmatter
- Record pushed to wxKanban `projectdocuments` table
- Compliance section present and complete if compliance_relevant
- Document is specific enough that a developer unfamiliar with the work can understand it without asking questions
