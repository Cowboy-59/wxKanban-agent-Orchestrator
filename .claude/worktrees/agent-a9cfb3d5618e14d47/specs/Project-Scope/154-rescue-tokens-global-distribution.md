# Scope 154: Rescue-Tokens Global Distribution

**Scope Number**: 154
**Status**: `draft`
**Created**: 2026-11-05
**Depends On**: None
**Source**: `specs/Project-Scope/154-rescue-tokens-global-distribution.md`

## Overview
Ship the rescue-tokens skill (from E:/AI_Development/AI_Foundation/Claude-Skills/skills/rescue-tokens) with the wxKanban kit: distribute it to every kit consumer's global ~/.claude/skills/rescue-tokens via a new idempotent installer (modeled on _wxAI/kit/install-session-defaults.mjs), wire that installer into kit-configure.ts and upgrade-kit.mjs the same way install-session-defaults.mjs is wired, mirror the skill into .claude/skills/, _wxAI/skills/, and wxkanban-agent/templates/skills/ (per check-skill-mirrors.mts parity), add a SessionStart hook entry to the consumer's global ~/.claude/settings.json (matcher startup resume, modeled on the existing 'standing' skill hook) so it's active every session, and reference it in CLAUDE.md's AI Behavior section noting it overrides the SCOPE-093 token-advisor's suggest-and-decide protocol whenever rescue-tokens' own red-flags fire. gives wxKanban a clearly defined business workflow with accountable outcomes. Token/rate-limit emergencies get no immediate, act-first response unless a developer has manually installed the externally-authored rescue-tokens skill on each machine. The kit already ships skills to every consumer PROJECT via kit-sync (SCOPE-019) and advises on token waste via the suggest-and-decide SCOPE-093 advisor, but neither reaches the developer's own machine as an always-on, act-first safety net. This scope covers Add rescue-tokens SKILL.md + README.md to the kit's mirrored skill trees. Build a new idempotent installer with install/--check/--uninstall modes that places the skill in ~/.claude/skills/rescue-tokens and adds one named SessionStart hook entry to ~/.claude/settings.json. Wire the installer into kit-configure.ts and upgrade-kit.mjs alongside the existing setUpSessionDefaults() call, with its own --no-rescue-tokens opt-out. Add a CLAUDE.md AI Behavior bullet documenting the precedence over SCOPE-093. Rewriting or removing the SCOPE-093 token-advisor rule itself; building code that forcibly enforces rescue-tokens' actions (model switching, sub-agent refusal, forced /clear) — it remains prose guidance; building a new project-level distribution mechanism (SCOPE-019 kit-sync already covers that once the file exists in .claude/skills); editing rescue-tokens' own content/rules (SKILL.md/README.md are copied verbatim from the source skill).

### Core Design

| Element | Value |
| --- | --- |
| **Primary Actor** | Developer/consultant running Claude Code with the wxKanban kit installed |
| **Secondary Actors** | Every kit consumer (any machine running wxkanban-agent kit:configure or upgrade-kit) |
| **Key Value** | Token/rate-limit emergencies get no immediate, act-first response unless a developer has manually installed the externally-authored rescue-tokens skill on each machine. The kit already ships skills to every consumer PROJECT via kit-sync (SCOPE-019) and advises on token waste via the suggest-and-decide SCOPE-093 advisor, but neither reaches the developer's own machine as an always-on, act-first safety net. |
| **Scope Boundary** | Add rescue-tokens SKILL.md + README.md to the kit's mirrored skill trees. Build a new idempotent installer with install/--check/--uninstall modes that places the skill in ~/.claude/skills/rescue-tokens and adds one named SessionStart hook entry to ~/.claude/settings.json. Wire the installer into kit-configure.ts and upgrade-kit.mjs alongside the existing setUpSessionDefaults() call, with its own --no-rescue-tokens opt-out. Add a CLAUDE.md AI Behavior bullet documenting the precedence over SCOPE-093. Rewriting or removing the SCOPE-093 token-advisor rule itself; building code that forcibly enforces rescue-tokens' actions (model switching, sub-agent refusal, forced /clear) — it remains prose guidance; building a new project-level distribution mechanism (SCOPE-019 kit-sync already covers that once the file exists in .claude/skills); editing rescue-tokens' own content/rules (SKILL.md/README.md are copied verbatim from the source skill). |


## User Scenarios & Testing

### US1 — Fresh machine, kit configure

**Actor**: Developer running kit:configure on a machine with no prior rescue-tokens setup

**Scenario**:
1. Developer runs kit:configure (or upgrade-kit) on a machine that has never seen rescue-tokens
2. The new installer checks ~/.claude/skills/rescue-tokens — absent
3. Installer copies SKILL.md + README.md there
4. Installer checks ~/.claude/settings.json SessionStart hooks for a rescue-tokens entry — absent
5. Installer adds it (matcher startup|resume, mirroring the 'standing' hook)

**Expected outcome**: The next Claude Code session on that machine has rescue-tokens installed and hooked, with zero manual steps.

### US2 — Already installed, re-run is a no-op

**Actor**: Developer re-running kit:configure on a machine where rescue-tokens is already installed and hooked identically

**Scenario**:
1. Developer re-runs kit:configure
2. Installer finds the skill files already present and identical
3. Installer finds the hook entry already present

**Expected outcome**: Installer reports 'already installed'/'kept' for both the skill files and the hook entry, touching nothing — the same idempotent contract as install-session-defaults.mjs.

### US3 — Pre-existing custom settings.json

**Actor**: Developer whose ~/.claude/settings.json already has other SessionStart hooks or a hand-edited rescue-tokens hook with different wording

**Scenario**:
1. Developer runs kit:configure on a machine with N pre-existing SessionStart hook entries (possibly including a hand-written rescue-tokens-named one)
2. Installer adds only its own named hook entry alongside the existing ones
3. If a rescue-tokens-named entry already exists with different wording, installer leaves it alone

**Expected outcome**: The original N entries are never altered, reordered, or removed; an existing rescue-tokens entry (any wording) is left alone and reported as 'kept', not overwritten.

### US4 — Uninstall

**Actor**: Developer who wants to remove rescue-tokens from a machine

**Scenario**:
1. Developer runs the installer with --uninstall
2. Installer removes only the hook entry and skill files it itself added, tracked by a marker/label
3. Installer leaves any user-authored rescue-tokens customization untouched

**Expected outcome**: A before/after diff shows exactly what install added is now removed, and nothing else in ~/.claude/settings.json or ~/.claude/skills changed.

## Functional Requirements

### FR-001 — Skill in kit trees

rescue-tokens SKILL.md + README.md are added to .claude/skills/, _wxAI/skills/, and wxkanban-agent/templates/skills/, byte-identical across trees per check-skill-mirrors.mts, inheriting SCOPE-019 kit-sync for free project-level distribution.

**Acceptance Criteria**:
- [ ] check-skill-mirrors.mts reports 0 drift for rescue-tokens across all three trees
- [ ] No new project-level distribution code is written — existing kit-sync carries the file to every consumer project

### FR-002 — Global installer script

A new _wxAI/kit/install-rescue-tokens.mjs, modeled on install-session-defaults.mjs, supports install (default), --check, and --uninstall modes. It is idempotent, writes only what it owns, and prints what it did on every run — never silent.

**Acceptance Criteria**:
- [ ] Running install twice produces 0 changes on the second run and reports 'already installed'
- [ ] --check reports current state and exits non-zero only when action is needed
- [ ] Every run (install/check/uninstall) prints a human-readable summary of what happened

### FR-003 — Skill file placement

Install mode copies SKILL.md + README.md into ~/.claude/skills/rescue-tokens/ only if absent or different from the kit's shipped copy; it never silently overwrites a user-modified local copy.

**Acceptance Criteria**:
- [ ] On an absent target, the files are copied and the run reports 'installed'
- [ ] On a target that differs from the kit's shipped copy, the installer reports the difference instead of silently overwriting

### FR-004 — SessionStart hook wiring

Install mode adds one named SessionStart hook entry (matcher startup|resume) to ~/.claude/settings.json pointing at the rescue-tokens skill, mirroring the shape of the existing 'standing' hook entry. It never touches any other existing hook entry.

**Acceptance Criteria**:
- [ ] A settings.json with N pre-existing SessionStart hook entries ends with N+1 entries after install (or N if already present)
- [ ] None of the original N entries are altered, reordered, or removed
- [ ] The hook's matcher and command shape mirror the 'standing' skill's existing hook

### FR-005 — Never shadow an existing choice

If a rescue-tokens-named hook entry already exists in ~/.claude/settings.json (any wording), the installer leaves it alone and reports 'kept' — the same discipline as install-session-defaults.mjs's alreadyChosen() check.

**Acceptance Criteria**:
- [ ] A hand-authored rescue-tokens hook entry with different wording is detected and left untouched
- [ ] The run report explicitly states 'kept' with the reason

### FR-006 — Kit wiring into configure/upgrade

A setUpRescueTokens() function is called from kit-configure.ts and upgrade-kit.mjs alongside the existing setUpSessionDefaults() call. It is best-effort and never fatal to the surrounding command, and respects a new --no-rescue-tokens opt-out flag.

**Acceptance Criteria**:
- [ ] kit:configure and upgrade-kit both invoke the installer without requiring a separate manual step
- [ ] A failure in the installer (e.g. unwritable home directory) is reported but does not fail the surrounding kit-configure/upgrade-kit run
- [ ] --no-rescue-tokens skips the installer entirely and is reported as skipped

### FR-007 — Uninstall path

--uninstall removes only the hook entry and skill files this installer itself added (tracked by a marker/label), never a user's own hand-added rescue-tokens setup.

**Acceptance Criteria**:
- [ ] After --uninstall, a before/after diff shows only the installer-added hook entry and skill files removed
- [ ] A user-authored rescue-tokens hook entry or modified skill file (detected as different from the kit's shipped copy) is never removed by --uninstall

### FR-008 — CLAUDE.md precedence note

CLAUDE.md's AI Behavior section gets a bullet stating rescue-tokens is active globally and that its act-first red-flag responses take precedence over the SCOPE-093 token-advisor's suggest-and-decide protocol whenever both would otherwise fire on the same trigger.

**Acceptance Criteria**:
- [ ] The bullet is present in CLAUDE.md's AI Behavior (MANDATORY) section
- [ ] The bullet explicitly names SCOPE-093 and states the precedence direction

## Data Requirements

None — no database tables, no projectdocuments doctype, no DB writes anywhere in this scope.

## API Routes

None — purely local filesystem and Claude Code settings.json edits, no HTTP surface.

## Frontend Components

None — no Cockpit/Admin UI.

## Success Criteria

1. Fresh-machine install: one kit:configure (or upgrade-kit) run on a machine with no prior rescue-tokens setup leaves ~/.claude/skills/rescue-tokens/ populated and exactly one rescue-tokens SessionStart hook entry in ~/.claude/settings.json, with 0 manual steps.
2. Idempotency: running the installer twice in a row produces 0 file/hook changes on the second run; both report already installed/kept.
3. Non-destructive: an installer run on a settings.json with N pre-existing SessionStart hook entries ends with N+1 entries (or N if already present) with 0 of the original N altered, reordered, or removed.
4. Clean uninstall: --uninstall removes exactly what install added and leaves any user-authored rescue-tokens customization untouched, verified by a before/after diff.
5. Kit-sync parity: check-skill-mirrors.mts reports 0 drift for rescue-tokens across .claude/skills, _wxAI/skills, and wxkanban-agent/templates/skills.

## Key Entities

None — no new domain entity; the installer manipulates existing settings.json/skills files only.

## Constraints

- MUST deliver only the behavior described within the scope boundary: Add rescue-tokens SKILL.md + README.md to the kit's mirrored skill trees. Build a new idempotent installer with install/--check/--uninstall modes that places the skill in ~/.claude/skills/rescue-tokens and adds one named SessionStart hook entry to ~/.claude/settings.json. Wire the installer into kit-configure.ts and upgrade-kit.mjs alongside the existing setUpSessionDefaults() call, with its own --no-rescue-tokens opt-out. Add a CLAUDE.md AI Behavior bullet documenting the precedence over SCOPE-093.
- MUST keep the following work out of scope for this iteration: Rewriting or removing the SCOPE-093 token-advisor rule itself; building code that forcibly enforces rescue-tokens' actions (model switching, sub-agent refusal, forced /clear) — it remains prose guidance; building a new project-level distribution mechanism (SCOPE-019 kit-sync already covers that once the file exists in .claude/skills); editing rescue-tokens' own content/rules (SKILL.md/README.md are copied verbatim from the source skill).
- MUST preserve guided, reviewable workflow decisions instead of relying on undocumented implementation assumptions.
- MUST keep user-visible outcomes aligned with the measurable success criteria defined in this scope.

## Notes

- Integration context: Mirrors the existing install-session-defaults.mjs pattern (SPEC-143 FR-020) for idempotent, never-silent, never-shadow-an-existing-choice installer behavior, and the existing 'standing' skill's SessionStart hook shape (matcher startup resume) already hand-configured in the user's global ~/.claude/settings.json. Must coexist with check-skill-mirrors.mts parity checking across .claude/skills and _wxAI/skills. Source material: SKILL.md + README.md copied verbatim from E:/AI_Development/AI_Foundation/Claude-Skills/skills/rescue-tokens.
- Constraints and risks: This installer targets the GLOBAL ~/.claude/settings.json and ~/.claude/skills — a different, new target from install-session-defaults.mjs, which only ever touches the project's .claude/settings.json; the two must not be conflated. Intentional governance contradiction, accepted not resolved: rescue-tokens' act-first behavior overrides SCOPE-093's suggest-and-decide advisor on conflict, per explicit product decision — CLAUDE.md documents this as a deliberate precedence rule, not an oversight. Cross-platform: homedir()-based paths (Windows + POSIX), same as install-session-defaults.mjs.
- Customer-visible or operator-visible history should be limited to outcomes that materially affect workflow review and support.

## Clarifications

### Session 2026-11-05

| # | Question | Decision |
|---|----------|----------|
| 1 | What business problem does this solve? | Token/rate-limit emergencies get no immediate, act-first response unless a developer has manually installed the externally-authored rescue-tokens skill on each machine. The kit already ships skills to every consumer PROJECT via kit-sync (SCOPE-019) and advises on token waste via the suggest-and-decide SCOPE-093 advisor, but neither reaches the developer's own machine as an always-on, act-first safety net. |
| 2 | Who are the primary and secondary actors? | Primary actor: Developer/consultant running Claude Code with the wxKanban kit installed. Secondary actors: Every kit consumer (any machine running wxkanban-agent kit:configure or upgrade-kit). |
| 3 | What is in scope? | Add rescue-tokens SKILL.md + README.md to the kit's mirrored skill trees. Build a new idempotent installer with install/--check/--uninstall modes that places the skill in ~/.claude/skills/rescue-tokens and adds one named SessionStart hook entry to ~/.claude/settings.json. Wire the installer into kit-configure.ts and upgrade-kit.mjs alongside the existing setUpSessionDefaults() call, with its own --no-rescue-tokens opt-out. Add a CLAUDE.md AI Behavior bullet documenting the precedence over SCOPE-093. |
| 4 | What is out of scope? | Rewriting or removing the SCOPE-093 token-advisor rule itself; building code that forcibly enforces rescue-tokens' actions (model switching, sub-agent refusal, forced /clear) — it remains prose guidance; building a new project-level distribution mechanism (SCOPE-019 kit-sync already covers that once the file exists in .claude/skills); editing rescue-tokens' own content/rules (SKILL.md/README.md are copied verbatim from the source skill). |
| 5 | How is success measured? | Fresh-machine install: one kit:configure (or upgrade-kit) run on a machine with no prior rescue-tokens setup leaves ~/.claude/skills/rescue-tokens/ populated and exactly one rescue-tokens SessionStart hook entry in ~/.claude/settings.json, with 0 manual steps. Idempotency: running the installer twice in a row produces 0 file/hook changes on the second run; both report already installed/kept. Non-destructive: an installer run on a settings.json with N pre-existing SessionStart hook entries ends with N+1 entries (or N if already present) with 0 of the original N altered, reordered, or removed. Clean uninstall: --uninstall removes exactly what install added and leaves any user-authored rescue-tokens customization untouched, verified by a before/after diff. Kit-sync parity: check-skill-mirrors.mts reports 0 drift for rescue-tokens across .claude/skills, _wxAI/skills, and wxkanban-agent/templates/skills. |
| 6 | What existing workflow must this align with? | Mirrors the existing install-session-defaults.mjs pattern (SPEC-143 FR-020) for idempotent, never-silent, never-shadow-an-existing-choice installer behavior, and the existing 'standing' skill's SessionStart hook shape (matcher startup resume) already hand-configured in the user's global ~/.claude/settings.json. Must coexist with check-skill-mirrors.mts parity checking across .claude/skills and _wxAI/skills. Source material: SKILL.md + README.md copied verbatim from E:/AI_Development/AI_Foundation/Claude-Skills/skills/rescue-tokens. |
| 7 | What constraints or risks matter right now? | This installer targets the GLOBAL ~/.claude/settings.json and ~/.claude/skills — a different, new target from install-session-defaults.mjs, which only ever touches the project's .claude/settings.json; the two must not be conflated. Intentional governance contradiction, accepted not resolved: rescue-tokens' act-first behavior overrides SCOPE-093's suggest-and-decide advisor on conflict, per explicit product decision — CLAUDE.md documents this as a deliberate precedence rule, not an oversight. Cross-platform: homedir()-based paths (Windows + POSIX), same as install-session-defaults.mjs. |
