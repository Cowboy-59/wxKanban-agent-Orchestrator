# Contracts: Agent Model Routing and Metering (SPEC-143)

Locked before any area starts. An area may not change a contract; it asks the managing agent.
Written by the managing agent, 2026-10-23. Kit code is plain Node ESM (`.mjs`, no dependencies) under `_wxAI/routing/`; app code is TypeScript (no `any`, Pino, Drizzle) under `src/server/`.

## C1. Run record (FR-002, FR-003, FR-011, FR-014)

One JSON object per agent run or main-session command turn. Local log: `decisions/agentrun-log.jsonl` (append-only). Same field names as the `agentruns` table.

```json
{
  "id": "0192f0a8-...-uuidv7",
  "projectid": "<uuid or null when unknown locally>",
  "aispecsessionid": null,
  "taskid": null,
  "command": "dbpush",
  "kind": "session | subagent | command",
  "difficulty": "easy | moderate | heavy",
  "model": "claude-haiku-5-5",
  "provider": "anthropic-subscription | anthropic-api",
  "route": "official",
  "inputtokens": 0, "outputtokens": 0, "cachereadtokens": 0, "cachewritetokens": 0,
  "activeminutes": 0, "waitingminutes": 0,
  "escalated": false,
  "comparisonid": null,
  "starttime": "2026-10-23T17:00:00.000Z",
  "endtime": "2026-10-23T17:12:00.000Z"
}
```

Amendment 2026-10-23 B (managing agent, before any SQL is applied): `activeminutes` and `waitingminutes` are replaced by `activeseconds` and `waitingseconds` (integer seconds). Many subagent runs last under two minutes, so whole minutes would drift billable time. Reports and billing derive minutes and hours from the seconds; billing rounds only the final per-task total.

Amendment 2026-10-23 (managing agent, after the Report area): comparison records also carry `variant` (`current` | `candidate` | null), `firstpass` (boolean | null: tests passed on the first cycle) and `neverbilled` (boolean, default false; true for every comparison run). These three are columns in `agentruns` too.

Rules: no prompt text, code, file contents or customer data in any field. Unknown numbers are `null`, never guessed. `route` is `official` for every Anthropic subscription run (FR-009).

Amendment A (2026-11-02, D1): Anthropic only. `provider` is an Anthropic provider and `route` is always `official`; the `omniroute` value is removed from the code, the route enum of the agent-runs API and the `agentruns.route` CHECK (migration 0075).

## C2. Settings (FR-005, FR-007, FR-016)

`decisions/settings.yaml` (project-owned; already holds `gate:`, `minimalCode:`, `links:` from SPEC-142). New sections:

```yaml
models:
  tiers:            # override of the kit default; missing keys fall back to the kit default
    easy: claude-haiku-5-5
    moderate: claude-sonnet-5-5
    heavy: claude-opus-5-5
  commands:         # per-command override of the command's declared tier
    dbpush: easy
```

Amendment A (2026-11-02, D1): there is no `allowedProviders:` section; a leftover one is ignored. A tier must name a Claude model (`claude-...`); any other id is refused, the kit's Claude model for that class is used, and a `refusal` event is logged (C5).

Kit default: `_wxAI/routing/tiers.default.json` — `{ "tiers": {easy, moderate, heavy}, "commands": { "<command>": "easy|moderate|heavy" } }`.
Reader: `_wxAI/routing/tiers.mjs` exports `resolveTier({ difficulty, command, root, log })` -> `{ model, tier, source: 'project'|'kit' }`, `escalate(tier)` -> next tier (`heavy` stays `heavy`) and `isClaudeModel(id)`.
Policy: `_wxAI/routing/policy.mjs` exports `checkRoute({ provider, route, model, root, difficulty, command, taskid })` -> `{ allowed, fallbackModel, reason }`: allowed only for an Anthropic provider, the official route and (when named) a Claude model. Comparison plans and records (`compare.mjs`) and proposals (`propose.mjs`) apply the same rule.
Agents never write `models:` (guard hook in `_wxAI/routing/hook-settings-guard.mjs`).

## C3. Difficulty (FR-004)

`_wxAI/routing/difficulty.mjs` exports `classify({ files, acceptanceCriteria, touches: [..], escalated })` -> `{ difficulty, reasons: [..] }`; `touches` values include `security`, `auth`, `money`, `schema`, `migration`, `production`. Owner override: `overrideDifficulty(root, taskid, difficulty, by)` appends to the audit log (C5).

## C4. Report (FR-011, FR-012)

`_wxAI/routing/report.mjs` reads C1 records (local log, or the API when present) and writes `docs/agent-cost-report.md` and `docs/agent-cost-report.json`. Prices come from `_wxAI/routing/prices.json` (`{ "source": "...", "asOf": "YYYY-MM-DD", "models": { "<id>": { "input": n, "output": n, "cacheRead": n } } }`, $ per million tokens).
Bridge summary (FR-012), appended as one line to `.wxai/room-outbox.jsonl` via `{time, text}` (the SPEC-142 T023 drain posts it): `text` is a single line starting `[agent-cost v1] <project>:` followed by totals, forecast range and pending proposals. No client content, no per-client tokens.

## C5. Audit log (FR-015)

`decisions/routing-log.jsonl`, append-only, one line per event: `{ time, event: "model-choice|escalation|refusal|comparison|proposal|approval|override", taskid, command, from, to, reason, evidence }`. Module `_wxAI/routing/log.mjs` exports `logEvent(root, event)`.

## C6. Proposal (FR-013)

`_wxAI/routing/propose.mjs` reads comparison records (C1 with `comparisonid`) and writes proposals into the report: `{ class, from, to, comparisons: n, costPerTask: {from, to}, firstPassRate: {from, to}, flagged: bool }`. Only when n >= 5, cost lower, pass rate no more than 5 points worse. Never writes settings.

## Ownership of shared files

| Files | Owner area |
|---|---|
| `_wxAI/routing/tiers*.{mjs,json}`, `policy.mjs`, `difficulty.mjs`, `hook-settings-guard.mjs`, guard test for FR-009 | Routing |
| `_wxAI/routing/capture*.mjs`, hook install entries for capture | Capture (after T001) |
| `_wxAI/routing/report.mjs`, `prices.json`, `propose.mjs`, `log.mjs`, `compare*.mjs` | Report & learning |
| `src/db/schema/agentrun.ts`, `src/db/migrations-manual/*agentruns*.sql`, `src/server/routes/*agent-run*`, time-entry writer | Data & API |
| Kit command files (`_wxAI/commands/*.md`, `.claude/commands/*.md`) tier declarations | Routing (after T002) |
| Hosted G.O.D. method under `mcp-server/src/prompts/` | Report & learning (T016 steps only) |
