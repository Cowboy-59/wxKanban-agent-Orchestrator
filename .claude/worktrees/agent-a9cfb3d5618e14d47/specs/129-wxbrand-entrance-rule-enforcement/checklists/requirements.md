# Requirements Checklist: wxBrand Entrance and Rule Enforcement

**Spec**: 129 · **Parent Scope**: SCOPE-129

| Requirement | Title | Covered by |
|-------------|-------|------------|
| FR-001 | wxBrand is the entrance | |
| FR-002 | The delivery channel is decided before the command is written | |
| FR-003 | Rules are data with a mechanical flag | |
| FR-004 | Rules reach implementation and design | |
| FR-005 | Rules reach review | |
| FR-006 | No structural property varies by mode | |
| FR-007 | No style literal in a component | |
| FR-008 | An active or missing schema announces itself | |
| FR-009 | Skill changes land in every mirror | |

## Metrics

- [ ] SC-1: 100% of rule-consuming runs in a schema-bearing project state that a schema is active and name it
- [ ] SC-2: 100% of declared-but-missing schemas produce an explicit statement rather than proceeding as though unbranded
- [ ] SC-3: 0 style literals in the generated component layer outside token blocks, and 0 structural properties set by a mode selector
- [ ] SC-4: 4 wxBrand modes are reachable — capture, ingest, interview and execute — with capture as the documented primary path
- [ ] SC-5: 0 divergence between skill mirrors after a rule-delivery change, verified by comparison
- [ ] SC-6: 100% of UI-bearing tasks in a schema-bearing project receive the applicable rules as build context
