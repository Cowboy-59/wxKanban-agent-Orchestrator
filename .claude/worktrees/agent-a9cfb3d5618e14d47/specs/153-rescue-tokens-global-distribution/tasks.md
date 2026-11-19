# Task Breakdown: Rescue-Tokens Global Distribution

**Feature**: Rescue-Tokens Global Distribution
**Spec**: 153
**Date Generated**: 2026-11-05
**Spec**: [spec.md](spec.md) | **Plan**: [plan.md](plan.md)

---

## Tasks

| # | Task | Priority | Status |
|---|------|----------|--------|
| 1 | T001 — Mirror rescue-tokens skill into kit trees | high | done |
| 2 | T002 — Build install-rescue-tokens.mjs installer | high | done |
| 3 | T003 — Skill file placement logic (install mode) | high | done |
| 4 | T004 — SessionStart hook wiring | high | done |
| 5 | T005 — Never shadow an existing rescue-tokens hook | medium | done |
| 6 | T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs | high | done |
| 7 | T007 — Uninstall path | medium | done |
| 8 | T008 — CLAUDE.md precedence bullet | medium | done |

## Task Details

### T001 — T001 — Mirror rescue-tokens skill into kit trees

Copy SKILL.md + README.md from E:/AI_Development/AI_Foundation/Claude-Skills/skills/rescue-tokens into .claude/skills/rescue-tokens/, _wxAI/skills/rescue-tokens/, and wxkanban-agent/templates/skills/rescue-tokens/, byte-identical across all three. Verify with check-skill-mirrors.mts that drift is 0 for rescue-tokens. Implements FR-001.

### T002 — T002 — Build install-rescue-tokens.mjs installer

Create _wxAI/kit/install-rescue-tokens.mjs modeled on _wxAI/kit/install-session-defaults.mjs: atomic tmp+rename writes, homedir()-based cross-platform paths, install (default) / --check / --uninstall modes, --root override, main-guard pattern. Never silent — every run prints what happened. Implements FR-002.

### T003 — T003 — Skill file placement logic (install mode)

In install-rescue-tokens.mjs, copy SKILL.md + README.md into ~/.claude/skills/rescue-tokens/ only when absent or differing from the kit's shipped copy; never silently overwrite a user-modified local copy — report the difference instead. Implements FR-003.

### T004 — T004 — SessionStart hook wiring

In install-rescue-tokens.mjs, add one named SessionStart hook entry (matcher startup|resume) to ~/.claude/settings.json pointing at the rescue-tokens skill, mirroring the shape of the existing 'standing' skill hook entry. Must never alter, reorder, or remove any other existing hook entry. Implements FR-004.

### T005 — T005 — Never shadow an existing rescue-tokens hook

In install-rescue-tokens.mjs, detect any pre-existing rescue-tokens-named hook entry in ~/.claude/settings.json (any wording) via an alreadyChosen()-style check, leave it untouched, and report 'kept' with the reason. Implements FR-005.

### T006 — T006 — Wire installer into kit-configure.ts and upgrade-kit.mjs

Add setUpRescueTokens() and call it from kit-configure.ts and scripts/upgrade-kit.mjs alongside the existing setUpSessionDefaults() call, via spawnSync with a timeout, best-effort and never fatal to the surrounding command. Add a --no-rescue-tokens opt-out flag that skips the installer and is reported as skipped. Implements FR-006.

### T007 — T007 — Uninstall path

In install-rescue-tokens.mjs, implement --uninstall to remove only the hook entry and skill files this installer itself added, tracked by a marker/label, leaving any user-authored rescue-tokens customization untouched. Verify with a before/after diff. Implements FR-007.

### T008 — T008 — CLAUDE.md precedence bullet

Add a bullet to CLAUDE.md's AI Behavior (MANDATORY) section stating rescue-tokens is active globally and that its act-first red-flag responses take precedence over the SCOPE-093 token-advisor's suggest-and-decide protocol whenever both would otherwise fire on the same trigger, explicitly naming SCOPE-093. Implements FR-008.
