# CLAUDE.md — wxKanban Implementation Guide

**Project**: Multi-Platform Task Management & Time Tracking System (wxKanban)
**Stage**: Implementation (lifecycle stage in `.wxai/project.json`)

> Live build status — "where am I, what's next" — lives in the generated `devplan` and
> `lifecycle` docs (see the Dev Cockpit), not here. This header carries **no dates or
> per-session state** on purpose, so CLAUDE.md stays byte-stable and prompt-cache-eligible
> (SCOPE-093 / FR-005).

> **This file is the always-on core (SCOPE-093 / T001).** It holds only the mandatory,
> always-relevant rules. Feature-specific and setup detail live in on-demand reference
> modules — see **Reference Modules — Read On Demand** at the bottom. Read a module with
> the Read tool **only when your work enters that area**; do not preload them.

---

## Quick Reference

### Critical Documentation

- **Specification**: `specs/main/spec.md` (82 functional requirements)
- **Data Model**: `specs/main/data-model.md` (10 entities with relationships)
- **API Contracts**: `specs/main/contracts/openapi.json` (25+ endpoints)
- **Integration Tests**: `specs/main/quickstart.md` (5 test scenarios)

### Rules Enforcement

The critical constraints below are **always in force**. Deeper rule files live in `_wxAI/rules/` and are read on demand — see **Rules — Read On Demand** at the bottom. Key constraints:

- **TypeScript**: 100% required, no `any`, no `@ts-ignore`
- **Logging**: Pino only, NO console.log
- **Database**: PostgreSQL + Drizzle ORM, UUID v7 primary keys
- **Authentication**: Custom wxKanban DB (bcrypt + JWT), NO Clerk
- **Security**: All secrets in env vars, encrypted at rest (AES-256-GCM)

### AI Behavior (MANDATORY)

- **Search before suggest**: BEFORE proposing any new feature, change, or implementation, first search the codebase for existing functionality that already addresses the need or provides a foundation. (`_wxAI/rules/search-before-suggest.md`)
- **Never proactively run git**: NEVER invoke git or the wxAIGit skill (commit, push, checkpoint, merge, branch) unless the user explicitly asks in the current message — a push deploys to production. (`_wxAI/rules/git.md`)
- **"HANDOFF REMOTE" is a command, not a task** (SCOPE-149): when the operator says **HANDOFF REMOTE** (any casing) or `/remote`, do NOT treat it as work to relay — compose a summary of where the work stands (names and counts only, never file contents or secrets) and run `node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <temp file>`; report its one output line verbatim. It launches nothing and never posts to the room itself — the already-connected Project Agent posts it. Full procedure + safety: `_wxAI/rules/remote.md`.
- **G.O.D. runs buildscope → implementation**: once a `/buildscope` is approved, everything after it (createSpecs, contracts, parallel helpers, implement) runs through `/wxG-O-D`, never an ad-hoc Workflow or Agent fan-out.
- **Model per subagent** (D-0001, SPEC-143): whenever subagents are spawned (Workflow `agent()` or the Agent tool), classify each task with `_wxAI/routing/difficulty.mjs` and set its `model` from `_wxAI/routing/tiers.mjs`; only heavy work inherits the session model. Show each agent's class and model in the plan before launching.
- **Token-saving advisor** (SCOPE-093): watch for a concrete token-saving opportunity and, when you spot one, **suggest it with an estimated saving and the choices apply / skip / silence-for-session** — never auto-apply, and take no action on no response. Silence is per-session and per-opportunity-class. Fire on at least these four: (1) a `buildscope` an existing scope already substantially covers (the reuse-check surfaces this); (2) a requested document that has a deterministic generator (lifecycle / devplan / scopeflow / help / audit — see `_wxAI/rules/token-advisor.md`); (3) context grown well beyond the current task's need; (4) repeated cold command runs where batching within the prompt-cache window would ride the cache. Estimation heuristics + examples: `_wxAI/rules/token-advisor.md` (read on demand when you surface a suggestion).
- **rescue-tokens is active globally, and wins on conflict** (SCOPE-154 / SPEC-153): the rescue-tokens skill is installed into every kit consumer's global `~/.claude/` profile and runs every session via a SessionStart hook. When its own red-flag matrix (token/context pressure, rate-limit risk, wrong-model routing, runaway verbosity) fires on the same trigger as the SCOPE-093 token-saving advisor above, rescue-tokens' act-first response takes precedence over the advisor's suggest-and-decide protocol — do not wait for an apply/skip/silence choice on that trigger.

### SPEC-FIRST Development (MANDATORY RULE)

**Before any code changes, implementation, or build work:**

1. **Read the spec** for the feature (`specs/###-FeatureName/spec.md`)
2. **Check the plan** for known issues, gates, constraints (`specs/###-FeatureName/plan.md`)
3. **If NOT in spec** → STOP, ASK user, UPDATE spec first
4. **Only then** → Proceed with code changes

**Why?** Prevents recurring issues, surprises, and lost context. Every feature decision must be documented in the spec *before* implementation.

**Example**: Build error recurred for 3 weeks because MCP config requirement was never added to spec 011. Fixed by: adding FR-023, documenting in plan, then implementing.

---

## Scope vs Spec Numbering — TWO Namespaces (MANDATORY)

There are **two independent numbering sequences** that share the same integers, so a bare number like "047" is ambiguous. Always disambiguate with a prefix:

- **`SCOPE-NNN`** → an umbrella scope definition in `specs/Project-Scope/NNN-*.md` (buildscope output). Currently advances through ~107 (105 vacated — renumbered to 106 to align 1:1 with its implementing spec).
- **`SPEC-NNN`** → an implementation spec folder `specs/NNN-name/spec.md` (with its own plan/tasks/lifecycle). Currently advances through ~106.

**Why they differ:** early scopes were 1:1 with their spec folder (SCOPE-004 ↔ SPEC-004). Once an umbrella scope began fanning out into several implementation specs, those specs took the *next global SPEC number*, not the scope's number — so the two counters detached and now overlap. Examples:

- `SCOPE-045` (marketing) → `SPEC-046`–`SPEC-050`
- `SCOPE-046` (language) → `SPEC-051`–`SPEC-054`
- `SCOPE-047` (stack-style) → `SPEC-055`–`SPEC-057`
- `SCOPE-113` (compliance) → `SPEC-112`–`SPEC-114`
- `SCOPE-114` (design-system catalog) → `SPEC-115`–`SPEC-116`

**Fence labels follow the SPEC folder, not the umbrella scope.** `implement <scope>/<task>`
derives the fence from its folder argument, so SCOPE-114's code is fenced `[SCOPE 115 / Tnnn]`
and `[SCOPE 116 / Tnnn]`. Grepping for a *scope* number will therefore miss its code when the
counters have diverged — use the mapping above. Fences are never hand-corrected to close this
gap; rewriting a fence comment silently reassigns authorship.

So **`SCOPE-047` (stack-style) and `SPEC-047` (windev-site-integration) are different things that collide only as integers.**

**Rules:**

1. In specs, plans, commits, fences, and conversation, write `SCOPE-NNN` or `SPEC-NNN` — never a bare number when context is ambiguous.
2. Code fences reference the **SCOPE** number: `[SCOPE 047 / 055]` = SCOPE-047 (stack-style) implemented by SPEC-055 (stack-capture). The `implement <scope>/<task>` path keeps this correct.
3. This is a **labelling convention only** — no folders are renamed and no fences/DB rows change. Existing artifacts keep their numbers.

---

## Code Fencing Convention (MANDATORY — spec 026)

Every top-level code unit in this repository is wrapped with a single-line BEGIN/END comment fence naming the spec and task that authored it:

```ts
// [SCOPE 013 / T042] BEGIN — Audit log retention pruning
export function pruneAuditLogs(...) { ... }
// [SCOPE 013 / T042] END
```

**Rules:**

1. Every top-level function, class, route handler, Drizzle table, React component, and SQL migration body must be fenced. Un-fenced code is a defect.
2. **Fences are written by the orchestrator only.** Never hand-author or hand-edit them. Use `wxkanban-agent implement <scope>/<task>`.
3. Later tasks that **partially modify** a fenced block add a `MODIFIED-BY` line under the BEGIN (handled automatically by `implement`).
4. Tasks that **fully replace** a block (≥ 80% diff) get a new fence with `(replaces N/Tn)` suffix.
5. JSON files are exempt.

**Verification:** Run `wxkanban-agent auditfences` before pushing. Exit 0 means clean. CI runs `--strict`.

**Legacy code:** wxKanban was baselined on 2026-05-13. Pre-spec-026 declarations are info-only; any new un-fenced declaration is an error.

If you see un-fenced code that's not in the legacy baseline, that's evidence work happened outside the orchestrator — remediate by routing through `implement`. Full reference: `wxkanban-agent/docs/fencing.md` and `specs/026-CodeFencing/spec.md`.

---

## Orchestrator-First (MANDATORY)

Route all spec edits, code changes, and release actions through the `wxkanban-agent` CLI. Direct file edits + git commands are reserved for exploration, investigation, and one-off fixes the user explicitly approves as "out of band."

**Commands by lifecycle stage:**

| Stage | Stage-gated | Cross-cutting |
|-------|-------------|---------------|
| Design | `buildscope`, `wxconversion`, `createspecs` | `dbpush`, `pipeline-agent` |
| Implementation | `implement`, `createtesttasks` | `dbpush`, `pipeline-agent` |
| QA Testing | `runqa` | `dbpush`, `pipeline-agent` |
| Human Testing | `runhuman` | `dbpush`, `pipeline-agent` |
| Beta | `prepareRelease` | `dbpush`, `pipeline-agent` |
| Release | `finalizeRelease` | `dbpush`, `pipeline-agent` |

```
wxkanban-agent --help        # list commands for the current stage
wxkanban-agent --version     # kit version
wxkanban-agent dbpush --dry-run
```

Stage is set in `.wxai/project.json`; advance via the normal lifecycle transitions.

---

## Technology Stack (Final)

| Layer      | Technology              | Notes                                   |
| ---------- | ----------------------- | --------------------------------------- |
| Backend    | Express                 | Node.js 20 LTS, RESTful API             |
| Frontend   | React 18+               | With Vite, SPA architecture             |
| Database   | PostgreSQL 15+          | Drizzle ORM, migrations auto-generated  |
| Auth       | bcrypt + JWT            | Custom implementation, httpOnly cookies |
| PM APIs    | OAuth2 + Polling        | Jira, Monday.com, Asana, Trello SDKs    |
| AI         | Gemini API              | Fallback: OpenAI                        |
| State Mgmt | TanStack Query          | SWR-style caching                       |
| Styling    | TailwindCSS + shadcn/ui | Component library                       |
| Testing    | Vitest + Playwright     | Unit + E2E                              |
| Logging    | Pino                    | Structured JSON logging                 |

---

## Database Conventions

- **Tables**: Plural, lowercase, no camelCase (e.g., `users`, `projects`, `timeentries`, `pmsystemconnections`)
- **Primary Keys**: `id` with UUID v7 (e.g., `users.id`, `projects.id`)
- **Foreign Keys**: Match parent table name + `id` (e.g., `userid` references `users.id`, `projectid` references `projects.id`)
- **Fields**: lowercase, no camelCase (e.g., `accesstoken`, `createdat`, `starttime`, `pmsystem`)
- **No Underscores**: Forbidden for word separation (use concatenation instead)
- **No Spaces**: All compound names concatenated (e.g., `companyauditlogs`, `pmsystemconnections`, `invitationbatches`)
- **Schema changes are applied MANUALLY** (SCOPE-117). There is no migration ledger in production
  and nothing auto-applies DDL. The workflow is: edit `src/db/schema/` → produce reviewed SQL →
  apply by hand → verify with `npm run db:drift` → record the change in
  `specs/117-production-schema-integrity/schema-change-log.md`.
- **`npm run db:drift`** — compares declared schema against deployed schema; exit 0 means every
  declared table exists. Also runs in CI (`auditfences --schema`). Read-only.
- **`npm run db:generate`** — drizzle-kit migration generation. Does **not** connect to the
  database. Note it currently stops at an interactive prompt because the migration snapshots in
  `src/db/migrations/meta/` predate the manually-applied changes; answer rename-vs-recreate
  carefully, as a wrong answer emits destructive SQL.
- **`npm run db:check`** — validates migration file consistency. Read-only.
- **`drizzle-kit push` is PROHIBITED** against this database. It reconciles the database *to* the
  declared schema and would propose dropping the ~19 undeclared-but-live tables, including
  `marketingcontacts`. The local `.env` `DATABASE_URL` points at PRODUCTION.

**Examples of correctly named tables:**

- `users`, `companies`, `projects`, `tasks`, `timeentries`, `invoices`, `notes`
- `pmsystemconnections`, `projectusers`, `userinvitations`, `companyauditlogs`
- `projectphases`, `testplans`, `invitationbatches`, `invitationdlqs`

---

## Reference Modules — Read On Demand (SCOPE-093)

The detail below is **not preloaded**. Read the module with the Read tool **only when your
work enters that area** — this keeps the fixed per-session context small (see SCOPE-093).
Each file lives under `_wxAI/reference/`.

| Read this module | When you are working on |
|------------------|-------------------------|
| `_wxAI/reference/feature-conventions.md` | Admin Dashboard; per-project Lifecycle (spec 048), Dev Plan (SCOPE-081), Overview docs; Generated-Output Watermark (SCOPE-082); Subscription-Aware Help (SCOPE-084) |
| `_wxAI/reference/implementation-patterns.md` | Authentication, PM-system integration, the 6-phase workflow, time tracking, invoice generation; performance targets |
| `_wxAI/reference/project-setup.md` | Project structure/navigation, dev-environment setup, first-time "before implementing" steps |

### Rules — Read On Demand

Governance rules in `_wxAI/rules/` are **not preloaded**. The always-on ones are inlined
above (**Rules Enforcement** + **AI Behavior**); read the rest when their trigger fires:

| Read this rule | Trigger |
|----------------|---------|
| `_wxAI/rules/shadcn.md` | Editing React/Tailwind files (`*.tsx`, `*.css`, `tailwind.config.*`, `components.json`) — use shadcn components + the shadcn-ui MCP |
| `_wxAI/rules/compliance-context.md` | Starting `buildscope`, `createSpecs`, or `implement` — load active compliance frameworks first |
| `_wxAI/rules/development-guidelines.md` | Deeper code-quality / implementation guidance |
| `_wxAI/rules/token-advisor.md` | Surfacing a token-saving suggestion (SCOPE-093 advisor) — estimation heuristics, the apply/skip/silence protocol, and the `token-footprint` measurement surface |
| `_wxAI/rules/remote.md` | Operator says **HANDOFF REMOTE** / `/remote` (SCOPE-149) — the handoff-to-Project-Agent procedure, summary fields, and safety |

---

This file provides guidance to Claude Code when working with code in this repository.

Governance rules in `_wxAI/rules/` are **not** auto-loaded into the editor context — the always-on ones are inlined above (Rules Enforcement, AI Behavior) and the rest are read on demand via **Rules — Read On Demand**. The kit reads `_wxAI/rules/` for its own enforcement and syncs them to consumer projects.
