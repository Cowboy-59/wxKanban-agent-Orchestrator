# Model routing, metering and agent-run billing

This folder decides which Claude model each piece of AI work runs on, records every run, and sends
those records to wxKanban, where they show up as **Resource** time on the Time & Billing page.
It is SPEC-143. Everything here is plain Node, needs no install, and never changes your session's
own model.

## Setting it up

Run kit setup once per machine, with the project API token from the web app's Kit tab:

```
wxkanban-agent kit:configure --token <project API token> --project-id <project id>
```

Besides its usual config, kit:configure now:

- **stores the token on this machine only**, in `~/.wxai/agentrun-tokens.json`. That is outside the
  project folder, so it can't be committed or shipped in a kit release. The forwarder looks it up
  by project folder and never reads `.env` or any other project file.
- **installs the routing hooks** into `.claude/settings.json`. Every other hook in that file is left
  alone, and running it again changes nothing.

The first kit session after a kit upgrade installs the hooks again, once for each new version. So
new hooks arrive with the kit. If you removed them (`node _wxAI/routing/install.mjs --uninstall`),
they stay removed until the next upgrade.

Check the setup with `wxkanban-agent kit:status`. The `agent runs` line shows whether the hooks are
`current`, `stale` or `missing`, and whether this machine has a project token. It never shows the
token itself.

## What the hooks do

| Hook | Script | What it does |
|------|--------|--------------|
| PreToolUse (Edit, Write, MultiEdit, Bash) | `hook-settings-guard.mjs` | Stops an agent from editing the `models:` section of `decisions/settings.yaml`; only the project owner changes it |
| SubagentStop, PostToolUse (Agent), Stop | `capture-hook.mjs` | Writes one record per run to `decisions/agentrun-log.jsonl` |
| Stop, SessionStart | `forward-hook.mjs` | Sends unsent records to wxKanban in the background; the session never waits for it |

A run record holds only identifiers and counts: project, task, command, model, token counts, and
active and waiting seconds. It never holds prompt text, code or file contents.

Each record is sent once. When the server accepts it, its id is added to
`decisions/agentrun-forwarded.txt`. If the network is down, the record stays in the log and the next
session sends it. The run log, the sent list and the token are never shipped in a kit release (the
release secret gate refuses them).

## Which model runs a task

Each task gets a **difficulty class** from `difficulty.mjs`. The same inputs always give the same
class:

| Class | When |
|-------|------|
| heavy | touches security, auth, money, schema, migrations or production; more than 5 files; more than 4 acceptance criteria; or already escalated |
| moderate | 2 to 5 files, or new branching logic that ships with tests |
| easy | everything else |

Each class maps to a model (`tiers.default.json`):

| Class | Model |
|-------|-------|
| easy | Claude Haiku |
| moderate | Claude Sonnet |
| heavy | Claude Opus |

`/implement` gives easy and moderate tasks to a subagent on that class's model, and keeps heavy
tasks in the main session, which already holds the context. A task that fails its tests twice moves
up one class and runs again.

Some commands also carry their class as a `model:` line in their command file. That model applies
only to the turn where you type the command:

| Command | Model |
|---------|-------|
| `/dbpush` | haiku |
| `/help`, `/wxLedger` | sonnet |
| `/buildscope`, `/createSpecs`, `/wxG-O-D` | opus |

`/implement` has no `model:` line on purpose. It routes each task itself, and a fixed model would
force Opus on a cheaper session.

**Changing the models (project owner only).** Add a `models:` section to
`decisions/settings.yaml`:

```yaml
models:
  tiers:
    easy: claude-haiku-5-5
  commands:
    dbpush: easy
```

Any key you leave out keeps the kit default.

**Anthropic only.** Every run is a Claude model on the official Claude client. If a model id doesn't
start with `claude-`, that class falls back to the kit's Claude model and the refusal is logged.
There is no setting for other providers.

## Comparing two models

`compare.mjs` runs the same task on two Claude models in two separate worktrees, then has a third
model review both diffs. It works on internal projects only. Comparison runs are never billed.

```
node _wxAI/routing/compare.mjs plan --task <id> --current claude-sonnet-5-5 --candidate claude-haiku-5-5
```

`propose.mjs` reads the results. It suggests a cheaper model for a class only after at least 5
comparisons that show a lower cost per task and a first-pass rate no more than 5 points worse. It
never changes your settings; you apply a proposal yourself.

## The cost report and forecast

```
node _wxAI/routing/report.mjs [--agents N --hours H]
```

This writes `docs/agent-cost-report.md` (and `.json`) from the run log: the runs by class, model and
command, plus a forecast for N agents over H hours. Dollar figures are **price equivalents**: what
the same tokens would cost at API list price. Runs on a Claude subscription are not billed per
token.

## How agent time is billed

Agent time is billed as **Resource** time on the Time & Billing page (SPEC-005). It is billed on
**active time only**; time spent waiting on you is never counted.

- **Who bills a run.** The company whose login or project token sent the run, never a company named
  inside the record. A consultant working on an engaged client project bills its own runs there.
  The client company's own runs on that project stay the client's.
- **When it appears.** Automatically. Loading the Time & Billing page brings in the agent runs for
  its date range, and generating a statement first brings in the runs for the statement's period.
  Nothing needs pulling by hand, though the manual pull still works.
- **How it adds up.** The runs for one project, line, scope, day and model are summed and rounded up
  to 15 minutes **once**. For example, 40 runs totaling 1 h 32 m bill as 1.75 hours, not
  40 × 15 minutes. Each subagent counts as one Resource; the main session counts as one.
- **What never changes.** An entry already on a statement is never changed by a later pull, and
  comparison runs are never billed.
