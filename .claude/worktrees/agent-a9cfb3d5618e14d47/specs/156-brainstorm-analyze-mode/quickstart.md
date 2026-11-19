# Quickstart: Brainstorm Analyze Mode

**Spec Number**: 156 (implements SCOPE-156)

## Setup

- Review [spec.md](spec.md) (FR-001 – FR-015, SC-1 – SC-7), [plan.md](plan.md) (phase order),
  [tasks.md](tasks.md) (T001 – T021) and [tests.md](tests.md) (28 cases).
- No database, route or UI change. Nothing here needs manual DDL or a deploy step of its own.
- The two served analyzer prompts (wxUIUXCodeReview, wxConversionParity) live in
  `mcp-server/src/prompts/` and go live only when Andy pushes (the hosted MCP auto-deploys on main).

## Development

- Work tasks in the release order given in [plan.md](plan.md), starting with the findings helper
  (T008) and its tests (T019).
- Fence every top-level unit `[SCOPE 156 / Tnnn]`, written by the orchestrator (`implement`) only.
- The helper is plain Node with no dependencies, so it runs in any consumer repo.
- Analyze is read-only on the analyzed app: it writes only `docs/brainstorms/analyze/` there.
- Never run git, push or publish; T018 is a sync dry-run only.

## Trying it

- In an app repo: `/wxBrainstorm --analyze` (add `--conversion` for a conversion, `--dir <folder>`
  for another repo). Approve the feature groups, then the analyzer plan.
- Review each finding: keep, explain, not needed, or discuss. Confirm the report and data file in
  `docs/brainstorms/analyze/`.
- Fix one finding and run again: confirm it shows as fixed and declined items stay quiet.
- In wxKanban: `/wxBrainstorm --analyze --cross-app --dir <app>,<app>` on two analyzed apps.
- Pause mid-review and run `/wxBrainstorm --resume`: the review continues without re-running analyzers.
