# CLAUDE.md — <Project Name>

**Project**: <one-line description>
**Last Updated**: <YYYY-MM-DD>
**Current Phase**: Design

This file is the AI assistant's project primer. Rules are auto-discovered from `_wxAI/rules/`; commands run via `wxkanban-agent <command>`.

---

## SPEC-FIRST Development (MANDATORY)

Before any code changes, implementation, or build work:

1. **Read the spec** for the feature (`specs/###-FeatureName/spec.md`)
2. **Check the plan** for known issues, gates, constraints (`specs/###-FeatureName/plan.md`)
3. **If NOT in spec** → STOP, ASK user, UPDATE spec first
4. **Only then** → proceed with code changes

Prevents recurring issues, surprises, and lost context. Every feature decision must be documented in the spec *before* implementation.

---

## Orchestrator-First (MANDATORY)

Route all spec edits, code changes, and release actions through the `wxkanban-agent` CLI. Direct file edits + git commands are reserved for exploration, investigation, and one-off fixes the user explicitly approves as "out of band."

**Commands by lifecycle stage:**

| Stage | Stage-gated | Cross-cutting |
|-------|-------------|---------------|
| Design | `buildscope`, `createspecs` | `dbpush`, `pipeline-agent` |
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

## 6-Phase Workflow

The orchestrator enforces a six-phase project lifecycle. Each phase must complete before the next begins:

1. **Design** — Specifications drafted, reviewed, approved
2. **Implementation** — Code written against approved specs; tests added
3. **QA Testing** — Automated + compliance (SOC 2 / HITRUST / HIPAA as configured) testing
4. **Human Testing** — Manual validation; feedback items become new specs
5. **Beta Release** — Limited deploy; modifications require explicit approval
6. **Release** — All prior phases complete; production cut

Stage transitions happen through the orchestrator (see `wxkanban-agent/core/orchestrator/transitions.ts`), never by hand-editing `.wxai/project.json`.

---

## Tech Stack

<!-- Fill in after scaffolding. Typical kit baseline:
- Runtime: Node.js 20 LTS
- Database: PostgreSQL 15+ via Drizzle ORM (UUID v7 primary keys)
- MCP Server: port 3002 (auto-started on folder open)
- Orchestrator HTTP Gateway: port 3003
- Logging: Pino (NO console.log)
-->

---

## Database Conventions

If this project uses the kit-standard PostgreSQL + Drizzle setup, the following naming rules apply and are enforced by `_wxAI/rules/projectrules.md`:

- **Tables**: plural, lowercase, no camelCase, no underscores for word separation, no spaces (e.g., `users`, `projecttasks`, `companyauditlogs`)
- **Primary keys**: `id` with UUID v7
- **Foreign keys**: match parent table name + `id` (e.g., `userid` references `users.id`)
- **Fields**: lowercase, no camelCase (e.g., `createdat`, `accesstoken`)
- **Migrations**: auto-generated via `npm run db:generate`

Verify any schema change against these rules before `dbpush`.

---

## Performance Targets

<!-- Fill in per project. Baseline suggestions:
- Dashboard load: < 10s
- Task sync (if PM integration): < 5 min
- Database query p95: < 200ms
-->

---

## Project Structure

<!-- Fill in after scaffolding. Typical layout:
project-root/
├── src/                     # application source
├── specs/                   # design artifacts (spec.md, plan.md, tasks.md per feature)
├── tests/                   # Vitest unit + Playwright E2E
├── _wxAI/                   # shared rules and command templates (installed from kit)
├── wxkanban-agent/          # orchestrator runtime (installed from kit)
├── mcp-server/              # MCP server (installed from kit)
├── scripts/                 # setup + health-check scripts
├── .vscode/                 # editor tasks (auto-start MCP + orchestrator)
├── .wxai/project.json       # lifecycle stage config
├── .wxkanban-project.json   # project ID + kit version
├── ai-settings.json         # AI primary model + encrypted credentials
└── CLAUDE.md                # this file
-->

---

## Auto-Discovered Context

- Rules: `_wxAI/rules/*.md` (constitution, dev guidelines, git, project conventions, shadcn, etc.)
- Commands: `_wxAI/commands/*.md` (prompt templates the orchestrator references)
- See `_wxAI/wxai-implement-rules.md` for implementation-phase expectations

No imports needed — the orchestrator loads these at command invocation.
