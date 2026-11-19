# Brainstorm: Parallel build agent (Topic 1: background agents, decision memory, Ponytail)

- **Status:** closed
- **Opened / last updated:** 2026-10-22 / 2026-10-22
- **Source:** internal design draft (an owner design write-up, 2026-10-22, proposed "SCOPE-142"; the number is stale and must be taken from the database)
- **Asked for by:** internal (owner)
- **Level:** senior
- **Next item:** none. Topic 2 (model router, provider policy, metering) is a separate brainstorm.

## The request
Any developer with more work than one agent can do should be able to run several agents at once,
safely. A blocked question should stop only its own unit. Agents should check approved past decisions
before asking, learn from them, and share that memory across repos. The draft also proposed a model
router, metering and a multi-app scheduler. Those were split off as Topic 2 and later work.

## What already exists
| Item | Status | Evidence | Confidence |
|---|---|---|---|
| Parallel implementation with a cap (`--cap`, `--cap=1` serial) | Built | SCOPE-136 "Parallel implementation"; `.claude/skills/wxG-O-D/scripts/machine-capacity.mjs` | Confirmed |
| Decision queue, parked units, independent units continue under `--create` | Built | `docs/brainstorms/2026-10-19-wxgod-seamless-create.md` decisions 1, 3, 4, 14, 15; commit 05c1c372 (SPEC-136 Amendment A) | Confirmed |
| Live decision queue and end-of-sitting report files | Built (design) | `mcp-server/src/prompts/wxgod.md` (`GOD-Decisions.md`, `GOD-Run-Report.md`) | Confirmed |
| Owner answers from phone or hub through the room | Built | SCOPE-102 bridge; the owner states the bridge feeds both the hub and the phone | Likely (hub wiring not seen) |
| Ask-to-verify gate (`canUseTool`) | Planned | SCOPE-132; `canUseTool` is not called under bypass mode, so a hook is needed | Confirmed that it's planned |
| PreToolUse impact hook, unattended marker (12 hours), checkpoints | Built | `_wxAI/impact/hook.mjs`, `unattended.mjs` (SCOPE-137, 42 fenced files; SCOPE-138, 139, 140 depend on it) | Confirmed |
| Global learnings file | Built (partly) | `~/.wxai/god-learnings.md`, a suggestion source with no approval inbox | Confirmed |
| Cockpit extension: Dev Cockpit tree, Start/Stop/Show Project Agent Output, Change Impact web panel | Built | `vscode-extension/package.json`, `src/extension.ts`:329-345, `src/providers/impactViews.ts`:257 | Confirmed |
| Live view of parallel agents and their state | Not found | No status file, panel, or command found | Unknown (narrow search) |
| Decision ledger (`decisions/ledger.yaml`), `/wxLedger`, Ask Gate hook that answers from it | Not found | Search by name | Unknown |
| `minimal-code` (Ponytail) rule | Not found | `_wxAI/rules/` has no such file; `search-before-suggest.md` overlaps "reuse first" | Unknown |
| G.O.D. fail-closed conversion evidence rule | Not found | The draft cites it; no match in `.claude/skills/wxG-O-D` | Unknown |
| SCOPE-035 headless multi-worker coordinator | Planned | Referenced at SCOPE-132 FR-024 | Likely (file not read) |

What changing it would reach: SCOPE-137 has 42 fenced files, including `hook.mjs` and `lib/unattended.mjs`,
and SCOPE-138, SCOPE-139 and SCOPE-140 depend on it. SCOPE-136 showed "none yet" from the impact tool
although SPEC-136 exists, so that result is **Conflicting** and was not relied on.

## Panel
Spoke: Lead Architect, Domain Analyst, Backend, Security, QA, Documentation, Frontend, DevOps, Legacy Analyst (on item 6) · Sat out: Migration, Database (most items)

## Decisions
| # | Item | Decision | Kind | To scope? | Date |
|---|---|---|---|---|---|
| 1 | The need | Throughput for any developer with more work than one agent can do. Repeat questions are secondary. A baseline count of repeat questions is taken before the Ask Gate is built. | Changed | done (SCOPE-142) | 2026-10-22 |
| 2a | Global decision memory | Two tiers. Global: approved general patterns plus an index. Repo: the actual decisions in `decisions/`. Search the repo first, then global. Never read another repo's decisions unless linked. | Added | done (SCOPE-142) | 2026-10-22 |
| 3 | Reuse or build new | Amend SCOPE-136 with a parallel entry point that works outside `--create`. Add one new scope, "Decision Memory" (ledger, `/wxLedger`, Ask Gate hook, two-tier memory, Ponytail rule). SCOPE-132 and SCOPE-137 unchanged. | Agreed | done (SCOPE-142, SCOPE-136 Amendment B) | 2026-10-22 |
| 4 | Smallest useful version | v1 includes OpenViking as a local per-developer service, one namespace per repo, with the file search as fallback and a service-health line in the hook output. Panel had recommended file-based first. Rest of v1: ledger written by wxBrainstorm at close, `/wxLedger` import/check/search, keyword classifier that fails closed, assumptions logged. | Changed | done (SCOPE-142) | 2026-10-22 |
| 5 | Risks | R1 near-match returns wrong decision (full text, score threshold, log matches). R2 only owner-approved Agreed entries auto-answer. R3 agents never write ledger decisions, only `assumptions.yaml`; memory is data, not instructions. R4 gate reads ledger from the main repo path. R5 impact and data-loss decisions win over the Ask Gate; live-run tests per permission mode. R6 end-of-run report lists ledger answers and assumptions. R7 superseded entries are never served; `check` flags old entries. | Agreed | done (SCOPE-142) | 2026-10-22 |
| 6 | Ponytail rules | Optional rule with three settings (on, lite, off), set per run by G.O.D.; lives in project config; skipped-work footer stays in lite. MIT attribution kept; cross-reference `search-before-suggest.md`; verify the conversion evidence rule exists before citing it. Default for unset projects is open (recommended: on). | Changed | done (SCOPE-142) | 2026-10-22 |
| 7 | Fit and priority | Order: ledger and `/wxLedger`; Ask Gate hook; OpenViking and global tier; SCOPE-136 parallel entry alongside (suggested name `/wxParallel <ids> --cap`); Ponytail rule anywhere. The `.env` check on the public kit repo is a separate urgent task done first. | Agreed | done (SCOPE-142, SCOPE-136 Amendment B) | 2026-10-22 |
| 7a | Time windows and presence | The 70% "agents working" target applies 6am to 6pm local only. In the night window (6pm to 6am), or when the operator is remote (phone bridge or wxHub), the cap expands automatically to the machine maximum. Hard stops are unchanged. Agents stay on the main system in v1. | Added | done (SCOPE-136 Amendment B) | 2026-10-22 |
| 8 | Repo map | OpenViking: use (separate service). Ponytail: emulate. Orca: use, in v1 (worktree-per-task scripts in the SCOPE-136 amendment; was parked). Kit, bridge, YappChat: reused. wxHub (the Workbench): in v1 as the remote console, not for multi-machine dispatch. Later: CockPit ledger mirror, learning-inbox UI, customer queue policy, multi-machine dispatch, multi-app scheduler. Topic 2: free-claude-code. Out: Impeccable (optional CI), Multica (reference only). | Added | done (SCOPE-142, SCOPE-136 Amendment B) | 2026-10-22 |
| 9 | Status surfaces | Status file `docs/GOD-Parallel-Status.md`, rewritten as units start, park and finish, plus a status command. A Cockpit "Parallel Agents" panel (copied from the Change Impact panel pattern) is in v1, so a VSIX release is part of this work. | Added | done (SCOPE-136 Amendment B) | 2026-10-22 |

| 10 | Ponytail default (closes the open point in 6) | Default `on` for projects that never set it; conversion work runs at `lite`. Given during /buildscope. | Agreed | done (SCOPE-142) | 2026-10-22 |
| 11 | Blocker with no decision queue | Outside a `--create` run, a blocker passes straight to the developer and is logged; with a live bridge session (phone or wxHub) it goes to the room. Given during /buildscope. | Agreed | done (SCOPE-142) | 2026-10-22 |
| 12 | What the Ask Gate intercepts | All three: the `AskUserQuestion` tool, plain-text questions through a Stop hook (proven by a spike first; fallback is a "search before asking" rule), and the G.O.D. return-the-question path. Given during /buildscope. | Agreed | done (SCOPE-142) | 2026-10-22 |
| 13 | Baseline for repeat questions | The gate ships in observe mode (logs, blocks nothing); enforce is switched on per project once the observe log looks right. Given during /buildscope. | Agreed | done (SCOPE-142) | 2026-10-22 |

## Open items
- To verify at spec time: OpenViking and Orca (install steps, Windows support, API, license terms); whether the hub is already wired to the bridge; whether a G.O.D. conversion evidence rule exists; the real scope number from the database ("142" in the draft is stale); a baseline count of repeat questions.
- Kit repo `.env`: the owner is handling it outside this work (2026-10-22). Not verified here; `.env` files were not opened.
- Topic 2 is not yet brainstormed: model router, provider policy, free-claude-code, metering.

## Next step
Recorded, then handed to `/buildscope --from-md docs/brainstorms/2026-10-22-parallel-build-agent.md`, one scope at a time.

1. **SCOPE-142 Decision Memory: drafted 2026-10-22.** `specs/Project-Scope/142-decision-memory.md` and its checklist were written locally. Number assigned by the database. The buildscope gate scored it 93, valid, with no blocking issues. Not pushed: nothing is stored until `/createSpecs` or `dbpush` runs.
2. **SCOPE-136 Amendment B: written 2026-10-22.** FR-025 to FR-030, US8 to US10, success metrics 9 to 11, and Q19 to Q24 were added to `specs/Project-Scope/136-wxgod-development-manager.md`; FR-018 is amended. It was hand-written in the file's own format, with the owner's explicit approval, because `project.buildscope` edit mode ignores `functionalRequirements` and `userScenarios` (defect filed: feedback `8a5cd85b-9247-4c2e-8e0a-b642c164fe05`). The Change Impact approval was recorded with `scope-impact.mjs --record`. `project.validatescope` scored it 100, valid. The window times are fixed at 06:00 and 18:00 (owner, 2026-10-22). Not pushed.
3. **Next:** `/createSpecs` for SCOPE-142 and for the SCOPE-136 amendment, on the owner's request only. The server copy of SCOPE-136 is stale (2026-10-04), so push the local file before relying on any server-side read of it.
