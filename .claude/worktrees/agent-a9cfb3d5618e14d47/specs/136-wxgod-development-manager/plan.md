# Implementation Plan: Spec 136 — wxG-O-D Development Process Manager

**Spec**: `specs/136-wxgod-development-manager/spec.md`
**Scope**: `specs/Project-Scope/136-wxgod-development-manager.md` (SCOPE-136)
**Phase**: design
**Priority**: high

## Approach

Most of this spec is **method text**, not code. G.O.D. is a prompt the editor AI runs (SCOPE-019
R6a holds: the kit never calls AI), so a requirement such as "`--create` runs the plan phase by
phase" is met by writing that procedure into the hosted method, and proved only by a real run.
That splits the work three ways:

| Kind | Where it lands | Proved by |
|------|----------------|-----------|
| Method | `mcp-server/src/prompts/wxgod.md`, `wxgod/references/*.md` | Registry test (shape), then acceptance runs (T029) |
| Skill files | `.claude/skills/wxG-O-D/` stub and scripts, thin commands, `/dev-plan` alias | Byte-identical mirror check, renderer smoke test, release-asset diff |
| Kit code | `resolve-spec-verification.ts` (FR-017), `server.ts` description, `helpCatalog.ts` | Unit tests, then the parallel-implement acceptance trial |

### Phase A — Hosted delivery (T001–T006)

Built before this spec (commit `64738521`). What remains is operational: one line in the
`get_command_prompt` tool description, and the post-deploy probe. The probe is not optional: the
App Runner deploy has rolled back silently before, and a stub that names an unserved key fails on
every subscriber's machine.

### Phase B — Plan mode (T007–T011)

Already in the method. These tasks verify it against the FRs during the acceptance run rather than
rewrite it.

### Phase C — Roadmap fold-in (T012–T013)

The dev-plan skill's judgment half becomes G.O.D.'s step 8, its template becomes § 2 of the
`document-templates` reference (so the reference keys stay the eight FR-002 names), and its
renderer moves to `.claude/skills/wxG-O-D/scripts/build-devplan-pdf.mjs`. `/wxG-O-D --roadmap`
writes just the roadmap; `/dev-plan` becomes a one-release alias for it. The roadmap moves from
`specs/` to `docs/`; an old `specs/DEVELOPMENT-PLAN.md` is read as the previous version. The
server's deterministic `devplan` document is untouched.

Release hazard: `sync-to-orchestrator.mjs` never prunes a skill dropped from its allowlist, so the
orchestrator's `.claude/skills/dev-plan/` keeps shipping until deleted there by hand.

### Phase D — New-project mode and `--create` (T014–T018)

N1–N10 already carry FR-012, FR-013, FR-015, and FR-016. `--create` is added as N11: the N6 design
review is the one pause; then each phase runs scope → validate → specify → design → implement →
exit gate, with the development plan's Pipeline column as the progress record. The state file
gains `position`, `limit`, `style`, per-scope `screen`/`pageMd`/`implement`, `phaseGates`,
`stoppedAt`, and `bridge`.

### Phase E — Parallel implementation (T019–T021)

**FR-017 (kit code) comes first.** `resolveSpecVerification` today returns "missing spec" unless
exactly one spec in the project is `planned`/`tasks_generated`/`implementing`; this project has 68.
It must take the spec number from the implement call and verify that spec only.

Found while creating this spec: `project.create_specs` stores its spec, plan, and lifecycle
documents with `specid` NULL, and the resolver counts documents by `specid`. A per-spec check
written naively would therefore block every spec createSpecs makes. T019 must decide how documents
are linked (set `specid` on create, or count through the task `documentIds`), with a test for a
spec created by `create_specs`.

FR-018 is method text (N8b): ready = all dependencies implemented; limit = min(machine maximum,
`--cap`); two or more ready specs run as background helpers that return every gate question to
G.O.D., which relays it verbatim and sends the answer back. G.O.D. remains the only driver of the
tree. Two ready specs that change the same file run one after the other.

### Phase F — Bridge, KAIN, defects (T022–T025)

N12 offers the bridge once after approval, when the three `YAPPCHATT_*` names exist (checked
without reading values) and the `remote` launcher exists. The hand-off seed is exactly
`/wxG-O-D --resume`. Known gap: the room's `STATUS` word reports the session, not the plan
position; until the bridge reads `GOD-State.json`, G.O.D. posts its position after every unit and
gate and answers "where are we?". The defect stop is a Rule in `wxgod.md`.

### Phase G — Style and screens (T026–T027)

N6b already carries both choices. It is moved to run when the user chooses Approve, before the
final confirmation, so the choices are settled before the plan is approved for building (FR-023).

### Phase H — Release and acceptance (T028–T029)

All three: app push (hosted MCP redeploy, then the probe), kit release, Cockpit VSIX. Then the
acceptance runs against `E:/AI_Development/EverettCash/analysis` and a test overview.

## Known Issues

- `create_specs` documents carry `specid` NULL (see Phase E); affects FR-017's "no documents still
  blocks" criterion.
- The room's `STATUS` word cannot show the plan position without a bridge change (FR-020).
- The orchestrator copy of the dev-plan skill must be removed by hand at release.
