# Agent Instructions

## Available Agents

### Scope Builder Agent
**Command**: `/BuildScope <description>`

Creates well-structured Scope of Project markdown files following wxKanban patterns.

**Usage**:
```bash
/BuildScope "Time tracking and billing system for consultants"
/BuildScope --quick "Audit management system"
/BuildScope --edit 005 "Add minimum billing time requirements"
```

**Features**:
- Interactive scope creation workflow
- Auto-generates spec numbers (NNN format)
- Creates proper directory structure
- Generates quality checklist
- Integrates with wxAI pipeline

**Output**: `specs/Project-Scope/NNN-scope-name.md`

---

### Scope Validator Agent
**Command**: `/scope-validate <spec-number|path>`

Validates scope documents against wxKanban quality criteria.

**Usage**:
```bash
/scope-validate 018              # Validate single scope
/scope-validate --all             # Validate all scopes
/scope-validate 005 --fix         # Validate and auto-fix
/scope-validate --all --report    # Generate validation report
```

**Checks**:
- Structure & completeness (required sections)
- Content quality (no implementation details, testable requirements)
- Formatting & standards (FR numbering, markdown tables)
- Pipeline readiness (no clarification markers, breakdown ready)

**Output**: Quality score (A+ to F) with specific recommendations

---

## Session Completion

When ending a work session:

1. **Run quality gates** (if code changed) — tests, linters, builds.
2. **Commit** finished work locally with clear messages.
3. **Hand off** — summarize what changed, what remains, and any follow-ups.

**Do NOT push or deploy on your own.** Commits accrue locally; a push to `main` deploys
to production (App Runner). Never `git push` (or run any git operation) unless the user
explicitly asks in the current message. See `_wxAI/rules/git.md`.
