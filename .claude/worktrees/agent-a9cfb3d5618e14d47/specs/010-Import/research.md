# Research: Scope Import — bd CLI Capabilities

**Feature**: Spec 010 — Scope Import
**Date**: 2026-02-21
**Purpose**: Verify bd CLI commands needed for scope-import implementation

---

## Finding 1: bd create — Supported Flags

**Decision**: Use `bd create` with these flags for task issue creation:

```bash
bd create \
  --title "[NNN-T001] description (80 chars)" \
  --type task \
  --priority 2 \
  --labels "spec-NNN,human-task" \
  --parent <parent-issue-id> \
  --status closed          # only for [x] tasks
```

**Verified flags**:
| Flag | Verified | Notes |
|------|----------|-------|
| `--title` | ✅ | Positional or flag |
| `--type task\|feature` | ✅ | Valid type values |
| `--priority 0-4` | ✅ | Default "2" |
| `--labels <csv>` | ✅ | Comma-separated, set at creation |
| `--parent <id>` | ✅ | Creates hierarchical child |
| `--status <value>` | ✅ | See valid values below |
| `--silent` | ✅ | Outputs only the issue ID (scripting) |
| `--description` | ✅ | Optional |

**Valid status values** (verified from `bd list --help`):
`open`, `in_progress`, `blocked`, `deferred`, `closed`

⚠️ **`done` is NOT a valid status** — the initial command draft used `--status=done`, corrected to `--status closed`.

---

## Finding 2: bd create --parent Creates Hierarchical Children

**Decision**: Use `--parent <spec-issue-id>` for all task issues.

Verified: `bd create --parent <id>` creates a true hierarchical parent-child relationship visible in:
- `bd list --tree` (shows children indented under parent)
- `bd show <parent-id>` (lists children)
- `bd list --label spec-NNN` (includes both parent and children)

**Rationale**: Cleaner than `bd dep add` for the spec-to-task relationship. Dependencies (`bd dep add`) reserved for task-to-task ordering.

---

## Finding 3: bd dep add Semantics

**Decision**: `bd dep add <child-id> <parent-id>` — child depends on parent (parent must complete first).

The equivalent `bd dep <blocker-id> --blocks <blocked-id>` syntax also works.

**Already-exists behavior**: Returns an error if the dependency already exists. Handle silently (skip the call, count as "skipped").

**Circular dependency**: `bd dep cycles` command available to check for cycles. Add cycle check before wiring if needed.

---

## Finding 4: Idempotency — Title-Based Dedup

**Decision**: Use `bd list --title "[NNN-TXXX]"` substring search to detect existing issues before creating.

```bash
bd list --title "[009-T001]"   # returns matching issues
```

If result is non-empty: skip creation, log as "skipped".

**Alternative considered**: Label-based search (`bd list --label spec-NNN`) — less precise because two tasks could share a description.

---

## Finding 5: bd label add — Post-Creation vs At-Creation

**Decision**: Use `--labels` at creation time. No separate `bd label add` calls needed.

`bd label add <id> <label>` is available but requires a separate command per label per issue. With potentially 627 issues, this doubles the bd API call count.

`bd create --labels "spec-009,human-task"` (comma-separated) achieves the same in one call.

---

## Finding 6: Spec Number Suffix Conflict (005)

**Finding**: Two directories share the `005` prefix:
- `005-specs-004-landingpage`
- `005-Time-and-Billing`

**Resolution** (user decision — Phase 2 Q2): Auto-assign alphabetical suffixes.
- `005-specs-004-landingpage` (alphabetically first) → label `spec-005a`
- `005-Time-and-Billing` (alphabetically second) → label `spec-005b`

**Implementation**: Sort conflicting dirs alphabetically, append `a`, `b`, `c`... to the NNN in the label. Apply consistently to parent and all task issues.

---

## Finding 7: tasks.md Format Variation — Case-Insensitive [X] vs [x]

**Finding**: Different spec `tasks.md` files use different checkbox formats:
- `- [X]` (uppercase) — used by specs 006, 008 (100% complete)
- `- [x]` (lowercase) — used by specs 002, 003, 009
- `- [ ]` (open) — used by all specs

**Decision**: All checkbox parsing must be case-insensitive. Use `grep -i` or equivalent pattern matching `- \[[ xX]\]`.

---

## Alternatives Considered

| Approach | Rejected Because |
|----------|-----------------|
| bash script for import | Needs 627+ bd API calls with error handling; poor adaptation to format variations |
| Node.js CLI tool | Requires maintenance, packaging, TypeScript, adds to codebase |
| bd file-based import (`--file`) | `bd create --file` creates issues from a markdown file, but the format requirements and idempotency logic are complex to pre-generate |
| GitHub Actions workflow | Over-engineered for a dev tool command |
