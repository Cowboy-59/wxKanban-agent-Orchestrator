---
name: compound-refresh
description: Review and maintain the learnings knowledge base. Check compound documents against current code, update stale references, merge overlapping docs, and remove obsolete ones. Run periodically or before a compliance audit.
---

# /compound-refresh

## Why This Matters

A knowledge base that isn't maintained becomes a liability. Stale docs misdirect developers. Outdated security documentation misleads auditors. A doc that says "we encrypt tokens with AES-128" when you've moved to AES-256-GCM is worse than no doc at all during a SOC 2 review.

This skill keeps the knowledge base honest. Run it after a major refactor, before a compliance audit, or whenever you suspect the docs have drifted from reality.

**This skill is tool-agnostic.** The discipline of maintaining a knowledge base applies regardless of what tools were used to build it.

---

## Usage

```
/compound-refresh                    # Review all learnings interactively
/compound-refresh mode:autofix       # Apply non-ambiguous fixes automatically
/compound-refresh [scope-name]       # Review only one scope's learnings
/compound-refresh [doc-title]        # Review one specific document
/compound-refresh mode:audit         # Compliance audit mode — report only, no changes
```

---

## Five Outcomes

For each document reviewed, choose one:

| Outcome | When to use |
|---------|-------------|
| **Keep** | Still accurate, no changes needed |
| **Update** | Core solution valid; references drifted (file paths, class names, line numbers, code snippets) |
| **Consolidate** | Two or more docs overlap; merge unique content into one, delete the rest |
| **Replace** | Core guidance is now wrong or misleading; write a successor based on current code, delete original |
| **Delete** | Feature removed, problem no longer exists, or fully superseded with no inbound citations |

---

## Review Process

### Phase 0 — Discover

Find all compound documents:
- `specs/*/learnings/*.md`
- `docs/learnings/*.md`
- Query wxKanban `projectdocuments` WHERE `doctype = 'CompoundLearning'`

Review **compliance-relevant docs first** (where `compliance_relevant: true`). These have the highest cost if stale.

### Phase 1 — Assess Each Document

For each document, check:

- **File paths and code references** — Do they still exist? Have they moved?
- **Code snippets** — Do they match the current implementation?
- **Security/compliance claims** — Does the current code still implement what the doc claims?
- **Related doc references** — Are cross-references still accurate?
- **Date** — How old is this? What changed in the codebase since then?

### Phase 2 — Set-Level Evaluation

Look across all documents as a whole:
- Are two docs covering the same problem with conflicting advice?
- Does a newer doc supersede an older one on the same topic?
- Are there contradictions between compliance docs?

### Phase 3 — Classify and Act

Apply the five outcomes. In interactive mode, ask before acting on anything ambiguous.
In `mode:autofix`, apply unambiguous Updates automatically; flag ambiguous ones.
In `mode:audit`, report only — no file changes.

### Phase 4 — Sync to wxKanban DB

After any file changes:
- Update the corresponding `projectdocuments` record with new content
- Update `updatedat` timestamp
- If a doc is deleted, mark the DB record as `status: archived` (do not hard delete — audit trail)

### Phase 5 — Generate Report

Always produce a report listing:

```
COMPOUND-REFRESH REPORT — {date}

REVIEWED: {N} documents
  Keep:        {N}
  Updated:     {N}  [list files]
  Consolidated:{N}  [list merges]
  Replaced:    {N}  [list replacements]
  Deleted:     {N}  [list deletions]

COMPLIANCE DOCS:
  Current:     {N}
  Updated:     {N}
  Flagged:     {N}  [list with reason]

RECOMMENDED MANUAL REVIEW:
  [Any docs that couldn't be automatically assessed]
```

---

## Compliance Audit Mode

`/compound-refresh mode:audit` is designed to run before a SOC 2, HIPAA, or HiTrust review.

It does NOT modify any files. It produces a report showing:

- Which compliance-relevant documents are current vs stale
- Which security controls are documented vs undocumented
- Gaps where compliance evidence is missing
- Recommended actions before the audit

This report can be shared directly with auditors as evidence of ongoing knowledge base maintenance.

---

## Key Rules

1. **Match docs to reality, not the reverse.** When code changes, the doc updates to reflect it — not the other way around.
2. **Update is for drift, not for rewrites.** If you're rewriting the solution, that's Replace.
3. **Never delete a compliance doc without archiving.** Mark as archived in DB; git history preserves the file.
4. **Consolidate proactively.** Redundant docs drift silently and create contradictions.
5. **Stale compliance docs are worse than no docs.** Flag these immediately.
