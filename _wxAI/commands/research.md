# Research & PRD Generation Prompt

## Context
You have prior knowledge of my app (wxKanban — open-source project management system with AI integration, built on React/TypeScript/Node.js, PostgreSQL, with LLM/AI agent capabilities). Reference what you already know about the app's purpose, target users, and core feature set before starting.

If anything about the app is unclear, ask me 1–3 clarifying questions before beginning research. Otherwise proceed.

---

## Phase 1: Landscape Research

Research and catalog existing tools, libraries, and projects that overlap with my app's features or functions. Cast a wide net across these categories:

- **CLIs** — command-line tools that perform similar workflows
- **APIs** — hosted/SaaS APIs offering equivalent capabilities
- **MCP servers** — Model Context Protocol servers (official + community) relevant to project management, kanban, AI agents, or LLM orchestration
- **Python libraries** — open-source packages with overlapping functionality
- **JavaScript / TypeScript libraries** — npm packages relevant to the stack
- **Open-source projects** — full apps or frameworks (GitHub, GitLab) in the same problem space
- **Reference implementations** — notable forks, templates, or starter kits worth studying

For each finding, capture:
| Field | Description |
|---|---|
| Name | Tool / project name |
| Type | CLI / API / MCP / Library / OSS App |
| Link | Repo or docs URL |
| What it does | 1–2 sentence summary |
| Overlap with my app | Which of my features it touches |
| License | MIT / Apache / GPL / Commercial / etc. |
| Maturity | Stars, last commit, production-ready? |
| Reusable? | Can I integrate it, fork it, or just learn from it? |

Prioritize active, well-maintained projects. Flag anything abandoned but architecturally interesting.

---

## Phase 2: Synthesis

Before writing the PRD, give me a short synthesis:
- **Build vs. buy vs. integrate** recommendations per feature area
- **Gaps in the ecosystem** my app could uniquely fill
- **Risks** (license conflicts, dead projects, vendor lock-in)

---

## Phase 3: Phased PRD

Compile findings into a Product Requirements Document structured for **incremental delivery**. Keep Phase 1 intentionally minimal — we add complexity over time.

### PRD Structure

**1. Overview**
- Problem statement
- Target users
- Success metrics

**2. Scope by Phase**

**Phase 1 — MVP (minimum lovable product)**
- Core features only (3–5 max)
- Tech stack decisions w/ rationale (cite which OSS tools from research we leverage)
- Out-of-scope list (explicit deferrals)
- Acceptance criteria

**Phase 2 — Expansion**
- Next-tier features
- Integrations enabled by Phase 1 foundation
- Dependencies on Phase 1

**Phase 3 — Advanced**
- Complex/AI-heavy features (multi-agent orchestration, advanced MCP, etc.)
- Performance, scale, observability concerns

**3. Architecture Sketch**
- High-level component diagram (text or mermaid)
- Data model outline
- External integrations per phase

**4. Open Questions / Decisions Needed**
- List anything requiring my input before build starts

**5. Appendix**
- Full research table from Phase 1
- Links to reference repos worth cloning/studying

---

## Output Format
- Deliver the PRD as a markdown file I can review and edit
- Use tables for comparisons, bullet lists for features
- Cite every external tool with a clickable link
- Keep prose tight — this is a working doc, not marketing copy

## Final Step
After delivering the PRD, ask me which phase to refine first or whether to proceed to implementation planning.
