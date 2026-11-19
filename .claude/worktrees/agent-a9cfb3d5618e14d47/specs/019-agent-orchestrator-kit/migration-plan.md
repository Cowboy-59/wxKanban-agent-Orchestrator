# 019 Migration Plan: wxKanban as Consumer #0

**Source spec**: [`../Project-Scope/019-agent-orchestrator-kit.md`](../Project-Scope/019-agent-orchestrator-kit.md) — Requirement 12
**Status**: Draft — awaiting approval before any code changes
**Date**: 2026-04-09

---

## Premise

When 019 was drafted, the assumption was that wxKanban would *install* a foreign kit. After surveying the repo, the reality is more nuanced:

1. **wxKanban is already the kit *producer*.** [src/server/routes/kitRoutes.ts](../../src/server/routes/kitRoutes.ts) (Spec 011) generates project kits via `KitGenerationService`, `ApiTokenService`, and `KitEncryptionService`. The [`Cowboy-59/wxKanban-agent-Orchestrator`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator) repo on GitHub is the visible output of (or close cousin of) that generator.
2. **wxKanban already has the complete 018-era gateway** implemented as five files in [src/server/services/gateway/](../../src/server/services/gateway/) — `GatewayService`, `GatewayAuditLog`, `GuardrailsPolicy`, `LLMRouter`, `MCPToolCallBuilder` — exposed via [src/server/routes/gateway.ts](../../src/server/routes/gateway.ts).
3. **wxKanban also has 018-era stubs** that 019 explicitly obsoletes: [src/server/routes/parity.ts](../../src/server/routes/parity.ts) and [src/server/routes/drift.ts](../../src/server/routes/drift.ts).

So this migration is *not* a greenfield install. It is a three-way reconciliation:

- The **kit's runtime** (`wxkanban-agent/`, `mcp-server/` in the orchestrator repo) — what 019 wants
- The **kit producer** (`KitGenerationService` in wxKanban) — what produces installable kits
- The **legacy in-process gateway** (`src/server/services/gateway/*` in wxKanban) — what 018 left behind

The end state per 019 is: the kit producer produces kits whose runtime matches the orchestrator design; wxKanban dogfoods that kit; the legacy in-process gateway is removed.

---

## Inventory: Files in scope

### 018-era code in wxKanban that must be reconciled or removed

| File | Lines | Purpose | Fate under 019 |
|---|---|---|---|
| [src/server/routes/gateway.ts](../../src/server/routes/gateway.ts) | 45 | Express route exposing `POST /api/gateway/invoke` | **Reduce to thin proxy** that forwards to kit MCP server in Phase C; delete in Phase D |
| [src/server/services/gateway/GatewayService.ts](../../src/server/services/gateway/GatewayService.ts) | ? | Orchestrates intent → policy → router → tool call | **Extract** to kit's `core/orchestrator/workflow-engine.ts` layout; delete from wxKanban in Phase D |
| [src/server/services/gateway/GuardrailsPolicy.ts](../../src/server/services/gateway/GuardrailsPolicy.ts) | ? | 018 R2 — prompt injection / policy denial | **Extract** to kit's `core/policy/`; delete from wxKanban in Phase D |
| [src/server/services/gateway/LLMRouter.ts](../../src/server/services/gateway/LLMRouter.ts) | ? | 018 R3 — primary + fallback provider routing | **Extract** to kit's `workers/ai/ai-client.ts`; delete from wxKanban in Phase D |
| [src/server/services/gateway/MCPToolCallBuilder.ts](../../src/server/services/gateway/MCPToolCallBuilder.ts) | ? | 018 R1 — free-form → structured tool call | **Extract** to kit's `core/orchestrator/`; delete from wxKanban in Phase D |
| [src/server/services/gateway/GatewayAuditLog.ts](../../src/server/services/gateway/GatewayAuditLog.ts) | ? | 018 audit trail | **Replace** with `project.capture_event` MCP tool calls per 019 R10; delete in Phase D |
| [src/server/routes/parity.ts](../../src/server/routes/parity.ts) | 35 | 018 R6 parity contract | **Delete** — obsolete under single-tree model |
| [src/server/routes/drift.ts](../../src/server/routes/drift.ts) | 73 | 018 R10 cross-project drift | **Delete** — obsolete under single-tree model |

### Kit producer code that needs alignment with 019

| File | Purpose | Action under 019 |
|---|---|---|
| [src/server/services/KitGenerationService.ts](../../src/server/services/KitGenerationService.ts) | Generates installable project kit | **Audit**: confirm output matches orchestrator repo layout (`wxkanban-agent/`, `mcp-server/`, `_wxAI/`, `scripts/`, `ai-settings.json`, `.wxkanban-project.json`). Update template to match 019 R1–R8. |
| [src/server/services/KitEncryptionService.ts](../../src/server/services/KitEncryptionService.ts) | Encrypts `DATABASE_URL` for embedding in kit | **Keep** — supports 019 Decision #3 (static encrypted URL). |
| [src/server/services/ApiTokenService.ts](../../src/server/services/ApiTokenService.ts) | Generates per-project API tokens | **Keep** — supports 019 R0 + Decision #4 (per-project token). |
| [src/server/routes/kitRoutes.ts](../../src/server/routes/kitRoutes.ts) | `GET /api/projects/:id/kit/preflight`, kit download endpoints | **Keep** — wxKanban remains the kit producer. |
| [src/server/routes/kitSetupRoutes.ts](../../src/server/routes/kitSetupRoutes.ts) | Setup wizard: verify-directory, write files locally | **Keep** — supports 019 R1 install flow. |

### Lifecycle code that may need refactoring

| File | Purpose | Action under 019 |
|---|---|---|
| [src/server/routes/lifecycle.ts](../../src/server/routes/lifecycle.ts) | Lifecycle stage transitions | **Verify** stage names match 019 R5 enum (`idea, scoped, specified, test_tasks_ready, implemented, handoff_ready`) |
| [src/server/routes/specificationLifecycle.ts](../../src/server/routes/specificationLifecycle.ts) | Spec lifecycle transitions | **Verify** policy enforcement matches 019 R5 |
| [src/server/services/SpecificationLifecycleService.ts](../../src/server/services/SpecificationLifecycleService.ts) | Lifecycle business logic | **Compare** against kit's `core/orchestrator/transitions.ts`; reconcile divergence |
| [src/server/services/PhaseService.ts](../../src/server/services/PhaseService.ts) | Phase management | **Compare** against kit's `core/policy/command-policy.ts`; reconcile |

---

## Phase A0 — Git Recovery (prerequisite to all phases)

**Discovered 2026-04-09:** the working directory at `e:\AI_Development\wxperts\wxKanban` is **not currently a git repository**. It has `.gitignore` and `.gitattributes` files, but no `.git/` directory. The remote at [https://github.com/Cowboy-59/wxKanban.git](https://github.com/Cowboy-59/wxKanban.git) is presumably authoritative, but the local working tree has no link to it. A sibling directory at `e:\AI_Development\wxperts\wxKanban - Copy\` does have a `.git/` and may be a stale snapshot.

This must be resolved before Phase A1, because Phase A1 ("snapshot current state via git tag") and the rollback strategies in every later phase assume git is functional.

**The fix is destructive and needs your decision before any action.** Three options:

1. **Re-clone from GitHub.** Move the current working directory aside (rename to `wxKanban.local-2026-04-09`), `git clone https://github.com/Cowboy-59/wxKanban.git`, then manually merge any uncommitted local changes back in. **Safest if the remote is authoritative and the working tree has minimal local changes.** Requires diffing the local working tree against the fresh clone to identify drift.
2. **Re-initialize in place.** `cd wxKanban && git init && git remote add origin https://github.com/Cowboy-59/wxKanban.git && git fetch origin && git reset --soft origin/main` (or whatever the default branch is). This preserves the working tree but rewrites history; if the working tree has diverged from `origin/main`, you'll need to commit the divergence as a new commit. **Riskier — needs careful staging.**
3. **Adopt `wxKanban - Copy/` as the canonical worktree.** Investigate whether `wxKanban - Copy/.git` is recent enough to serve as the base. Probably stale; not recommended unless you tell me otherwise.

**Recommendation: Option 1 (re-clone).** It's the only option with a clear undo path (the renamed-aside copy). Steps:

1. **A0.1.** Verify the remote is reachable: `gh repo view Cowboy-59/wxKanban` and `git ls-remote https://github.com/Cowboy-59/wxKanban.git HEAD` from any directory.
2. **A0.2.** Inventory uncommitted local changes: list every file in `wxKanban/` and compare against the GitHub `main` tree. Identify which files exist locally but not in `main`, which differ, which are missing locally. (This is grunt work; can be automated with a script.)
3. **A0.3.** Decide for each diverged file: keep local, take remote, or merge. Most spec files (including 019 itself, which exists locally but may not yet be on GitHub) will need to be staged as new commits after the re-clone.
4. **A0.4.** Rename current working dir aside: `mv wxKanban wxKanban.local-2026-04-09-pre019`.
5. **A0.5.** Fresh clone: `git clone https://github.com/Cowboy-59/wxKanban.git wxKanban`.
6. **A0.6.** Copy diverged-but-keep files from `wxKanban.local-2026-04-09-pre019/` into the fresh `wxKanban/` working tree. Pay particular attention to:
   - `specs/Project-Scope/018-unified-cli-mcp-restructure.md` (banner edit)
   - `specs/Project-Scope/019-agent-orchestrator-kit.md` (entirely new)
   - `specs/019-agent-orchestrator-kit/` (entirely new directory with this migration plan + secrets runbook)
   - Any uncommitted source code changes
7. **A0.7.** Verify type-check passes: `npm run check-types`.
8. **A0.8.** Commit the spec 019 work as the first new commit: `git add specs/ && git commit -m "spec 019: agent orchestrator kit (supersedes 018)"`.
9. **A0.9.** **Stop.** Do not push yet. Show the commit to the user and confirm before pushing to `main`.

**Phase A0 exit criteria**:
- `git status` works in the working directory and reports a clean tree (or a known set of expected modifications)
- `git log` shows real history matching `origin/main`
- All spec 019 work is staged or committed but **not pushed**
- The previous working dir is preserved at `wxKanban.local-2026-04-09-pre019` for rollback

**Rollback for Phase A0**: `rm -rf wxKanban && mv wxKanban.local-2026-04-09-pre019 wxKanban`. The aside copy is the only undo, so don't delete it until at least Phase B is complete.

---

## Phase A — Install Alongside (non-breaking)

**Goal**: Get the kit running inside the wxKanban repo without disturbing any existing functionality. Both the legacy in-process gateway and the new kit MCP server run side by side. No traffic is routed through the kit yet.

**Steps**:

1. **A1. Snapshot current state.** Tag the wxKanban repo at a known-good commit before any 019 work begins. Record: gateway services list, route inventory, lifecycle service version.
2. **A2. Add `.wxkanban-kit/` to wxKanban.** Clone or copy the orchestrator kit's `wxkanban-agent/`, `mcp-server/`, `_wxAI/`, `scripts/`, `ai-settings.json` into a new top-level directory (`.wxkanban-kit/`) inside the wxKanban repo. Add `.wxkanban-kit/node_modules` to `.gitignore`.
3. **A3. Generate `.wxkanban-project.json` for wxKanban itself.** Run `init` against wxKanban: generate a `projectid`, generate a `WXKANBAN_API_TOKEN`, write the file. The `projectid` here is wxKanban's *own* identity as a consumer of the kit.
4. **A4. Register wxKanban as a project row.** Insert a row in the `projects` table for the wxKanban `projectid`. Mark it `kitVersion = <orchestrator-repo-tag>`, `consumerType = 'self-host'`.
5. **A5. Start the kit MCP server.** `cd .wxkanban-kit && node scripts/setup-mcp.mjs`. Verify it binds to `localhost:3002` and responds to `mcp-health-check.mjs`. Note: this **must use a different port from any wxKanban server already running**, or the kit MCP server must be configured to use a different port (e.g., 3003) for Phase A to avoid conflicts with the existing `gateway.ts` route on the main Express server.
6. **A6. Wire `npm run kit:start` and `npm run kit:health`** scripts in the root `package.json` so the kit can be started/health-checked from wxKanban's developer workflow without `cd`.
7. **A7. Verify legacy gateway still works.** Hit `POST /api/gateway/invoke` with a known intent. Confirm the legacy `GatewayService` path still returns its previous results. **No code changes to legacy gateway in Phase A.**

**Phase A exit criteria**:
- Kit MCP server boots and passes health check
- wxKanban project row exists in DB with kit metadata
- Legacy `gateway.ts` continues to serve traffic unchanged
- Both paths can be invoked independently

**Rollback for Phase A**: delete `.wxkanban-kit/` and the wxKanban project row. Zero blast radius.

---

## Phase B — Parallel Run with Divergence Logging

**Goal**: Route a defined subset of commands through *both* the legacy gateway and the kit, compare outputs, log any divergence. Production traffic still hits the legacy path; the kit path runs as a shadow.

**Steps**:

1. **B1. Add a shadow-call wrapper to `GatewayService`.** When a request matches a defined "shadow set" (e.g., `buildscope`, `createspecs`), `GatewayService.invoke()` continues to execute the legacy path but additionally fires-and-forgets the same intent to the kit's HTTP gateway. The legacy result is returned to the user; the kit result is logged.
2. **B2. Build a divergence comparator.** A small service (`src/server/services/migration/KitDivergenceComparator.ts`) receives both results, normalizes them (strip timestamps, request IDs, audit trail UUIDs), and compares the structural payload. Differences are written to a new `gatewaydivergence` table and to Pino logs.
3. **B3. Define the shadow set.** Start with read-only or idempotent commands. Recommended initial set:
   - `buildscope` (worker is read-only against repo state)
   - `createspecs --dry-run` (no DB writes)
   - `list-open-items` (pure read)
4. **B4. Run for at least 7 days of regular use.** Track divergence rate, categorize by cause (timestamp drift, schema mismatch, AI provider variance, real bug).
5. **B5. Triage divergences in the kit, not in wxKanban.** When a divergence is found, the fix goes into the orchestrator repo and a new kit version is published. wxKanban pulls the new kit version. **wxKanban-side patches to the legacy gateway are forbidden in Phase B** — this is the rule that proves the kit is portable.
6. **B6. Promote shadow set commands one at a time** to production routing. When a command's divergence rate is zero for 48 hours of normal traffic, flip its routing flag from `legacy` to `kit`. Roll back if any user-visible regression appears.

**Phase B exit criteria**:
- Every command in the canonical 019 R4 set (`buildscope`, `createspecs`, `createtesttasks`, `implement`, `dbpush`, `humantest`, `beta`, `release`, `createhandoff`) has been routed through the kit at least once with zero divergence
- All divergences encountered have been resolved by kit changes, not wxKanban patches
- The `gatewaydivergence` table has been quiet for 7 consecutive days

**Rollback for Phase B**: flip routing flags back to `legacy`. Shadow comparator stays in place. Zero blast radius.

---

## Phase C — Cutover

**Goal**: Make the kit MCP server the sole execution path. The legacy in-process gateway becomes a thin HTTP proxy.

**Steps**:

1. **C1. Reduce `gateway.ts` to a proxy.** Replace the body of `POST /api/gateway/invoke` with a single `fetch` to `http://localhost:3002/call` (or wherever the kit MCP gateway listens). Preserve the existing request/response envelope so external API consumers see no change.
2. **C2. Remove `GatewayService`'s shadow-call wrapper.** Shadow comparator service stays for now (it becomes the rollback safety net).
3. **C3. Update internal callers** that previously imported `GatewayService` directly (not via the route) to call the proxy route or, preferably, the kit gateway directly. Search for `import.*GatewayService` and rewrite each usage.
4. **C4. Verify all integration tests pass.** Both the legacy paths (now proxies) and any direct kit-gateway calls.
5. **C5. Run wxKanban for 7 days in Phase C state.** Monitor for any regression. If any appears, revert C1 and re-enable shadow mode.

**Phase C exit criteria**:
- `gateway.ts` is a pure proxy
- No internal code references `GatewayService` directly
- 7 days of clean production use
- All integration tests green

**Rollback for Phase C**: revert C1 (`gateway.ts` proxy). The legacy `GatewayService` and its dependencies are still in the tree, so the rollback is a single-file revert.

---

## Phase D — Cleanup

**Goal**: Remove dead 018-era code now that the kit is the source of truth.

**Steps**:

1. **D1. Delete the legacy gateway services**:
   - `src/server/services/gateway/GatewayService.ts`
   - `src/server/services/gateway/GuardrailsPolicy.ts`
   - `src/server/services/gateway/LLMRouter.ts`
   - `src/server/services/gateway/MCPToolCallBuilder.ts`
   - `src/server/services/gateway/GatewayAuditLog.ts`
   - …plus their compiled `.js` / `.d.ts` artifacts
2. **D2. Delete `gateway.ts` proxy entirely.** No external consumers of `/api/gateway/invoke` are known as of 2026-04-09. Pre-deletion verification: run `grep -rn "api/gateway/invoke" .` across the wxKanban repo, plus any consumer repo or doc site you control. If any reference is found, migrate it before deletion or reinstate the proxy as a stop-gap shim with an explicit sunset date.
3. **D3. Delete obsolete 018 routes**:
   - `src/server/routes/parity.ts` (R6 obsolete)
   - `src/server/routes/drift.ts` (R10 obsolete)
   - Remove their route registrations from `src/server/index.ts`
4. **D4. Delete the divergence comparator** (`KitDivergenceComparator.ts`) and the `gatewaydivergence` table once Phase D has been stable for 30 days. Keep the table if you want long-term audit history.
5. **D5. Remove `~/shared/types/gateway.ts`** and any types now exclusively used by deleted code.
6. **D6. Run `npm run check-types`** and fix any orphaned imports.
7. **D7. Update `specs/projectlifecycle.md`** to reflect that 019 R12 is complete.
8. **D8. Update [CLAUDE.md](../../CLAUDE.md)** to remove any references to the legacy in-process gateway and point developers at the kit instead.

**Phase D exit criteria**:
- All files in the "Inventory: 018-era code" table are deleted
- `npm run check-types` passes
- All tests pass
- `specs/projectlifecycle.md` reflects the new state

**Rollback for Phase D**: revert the deletion commits. This is the irreversible phase — do not enter it until Phase C has been stable for at least 7 days.

---

## Special: Kit Producer Reconciliation (parallel track)

This work happens *alongside* Phases A–D, not in series, because it lives in `KitGenerationService` rather than the gateway.

1. **K1. Audit `KitGenerationService` output.** Compare the files it generates against the actual contents of the [`Cowboy-59/wxKanban-agent-Orchestrator`](https://github.com/Cowboy-59/wxKanban-agent-Orchestrator) repo. Identify drift.
2. **K2. Update kit templates** to match the orchestrator repo layout exactly: `wxkanban-agent/`, `mcp-server/`, `_wxAI/`, `scripts/`, `ai-settings.json` placeholder shape, `.wxkanban-project.json` schema.
3. **K3. Source of truth: GitHub orchestrator repo (resolved 2026-04-09).** `KitGenerationService` will be **deleted**. `kitRoutes.ts` `/download` becomes a thin endpoint that fetches the latest GitHub release tarball, injects per-project secrets server-side, and streams the result to the user. This collapses two sources of truth into one and aligns with 019 Decision #12 (GitHub-release distribution).
4. **K4. Refactor `kitRoutes.ts` `/download`** to operate as a **non-secret tarball fetcher with per-project secret overlay**. The work is:
   - **K4a. Fetch the non-secret tarball.** GET `https://api.github.com/repos/Cowboy-59/wxKanban-agent-Orchestrator/releases/latest`, download the attached `kit.tar.gz` asset, verify its SHA-256 checksum against the release metadata.
   - **K4b. Generate per-project secrets fresh.** Call `ApiTokenService.getOrCreateToken(userId, companyId, undefined, projectId)` to mint (or reuse) the project's `WXKANBAN_API_TOKEN`. Call `KitEncryptionService.encryptDatabaseUrl(process.env.DATABASE_URL, apiToken.token)` to produce the per-project encrypted DB URL. **This preserves the existing per-project encryption model from `KitGenerationService.generateEnvFile()` (lines 677–732) and Decision #3 in spec 019.** The encryption is per-install, keyed on the per-install API token; the GitHub tarball contains no secrets.
   - **K4c. Overlay secrets onto the tarball.** Open the downloaded tarball in memory, find these files, and rewrite them with per-project values:
     - `ai-settings.json` — inject `DATABASE_URL_ENCRYPTED`, `WXKANBAN_API_TOKEN`, `WXKANBAN_PROJECT_ID`, `API_KEY` (mirrors `KitGenerationService.generateAiSettings()` lines 517–583)
     - `.env` — inject the same set (mirrors `generateEnvFile()` lines 694–729)
     - `.wxkanban-project.json` — inject `projectId`, `createdAt`, `kitVersion` (mirrors `generateProjectConfig()` lines 653–671)
     - `mcp-server/src/config.ts` and `mcp-server/dist/config.js` — patch the embedded credentials literal (mirrors lines 302–323 of `KitGenerationService`)
     - `AI.md` — inject `projectId` and mode (mirrors `generateAiContext()` lines 588–648)
   - **K4d. Re-pack and stream.** Re-tar the modified tree, stream the result to the HTTP response with `Content-Type: application/gzip`.
   - **K4e. Operational warning to surface in the install guide.** The downloaded tarball contains the encrypted DB URL **and** the API token that decrypts it, sitting in the same file (`ai-settings.json`). Per spec 019 Decision #3 (corrected 2026-04-09), the installer is responsible for moving the API token to a separate secret store after `init` completes. The kit cannot enforce this — it can only document it. This is a known weakness inherited from `KitGenerationService` and should be addressed in a future spec.
   - **K4f. Delete `KitGenerationService` after K4a–K4e are working in production.** Delete the file plus its references in `kitRoutes.ts`. Decide separately whether to drop the `projectkits` and `projectkitfiles` DB tables — they may have value as audit history of who downloaded which kit version when. Recommendation: keep the tables, drop only the generation logic.
   - **Retained:** `KitEncryptionService` (K4b), `ApiTokenService` (K4b).
   - **Verify before any deletion:** grep for `KitGenerationService`, `kitGenerationService`, and any imports of `projectkits`/`projectkitfiles` outside `KitGenerationService` and the audit-history use case.
5. **K5. Update `kitSetupRoutes.ts` setup wizard** to match the new install flow described in 019 R1.

---

## Sequencing summary

```
Phase A (install alongside)  ──┐
                               ├──> Phase B (shadow run)  ──> Phase C (cutover)  ──> Phase D (cleanup)
Kit Producer (K1–K5)  ─────────┘                                                          │
                                                                                          │
                                                                                          ▼
                                                                                      019 R12 done
```

Phase A and the Kit Producer track can start in parallel. Phase B cannot start until Phase A and K1–K3 are complete (the kit must match what's installed). Phases C and D are strictly sequential.

---

## Risks and mitigations

| Risk | Mitigation |
|---|---|
| Kit MCP server port conflict with existing wxKanban server | Phase A6: configure kit MCP on a non-default port via env var; document in `.wxkanban-project.json` |
| `KitGenerationService` and orchestrator repo drift silently during Phases A–B | K1 audit happens before Phase B; Phase B forbids wxKanban-side patches to force fixes upstream |
| Divergence rate stays non-zero in Phase B due to AI provider non-determinism | Comparator must normalize AI-generated content; if structural divergence is unavoidable, narrow shadow set to deterministic commands only |
| External API consumer relies on `POST /api/gateway/invoke` URL shape | None known (resolved 2026-04-09). D2 mandates a `grep` sweep before deletion as final check. |
| Lifecycle stage names diverge between wxKanban's `SpecificationLifecycleService` and kit's `core/orchestrator/transitions.ts` | Inventory item under "Lifecycle code" — verify before Phase B; reconcile in the kit, not in wxKanban |
| 018-era `parity.ts` / `drift.ts` are referenced by other code | Grep for `parity` / `drift` route imports before D3; if found, refactor or document as deferred |

---

## Resolved decisions for this migration plan

_All four prior open questions resolved on 2026-04-09._

1. **K3 source-of-truth: K3b.** The GitHub orchestrator repo is the single source of truth. `KitGenerationService` will be **deleted**. `kitRoutes.ts` `/download` becomes a thin endpoint that streams the latest GitHub release tarball, injecting the encrypted DB URL server-side at download time. `KitEncryptionService` is retained for that injection step.
2. **Phase B bake time: 7 days minimum** of normal traffic with zero divergence per command before promotion.
3. **Kit MCP port: 3002** (default). No conflict in current wxKanban dev setup.
4. **External consumers of `/api/gateway/invoke`: none known.** Phase D2 plan is to **delete `gateway.ts` outright** rather than keep a sunset shim, contingent on a `grep` sweep at the start of Phase D confirming no external code, scripts, or docs reference the URL. If the sweep finds any reference, that reference is migrated or the shim is reinstated as a stop-gap with a sunset date.

## Status

- **Date**: 2026-04-09
- **Phase**: planning — no code changes yet
- **Blocked on**: approval of this plan + answers to the four open questions above
- **Next step on approval**: Phase A1 (snapshot) and K1 (kit producer audit) in parallel
