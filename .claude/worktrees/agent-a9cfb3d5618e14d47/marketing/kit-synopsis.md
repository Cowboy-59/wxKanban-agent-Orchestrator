# wxKanban Agent Orchestrator Kit — Feature Synopsis

**Last updated:** 2026-06-06
**One-liner:** A self-contained, installable orchestration kit that brings deterministic lifecycle management, stage-gated commands, AI-assisted workflows, and full audit trails to any project — and teaches the development *judgment* (not just the procedure) as you use it.

The Kit isn't a code generator you point at a prompt. It installs into any project, enforces a **6-phase development lifecycle**, and makes the right action available only at the right time — so specs get followed, tests don't get skipped, releases don't happen without QA, and there's always a single source of truth for where a project actually is. It's the engine that turns "I have an AI that writes code" into "I ship tested, audited software on a repeatable process."

---

## 1. Deterministic Lifecycle Management

- **A 6-phase lifecycle every feature must progress through, in order** — you can't skip ahead or go backward.
- **Stage gates** — the policy engine evaluates the current phase and blocks commands that don't belong yet.
- **Single source of truth** — the current stage lives in project config (`.wxai/project.json`); every command resolves project context before it runs.
- **Structured outputs** — every command returns a typed `CommandResult` + `AuditRecord`. Nothing happens off the record.

## 2. The 6-Phase Lifecycle

**Design → Implementation → QA Testing → Human Testing → Beta → Release**

| # | Phase | Purpose | Commands |
|---|-------|---------|----------|
| 1 | **Design** | Define what to build | `buildscope`, `createspecs` |
| 2 | **Implementation** | Build it | `implement`, `createtesttasks` |
| 3 | **QA Testing** | Automated verification | `runqa` |
| 4 | **Human Testing** | Manual verification + feedback | `runhuman` |
| 5 | **Beta** | Controlled release | `prepareRelease` |
| 6 | **Release** | Ship it | `finalizeRelease` |

**Cross-cutting commands** (available in any phase): `dbpush` (sync data + apply migrations), `pipeline-agent` (multi-phase orchestration: run/resume/retry/status), `auditfences` (traceability check), `kit:status` (per-service liveness).

## 3. Spec-First Workflow

- **`buildscope`** — an interactive Senior Business Analyst workflow: discovery → draft → section-by-section review with explicit approval gates → final review. No scope ships on hand-waving.
- **`createspecs`** — turns an approved scope into the full artifact set: **spec, plan, tasks, tests, quickstart**, and a requirements checklist.
- **`implement`** — drives implementation task-by-task against the spec, with normalization and gate checks.
- Features are specified, planned, and broken into tasks **before** code is written — the discipline that separates shipping from drifting.

## 4. Code Fencing & Traceability

- **Every top-level code unit is fenced** with the spec/task that authored it (`// [SCOPE 044 / T002] BEGIN … END`).
- **`auditfences`** verifies every declaration is fenced and traceable; CI runs it in strict mode.
- The result: any line of code can be traced back to the requirement that asked for it — the foundation for real audit reporting.

## 5. Bring-Your-Own-AI

- **The Kit is a workflow engine, not an AI client.** Your editor's AI (Claude, Cursor, etc.) does the generation; the Kit **validates, writes, fences, and audits** the result through its MCP tools.
- **Provider-configurable** routing with primary + fallback (Groq / Gemini / OpenAI) for the workflows that do call AI directly.
- You keep your AI of choice and your judgment; the Kit keeps the process honest.

## 6. Audit Trails

- **Every command produces an `AuditRecord`** — who ran what, when, with what inputs and outcome.
- **Per-project audit reports and lifecycle summaries** roll up the full history.
- **A full audit report on every release** — compliance isn't bolted on afterward; it's a by-product of the process.

## 7. Multi-Project Isolation & Runtime

- **Installs into any project, any stack** — the Kit sits alongside your code as `wxkanban-agent/`.
- **Multi-project isolation** — many projects share one wxKanban database, isolated by `projectId`; each project runs its own gateway on an auto-selected port with a per-project runtime-state file.
- **`kit:status`** reports per-service liveness so you always know what's running.

## 8. The WinDev / HFSQL Conversion Path

- **`wxConversion`** prepares a legacy WINDEV application as Markdown source material (procedures, window/screen files), with screenshots preserving the original look.
- **`buildscope --from-md`** converts that Markdown — or any PRD, meeting notes, or legacy spec — directly into a structured Scope-of-Project, reviewed section by section.
- The on-ramp that turns "I have a proprietary app" into "I have a spec-driven, AI-buildable plan."

## 9. VS Code Dev Cockpit

- A **sidebar extension** showing the current project's remaining work per scope — incomplete tasks grouped by scope, active scope pinned — live as work is built and completed, without leaving the editor.
- Reads through the project-scoped MCP, including an in-editor command/help reference.

## 10. Architecture & Integration

- **CLI + HTTP gateway + MCP adapter** — three entry points (terminal, gateway, or AI agent) over the same policy and workflow engine.
- **MCP Project Hub** — the hosted/remote interface (`mcp.wxperts.com`) consumer projects talk to; the Kit is the local workflow engine that validates and writes.
- **Config-driven per install** — `.wxkanban-project.json` (projectId, kit version), `.wxai/project.json` (lifecycle stage), `ai-settings.json` (AI adapters + custom commands).

---

## How It Fits Together

```
Consumer Project (any stack)
  └─ wxkanban-agent/        ← the Kit: CLI + gateway + policy + workflow engine
  └─ mcp-server/            ← MCP Project Hub (remote interface)
  └─ .wxai/project.json     ← current lifecycle stage
```

```
User / AI agent
  → CLI · HTTP gateway · MCP adapter
    → project context resolved → stage gate evaluated
      → workflow engine dispatches handler (AI worker · MCP tools · file I/O)
        → audit record written → typed result returned
```

---

## Why It Matters

The hard part of building software was never the syntax — it was the **judgment**: knowing how to take work from messy idea to clean, tested, shipped, audited result. That judgment is the **lifecycle**, and it's exactly what AI-assisted development still demands and what newcomers lack. The Kit doesn't hide that discipline behind a magic button — it makes it the path of least resistance, enforces it at every gate, and teaches it by doing. Projects stop drifting, and developers level up into the part of the job AI can't replace.
