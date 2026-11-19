# 029 — Dbpush Blocking Contract — Plan

**Spec**: [spec.md](./spec.md)
**Created**: 2026-05-25
**Status**: Design

---

## Approach

The work splits into three layers that ship in dependency order, behind no feature flag (each layer is incrementally safe to deploy):

**Layer 1 — Foundation (no behavior change).** Extract the preflight rules into `shared/preflight/` (FR-014) and add the typed envelope helper consumed by both MCP clients (FR-001, FR-002). These are pure refactors: the kit and server continue to work exactly as before, but the rule and the envelope shape now live in dedicated modules that the rest of the scope builds on.

**Layer 2 — Truth-telling (kit detects, server signals).** Wire the kit's `dbpush` to inspect the envelope (FR-003, FR-005–FR-008), fix Phase 2's idempotency read (FR-009–FR-011), and update `capture_event` to report accurate counts (FR-021). In parallel, update the MCP server to return HTTP 422 on blocked envelopes (FR-012, FR-013). After this layer, blocked specs surface loudly as errors — but the operator's only recovery path is manual heading edits + re-push.

**Layer 3 — Self-service recovery (interactive auto-correct).** Add the heading-shape classifier + interactive prompt + in-place rewriter (FR-017–FR-020), and ship the `createspecs` template update + CI guard (FR-015, FR-016, FR-024). After this layer, customers hit by the YappChat-class regression can fix their specs with a single `y` keypress, and new customers don't hit it at all.

**Why layered, not big-bang.** Layer 1 alone unblocks `shared/preflight/` for any future scope that needs to score spec quality client-side (e.g. `createspecs` could call it before writing). Layer 2 alone is the minimum viable fix — if Layer 3 slips, the bug is no longer silent. Layer 3 is the customer-experience win. Each layer can be merged, deployed, and observed before the next starts.

**No backward-compat shims required.** The kit talks only to the hosted MCP server, both ship from this repo, and there is no external published consumer at risk (per spec.md FR-029's npm-publication carve-out). The HTTP 200 + `success:false` legacy path is supported by FR-003 purely as a belt + suspenders defense, not because any live caller still produces it.

---

## File Inventory

Grouped by layer. New files marked **N**, modified marked **M**.

### Layer 1 — Foundation

| File | Status | Purpose |
|------|--------|---------|
| `shared/preflight/package.json` | N | Minimal package definition for the shared module |
| `shared/preflight/tsconfig.json` | N | References repo root tsconfig |
| `shared/preflight/src/index.ts` | N | Exports `runPreflight()` and result types |
| `shared/preflight/src/checks.ts` | N | The 7 section checks lifted from MCP server |
| `shared/preflight/tests/preflight.test.ts` | N | Unit tests (FR-025) |
| `wxkanban-agent/core/orchestrator/mcp-envelope.ts` | N | Shared envelope type + parser used by both kit MCP clients |
| `mcp-server/src/server.ts` | M | `project.create_specs` handler imports from `shared/preflight/` |
| `mcp-server/src/utils/project-kit.ts` | M | If it owns part of the rule, source it from `shared/preflight/` |
| `wxkanban-agent/core/orchestrator/mcp-client.ts` | M | Uses new envelope parser |
| `wxkanban-agent/core/http/mcp-client.ts` | M | Uses new envelope parser |
| repo root `tsconfig.json` / `package.json` | M | Register `shared/preflight/` workspace |

### Layer 2 — Truth-telling

| File | Status | Purpose |
|------|--------|---------|
| `wxkanban-agent/dbpush.ts` | M | `pushNewSpec` + `pushExistingSpec` envelope inspection (FR-005–FR-007); `phase2Compare` title-prefix fallback (FR-009–FR-011); `capture_event` metadata accuracy (FR-021) |
| `wxkanban-agent/core/orchestrator/command-handlers/dbpush.ts` | M | Same envelope inspection in newer handler (FR-008) |
| `mcp-server/src/server.ts` | M | Return HTTP 422 on blocked (FR-012) |
| `wxkanban-agent/tests/unit/dbpush-blocked-envelope.test.ts` | N | FR-022 (a)–(c) |
| `wxkanban-agent/tests/unit/dbpush-phase2-title-prefix.test.ts` | N | FR-022 (d) |
| `wxkanban-agent/tests/integration/dbpush-blocked-report.test.ts` | N | FR-023 |
| `mcp-server/tests/integration/create-specs-422.test.ts` | N | FR-025 |

### Layer 3 — Self-service recovery

| File | Status | Purpose |
|------|--------|---------|
| `wxkanban-agent/core/orchestrator/heading-classifier.ts` | N | FR-017 classifier (calls `runPreflight()` from `shared/preflight/`) |
| `wxkanban-agent/core/orchestrator/spec-heading-rewriter.ts` | N | FR-019 rewriter + `.bak` handling |
| `wxkanban-agent/tests/helpers/stdin-stub.ts` | N | FR-023 stdin stub helper for interactive prompt tests |
| `wxkanban-agent/tests/unit/heading-classifier.test.ts` | N | FR-022 (e) |
| `wxkanban-agent/tests/integration/template-passes-preflight.test.ts` | N | FR-024 (CI guard) |
| `wxkanban-agent/dbpush.ts` | M | Wires classifier + prompt + rewriter into 422 path |
| `wxkanban-agent/<createspecs-template-location>` | M | Template emits explicit `## Business Problem`…`## Open Questions` headings (FR-015). Exact path confirmed in T009 |

---

## Task Dependency Graph

```
Layer 1
  T001 ─ extract shared/preflight/ + unit tests
  T002 ─ extract mcp-envelope.ts type + parser            (depends on workspace wiring from T001)

Layer 2 (depends on T001 + T002 merged)
  T003 ─ dbpush.ts envelope inspection (pushNewSpec/pushExistingSpec)
  T004 ─ command-handlers/dbpush.ts envelope inspection   (shares helper from T003)
  T005 ─ phase2Compare title-prefix fallback              (parallel to T003)
  T006 ─ capture_event metadata accuracy                  (depends on T003 + T004)
  T007 ─ mcp-server returns HTTP 422 on blocked           (parallel to T003-T006)
  T008 ─ Layer 2 unit + integration tests

Layer 3 (depends on Layer 2 fully landed)
  T009 ─ createspecs template emits explicit ## headings
  T010 ─ heading-shape classifier                          (uses runPreflight from T001)
  T011 ─ spec-heading rewriter + .bak handling
  T012 ─ dbpush interactive prompt + retry loop            (wires T010 + T011 into T003)
  T013 ─ stdin-stub test helper
  T014 ─ CI guard: templated scope passes preflight
  T015 ─ Layer 3 unit + integration tests
```

Critical path: T001 → T002 → T003 → T012. Estimated ~15 tasks total.

---

## Risk Register

| ID | Risk | Likelihood | Impact | Mitigation |
|----|------|------------|--------|------------|
| R1 | Preflight extraction breaks an edge case the current inline logic handles | Low | High (every push affected) | T001 ships byte-for-byte equivalent logic; regression tests against captured production envelopes; manual probe against `mcp.wxperts.com` before merge |
| R2 | Hosted MCP returns 422 but a deployed legacy kit (≤ v1.2.6) interprets it as a 5xx error | Medium | Medium (operator sees a different error message, but at least it's not silent) | FR-003 keeps the 200 + `success:false` path working; deploy server change AFTER kit change rolls out; document kit version requirement in release notes |
| R3 | Auto-rewrite corrupts a spec.md with unusual formatting (nested bolds, code fences containing `**Label**`) | Medium | High (operator's authored content damaged) | `.bak` file before every rewrite (FR-019); rewriter operates only outside code fences (skips content between ``` and ```); integration test covers nested-bold and code-fence edge cases |
| R4 | TTY detection misfires in a developer's terminal that pipes output (e.g. `dbpush \| tee log.txt`) | High | Low (operator sees errors but no prompt, runs again without pipe) | FR-020 mandates non-TTY behavior is "just exit with errors" — safe by design; document that interactive recovery requires running without redirection |
| R5 | `shared/preflight/` workspace wiring blocks the repo build on Windows | Low | High (entire repo build broken) | T001 gated on green CI on Windows before Layer 2 can start; preflight package has zero runtime deps |
| R6 | Hosted MCP deploy lags kit ship → period where kit checks for 422 but server still returns 200 | Low | None | FR-003 (belt + suspenders) — kit detects either path; no deploy coordination required |
| R7 | YappChat operator runs auto-correct, hits a content blocking issue mid-spec, doesn't realize they need to hand-edit | Medium | Low | FR-018's prompt prints ONLY heading-shape issues; content issues remain in `r.errors` after retry and trigger a second visible error pass |

---

## YappChat Migration Playbook (FR-026)

After kit ≥ v1.2.7 is installed and the hosted MCP at `mcp.wxperts.com` has shipped the 422 change (or even before — FR-003 handles the legacy 200 + `success:false` path):

### Interactive path (recommended)

1. `cd` into the YappChat project root.
2. Run `wxkanban-agent dbpush`.
3. The kit detects each blocked spec, runs `runPreflight()` locally, and prints something like:
   ```
   Spec 002 blocked: heading-shape issues detected:
     - Business Problem must be specific and non-placeholder.
     - Actors section must identify a primary actor.
     - Scope Boundary must define what is included.
   Auto-correct heading shape and retry push? [y/N]:
   ```
4. Operator presses `y`. The kit backs up each affected `spec.md` to `spec.md.bak-2026-05-25T14-22-31Z` and splits each `**Label**` bold into its own `## Label` heading at the appropriate insertion point.
5. The kit re-runs Phase 1 → Phase 4 once. Specs land in the database.
6. After visual verification in the wxKanban dashboard, the operator may delete `*.bak-*` files (optional — kept by default for an audit trail).

### Manual path (headless / non-TTY)

1. Open each `spec.md`.
2. For every `**Label**` (bold inline) that corresponds to a required preflight section (`Business Problem`, `Actors`, `Success Metrics`, `Scope Boundary`, `Out of Scope`, `Open Questions`), replace it with `## Label` on its own line above the body text.
3. Repeat for all 11 specs.
4. Run `wxkanban-agent dbpush` again.

### Rollback

If the auto-correct produces unexpected output:

- **Single file**: `mv spec.md.bak-<ISO> spec.md` to restore.
- **All files**: `git checkout specs/` if YappChat tracks specs in git.

No database rollback is required because nothing landed during a blocked push.

### Verification

After re-push completes with `errors: []`:

- Wait ~5 seconds, then load the wxKanban dashboard for the YappChat project.
- The 11 scopes should appear in the project's document panel.
- `project.list_open_items` should return 88 tasks (per the original report).
- The most recent `projectevents` row of type `document_updated` should have `metadata.pushErrors: 0` and `metadata.blockingIssuesCount: 0`.
