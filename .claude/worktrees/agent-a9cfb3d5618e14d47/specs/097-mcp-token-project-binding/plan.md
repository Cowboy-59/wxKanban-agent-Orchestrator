# Plan: MCP Token/Project Binding Hardening

**Spec Number**: 097
**Date**: 2026-07-13

## Implementation Plan

### Phase 1: Server resolution (Defect A) — FR-001, FR-004
- `mcp-server/src/utils/project-context.ts`: add `'token'` to `ProjectContextSource` / `ProjectContextResolution.source`; add an optional `tokenProjectId` param and insert it as the priority-2 default (args > token > env > file).
- `mcp-server/src/server.ts`: pass `request.params._meta.mcpScope.projectId` into `withResolvedProjectId` (don't rely on the L520 call preceding the L548 mcpScope read); forward it to `resolveProjectContext`.
- Unit tests for the full precedence order.

### Phase 2: Health truth (Defect A symptom) — FR-002
- `mcp-server/src/utils/mcp-health.ts`: allow `'token'` in `ProjectContextSource`; make `project_mcp_health` resolve `projectContext` per request under the caller's token rather than from the frozen module-level `state`. Verify how the health handler builds its payload first.
- Test: health under a token returns the token project + `source:"token"`; dev-bypass unchanged.

### Phase 3: Safety guard (regression) — FR-003
- No code change to `db/scoped-query.ts` / `middleware/auth.ts`. Add/keep a regression test: scoped write with mismatched `projectId` still throws `scope-mismatch`; `check-no-direct-db` passes.

### Phase 4: Kit client unification (Defect B) — FR-005, FR-006
- `wxkanban-agent/core/http/mcp-client.ts`: remove `TOKEN_RE` (L44) and the constructor throw (L144-148); keep the no-token hosted fast-fail.
- `wxkanban-agent/core/orchestrator/mcp-client.ts`: confirm shape-agnostic parity (L55).
- Update `tests/unit/mcp-client.test.ts` (flip the throw assertion); add a parity test across both clients.

### Phase 5: Release
- Server changes deploy to the production hosted MCP on push to main.
- Kit changes ship via `scripts/sync-to-orchestrator.mjs`.
- Hold all push/publish until the user gates it. Run `auditfences` before pushing.

## Known Issues

- FR-002 hinges on whether `project_mcp_health` reads the frozen startup `state` vs resolving per-request — confirm at implement time.
- `implement` CLI corrupts fences on MODIFY (memory); these are edits to fenced files — route MODIFY through the working MCP `project.implement` path, not the local CLI, or hand-fence per convention.
