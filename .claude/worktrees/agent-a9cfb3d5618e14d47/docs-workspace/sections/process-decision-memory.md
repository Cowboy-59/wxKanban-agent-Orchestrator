---
id: process-decision-memory
part: the-process
audience: customer
sources: specs/142-decision-memory/spec.md, specs/144-company-yappchatt-account/spec.md, _wxAI/commands/wxLedger.md, _wxAI/rules/minimal-code.md
---
# Decision memory: the ledger and the Ask Gate

Decision memory stops the AI from asking you the same question twice. You answer once, the answer is written down, and from then on the AI looks it up.

## The ledger

The ledger is the file `decisions/ledger.yaml` in your project. Each entry is one decision you approved: the question, the answer, why, and where it came from. The file is append-only. Nothing is edited or removed; to change your mind, a new entry points at the old one and replaces it. Only the ledger script writes the file, and an AI agent that tries to edit it directly is stopped.

Not every entry is allowed to answer a question. Only a decision you approved, that nothing later replaces, and whose evidence is not "unknown", can answer. Entries that are not allowed to answer are still shown to the AI as background.

Use `/wxLedger` to work with it:

| Subcommand | What it does |
| --- | --- |
| `check` | Checks the ledger for problems. |
| `check --global` | Checks the shared learnings for project names, file paths, or customer data. |
| `search` | Finds the approved decision that answers a question. |
| `import` | Proposes ledger entries from a finished brainstorm and writes them only after you approve. |

## The Ask Gate

When an AI agent is about to ask you a question, the Ask Gate catches it first and searches the ledger.

- If an approved decision answers it, the agent gets that answer and you are not interrupted. The answer is tagged with its ledger ID so you can see where it came from.
- If nothing answers it and the agent cannot safely go on, the question is queued for you.
- If nothing answers it but a sensible default exists, and nobody is there to answer (an unattended run, such as wxG-O-D `--create`), the agent takes the default and records it in `decisions/assumptions.yaml` for you to review later. When you are in the session, the question comes to you instead.
- A question asking you to approve, confirm or choose ("record it?", "want me to go ahead?") always comes to you.

Every intercepted question is logged to `decisions/gate-log.jsonl`.

### Observe or enforce

The gate has two modes, set in `decisions/settings.yaml` under `gate.mode`.

| Mode | What happens |
| --- | --- |
| `observe` (default) | The gate answers nothing. It only records what it would have answered, so you can check its judgment against real questions first. |
| `enforce` | The gate answers from the ledger, and queues the rest or, in an unattended run, assumes it. |

Start in `observe`. Switch to `enforce` once the log shows it would have answered correctly. `gate.matchThreshold` (0 to 1, default 0.75) sets how close a match must be.

### When KAIN answers for you

When the project agent runs with KAIN supervising, a parked question goes to the project's room. Everyone in your company can read the room, but only a **Room Approver** can decide in it:

- a company **Admin** (ADMIN), or
- a **Manager** (TEAM_MANAGER) who is a member of that project.

The role is the one set on [Team Members](team.md).

A Room Approver answers there (`DQ-01: your answer`), and it goes straight into the ledger under that person's name. When anyone else answers, nothing is recorded: their reply goes to the agent as ordinary discussion, and the room shows "Not recorded: only an ADMIN or this project's TEAM_MANAGER can decide."

KAIN can also answer a parked question acting for you, so the work keeps going. KAIN's answer is not a decision yet: it waits for a Room Approver's review, and it never answers another question until it is approved. KAIN is never a Room Approver.

| A Room Approver does | What happens |
| --- | --- |
| `/wxLedger review`, or `KR-0001 approve` in the room | KAIN's answer becomes your decision in the ledger |
| `KR-0001 change: <your answer>` | Your answer goes into the ledger instead, and you are told which work to check |
| `KR-0001 reject` | Nothing goes into the ledger, and you are told which work to check |

Each verdict is recorded under the name of the Room Approver who gave it. In the room, a review from anyone who is not a Room Approver is not recorded. Each verdict is posted in the room, so KAIN learns how you would have answered. KAIN can never review its own answers, and it cannot answer a question that could lose data.

Who is in the room, and how a company sets up its chat, is in [Team chat](team-chat.md).

## The memory service (optional)

By default the gate searches the ledger file directly. For larger ledgers you can install a separate local memory service, OpenViking, which also lets decisions be shared across your own projects. It is never bundled with the kit. If it is slow (no answer within 1.5 seconds) or down, the gate falls back to the file search and says so on its status line, so every answer still arrives within 2 seconds.

Install steps: *to be confirmed by the Memory area.* They are not final yet, so do not follow any older notes you may find.

## Minimal code levels

The AI follows a rule to write the smallest complete change: read first, reuse what exists, and never cut validation, security, error handling, or accessibility. It ends each reply with a short "what I skipped" note. Set the level in `decisions/settings.yaml` under `minimalCode.level`:

| Level | What it means |
| --- | --- |
| `on` (default) | The full rule. |
| `lite` | For conversion work. The "what I skipped" note stays, and nothing is skipped when the old program's behavior is unclear. |
| `off` | The rule is not applied. |

G.O.D. can set the level for a single run; conversion runs use `lite`.

## Upgrades never touch your decisions

Everything in `decisions/` belongs to your project. A kit upgrade never overwrites, deletes, or adds to it.
