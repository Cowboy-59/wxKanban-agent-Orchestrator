---
description: Update the project's Stack & Style document (stack.md) from VS Code — a guided, default-first interview that revises the target stack and look-and-feel, then persists the ProjectStack document. The primary capture happens in the wxKanban web app at project creation; this command edits the existing stack.md afterward.
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
---

# /buildstack — Update the Project Stack & Style

## Purpose

Update the project's **`stack.md`** — its captured **target stack** and **design/CSS style** — from the editor. The stack is **first captured in the wxKanban web app during project creation**; this command is the **update path**: it loads the existing `stack.md`, walks a guided, default-first interview over the parts you want to change, writes the revised `stack.md`, and persists it as the project's `ProjectStack` document.

**The kit is a workflow engine, not an AI client.** YOU (the editor AI) run the interview and write the file; the kit only persists the result via MCP. Do not call any kit-internal AI.

## When to use

- The project already has a `stack.md` (created by the web walkthrough) and you want to change the stack or look-and-feel.
- If there is **no** `stack.md` yet, you can still create one here — but the normal place to set it up is the web new-project walkthrough.

## Procedure

1. **Load the current stack.** Read `stack.md` at the repo root if it exists; treat its contents as the starting point. If absent, start from the defaults for the chosen application type (below).
2. **Confirm the application type** — **Web / Desktop / Mobile**. Changing it re-seeds the per-type defaults **only** for stack dimensions the user hasn't customized.
3. **Walk the six stack dimensions**, one at a time, default-first — show the current/default value, explain why it asks, and accept an override or the default. Each carries a **one-line rationale**:
   - **Backend** (language / framework)
   - **Frontend** (framework)
   - **Database**
   - **Styling / Components**
   - **Testing**
   - **Hosting / Deploy**
4. **Look & feel (UI app types).** Offer the curated galleries below; let the user pick a direction and/or **cite a specific app/page**. From the cited reference, derive concrete **design tokens** (color palette, typography, spacing/radius). If the user accepts the default style, keep a sensible default token set.
5. **Write `stack.md`** at the repo root in the canonical format (see Output Format). One question at a time; never overwrite without showing the result.
6. **Persist** via MCP `project.upsert_document` with **`doctype: "ProjectStack"`**, `title: "Project Stack & Style"`, and `bodyMarkdown` = the full `stack.md` content. The `doctype` makes the upsert idempotent — re-running updates the same row.

## Per-application-type default stacks (seed values)

- **Web** — Backend: Node.js + Express · Frontend: React + Vite · Database: PostgreSQL · Styling: Tailwind CSS + shadcn/ui · Testing: Vitest + Playwright · Hosting: Containerized (AWS / Vercel)
- **Desktop** — Backend: Rust (Tauri core) or Node sidecar · Frontend: React (Tauri webview) · Database: SQLite (embedded) · Styling: Tailwind CSS · Testing: Vitest · Hosting: Signed installers (per-OS)
- **Mobile** — Backend: Node.js + Express API · Frontend: React Native (Expo) · Database: SQLite (on-device) + Postgres (server) · Styling: NativeWind · Testing: Jest + Detox · Hosting: App stores + EAS / managed API

## Curated look-and-feel galleries

Present these so a non-designer can pick a direction by example (keep this list in sync with the web app's `src/shared/lookfeel-galleries.ts`):

- **Mobbin** — https://mobbin.com — real iOS / Android / web app screens and flows (mobile, web)
- **Land-book** — https://land-book.com — landing-page / marketing aesthetics (web)
- **Dribbble** — https://dribbble.com — broad UI design shots (web, mobile, desktop)
- **Awwwards** — https://www.awwwards.com — high-end modern web design (web)

## Output Format (`stack.md`)

```markdown
# Project Stack & Style

**Application type:** <Web|Desktop|Mobile>

## Target Stack

| Dimension | Choice | Why |
|---|---|---|
| Backend | <value> | <rationale> |
| Frontend | <value> | <rationale> |
| Database | <value> | <rationale> |
| Styling / Components | <value> | <rationale> |
| Testing | <value> | <rationale> |
| Hosting / Deploy | <value> | <rationale> |

## Look & Feel

- **Gallery:** <gallery key, or "default">
- **Reference:** <cited app/page, if any>

### Design Tokens

- **Colors** — primary <hex>, secondary <hex>, neutral <hex>, background <hex>, foreground <hex>
- **Typography** — <font family>; <scale>
- **Spacing** — base <unit>; radius <value>
```

## Rules

- **Default-first:** every step has a default; accepting all defaults yields a complete, valid `stack.md`. No choice is mandatory.
- **Methodology terms stay English** (consistent with the kit's localization rule).
- **Non-destructive:** updating the stack does NOT alter already-generated specs/code; the revised `stack.md` governs only future generation (spec 056).
- **One question at a time**, explain why, wait — BuildScope discipline.
