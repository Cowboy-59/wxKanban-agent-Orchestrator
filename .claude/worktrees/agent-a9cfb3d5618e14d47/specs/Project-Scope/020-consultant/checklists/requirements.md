# Requirements Checklist — Spec 020: Consultant Work Hub

**Spec**: 020-consultant.md  
**Created**: 2026-04-01  
**Status**: `draft`

---

## Specification Quality

- [ ] Overview clearly states WHAT and WHY (not HOW)
- [ ] Primary and secondary actors identified
- [ ] Key value proposition stated
- [ ] Scope boundary defined (in scope + out of scope)

---

## User Scenarios

- [ ] US1 covers primary happy-path workflow
- [ ] US2 covers a distinct secondary workflow
- [ ] US3 covers an edge case or error condition
- [ ] Each scenario has a measurable expected outcome

---

## Functional Requirements

- [ ] FR-001: Unified Consultant Task Queue — acceptance criteria defined
- [ ] FR-002: Project-Based Task Filtering — acceptance criteria defined
- [ ] FR-003: Dashboard Workload Indicators — acceptance criteria defined
- [ ] FR-004: Manual Task Time Tracking — acceptance criteria defined
- [ ] FR-005: AI Execution Time Capture includes timestamp capture, duration storage, and AI completion summary append behavior
- [ ] FR-006: External Task Status Sync-Back — acceptance criteria defined
- [ ] FR-007: Blocked and Suspended Task States — acceptance criteria defined
- [ ] FR-008: Compliance-Aware Enforcement — acceptance criteria defined
- [ ] FR-009: Invoice-Ready Work Output — acceptance criteria defined
- [ ] FR-010: Consultant Team Member Management — acceptance criteria defined
- [ ] All FRs are testable (no vague or unmeasurable language)
- [ ] No FR contains implementation details

---

## Data Requirements

- [ ] All new tables identified (`tasklogs`, `tasksyncrecords`, `taskstateoverrides`, `complianceflags`, `consultantteammembers`)
- [ ] Primary keys use UUID v7 defaults (`uuidv7()`)
- [ ] `tasklogs` contains `completionnotesummary` for AI-assisted completion summaries
- [ ] Schema definitions use project naming conventions (lowercase, no camelCase, no underscores)
- [ ] Required indexes specified
- [ ] Foreign key relationships correct
- [ ] Migration impact noted (existing `timeentries` compatibility check)

---

## API Routes

- [ ] All 13 routes listed with method, path, and description
- [ ] Routes follow REST conventions
- [ ] No endpoint leaks data beyond authenticated user's company scope
- [ ] Team and compliance routes included

---

## Frontend Components

- [ ] 9 new components listed with paths
- [ ] 2 modified components identified with change description
- [ ] Component paths follow project conventions (`components/consultant/`)

---

## wxAI Commands

- [ ] `/consultant-hub` defined with usage and behavior
- [ ] `/track-time` defined with start/stop usage and behavior
- [ ] `/suspend-task` defined with blocked/suspended usage and behavior

---

## Success Criteria

- [ ] 8 measurable success criteria defined
- [ ] Performance target stated (3-second hub load)
- [ ] AI success criterion includes completion summary append behavior
- [ ] Billable output criteria present
- [ ] Team management criteria present

---

## Constraints & Notes

- [ ] Authentication and authorization constraints stated
- [ ] Sync failure handling documented
- [ ] Out-of-scope items explicitly listed
- [ ] Dependencies on other specs identified

---

## Pipeline Readiness

- [ ] No `[TBD]`, `[TODO]`, or `[PLACEHOLDER]` markers remain
- [ ] No clarification questions remain open
- [ ] Spec is ready for task breakdown
- [ ] Spec is ready for QA test plan generation

---

## Next Steps

- [ ] Assign spec to implementation queue
- [ ] Generate task breakdown (`specs/020-consultant/tasks.md`)
- [ ] Create QA test plan linked to FRs
- [ ] Confirm `timeentries` -> `tasklogs` migration path before implementation begins
