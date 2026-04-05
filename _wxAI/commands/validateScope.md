---
description: Validate Scope of Project documents against wxKanban quality criteria
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

## User Input

```text
{{args}}
```

You **MUST** consider the user input before proceeding (if not empty).

## Scope Validate — Quality Assurance for Scope Documents

This command validates a Scope of Project markdown file against wxKanban quality criteria. It checks for required sections, proper formatting, measurable success criteria, and readiness for the wxAI pipeline.

**Input**: Scope file path or spec number (NNN)

---

## Pre-Flight

### 1. Parse Arguments

Check `{{args}}` for:

| Pattern | Action |
|---------|--------|
| `NNN` (e.g., `018`) | Validate `specs/Project-Scope/NNN-*.md` |
| `NNN-scope-name` | Validate `specs/Project-Scope/NNN-scope-name.md` |
| Full path | Validate specified file |
| `--all` | Validate all scope files in `specs/Project-Scope/` |
| `--fix` | Auto-fix minor issues (formatting, numbering) |
| `--report` | Generate validation report file |

If `{{args}}` is empty:
```
ERROR: No scope file specified.

Usage: /scope-validate <spec-number>
       /scope-validate <path-to-file>
       /scope-validate --all
       /scope-validate 018 --fix

Examples:
  /scope-validate 018           # Validate spec 018
  /scope-validate --all           # Validate all scopes
  /scope-validate 005 --fix       # Validate and auto-fix issues
```

### 2. Locate Scope File(s)

**Single file mode**:
- If NNN provided: Find `specs/Project-Scope/NNN-*.md`
- If path provided: Verify file exists
- Error if not found: "Scope file not found at [path]"

**Batch mode** (`--all`):
- List all `specs/Project-Scope/NNN-*.md` files
- Sort by spec number
- Validate each sequentially

---

## Validation Criteria

### Section 1: Structure & Completeness

| Check | Weight | Description |
|-------|--------|-------------|
| ✅ Title Format | Required | `Spec [NNN]: [Name] — [Description]` |
| ✅ Spec Number | Required | Matches filename NNN |
| ✅ Status Field | Required | `draft`, `clarified`, `planned`, or `implemented` |
| ✅ Overview | Required | Has Overview section with Core Design table |
| ✅ User Scenarios | Required | At least 3 scenarios (US1, US2, US3) |
| ✅ Functional Requirements | Required | At least 3 numbered FRs (FR-001, FR-002...) |
| ✅ Success Criteria | Required | At least 3 measurable criteria |
| ✅ Key Entities | Recommended | Table of entities defined |
| ✅ Constraints | Required | At least 2 constraints listed |

### Section 2: Content Quality

| Check | Weight | Description |
|-------|--------|-------------|
| ✅ No Implementation Details | Critical | No languages, frameworks, APIs in spec sections |
| ✅ Testable Requirements | Required | Each FR has acceptance criteria |
| ✅ Measurable Success | Required | Criteria include specific metrics (time, %, count) |
| ✅ Clear Scope Boundaries | Required | In scope / out of scope defined |
| ✅ Actor Identification | Required | Primary and secondary actors named |
| ✅ Value Proposition | Required | Problem/solution clearly stated |

### Section 3: Formatting & Standards

| Check | Weight | Description |
|-------|--------|-------------|
| ✅ FR Numbering | Required | Sequential: FR-001, FR-002, no gaps |
| ✅ US Numbering | Required | Sequential: US1, US2, US3... |
| ✅ Markdown Tables | Required | Properly formatted with `|` separators |
| ✅ Code Blocks | Required | SQL/schema blocks use ```sql |
| ✅ Consistent Headers | Required | Proper hierarchy (#, ##, ###) |
| ✅ No TODO Placeholders | Recommended | No "[TODO]" or "[FILL IN]" markers |

### Section 4: Pipeline Readiness

| Check | Weight | Description |
|-------|--------|-------------|
| ✅ No Clarification Markers | Required | No `[NEEDS CLARIFICATION]` remaining |
| ✅ Dependencies Listed | Recommended | `Depends On` field populated |
| ✅ Breakdown Ready | Required | Can be decomposed into `/wxAI-pipeline` specs |
| ✅ Checklist Exists | Recommended | `checklists/requirements.md` present |

---

## Validation Scoring

### Calculate Quality Score

```
Total Checks: N
Passed: P
Failed: F
Warnings: W

Quality Score = (P / N) * 100
```

### Grade Levels

| Score | Grade | Status |
|-------|-------|--------|
| 95-100% | A+ | ✅ Ready for pipeline |
| 85-94% | A | ✅ Ready with minor notes |
| 75-84% | B | 🟡 Needs refinement |
| 65-74% | C | 🟡 Significant issues |
| 50-64% | D | 🔴 Major revision needed |
| <50% | F | 🔴 Not ready |

---

## Validation Report

### Single File Report

```
===================================================
SCOPE VALIDATION REPORT
===================================================

File:     specs/Project-Scope/[NNN]-[name].md
Spec:     [NNN]
Title:    [Title]
Status:   [Status]

---------------------------------------------------
SECTION 1: STRUCTURE & COMPLETENESS
---------------------------------------------------
[✅/❌] Title Format        [details]
[✅/❌] Spec Number         [details]
[✅/❌] Status Field        [details]
[✅/❌] Overview            [details]
[✅/❌] User Scenarios      [N found, need 3]
[✅/❌] Functional Reqs     [N found, need 3]
[✅/❌] Success Criteria    [N found, need 3]
[✅/⚠️/❌] Key Entities     [details]
[✅/❌] Constraints         [details]

Section Score: [X]%

---------------------------------------------------
SECTION 2: CONTENT QUALITY
---------------------------------------------------
[✅/❌] No Implementation   [details]
[✅/❌] Testable Reqs       [details]
[✅/❌] Measurable Success  [details]
[✅/❌] Scope Boundaries    [details]
[✅/❌] Actor ID            [details]
[✅/❌] Value Prop          [details]

Section Score: [X]%

---------------------------------------------------
SECTION 3: FORMATTING & STANDARDS
---------------------------------------------------
[✅/❌] FR Numbering        [details]
[✅/❌] US Numbering        [details]
[✅/❌] Markdown Tables     [details]
[✅/❌] Code Blocks         [details]
[✅/❌] Headers             [details]
[✅/⚠️/❌] No Placeholders  [details]

Section Score: [X]%

---------------------------------------------------
SECTION 4: PIPELINE READINESS
---------------------------------------------------
[✅/❌] No Clarifications   [N markers found]
[✅/⚠️/❌] Dependencies     [details]
[✅/❌] Breakdown Ready     [details]
[✅/⚠️/❌] Checklist Exists [details]

Section Score: [X]%

---------------------------------------------------
SUMMARY
---------------------------------------------------
Total Checks:    [N]
Passed:          [P]
Failed:          [F]
Warnings:        [W]
Quality Score:   [X]% ([Grade])

Status:          [Ready / Needs Work / Major Revision]

Critical Issues:
  ❌ [Issue 1]
  ❌ [Issue 2]

Warnings:
  ⚠️ [Warning 1]
  ⚠️ [Warning 2]

Recommendations:
  1. [Specific action to fix issue]
  2. [Specific action to improve]

Next Steps:
  [Ready]: Run `/wxAI-pipeline` to break down into detailed specs
  [Needs Work]: Address failed checks, then re-run `/scope-validate`
  [Major Revision]: Use `/scope-builder --edit [NNN]` to rebuild
===================================================
```

### Batch Report (`--all`)

```
===================================================
SCOPE VALIDATION — BATCH REPORT
===================================================

Scopes Validated: [N]
Date: [TIMESTAMP]

---------------------------------------------------
INDIVIDUAL RESULTS
---------------------------------------------------
| NNN | Title (truncated) | Score | Grade | Status |
|-----|-------------------|-------|-------|--------|
| 002 | Admin Function... | 94%   | A     | ✅ Ready |
| 005 | Time and Bil... | 78%   | B     | 🟡 Refine |
| 011 | New Project ... | 88%   | A     | ✅ Ready |
| ... | ...               | ...   | ...   | ...    |

---------------------------------------------------
SUMMARY STATISTICS
---------------------------------------------------
Ready for Pipeline (A+ or A):  [N] scopes
Needs Refinement (B):          [N] scopes
Major Revision Needed (C/D/F): [N] scopes

Average Quality Score: [X]%

---------------------------------------------------
TOP ISSUES ACROSS ALL SCOPES
---------------------------------------------------
1. [Issue type] — Found in [N] scopes
2. [Issue type] — Found in [N] scopes
3. [Issue type] — Found in [N] scopes

---------------------------------------------------
RECOMMENDATIONS
---------------------------------------------------
[Specific recommendations based on common issues]

===================================================
```

---

## Auto-Fix Mode (`--fix`)

When `--fix` flag is provided, automatically fix minor issues:

| Fixable Issue | Action |
|---------------|--------|
| FR numbering gaps | Renumber sequentially |
| Missing status field | Add `Status: draft` |
| Inconsistent headers | Standardize to template |
| Trailing whitespace | Remove |
| Missing newline at EOF | Add |
| Table formatting | Align columns |

**Non-fixable issues** (require manual intervention):
- Missing content sections
- Implementation details in spec
- Unclear requirements
- Missing success criteria

---

## Report Generation (`--report`)

When `--report` flag provided, save validation results:

**Path**: `specs/Project-Scope/validation-reports/[NNN]-[date].md`

**Content**: Full validation report + diff of changes (if `--fix` used)

---

## Behavior Rules

- **Strict validation**: Failed critical checks block pipeline readiness
- **Helpful guidance**: Provide specific fix recommendations
- **Non-destructive**: `--fix` only modifies formatting, never content
- **Comprehensive**: Check all sections, not just presence but quality
- **Actionable**: Every failure includes specific next step

---

## Error Handling

| Error | Response |
|-------|----------|
| File not found | "Scope file not found. Check path or spec number." |
| Invalid spec number | "No scope found with number [NNN]" |
| Malformed markdown | "Unable to parse. Check markdown syntax." |
| Permission denied | "Cannot read/write file. Check permissions." |
| Template missing | "Validation template not found. Check installation." |

---

## Examples

### Example 1: Validate Single Scope

**Input**:
```
/scope-validate 018
```

**Output**: Full validation report for spec 018

### Example 2: Validate and Fix

**Input**:
```
/scope-validate 005 --fix
```

**Output**: Validation report + "Fixed 3 formatting issues"

### Example 3: Batch Validation

**Input**:
```
/scope-validate --all --report
```

**Output**: Batch report + saved to `validation-reports/batch-[date].md`
