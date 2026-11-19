# Project-Specific Rules

<!--
WHAT BELONGS HERE: Project-specific enforcement rules (MUST/NEVER/FORBIDDEN).
WHAT DOESN'T: General documentation (goes in README), implementation tips (goes in dev-guidelines).
Rule of thumb: If it's enforcement for THIS project only, it's here.
-->

Rules specific to this project. Customize for your stack, patterns, and requirements.

See README.md for project documentation/context.

## I. Critical Documentation

<!-- List project-specific documentation that MUST be consulted -->

| Task                      | Reference Document                         |
| ------------------------- | ------------------------------------------ |
| Example: Server functions | `project-documentation/server-patterns.md` |
| Example: Authentication   | `project-documentation/auth-guide.md`      |

## II. Schema/Database Patterns

<!-- ORM-specific patterns for your project -->

| Requirement        | Rule                                  |
| ------------------ | ------------------------------------- |
| Schema location    | `src/db/schema/`                      |
| Migration workflow | Example: `db:generate` → `db:migrate` |
| Type inference     | Example: Use ORM's built-in inference |

## III. File Organization Rules

<!-- Project structure enforcement -->

| Rule             | Enforcement                    |
| ---------------- | ------------------------------ |
| Routes folder    | Only route exports             |
| Components       | In `src/components/{feature}/` |
| Server functions | In `src/lib/serverFunctions/`  |

## IV. UI Patterns

<!-- Reference to project style guides -->

| Rule              | Reference                              |
| ----------------- | -------------------------------------- |
| Primary patterns  | `project-documentation/ui-patterns.md` |
| Component library | Example: shadcn/ui                     |

## V. Testing Rules

<!-- Project testing approach -->

| Rule         | Details                   |
| ------------ | ------------------------- |
| Test type    | Example: Integration only |
| Test command | Example: `npm test`       |

## VI. Development Server

<!-- Dev server rules if AI shouldn't control it -->

| Rule         | Details                 |
| ------------ | ----------------------- |
| Port         | Example: 3000           |
| Check first  | `lsof -i :3000`         |
| Log location | Example: `logs/dev.log` |

## VII. Related Projects

<!-- If this project has sibling projects -->

Delete this section if not applicable.

| Project                | Purpose     |
| ---------------------- | ----------- |
| Example: `api-service` | Backend API |

## VIII. MANDATORY: wxAI Pipeline Database Insertion

**⚠️ CRITICAL RULE - AI MUST NOT VIOLATE**

### The Rule
**NO IMPLEMENTATION WITHOUT DATABASE INSERTION.** The AI MUST NOT write code, modify files, or begin implementation work until the specification, tasks, and all documents are inserted into the wxKanban PostgreSQL database.

### What This Means
| Action | Allowed? | Verification Required |
|--------|----------|----------------------|
| Write code files | ❌ NO | Database verification |
| Modify existing code | ❌ NO | Database verification |
| Create new components | ❌ NO | Database verification |
| Run migrations | ❌ NO | Database verification |
| Generate tests | ❌ NO | Database verification |
| Read/analyze files | ✅ YES | None |
| Verify database status | ✅ YES | None |
| Run database queries | ✅ YES | None |

### Before ANY Implementation, AI MUST:

1. **Check database for spec**:
   ```sql
   SELECT specnumber, status FROM specs WHERE specnumber = '<NNN>';
   ```

2. **Verify tasks exist**:
   ```sql
   SELECT COUNT(*) FROM tasks WHERE spec_number = '<NNN>';
   -- Must return > 0
   ```

3. **Verify documents exist**:
   ```sql
   SELECT COUNT(*) FROM projectdocuments WHERE specnumber = '<NNN>';
   -- Must return >= 4
   ```

4. **Confirm spec status**:
   - Valid statuses: `tasks_generated`, `in_progress`, `ready_for_implementation`
   - Invalid: `specified`, `planned` (pipeline incomplete)

### If Database Check Fails, AI MUST:

1. **STOP immediately** - Do not proceed with any implementation
2. **Report the failure** with specific missing items
3. **Direct user to complete Phase 4.5** (Task Push):
   ```
   Required: Run wxk_scope_import and wxk_doc_import for spec <NNN>
   Reference: _wxAI/commands/wxAI-pipeline-mandatory-database.md
   ```
4. **Offer to help** with database insertion if MCP tools are available

### Error Message Template (Use Exactly)
```
⛔ IMPLEMENTATION BLOCKED - DATABASE VERIFICATION FAILED

I cannot proceed with implementation because the specification is not 
properly inserted in the wxKanban database.

Missing: <spec/tasks/documents>

Required Actions:
1. Complete wxAI pipeline Phase 4.5 (Task Push)
2. Run: wxk_scope_import --spec <NNN> --dry-run false
3. Run: wxk_doc_import --spec <NNN> --dry-run false
4. Re-verify database status
5. Retry implementation

Reference: _wxAI/commands/wxAI-pipeline-mandatory-database.md
```

### Emergency Override (Document Only)
If user explicitly requests override with `--force --reason`:
- Log the override reason
- Document in audit trail
- Proceed with caution

### Reference Documents
| Document | Purpose |
|----------|---------|
| `_wxAI/commands/wxAI-pipeline-mandatory-database.md` | Full requirements |
| `_wxAI/commands/wxAI-implement-gate.md` | Implementation blocking rules |
| `_wxAI/commands/ENFORCEMENT_SUMMARY.md` | All enforcement locations |

### AI Self-Check Before Writing Code
Before creating or modifying ANY file, ask:
1. "Is the spec in the database?" → Must be YES
2. "Are tasks imported?" → Must be YES
3. "Are documents imported?" → Must be YES
4. "Is spec status valid?" → Must be YES

**If ANY answer is NO → STOP and report to user**

---

## IX. AI Governance Rules (Spec 015)

> **Source**: `specs/Project-Scope/015-AiInteraction.md`
> **Enforcement**: These rules apply to ALL AI providers (Claude, Gemini, Mistral, Blackbox, OpenAI, Kimi, Minimax, Grok)

### The Scope-First Rule (HARD BLOCK)

**No AI assistant may create or modify code without a verified scope in the wxKanban database.**

This is a HARD BLOCK — not a warning. The AI MUST:

1. Run `wxai scope-check` before any implementation
2. If no scope found → search existing scopes for a match
3. If no match → offer to run `wxai training --new-scope`
4. If user provides `--force --reason` → log override and proceed
5. NEVER silently bypass the scope check

### TODO File Rules

When creating ANY TODO file, the AI MUST:

1. Add scope reference header immediately:
   ```markdown
   <!-- wxKanban Scope: <NNN> — <Title> | DB: verified | Created: <date> -->
   ```
2. Map each item to an existing task or create a new task via `wxk_scope_import`
3. Add task IDs as inline comments: `<!-- T<NNN> -->`
4. Notify the developer that items are tracked in the database

For existing unlinked TODO files: run `wxai todo-import`

### Document Protection Rules

**In consumer projects** (no `.wxkanban-origin` file), these files are READ-ONLY:

```
_wxAI/rules/constitution.md
_wxAI/rules/projectrules.md
_wxAI/commands/wxAI-implement.md
_wxAI/commands/wxAI-scope-check.md
_wxAI/commands/wxAI-training.md
_wxAI/commands/wxAI-todo-import.md
_wxAI/commands/wxAI-sync-global.md
_wxAI/commands/wxAI-session-start.md
.wxkanban-version
```

If a developer requests modification of a protected file, display the protection message and refuse.
Exception: `--force --reason` override is logged and visible to management.

**In the wxKanban source project** (`.wxkanban-origin` present): all files are editable.

### AI Provider Naming Convention

All AI-related files use the `wx` prefix — never provider-specific names:

| ✅ Correct | ❌ Wrong |
|-----------|---------|
| `wxAI-implement.md` | `claude-implement.md` |
| `wxAI-scope-check.md` | `gemini-scope-check.md` |
| `_wxAI/` directory | `_claude/` directory |
| `wxai scope-check` | `claude scope-check` |

### Audit Logging

Every AI interaction that modifies code, creates scopes, or triggers blocks MUST be logged:

```
POST /api/ai-audit/log
{
  "actiontype": "scope_check_pass|scope_check_block|scope_check_override|...",
  "scopenumber": "<NNN>",
  "provider": "<provider name>",
  "description": "<what happened>"
}
```

Management reviews AI activity at: `GET /api/ai-audit/summary`

### Version Check (Consumer Projects)

On every project open or AI session start, check `.wxkanban-version`:

```bash
wxai sync-global --check
```

- If 1 major version behind → warn developer
- If 2+ major versions behind → BLOCK implementation until updated
- Run `wxai sync-global --apply` to update governance rules
