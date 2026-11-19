# Tests: Cockpit Commits To Push (Spec 091)

Mostly manual/integration in the Extension Development Host, since the surface is a VS Code TreeView over local git. Where practical, `checkGitStatus()` is unit-tested against a temp git repo.

## TC-01 — Count + list (FR-001, FR-002)
Given a repo with 3 commits ahead of `@{u}`, when the Cockpit loads, then a "Git — 3 commits to push" section appears and expands to the 3 commit subjects, newest first.

## TC-02 — Cap at 10 (FR-002)
Given 25 unpushed commits, when the section expands, then it shows the 10 newest subjects followed by a "…and 15 more" row.

## TC-03 — Silent at zero (FR-002)
Given a branch even with its upstream, when the Cockpit loads, then no Git section is rendered (no empty/zero row).

## TC-04 — Non-git / no-upstream / git-missing (FR-001, FR-005)
Given a workspace that is not a git repo, or has no upstream, or where git is unavailable, when the Cockpit loads, then no Git section appears, no error is surfaced, and the rest of the tree renders normally.

## TC-05 — Refresh on commit/push (FR-004)
Given the Cockpit is open, when the developer commits, then the next poll shows the incremented count; when the developer pushes successfully, then the next poll removes the section.

## TC-06 — Read-only (FR-003)
The section and its items expose no command that performs a git write/push; hovering shows the tooltip stating these commits build/deploy only after a push to main.

## TC-07 — Non-blocking (FR-005)
Given git is slow/hanging, when the Cockpit loads, then the tree still renders (section absent) with no perceptible stall.

## TC-08 — Unfinished scopes grouped (FR-006)
Given 3 scopes with remaining work, when the Cockpit loads, then a collapsed "3 Scopes unfinished" header appears; expanding it shows the 3 scope rows (active first), each with its tasks/checkout/decorations behaving as before. Given 0 scopes with remaining work, then no header appears and the "All caught up" message shows instead.
