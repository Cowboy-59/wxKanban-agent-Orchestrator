# Feedback Triage — wxKanban (sink `ba924193-0335-4080-9fa6-33cd6b81300a`) — 2026-08-13

Sink read with `incoming: true` — these are **other companies' reports filed into the sink wxperts
owns**, not our own submissions. Enumerated per status with `includeHidden: true`, `maxItems: 100`.

## Summary

| | |
|---|---|
| Reports swept | **102** (new 72 / triaged 14 / needsinfo 0 / inprogress 5 / resolved 11 / declined 0) |
| Open reports (new + triaged + inprogress) | 91 |
| Open clusters | 16 |
| Auto-resolved this run | **5** (2 clusters) |
| Awaiting release (fixed, not shipped) | 1 cluster (C7 — sitting in-tree since 2026-08-12) |
| Truncation risk | **none** — largest status returned 72 of a 100 cap |

Cross-check: an unfiltered call confirms the same newest item. Per-status counts sum to 102, above
the 100 cap, so the *unfiltered* list alone would have truncated — the per-status enumeration is the
complete one. No status hit the cap.

---

## Ranked open clusters

| # | Cluster | Sev | Reporters | Verdict | Effort |
|---|---------|-----|-----------|---------|--------|
| C1 | `upgrade-kit.mjs` extracts over project root — destroys `package.json` + `.claude/**/scripts/**` | **S1** | **12** | STILL-BROKEN | L |
| C2 | Conversion extractors exit 0 while writing zero/partial output | **S1** | 6 | STILL-BROKEN | L |
| C3 | No update path for a materialized scope (dbpush/create_specs/buildscope --edit) | **S1** | 12 | **PARTIAL — fix deployed, field-contradicted** | M (verify) |
| C4 | `buildscope` discards authored FRs/scenarios; emits placeholder shell; doesn't persist | **S1** | 6 | STILL-BROKEN | M |
| C5 | shadcn-ui MCP registered as `cmd /c npx` → console window per VS Code window | S2 | 3 | STILL-BROKEN | S |
| C6 | Project stuck in "Design" — `implement` hard-blocked, no stage-advance path | S2 | 5 | STILL-BROKEN | M |
| C7 | wxCreateTestPlan/preTest hardwired to Express+Drizzle+Postgres | S2 | 3 | **FIXED-NOT-SHIPPED** | S (release) |
| C8 | `inventory-functions.mjs` misses routers not literally named `router`/`app`/`r` | S2 | 2 | STILL-BROKEN | S |
| C9 | `upsert_document` creates duplicates instead of matching (title / ProjectStack doctype) | S2 | 4 | PARTIAL | M |
| C10 | `capture_event` rejects the type `implement.md` Phase 3 tells you to send | S2 | 2 | STILL-BROKEN | **XS** |
| C11 | UI-saved project state not reflected by the API (audit config, theme ref, rollups, board phase) | S2 | 5 | PARTIAL | M |
| C12 | MCP surface has no delete/update for documents, tasks, scopes | S4 | 5 | STILL-BROKEN (request) | M |
| C13 | Dev Cockpit refresh: console window + repeating URI trust dialog | S3 | 1 | PARTIAL | S |
| C14 | **Misrouted customer-app findings landing in our sink** (~20 reports) | S3 | 4 orgs | STILL-BROKEN (process) | S |
| C15 | Duplicate/phantom spec generation and orphan spec rows | S2 | 3 | UNVERIFIABLE | M |
| C16 | Small asks: attachments on reports, spec↔commit links, core-complete state | S4 | 4 | Requests | M |

**Batch by area.** C1 + C5 + C13 are all "the kit's own file/process handling on Windows" — one
release. C3 + C4 + C9 + C15 are all "spec/document identity in the MCP write path" — one release.
C7 + C8 + C2 are all "QA/conversion tooling honesty" — one release, and C7 is already built.

---

## Resolved this run (writes I made)

| Report ID | Cluster | Commit | Version | Note sent |
|---|---|---|---|---|
| `3f665c75-8391-4e97-b864-75859c04684c` | Missing kit scripts | `6c4e67aa` | kit v1.7.49 | Verified against shipped v1.7.54 archive |
| `a01a6b7c-c07f-455a-b5d3-4e696cf8a5da` | Missing kit scripts (fuller scope) | `6c4e67aa` | kit v1.7.49 | + noted aef6a602 stays open |
| `b4dd6acc-7783-429e-bb50-90b5791dc01c` | Missing kit scripts (dup) | `6c4e67aa` | kit v1.7.49 | Pointer to 3f665c75 |
| `192e08c1-9c73-4d72-8aa3-03d9fb29701c` | `tsconfig.wxdbanalyze.json` TS5058 | `6c4e67aa` (T016) | kit v1.7.49 | + explicitly told them C1 is NOT fixed |
| `c9fc52d4-b0fa-410f-938b-2d2a9a765c18` | Spanish "todo" preflight block | `808a2537` (T010+T011) | hosted MCP, 2026-08-05 | Bilingual; corrected one claim in their report |

**Evidence for the kit-scripts resolves** — I did not take the release note on trust. I downloaded
`kit.zip` from the v1.7.54 GitHub release, extracted it, and ran a resolver over the archive's own
`package.json`: every `scripts/*` path it references exists in the extracted tree (the one apparent
miss, `db:analyze → scripts/cli.ts`, is my regex clipping the real path
`_wxAI/skills/wxDBAnalyze/scripts/cli.ts`, which is present). `scripts/kit-status.mjs` and
`tsconfig.wxdbanalyze.json` are both in the archive.

**Evidence for the Spanish resolve** — `shared/preflight/src/text-utils.ts:61` `markerPattern()` is
now case-sensitive with a guard comment ("The absence of the `i` flag is the entire fix — do not add
it back"), and `shared/preflight/src/extractors.ts:45` `extractActorValue()` accepts emphasis around
the label. Both landed in `808a2537`, which is an ancestor of `origin/main`; the hosted MCP
auto-deploys on push, and `create_specs` preflight is server-side, so the reporter has it.

---

## Recommend declining (NOT actioned — your call)

| Report ID | Why |
|---|---|
| `d46cbaa4`, `876f3e45`, `86a92cb8`, `a87755a9`, `87678f78`, `27330ecc`, `a59243c7` | Findings about **the customer's own app**, not wxKanban. Several say outright "deliberately NOT fixed" or "now fixed" — they are the customer's own decision log. |
| `e63fa4a8`, `1dc2af58`, `4074e065`, `88b5b46b`, `abcc73a0`, `10745346`, `5c14f487`, `be69c47d`, `720b097e`, `1cabd768`, `4d1ace66`, `68ee1fb1` | All from project `9f74074c` — 12 defect reports about an Italian restaurant/POS app (allergens, fiscal receipts, FatturaPA XML, 185 tables / 15 FKs). Zero relate to wxKanban. |
| `b7a5bb76`, `9bb4d060` | `proactive-by-ddes` app security findings (SESSION_SECRET default, `failedattempts` retention). Their code, their repo. |

**Do not just decline these.** See C14 — they are a symptom of our own skill, and declining 20
reports without fixing the routing guarantees 20 more next month.

## Recommend asking the reporter (NOT sent — your call)

| Report ID | Question I would send |
|---|---|
| `697ece7a` | Was your 2026-08-08 retest run against the hosted MCP after 2026-08-05? `create_specs` was changed on 2026-08-05 to update on identity rather than refuse. If it still blocks, the exact error string and timestamp would isolate whether the deploy or the code is at fault. |
| `749fb704` | Which process owns the window — can you run `Get-CimInstance Win32_Process -Filter "Name='node.exe'"` while one is open? Reporter `2eee3c17` traced theirs to the shadcn-ui MCP, not the gateway; if yours is the same, v1.7.54 will not have fixed it. |
| `00c194f9` | Your project predates SCOPE-112, which replaced the `audittype` dropdown with a Compliance tab that writes the real enablement flags. Does re-setting the frameworks in the Compliance tab make `get_audit_config` correct? That distinguishes a live bug from an unmigrated row. |
| `ef88bbee` | Yes please — send the `.txa`/`.dctx` files. The reporter offered; cwConversion has no `.dctx` (XML dictionary) reader at all and this is the only sample we would have. |
| `f0df8d41` | Which page of the PC SOFT export carries the project statistics block, and can you share it? The proposed fix (reconcile written counts against the export's own declared counts) needs that block's exact shape. |
| `6611ee99` | Confirm defect B (FK direction from `parse_links()`) against a genuine PCSoft export — the reporter flagged their own source PDF as reconstructed and asked us not to action it unverified. |

---

## Detail

### C1 — `upgrade-kit.mjs` destroys project-owned files — **S1** — 12 reporters — STILL-BROKEN

Members: `aef6a602`, `4294090f`, `24ee838a`, `a60b95b3` (inprogress) · `8b6fae5a`, `6edf2099`,
`b2eb740b`, `e1447ae1`, `faf43e32`, `ea646b70`, `302b125d`, `89617d54` (new).

Twelve reporters across eight distinct customer projects, versions v1.7.39 → v1.7.49. Two independent
loss classes: root `package.json` replaced wholesale (project scripts *and* declared dependencies
gone), and `.claude/**/scripts/**` reverted to stock.

**S1, and silent wrongness is why.** The dependency loss is latent — `node_modules` survives, so
typecheck, tests and build stay green until the next unrelated `npm install` prunes and the repo
breaks a day later, pointing the investigation at the wrong change (`8b6fae5a`, in detail). The
script revert is worse: reverted `pcsoft-doc-split.py` writes **zero** `.table.md` files and loses a
45-table data model while the console summary still reports success; reverted
`pcsoft-procs-to-scope.py` reports 0 procedures instead of 336 on lowercase exports. `6edf2099`
reports the reverted `build:server` line producing a bundle that exits 0 and dies at runtime.
`b2eb740b` proves the overwrite delivered **zero** upstream value: all four reverted scripts were
SHA-256 byte-identical between v1.7.48 and v1.7.49.

**Verified STILL-BROKEN on the shipped path**, not inferred. I extracted the released v1.7.54
`kit.zip` and read its `scripts/upgrade-kit.mjs`: `extractArchive()` (line 331) runs
`Expand-Archive -LiteralPath ... -Force` over the project root, or `tar -xzf` with `cwd=root`. There
is **no** manifest, no snapshot, no `package.json` merge, no preserve list, no `*.kit-new`. `grep
package.json scripts/upgrade-kit.mjs` in the shipped archive returns nothing at all — the file is
simply carried in the archive and lands on top. The `--confirm-overwrite` gate (line 391) protects
only CLAUDE.md / AI.md / ProjectOverview.md / README.md, and only on the GitHub fallback branch —
exactly the asymmetry `24ee838a` describes.

`specs/121-kit-upgrade-file-preservation/tasks.md` confirms the design exists and **none of it is
built**: T001–T013 are all `todo`. Only T014–T017 (a different problem — see Resolved) are released.

- **What to change** — target repo is `wxKanban-agent-Orchestrator`, not this one. T005 (merge
  `package.json`) alone closes 3 of the 5 original field reports; T001+T002 (manifest + comparator)
  plus T004 close the script-revert half. T003 (unconditional pre-upgrade snapshot) is independent
  and could land first as standalone protection this week.
- **Blast radius** — every consumer upgrade. T011 (server-side 409 gate) **must deploy before** the
  kit release or the first upgraders into the fixed version get no protection.
- **How to prove it** — on a scratch consumer project: add a script + a `file:` dependency + patch a
  `.claude/wxConversion/scripts/*.py`, run `node scripts/upgrade-kit.mjs`, then `git diff
  package.json` and re-hash the script. Then `rm -rf node_modules && npm ci && npm run build`.
  Unit tests will not catch this.
- **Effort** — L. **Ships with** — C5, C13.

### C2 — Conversion extractors exit 0 while writing zero or partial output — **S1** — 6 — STILL-BROKEN

Members: `f0df8d41`, `6611ee99`, `4d285663`, `0b67737e`, `ef88bbee`, `4a437493` (triaged).

Silent wrongness, at estate scale. `f0df8d41` documents four distinct silent failures across **nine**
converted applications and states that at least two substantive wrong conclusions have already been
traced to incomplete extracts — a heading-variant miss that wrote zero `.table.md` files (48 tables
lost, exit 0); the extractor matching only `procedure` and not `function` (37 methods dropped,
including a whole record-manager save API); 223 of 669 controls found; natural keys dropped from DDL.

Verified in tree: `_wxAI/skills/wxConversion/scripts/pcsoft-doc-split.py` has **no** statistics-block
reconciliation (the only non-zero exit is `--fail-on-secrets` from SCOPE-125, unrelated).
`pcsoft-page-to-react.py` has no `Sidebar`/`SDB` handling (`6611ee99`) and
`pcsoft-schema-to-sql.py` has no `2-byte integer` / `4-byte real` HFSQL types (`4d285663`,
data-losing). Zero Spanish vocabulary anywhere in the splitter (`0b67737e`). The `<Type> : <Name>`
desktop header format *is* now handled (lines 74/103/224/790), so `4d285663`'s defect 1 is partly
addressed — but a partial fix here is the whole problem.

The single highest-value change is the one three separate reporters converged on independently:
**reconcile written counts against the export's own declared statistics block and exit non-zero on
mismatch.** `f0df8d41` states this would have caught all four of their failures. A run producing zero
table files and printing success is worse than a crash.

- **What to change** — `_wxAI/skills/wxConversion/scripts/pcsoft-doc-split.py`: add a post-extraction
  reconciliation pass. Independently, make `match_type()` failure loud in `pcsoft-schema-to-sql.py`
  and emit a warning for every skipped unrecognised `<Type> : <Name>` block in `pcsoft-page-to-react.py`.
- **Blast radius** — every conversion customer; several offered patches.
- **How to prove it** — run the splitter against a real PCSoft export with a known element count and
  assert non-zero exit when the counts disagree.
- **Effort** — L (S for the fail-loud warnings alone, which is most of the value).
- **Ships with** — C7, C8.

### C3 — No update path for a materialized scope — **S1** — 12 — **PARTIAL, and this is the key finding**

Members: `ff0eb155`, `ac139158`, `975ada4a`, `a02e6ec5`, `7d581603`, `27f18632` (escalation),
`697ece7a`, `914af275`, `0304ff5d`, `9b7e1a8d`, `2a2c4860`, `3de3efa6`.

Largest and oldest cluster; includes a formal ESCALATION (`27f18632`) naming six unresolved tickets
and complaining they were all still status `new` with no vendor response.

**The fix appears to be built and deployed.** SCOPE-124 landed 2026-08-05 and I verified it in code:
`wxkanban-agent/dbpush.ts:548-550` now builds `knownSpecNumbers` from authoritative spec identity
rather than parsing task titles (`MODIFIED-BY: [SCOPE 124 / T005]` at :489, closing `7d581603`'s
exact root cause); `mcp-server/src/server.ts:2740` "the guard now UPDATES instead of refusing"
(closing `914af275`); `mcp-server/src/utils/project-kit.ts:1161` makes `buildscope --edit` a
read-modify-write instead of a blank re-interview (closing `ff0eb155` defect 1);
`mcp-server/src/utils/spec-persistence.ts` defines one identity rule shared by both writers.

**I did not resolve any of them, because the delivery evidence does not hold.** Two problems:

1. `697ece7a` was filed **2026-08-08**, three days after the server fix deployed, and reports the
   same symptom with a concrete repro: "`create_specs` again → blocked: 'spec NNN already exists /
   Refusing to create a duplicate'". Either the deploy did not carry it, the guard has a path the fix
   misses, or the reporter is describing pre-fix experience. All three are possible; none is verified.
2. The kit half missed its window. SCOPE-124's commits are 2026-08-05 20:57–00:12 UTC; kit **v1.7.49
   published at 14:43 UTC that same day**, i.e. *before* them. The first release carrying the
   `dbpush.ts` change is v1.7.52 (2026-08-10). Anyone still on v1.7.49 has the server fix and the old
   `dbpush`.

- **What to prove, before anything else** — on a scratch project against the hosted MCP: `create_specs`
  a scope, edit it, `create_specs` again, and confirm it reports *updated* not *blocked*. Then
  `dbpush` twice from a v1.7.52+ kit and confirm `specsUpdated > 0`. **One 20-minute run converts
  this cluster from PARTIAL to 12 resolvable reports** — by a wide margin the highest-leverage action
  on this list.
- **Effort** — M (verification), then S (replies). **Ships with** — C4, C9, C15.

### C4 — `buildscope` produces a placeholder shell and discards authored input — **S1** — 6 — STILL-BROKEN

Members: `a02e6ec5`, `17b7ae98`, `a6734641`, `01b1ed0e`, `cd6245f9`/`6a6b1edc` (already resolved but
same cause).

Verified: `grep functionalRequirements|userScenarios mcp-server/src/server.ts` returns **nothing** —
there is still no input by which a caller can supply authored FRs or scenarios, two months after
`cd6245f9` reported it as silent data loss with `success: true`. `mcp-server/src/utils/project-kit.ts`
lines 777–802 unconditionally inject four `[NEEDS CLARIFICATION]` blocks, which then populate
`blockingIssues` and set `canProceedToCreateSpecs: false` — so `buildscope` reliably blocks on
placeholder text **it wrote itself**. Line 1136's `!input.quick` guard skips the draft assessment but
not the injected placeholders, which is precisely `17b7ae98`'s "quick/templateOnly do not bypass the
gate as documented" (3 occurrences).

This is S1 by the silent-wrongness rule: `cd6245f9` supplied 9 specific FRs and received 6 generic
ones ("Primary workflow support", "Business rule enforcement") with `qualityScore: 83` and every
section present. The loss is invisible until `createSpecs`.

`a02e6ec5` asks the fair question: either `buildscope` synthesizes real FRs from the material it is
given, **or** the governance rules stop treating hand-authored scope docs as an out-of-band
violation. Right now we mandate a path that cannot produce an implementation-ready scope.

- **What to change** — `mcp-server/src/server.ts` buildscope input schema + `project-kit.ts:777-802`.
  Accept `userScenarios`/`functionalRequirements`; when supplied, use them and do not inject the
  placeholder block for that section. At minimum, echo back any unknown input field rather than
  dropping it silently.
- **How to prove it** — call `project.buildscope` with 9 authored FRs and assert they appear in
  `scopeContent`; call with `quick:true, templateOnly:true` and assert `blockingIssues` is empty.
- **Effort** — M. **Ships with** — C3, C9, C15.

### C5 — shadcn-ui MCP registered as `cmd /c npx` — S2 — 3 — STILL-BROKEN

Members: `791024d3`, part of `2eee3c17`, probably `8a2b439a` and `749fb704`.

**Verified present in the shipped v1.7.54 archive**, `scripts/init.mjs:400`:

```js
{ type: 'stdio', command: 'cmd', args: ['/c', 'npx', '-y', '@jpisnice/shadcn-ui-mcp-server'] }
```

A stdio MCP server is launched by the client on **every project open**, through `cmd.exe` — a console
program — with a console layer the kit chose. `791024d3` counted ~10 windows and 20 node processes,
all of them this one server. This is the on-project-open case, and v1.7.54 did **not** fix it: that
release closed the six `spawn` sites in the kit's own scripts (verified: every shipped script now has
`windowsHide` count ≥ spawn count, and a build gate enforces it), but `init.mjs` does not spawn the
MCP — the host does, so `windowsHide` was never the lever here.

Both reporters proposed the same fix and it is cheap: add the package to devDependencies and register
`{command: 'node', args: ['node_modules/@jpisnice/shadcn-ui-mcp-server/build/index.js']}`, removing
the `cmd` console and two of three processes. `791024d3` also notes the components are already
vendored under `src/client/components/ui/`, so an opt-out (`WXKIT_SKIP_SHADCN_MCP=1`) is reasonable.

- **What to change** — shipped `scripts/init.mjs:396-401` (orchestrator repo).
- **How to prove it** — open two kit projects in VS Code on Windows; count console windows.
- **Effort** — S. **Ships with** — C1, C13.

### C6 — Project stuck in Design; `implement` hard-blocked — S2 — 5 — STILL-BROKEN

Members: `600d11d2`, `8369ad91`, `0304ff5d`, `7fee37ad`, `15429454`, and `bd756151` (the
`kit:configure` chicken-and-egg, same gate).

`600d11d2` did our root-cause work for us and it holds: `resolveCurrentPhase()` reads
`projectphases`, `transitions.ts` `canTransition` is referenced only by its own unit test, and no CLI
or MCP path writes a `projectphases` status. I confirmed the server side does have write logic
(`src/server/services/PhaseService.ts` inserts and updates `projectphases` at :38, :135, :431, :445,
:539) — but there is **no MCP tool** exposing it; `mcp-server/src/server.ts` offers
`update_spec_status` for *spec* lifecycle only. So the customer is right: nothing on their side can
move the project, and they reported zero transition events ever logged across four kit upgrades.

Per `8369ad91`, the product owner's position is that "Design" is a **scope** status and must never
gate the pipeline. If that stands, this is a deletion, not a feature.

- **What to change** — either remove project-stage gating of `implement` (make it advisory), or
  expose `project.advance_stage` over MCP. `bd756151` additionally needs `kit:configure` exempted
  from stage-gating outright — it is the bootstrap command that writes the file the gate reads.
- **Immediate** — two customers asked us to hand-advance their projects
  (`947a5614-0891-415e-a9f9-4d89f7e4c725`, `68cf2d4b-fb8e-442f-8290-3aa3fd2be701`). That is a 2-minute
  unblock and it has been outstanding since 2026-07-22.
- **Effort** — M.

### C7 — wxCreateTestPlan hardwired to Express+Drizzle+Postgres — S2 — 3 — **FIXED-NOT-SHIPPED**

Members: `6a0daeac`, `9ba8d647`, `4a437493` (triaged).

**Cheapest win on the list.** Commit `71ed91a1` (2026-08-12 11:43 CDT) fixes all three: adapters split
out of SKILL.md (`adapters/wxkanban-express.md`, `adapters/dotnet-wpf.md`) against a fixed
six-question contract, Phase 0 step 0 resolves the adapter from `stack.md` before anything else, and —
directly answering `4a437493` — both extractors now **hard-stop** rather than emitting a confident
empty result: `inventory-functions.mjs` exits 3 naming the extensions it actually found, and
`schema-analyze.mjs` exits 3 on no-TypeScript or TypeScript-but-no-pgTable so it can never score
referential integrity for a schema it did not read. The commit message states the failure precisely:
"a confident empty result reads as a result, which is worse than an error."

**It has not shipped.** Latest release is v1.7.54, published 2026-08-11T19:09Z — *before* this commit.
The tree is at kit 1.7.55, uncut. Three customers are waiting on work that is done.

- **Action** — cut a kit release. Nothing to build.
- **Effort** — S. **Ships with** — C2, C8 (fix C8 first so one release carries both).

### C8 — `inventory-functions.mjs` misses non-`router`-named routers — S2 — 2 — STILL-BROKEN

Members: `e0b0a9cf` (2026-08-13), `e63fa4a8` (F-INV-01).

`_wxAI/skills/wxCreateTestPlan/scripts/inventory-functions.mjs:252`:

```js
/^(router|app|r)$/i.test(node.expression.expression.text)
```

The identifier must be exactly `router`, `app` or `r`. The idiomatic one-Router-per-resource pattern
(`applicationsrouter.post(...)`, `authrouter.post(...)`) never matches. `e0b0a9cf` found 1 of 19
units; `e63fa4a8` found 1 of ~227 endpoints. Both reporters diagnosed it correctly without reading
the source.

Note this survives `71ed91a1` — that commit made the extractor fail loud on the *wrong stack*, but on
a genuine Express tree it still silently under-counts, which the new "warns loudly when it parses
files but classifies zero units" guard will not catch either (it found 1, not 0).

- **What to change** — `inventory-functions.mjs:252`. Match any identifier ending in `router`, or
  better, resolve identifiers bound to an `express.Router()` call.
- **How to prove it** — run against a `src/server` with 7 resource-named routers; expect 18 units.
- **Effort** — S. **Ships with** — C7 (same release).

### C9 — `upsert_document` creates duplicates instead of matching — S2 — 4 — PARTIAL

Members: `d493cadd`, `20b6b928`, `cab92d3a`, `975ada4a`.

SCOPE-124/T008 defined one identity rule (`mcp-server/src/utils/spec-persistence.ts`) shared by
`create_specs` and `dbpush`, and server.ts:2840 explicitly reasons about the `(doctype, title)` +
`specId IS NULL` key. That addresses `d493cadd`'s title-match orphans.

It does **not** address `20b6b928`, which is the sharper report: the **web new-project walkthrough**
creates the `Project Stack & Style` document without stamping `doctype='ProjectStack'`, so the
documented `upsert_document` key misses it and forks the stack into two documents — and the developer
then "fixes" the stack in the web UI, editing the original, which is the copy no consumer reads.
Their suggested fix 1 (stamp the doctype in the walkthrough) is a web-app change, not an MCP one, and
I found no evidence of it. `20b6b928` also reports `get_stack` serving stale content for 3-4 minutes
after a successful write — a separate cache-invalidation defect.

Two outstanding **data requests** we have not answered: `d493cadd` asks us to delete two named orphan
rows (`f3d6cd45-2c09-4853-9dfe-f9ff74b377d6`, `5723bc34-0625-4da5-911e-f9831b22e127`) and `3de3efa6`
asks for cleanup of 29 duplicate scope rows (specNumber 030–058) plus a stray 001–007 set. Neither
customer can self-service — there is no delete tool (C12).

- **Effort** — M. **Ships with** — C3, C4, C15.

### C10 — `capture_event` rejects the documented type — S2 — 2 — STILL-BROKEN — **XS**

Members: `2f4ac63f`, `9ce61551` (both 2026-08-13, two different customers, same day).

Straight documentation-vs-schema contradiction, verified on both sides:
`_wxAI/commands/implement.md:47` and `.claude/commands/implement.md:47` instruct
`type: "spec_implementation_progress"`; `mcp-server/src/server.ts:4073` enum is
`['meeting_notes','chat_thread','commit','ticket_update','manual_note','spec_created','task_created','task_completed','task_push','document_updated']`.
Fires once per `implement` run, on every spec. `2f4ac63f` adds that `source` and `actor` are required
by the tool but unmentioned in the Phase 3 instructions, so a first attempt fails on those too.

Both customers worked around it with `task_completed`, which means our event stream now cannot
distinguish implementation progress from ordinary task completion.

- **What to change** — one line: add `spec_implementation_progress` to the enum in
  `mcp-server/src/utils/schemas.ts` and `server.ts:4073`; add `source`/`actor` to the Phase 3 text in
  both `implement.md` mirrors.
- **Effort** — XS. Should ride the next server deploy regardless of batching.

### C11 — UI-saved state not reflected by the API — S2 — 5 — PARTIAL

Members: `00c194f9` (audit config), `6e885ca1` (theme cited reference), `a4a98dca` (dashboard
rollups), `cb45d595` (board `phase` field), `6d2d7e58` (audit cannot be run).

One reporter identified the pattern themselves: "project state saved in the UI is not reflected by
the API/engine". `00c194f9` caused an agent to misreport a HITRUST project's compliance status to the
customer; `a4a98dca` showed "Outstanding tasks 75" when 0 were outstanding, and the customer
concluded no work had been done.

`00c194f9`'s root cause **has been addressed** — SCOPE-112/T006 replaced the `audittype` varchar with
a Compliance tab writing through `/api/audit/config`
(`src/client/pages/ProjectWorkspacePage.tsx:284,315`: "Replaces `audittype`… which no longer drives
anything"). But that does not retroactively migrate the reporter's project, so I cannot claim they
have a working config — hence the question in the ask-the-reporter table rather than a resolve.

`cb45d595` remains squarely open and has a concrete ask: no MCP tool can set `phase` on an existing
spec, so 8 of 9 fully-shipped scopes are invisible on that customer's Kanban board. They offer three
acceptable resolutions including a server-side backfill.

- **Effort** — M.

### C12 — No delete/update surface on MCP — S4 — 5 — request

Members: `0c395650` (delete_document), `edd34387` (update_task/delete_task), `a5c4b345`
(delete_scope), plus `d493cadd` and `3de3efa6` blocked on it.

Not a defect, but it is what converts every other duplicate-creation bug into a permanent mess the
customer must mail us about. `edd34387` puts it well: "without edit/delete, agents cannot self-correct
their own task output" — it is the main thing keeping the workflow half-manual. Propose as a scope,
not a fix. Guard rails matter (refuse when a task still links to the target doc).

### C13 — Dev Cockpit refresh: console window + repeating trust dialog — S3 — 1 — PARTIAL

`e8849e53`. Half fixed: commit `15caa274` (2026-08-04) added `windowsHide` to every spawn in
`wxkanban-agent/core/orchestrator/cockpit-refresh.ts` — verified, all 6 sites at lines 23, 60, 61, 92,
147, 153 — released in v1.7.49. The **second** half is untouched: the VS Code URI-handler trust
dialog still reappears on every refresh ping, and checking "do not ask again" then cancelling does not
persist the denial. The only escape is `WXKANBAN_NO_COCKPIT_REFRESH=1`
(`cockpit-refresh.ts:45,101`), which the reporter already called undiscoverable. Not resolved.

### C14 — Our own skill is routing customer-app findings into our sink — S3 — 4 orgs — process defect

~20 of the 91 open reports are not about wxKanban at all: they are findings about the reporter's own
application (allergen fail-open logic, FatturaPA XML escaping, 185 tables with 15 FKs, SESSION_SECRET
defaults, a `créance` sync gap). Several are self-answering — "Deliberately NOT fixed", "now fixed",
"filed for the record".

The cause is ours. `wxCreateTestPlan` Phase 2C tells the agent that app-only-enforced constraints are
*findings* to be filed rather than passing tests, and the only filing verb the agent has is
`project.submit_feedback` — which points at the vendor sink. Reporters say so explicitly: "per the
wxCreateTestPlan skill's Phase 2C convention".

This is worth fixing before it doubles. It also distorts every metric we compute off this queue.

- **What to change** — Phase 2C should write findings to the customer's **own** project (a
  `ScopeAnalysis`/`ConstraintGap` document via `upsert_document`, or a task), and reserve
  `submit_feedback` for defects in wxKanban/the kit. Adding one line to the skill — "file kit defects
  here; file findings about YOUR application to your own project" — captures most of the value.
- **Effort** — S. High leverage.

### C15 — Duplicate/phantom spec generation — S2 — 3 — UNVERIFIABLE

`3de3efa6` (29 duplicate scope rows at specNumber 030–058, offset exactly +29 from real 0001–0029,
plus a stray 001–007 set), `a5c4b345` (6 empty seed scopes 001–006), `d493cadd`. SCOPE-124/T014 added
`mcp-server/src/utils/duplicate-scopes.ts` ("detect shadow scopes already written"), which is
plausibly the prevention. It does not clean up existing rows, and I cannot confirm the historical
cause without querying those customers' data. Both need a manual cleanup we have not done. Note
`3de3efa6` says this was "previously reported/attempted to be fixed once already… but resurfaced".

### C16 — Small requests — S4 — 4

`052e76de` attachments on a feedback report — **note commit `9e78943f` "feat(feedback): attach
text/log files to a report (SCOPE-043 Amendment E)" appears to deliver this**; I did not resolve it
because I did not verify the shipped client surface, and the reporter is on extension 0.1.16. Worth a
5-minute check — it may be a free resolve. Also `fd5732f6` (link specs/tasks to external repo
commits/PRs), `c78fb462` (core-complete state / split deferred tasks), `63b3bf2b` (reconcile spec
status with computed devplan state), `73c88a11` (skip DB changes already applied).

---

## Questions

1. **C3 is the whole game — do you want me to run the verification?** One `create_specs` re-push
   against a scratch project decides whether 12 reports (including a formal escalation with six
   named tickets) can be closed this week. I did not run it because it writes data.
2. **C6: shall I hand-advance the two stuck projects?** `947a5614-…` and `68cf2d4b-…` have been
   waiting since 2026-07-22 and 2026-07-25. It is a `projectphases` row flip. I have not touched it —
   it is outside my write boundary.
3. **C9/C15: the two data-cleanup requests.** `d493cadd` names two orphan document IDs;
   `3de3efa6` needs 29 duplicate scope rows plus a stray 001–007 set removed. Both are explicit
   customer asks that have been open for weeks. Do these by hand, or ship `delete_document` first?
4. **C14: is the wxCreateTestPlan routing intentional?** If the design is that constraint-gap findings
   flow to the vendor, say so and I will stop flagging them. If not, it is a one-line skill change.
5. **`ef88bbee` (cwConversion) offered us their `.txa`/`.dctx` files.** That offer is from 2026-08-11
   and unanswered. Want me to draft the reply? cwConversion has no `.dctx` XML reader at all.
6. **`27f18632` is a formal escalation** complaining that six tickets sat at status `new` with no
   vendor response. Even where the fix is uncertain, moving those six to `triaged`/`inprogress` costs
   nothing and answers the actual complaint. I did not do it — my boundary is `resolved` only.

## Assumptions

- `incoming: true` was accepted, so wxperts owns this sink. Every report analysed is a customer's,
  not ours.
- The hosted MCP auto-deploys on push to `main`, so a commit that is an ancestor of `origin/main` and
  touches `mcp-server/` or `shared/` is live. I used this for the C15 resolve and flagged it as an
  assumption in the C3 analysis rather than relying on it there.
- `scripts/` is **not** mirrored to the orchestrator repo (confirmed at
  `scripts/sync-to-orchestrator.mjs:288-293` and stated in commit `be4cecc5`). This repo's `scripts/`
  copies have diverged and are not what customers run — so for C1, C5 and the windowsHide audit I
  verified against the **downloaded v1.7.54 release asset**, not this working tree. Any claim in this
  report about `scripts/` behaviour is a claim about the shipped archive.
- Severity uses the multiple-reporter escalation rule: C1 (12 reporters), C3 (12) and C2 (6) would be
  S2 on a single report; repeated independent confirmation raises them.
- Reporter counts are of distinct feedback rows, including rows the sink already marks as duplicates.
- I have not verified `9e78943f` (feedback attachments) against the shipped client, so C16's
  `052e76de` stays open despite the commit existing.
