# Contracts: Decision Memory (SPEC-142)

Locked before any area starts. An area may not change a contract; it asks the managing agent.
Written by the managing agent, 2026-10-22. Plain Node, no dependencies, `.mjs` for everything under `_wxAI/askgate/`.

## C1. Ledger entry (FR-001, FR-002)

File: `decisions/ledger.yaml`, a YAML list, append-only. One entry:

```yaml
- id: D-0001                # D- plus 4 digits, unique, assigned by the script
  scope: SCOPE-142          # the scope or area this decision belongs to, free text allowed
  question: "How are endorsements prorated?"
  decision: "Daily, on the endorsement effective date."
  rationale: "Matches the carrier's billing."
  kind: Agreed              # Agreed | Added | Changed | Declined | Parked
  evidence: confirmed       # confirmed | likely | assumed | unknown | conflicting
  source: "docs/brainstorms/2026-10-22-parallel-build-agent.md#4"
  approved_by: owner        # non-empty; "owner" or the named customer approver
  date: 2026-10-22
  supersedes: null          # an earlier id, or null
```

Rules the script enforces:
- Appends only. No edit, no removal, ever. A change is a new entry whose `supersedes` names the old id.
- Refuses an entry with empty `approved_by`, a duplicate id, an unknown `kind` or `evidence`, or a `supersedes` that names no entry.
- Answer-eligible entries (FR-008): `kind` is Agreed, Added or Changed, `approved_by` is non-empty, no later entry supersedes it, and `evidence` is not `unknown`.

Script: `_wxAI/askgate/ledger.mjs`.
CLI: `node _wxAI/askgate/ledger.mjs append --file <entry.json> --approved-by <who> [--root <dir>]`, `check [--root <dir>]`, `check --global`.
Module exports: `readLedger(root)`, `appendEntry(root, entry, approvedBy)`, `isAnswerEligible(entry, allEntries)`.

## C2. Search interface (FR-008, FR-016, FR-017)

Module: `_wxAI/askgate/search.mjs`. One async function, two backends behind it.

```js
// search(question, { root, mainRepoRoot, threshold, backends }) -> SearchResult
// SearchResult = {
//   status: 'answered' | 'context' | 'none',
//   hit: { id, tier: 'repo'|'global', score, text } | null,   // text = the entry's FULL text
//   context: [ { id, tier, score, text } ],                     // evidence:unknown entries etc.
//   backend: 'openviking' | 'file',
//   fellBack: boolean,                                          // true when openviking was down/slow
//   elapsedMs: number
// }
```

Rules:
- Search the repo ledger first, read from `mainRepoRoot` (never a worktree copy), then the global tier.
- Only answer-eligible entries (C1) and scores at or above `threshold` set `status: 'answered'`.
- Entries with `evidence: unknown` go in `context` and never answer.
- Another repo's ledger is searched only if `decisions/settings.yaml` `links` names it.
- The OpenViking backend has a 2000 ms budget. On timeout or error, run the file backend and set `fellBack: true`.
- Backends are plain objects: `{ name, available(), search(query, scopeNames) }`. `file.mjs` is the default.

## C3. Settings (FR-013, FR-014, FR-019, FR-020)

File: `decisions/settings.yaml`, project-owned.

```yaml
gate:
  mode: observe          # observe (default) | enforce
  matchThreshold: 0.75   # 0..1
minimalCode:
  level: on              # on (default) | lite | off ; conversion work runs at lite
links: []                # repo roots whose ledgers this repo may read
```

Module: `_wxAI/askgate/settings.mjs` exports `readSettings(root)` returning these defaults when the file is missing.

## C4. Gate outcome and log line (FR-010, FR-011, FR-014)

Outcome object returned by the gate: `{ outcome: 'answered'|'passed-through'|'queued'|'assumed'|'observed', class: 'blocker'|'assumption'|null, ledgerId: string|null, score: number|null, reason: string }`.

Log: `decisions/gate-log.jsonl`, one JSON object per intercepted question, append-only:

```json
{"time":"2026-10-22T20:10:00.000Z","session":"<id>","intercept":"tool|stop|god","question":"...","outcome":"answered","class":null,"ledgerId":"D-0001","score":0.91,"wouldHaveAnswered":true,"mode":"observe"}
```

Module: `_wxAI/askgate/log.mjs` exports `logOutcome(root, event)` (append only, never rewrites). In observe mode `outcome` is `observed` and `wouldHaveAnswered` carries the result.

## C5. Assumption entry (FR-011)

File: `decisions/assumptions.yaml`, a YAML list: `{ time, question, defaultChosen, agent, reviewed: false }`. Agents may write this file; they may never write the ledger.

## Ownership of shared files

| File | Owner area | Others |
|---|---|---|
| `_wxAI/askgate/ledger.mjs`, `search.mjs`, `file.mjs`, `settings.mjs`, `log.mjs` | Ledger | read only |
| `_wxAI/askgate/classify.mjs`, `hook-tool.mjs`, `hook-stop.mjs`, `gate.mjs` | Gate | read only |
| `_wxAI/askgate/openviking.mjs`, `service/*` | Memory | read only |
| `_wxAI/impact/install-hook.mjs` (installer) | Gate | one owner, others ask |
| wxgod method under `mcp-server/src/prompts/` | Routing | read only |
| `_wxAI/rules/minimal-code.md`, kit sync allowlists, help | Kit | read only |
