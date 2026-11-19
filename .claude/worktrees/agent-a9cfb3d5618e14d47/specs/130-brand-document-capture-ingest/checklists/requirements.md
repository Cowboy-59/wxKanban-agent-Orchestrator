# Requirements Checklist: Brand Document Capture and Ingest

**Spec**: 130 · **Parent Scope**: SCOPE-129

| Requirement | Title | Covered by |
|-------------|-------|------------|
| FR-001 | The format reference precedes the parser | |
| FR-002 | The template is a shipped artifact | |
| FR-003 | Ingest is deterministic | |
| FR-004 | Unrecognized structure is rejected and named | |
| FR-005 | Capture reuses the shipped extraction path | |
| FR-005a | Capture never handles customer credentials | |
| FR-006 | A captured brand starts with one mode | |
| FR-007 | Capture states what it inferred | |
| FR-008 | Every path produces a document | |
| FR-009 | Ingest reports before it stores | |
| FR-010 | Parsing is offline and nothing is sent outward | |
| FR-011 | The reference document is the regression corpus | |

## Metrics

- [ ] SC-1: 100% of captured documents parse cleanly on their first pass through the ingest they were generated for, because both sides are ours
- [ ] SC-2: 0 rule sections fabricated by capture — every section not measurable from a rendered product is emitted as an unanswered prompt
- [ ] SC-3: the reference corpus parses to exactly 6 modes of 41 contract tokens each, with 0 missing and 0 extra
- [ ] SC-4: 100% of parser rejections name both the offending content and its location, with 0 partial imports
- [ ] SC-5: 100% of imports present the validation report before the schema is committed
- [ ] SC-6: 1 mode is produced by capture, never more, because a built product has one look
