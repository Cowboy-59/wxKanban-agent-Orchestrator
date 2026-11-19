---
name: code-review
description: Structured code review using parallel reviewer personas tuned for the wxKanban stack (TypeScript, Express, React, Drizzle ORM, PostgreSQL, Pino). Covers correctness, security, compliance, performance, maintainability, and stack conventions. Use before creating a PR or after completing an implementation task.
---

# /code-review

## Why This Matters

Code review is where critical thinking meets someone else's work — or your own work with fresh eyes. Most developers early in their career think code review is about catching bugs. That's part of it. But the deeper value is that it's where you learn to read code the way an experienced developer reads it: asking "what could go wrong here?" before it goes wrong in production.

Every reviewer in this skill represents a different lens — a different set of questions a professional brings to code. Over time, you internalize those lenses. You stop needing to run the skill explicitly because the questions become second nature.

**This skill is tool-agnostic.** The reviewer personas and the questions they ask apply whether the code was written by a human, an AI, or both. The lens doesn't change based on who wrote it.

---

## Usage

```
/code-review                    # Review all uncommitted or staged changes
/code-review [file or path]     # Review a specific file or directory
/code-review mode:report        # Report only — no fixes applied
/code-review mode:autofix       # Apply safe fixes automatically
```

---

## Compliance Context — Load Before Review

Before running any reviewers:

1. Call `project.get_audit_config` MCP tool for this project
2. For each enabled framework, read the relevant rules file:
   - `soc2enabled` → `SOC2_SDLC_Compliance_Rules.md` — focus on Development phase section
   - `hipaaenabled` → `HIPAA_SDLC_Compliance_Rules.md` — focus on Technical Safeguards section
   - `hitrustenabled` → `HITRUST_SDLC_Compliance_Rules.md` — focus on System Acquisition/Development section
   - `gdprenabled` → `GDPR_SDLC_Compliance_Rules.md` — focus on Development phase and Privacy by Design section
3. If no frameworks active → Compliance Reviewer is skipped
4. If one or more active → Compliance Reviewer runs with the loaded rules as its checklist, not just the generic questions below

---

## Reviewer Personas

### Always-On (run for every review)

**1. Correctness Reviewer**
- Logic errors, off-by-one mistakes, incorrect conditionals
- State that can be in an unexpected combination
- Functions that don't do what their name says
- Missing null/undefined checks at system boundaries (user input, external APIs)
- Async/await mistakes, unhandled promise rejections

**2. TypeScript Compliance Reviewer**
*(wxKanban rule: 100% TypeScript, no `any`, no `@ts-ignore`)*
- Any use of `any` type — flag and suggest the correct type
- Any `@ts-ignore` or `@ts-expect-error` — flag as violation
- Missing return types on exported functions
- Type assertions (`as X`) that could fail at runtime
- Implicit `any` from untyped library usage

**3. Security Reviewer**
*(always-on because wxKanban handles auth, OAuth tokens, and time/billing data)*
- SQL injection via Drizzle ORM — raw query interpolation
- JWT validation gaps — is expiry checked? Is signature verified?
- Secrets in code, logs, or error messages
- Missing authentication middleware on protected routes
- OAuth tokens stored or logged in plaintext (must be encrypted at rest, AES-256-GCM)
- bcrypt usage — is cost factor adequate? Is timing-safe comparison used?
- httpOnly cookie flags — are auth cookies marked correctly?
- Input validation at system boundaries — user input, webhook payloads, PM API responses

**4. Logging Compliance Reviewer**
*(wxKanban rule: Pino only, NO console.log)*
- Any `console.log`, `console.error`, `console.warn`, `console.info` — flag as violation
- Pino log levels used correctly (error/warn/info/debug)
- PII or sensitive data (tokens, passwords, PHI) appearing in log messages
- Structured logging — are log calls using objects, not string concatenation?

**5. Maintainability Reviewer**
- Functions doing more than one thing
- Deep nesting that should be flattened
- Magic numbers or strings that should be named constants
- Dead code — unreachable branches, unused variables, unused imports
- Names that don't match what the thing actually does

**6. Test Coverage Reviewer**
- Happy path covered?
- What are the obvious failure modes — are they tested?
- Tests that test implementation (internal functions, private methods) instead of behavior
- Missing integration tests for new API endpoints
- Acceptance criteria from the spec — are they all covered by a test?

---

### Conditional (run when relevant to the diff)

**Database / Drizzle ORM Reviewer** *(trigger: any changes to `src/db/` or schema files)*
- Table and column naming conventions: plural, lowercase, no camelCase, no underscores
- UUID v7 primary keys — is `id` using the correct generator?
- Foreign key naming: `{parenttable}id` pattern
- Missing indexes on foreign keys or frequently queried columns
- Migration safety — does this migration work on a table with existing data?
- N+1 query patterns — is this fetching in a loop when a join would work?

**API Contract Reviewer** *(trigger: any changes to route handlers)*
- Does the response shape match the OpenAPI spec in `specs/main/contracts/openapi.json`?
- HTTP status codes correct? (201 for create, 200 for update, 204 for delete, etc.)
- Error responses have consistent shape?
- Authentication middleware applied to all protected routes?

**Compliance Reviewer** *(trigger: any changes touching auth, user data, time entries, invoices, PM tokens)*
- Is this change audit-logged? (SOC 2 / HiTrust requirement)
- Does this handle PHI or PII? Is it encrypted at rest?
- Are OAuth tokens handled correctly — encrypted in DB, never in logs?
- Does this affect billing data? Is the audit trail preserved?
- Is access control enforced — does the route verify the user belongs to the right company?

**Performance Reviewer** *(trigger: changes to sync jobs, invoice generation, or dashboard queries)*
- Does this query load more data than it needs?
- Is pagination applied to list endpoints?
- Are there synchronous operations that should be async?
- Background job error handling — does a failure block the next cycle?

---

## Finding Severity

| Level | Meaning | Action |
|-------|---------|--------|
| **P0** | Blocks merge — security vulnerability, data loss risk, or spec violation | Must fix before PR |
| **P1** | Should fix — correctness issue or compliance gap | Fix before merge unless explicitly accepted |
| **P2** | Recommended — maintainability or test coverage gap | Fix if low-effort, otherwise log as follow-up |
| **P3** | Advisory — style, naming, minor improvement | Developer discretion |

P0 findings are always shown. P1+ require confidence ≥ 75% to appear in the primary findings list.

---

## Output Format

```
CODE REVIEW — {files reviewed} — {date}

═══════════════════════════════
P0 — MUST FIX
═══════════════════════════════
[file:line] [reviewer] [finding]
[why it matters]
[suggested fix]

═══════════════════════════════
P1 — SHOULD FIX
═══════════════════════════════
...

═══���═══════════════════════════
P2 — RECOMMENDED
═══════════════════════════════
...

═══════════════════════════════
COMPLIANCE SUMMARY
═══════════════════════════════
Compliance-relevant changes: yes/no
Controls verified: [list]
Gaps found: [list or "none"]

═══════════════════════════════
VERDICT
═══════════════════════════════
APPROVE / APPROVE WITH P2s / REQUEST CHANGES
```

---

## After the Review

If P0 or P1 findings exist:
- Fix them before creating a PR
- Re-run `/code-review` after fixing to verify

If compliance gaps were found:
- Run `/compound` after fixing to document the control that was added
- This creates the audit evidence trail

If the review is clean:
- Consider running `/compound` if this work introduced a new pattern or significant decision worth preserving
