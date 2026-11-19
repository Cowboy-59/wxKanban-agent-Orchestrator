# Plan: User Feedback

**Spec Number**: 043
**Date**: 2026-05-31

## Implementation Plan

### Phase 1: Setup
- Review spec and data model
- Identify dependencies

### Phase 2: Core Implementation
- Implement core functionality
- Write unit tests

### Phase 3: Integration
- Integration testing
- Documentation

## Known Issues

### FOLLOW-UP: harden feedback-sink customerId resolution (queued 2026-06-15)

`resolveSinkScope()` in `mcp-server/src/utils/feedback-sink.ts` calls
`withScope(caller).selectScoped(companyprojects, eq(companyprojects.id, projectId))`
to look up the sink project's `companyId`. The comment claims this is an
"unscoped read," but `companyprojects` has no `projectid` column, so
`selectScoped` would throw `scope-missing-column` on a cold container — it only
survives because `cachedSinkCustomerId` short-circuits the lookup on warm
containers. Fragile.

**Fix:** resolve the sink `companyId` without `selectScoped` (an explicit
unscoped read helper, or a lookup that doesn't assume a `projectid` column),
and correct/remove the misleading comment. Route through `implement 043/<task>`
when picking this up.

**Context:** surfaced while diagnosing the 2026-06-15 `submit_feedback` 500
(`invalid input syntax for type uuid: "wxKanban Development"`), whose actual root
cause was `FEEDBACK_SINK_PROJECT_ID` set to the project name instead of its UUID
(now fixed in the App Runner console). This follow-up is the latent fragility
found alongside it, not the cause of that incident.
