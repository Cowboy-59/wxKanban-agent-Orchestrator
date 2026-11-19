# Requirements Checklist: Cockpit Commits To Push (Spec 091)

## Functional Requirements
- [ ] FR-001 — `checkGitStatus()` computes unpushed commits (ahead of `@{u}`) locally; empty result + no error on non-git / no-upstream / git-missing. (T001)
- [ ] FR-002 — "Git — N commits to push" collapsible section; subjects newest-first, capped at 10 with "…and N more"; omitted at 0. (T002)
- [ ] FR-003 — Read-only: no push/commit/stage action; tooltip states push→deploy-on-main. (T002)
- [ ] FR-004 — Refreshes on the existing poll cycle; count updates on commit, section disappears on push. (T003)
- [ ] FR-005 — Cheap + non-blocking; hanging git degrades to "no section", tree still renders. (T001)
- [ ] FR-006 — Unfinished scopes grouped under a collapsed "<nn> Scopes unfinished" header; 0 → "All caught up"; expanded rows behave as before. (T005)

## Success Metrics
- [ ] Visibility: section appears + count matches `git rev-list --count @{u}..HEAD` in git-repo/upstream workspaces.
- [ ] No noise: 0 rows at 0 unpushed; absent in non-git / no-upstream workspaces.
- [ ] Non-blocking: no perceptible delay; hang → no section.

## Guardrails / Release
- [ ] Local only — no hosted-MCP call.
- [ ] Extension typecheck/build clean; `auditfences` clean for touched files.
- [ ] COCKPIT bump + VSIX rebuild + `vsce publish` (release task T004) — only after verify + user approval.
- [ ] Nothing pushed/published until the user says so.
