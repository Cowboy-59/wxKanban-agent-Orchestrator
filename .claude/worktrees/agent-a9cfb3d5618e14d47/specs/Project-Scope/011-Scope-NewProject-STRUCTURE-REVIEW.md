t# Spec 011 Structure Review & Recommendations

## Current Structure Analysis

After comparing `specs/Project-Scope/011-Scope-NewProject.md` with other Project-Scope specifications (010, 012, 013), the document is **well-structured and comprehensive**. Here's the analysis:

---

## Standard Sections Present ✅

| Section | Status | Notes |
|---------|--------|-------|
| Header (Spec Number, Status, Created, Depends On) | ✅ | Complete with all metadata |
| Overview | ✅ | Clear problem statement and goal |
| Core Problem | ✅ | Well-defined with bullet points |
| Data Hierarchy | ✅ | Visual tree diagram |
| Project Kit Contents | ✅ | Detailed breakdown of 7 components |
| New Project Flow | ✅ | Step-by-step UI/API/process flow |
| Schema | ✅ | All 3 new tables defined (apitokens, projectkits, projectkitfiles) |
| API Routes | ✅ | Table of endpoints |
| Success Criteria | ✅ | 8 criteria defined |
| Key Entities | ✅ | Table format with descriptions |
| Constraints | ✅ | 7 constraints listed |
| Task Management Integration | ✅ | Extensive DB sync documentation |
| Scope Boundary | ✅ | Clear separation from Spec 012 |
| Existing Project Import | ✅ | Detailed import flow (reference only) |

---

## Comparison with Other Specs

### Spec 010 (Scope Import)
- Similar structure with US1-US4 scenarios
- Has "User Scenarios & Testing" section (011 uses "New Project Flow")
- 011 is more comprehensive with kit generation details

### Spec 012 (Kanban View)
- Has "Clarifications" section with Q&A table
- Has "Scope Boundary" section (011 also has this)
- 011 has more implementation detail

### Spec 013 (Audit Management)
- Has "The 4 Compliance Frameworks" visual matrix
- Has "Implementation Status" section
- Similar level of detail to 011

---

## Recommendations for Enhancement

### 1. Add "Clarifications" Section (Optional)
Consider adding a clarifications section like Spec 012 has, documenting key design decisions:

```markdown
## Clarifications ##

| # | Question | Decision |
|---|----------|---------|
| C1 | API Token storage format | Store both hash (lookup) and encrypted (server-side decrypt) |
| C2 | Kit caching strategy | Cache static files; inject credentials at download |
| C3 | Multi-AI command syntax | Use `{{args}}` placeholder (AI-agnostic) |
| C4 | Import vs New project split | Spec 011 = New projects; Spec 012 = Existing import |
```

### 2. Add "Implementation Status" Section (Recommended)
Add a tracking section for implementation progress:

```markdown
## Implementation Status ##

| Component | Status | Notes |
|-----------|--------|-------|
| Database Schema | ✅ Complete | Migration 0013 applied |
| Encryption Service | ✅ Complete | AES-256-GCM roundtrip verified |
| Token Service | ✅ Complete | CRUD operations working |
| Kit Generation | ✅ Complete | Async generation with notification |
| API Routes | ✅ Complete | All endpoints implemented |
| Frontend Components | 🔄 In Progress | KitManager, ProjectSetupWizard |
| MCP Server | ✅ Complete | --init --dir flags working |
| AI Commands | ✅ Complete | 7 command templates in _wxAI-commands/ |
```

### 3. Standardize "Key Entities" Table Format
The current format is good, but could align with other specs by adding a "Table" column:

```markdown
| Entity | Table | Description |
|--------|-------|-------------|
| API Token | `apitokens` | User's personal API token |
| Project Kit | `projectkits` | Kit metadata |
| Kit Files | `projectkitfiles` | Individual kit files |
```

### 4. Add "Notes" Section (Optional)
Add a notes section for additional context:

```markdown
## Notes ##

- Kit generation is asynchronous — UI polls for status
- API tokens are shown only once at creation
- DATABASE_URL_ENCRYPTED is computed at download time, never cached
- The Project Kit is read-only from DB perspective
- Future: npm package delivery (`npx wxkanban-init <project_id>`)
```

---

## Missing Standard Sections (Minor)

| Section | Priority | Rationale |
|---------|----------|-----------|
| Clarifications | Low | Design decisions are documented inline |
| Implementation Status | Medium | Useful for tracking progress |
| Notes | Low | Information is spread throughout |

---

## Overall Assessment

**Grade: A-**

The spec is comprehensive, well-organized, and implementation-ready. The structure follows the established pattern from other Project-Scope specs. Minor enhancements (Implementation Status section) would improve tracking but are not blockers.

### Strengths:
1. Extensive detail on kit components
2. Clear separation of concerns (New vs Import)
3. Complete schema definitions
4. Task management integration fully documented
5. Multi-AI compatibility matrix included

### Areas for Improvement:
1. Add Implementation Status tracking section
2. Consider adding Clarifications section for key design decisions
3. Standardize table formats across all specs

---

## Action Items

- [ ] Add "Implementation Status" section to track progress
- [ ] Add "Clarifications" section documenting Q1-Q5 decisions
- [ ] Update "Key Entities" to include Table column
- [ ] Add "Notes" section for miscellaneous context
- [ ] Cross-reference with Spec 012 to ensure no overlap/duplication

---

*Review completed: 2026-03-02*
*Comparing against: Spec 010, 012, 013*
