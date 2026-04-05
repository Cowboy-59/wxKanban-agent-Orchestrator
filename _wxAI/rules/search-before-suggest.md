# Search Before Suggest Rule

**Rule ID**: search-before-suggest  
**Applies To**: ALL AI providers (Claude, Gemini, Mistral, Blackbox, OpenAI, Kimi, Minimax, Grok)  
**Enforcement**: MANDATORY — Violations are CRITICAL ERRORS

---

## Rule Statement

**BEFORE suggesting any new feature, change, or implementation, the AI MUST first search the codebase for existing functionality that may already address the need or provide a foundation for the requested change.**

---

## Why This Rule Exists

Without this rule, AI assistants will:
- Suggest creating new features that already exist in the codebase
- Propose API endpoints that are already implemented but unused
- Recommend schema changes when tables/columns already exist
- Create duplicate functionality, leading to maintenance burden and confusion
- Waste development time on redundant work

---

## Required Search Steps

When a user requests a feature or reports a missing capability, the AI MUST:

### Step 1: Search for Existing Backend Functionality
```bash
# Search for API endpoints, services, routes
search_files:
  path: src/server
  regex: <feature_name>|endpoint|route|service
  file_pattern: *.ts
```

### Step 2: Search for Existing Frontend Components
```bash
# Search for React components, hooks, pages
search_files:
  path: src/client
  regex: <feature_name>|component|hook|page
  file_pattern: *.tsx, *.ts
```

### Step 3: Search for Database Schema
```bash
# Search for tables, columns, schema definitions
search_files:
  path: src/db/schema
  regex: <feature_name>|table|column
  file_pattern: *.ts
```

### Step 4: Search for Specifications
```bash
# Search for existing specs that may cover this feature
search_files:
  path: specs
  regex: <feature_name>|requirement|FR-
  file_pattern: *.md
```

### Step 5: Search for Tests
```bash
# Search for existing tests that may validate this functionality
search_files:
  path: tests
  regex: <feature_name>|test|spec
  file_pattern: *.ts, *.test.ts
```

---

## Decision Matrix

| Search Result | Action Required |
|--------------|-----------------|
| Backend API exists, Frontend missing | Suggest UI implementation only, reference existing API |
| Frontend component exists but hidden | Suggest exposing/enabling the existing component |
| Both backend and frontend exist | Report to user: "This feature already exists at [location]" |
| Partial implementation exists | Suggest completing the existing implementation |
| Nothing found | Proceed with full feature specification and implementation |

---

## Documentation Requirements

After searching, the AI MUST document in its response:

1. **What was searched** — paths and patterns used
2. **What was found** — existing files, components, APIs
3. **Gap analysis** — what specifically is missing (if anything)
4. **Recommendation** — whether to extend existing code or create new

---

## Example: Correct Workflow

**User**: "I don't see anywhere to assign projects to team members after creation"

**AI Response**:
```
I'll search the codebase to understand the current project assignment functionality.

[Executes 5 search steps...]

**Search Results**:
- ✅ Backend: `PATCH /api/projects/:id/phases/:phaseid/assign` exists in `src/server/routes/projects.ts`
- ✅ Service: `PhaseService.assignUser()` exists
- ✅ Frontend: `CreateProjectModal.tsx` has phase assignment during creation
- ❌ Missing: `ProjectWorkspacePage.tsx` edit modal does NOT have phase assignment editing

**Gap Analysis**:
The backend API and service exist, but the Project Edit modal doesn't expose phase reassignment. The feature exists for project creation but not for editing.

**Recommendation**:
Extend the existing `ProjectWorkspacePage.tsx` edit modal to include phase assignment dropdowns, reusing the pattern from `CreateProjectModal.tsx`.
```

---

## Violation Examples

| Violation | Correct Approach |
|-----------|---------------|
| "I'll create a new API endpoint for phase assignment" | "The API endpoint already exists at `src/server/routes/projects.ts:PATCH /phases/:phaseid/assign`" |
| "We need a new database table for phase assignments" | "The `projectphases` table already has `assigneduserid` column" |
| "I'll build a new component for phase selection" | "The dropdown pattern exists in `CreateProjectModal.tsx` — we should reuse it" |

---

## Enforcement

- **Pre-commit hook**: AI must confirm searches were performed before suggesting changes
- **Audit log**: All feature suggestions must include search summary
- **User verification**: If user asks "Does this already exist?", AI must re-run searches

---

**Related Rules**:
- `constitution.md` — TypeScript, database, security rules
- `projectrules.md` — Project-specific enforcement rules
- `development-guidelines.md` — Implementation best practices

---

**Version**: 1.0.0  
**Last Updated**: 2026-02-22  
**Applies To**: All wxKanban AI interactions
