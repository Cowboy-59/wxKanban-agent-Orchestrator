---
description: wxLedger — the decision ledger. check validates decisions/ledger.yaml, check --global scans the shared learnings for project names, paths and customer data, search finds the approved decision that answers a question, import proposes ledger entries from a closed brainstorm record and writes only after you approve, review lists KAIN's answers awaiting your verdict (approve, change or reject).
args: "{{args}}"
ai-compat: universal
claude-code: true
cursor: true
blackboxai: true
---

# wxLedger — the decision ledger

The ledger (`decisions/ledger.yaml`) holds the decisions you approved, so an agent can look an answer
up instead of asking you again. It is append-only: nothing is edited or removed, and a change is a
new entry that names the old one in `supersedes`. Only the ledger script writes it
(`_wxAI/askgate/ledger.mjs`); an agent that tries to edit the file directly is stopped by a hook.

Run the subcommand the user asked for. Show the command's output as it is.

## check

```bash
node _wxAI/askgate/ledger.mjs check
```

Validates the file: every required field, a known kind and evidence, a non-empty `approved_by`, no
duplicate id, and no `supersedes` that points at nothing. Exit 0 means clean. On failure, list each
problem and stop; do not try to repair the file by hand, because the ledger is append-only. If an
entry is wrong, the fix is a new entry that supersedes it, added through `append`.

## check --global

```bash
node _wxAI/askgate/ledger.mjs check --global
```

Scans `~/.wxai/god-learnings.md` (the global tier seed) for things that must not be shared across
projects: file paths, `SCOPE-` / `SPEC-` numbers, and email addresses. Exit 0 means clean. Report
each finding with its line, and ask the owner whether to reword it. Do not edit the file unless the
owner says so.

## search `<text>`

```bash
node _wxAI/askgate/search.mjs "<text>"
```

Uses the same ranking as the Ask Gate: the repo ledger first (read from the main repo path), then the
repos named in `decisions/settings.yaml` `links`, then the global tier. Only an Agreed, Added or
Changed entry that is owner-approved, not superseded and above `gate.matchThreshold` is shown as
**ANSWER**; anything else relevant is shown as **context**. Always read the whole entry and say why it
applies before relying on it. A near match is not the same question.

## import `<record.md>`

```bash
node _wxAI/askgate/import.mjs <record.md>
```

Reads the Decisions table of a brainstorm record (`docs/brainstorms/...`) and **prints** one proposed
entry per row: kind from the row, evidence `confirmed` (Parked rows: `unknown`), scope from the
`SCOPE-` / `SPEC-` tag in the row, source `record#row`. **Nothing is written.** Show the list to the
owner and ask which to keep. Only when the owner approves, run the same command again with the
approver's name:

```bash
node _wxAI/askgate/import.mjs <record.md> --approve owner
```

Rows already in the ledger are skipped. Run `check` afterward and report the count written.

## review

In a project-agent room, KAIN may answer a parked question acting as the owner, so the work goes on.
Each KAIN answer waits in `decisions/kain-replies.yaml` for the owner's review. Until the owner
approves it, it is not a decision and never answers another question.

```bash
node _wxAI/askgate/kain.mjs list
```

Show the list as it is: each reply's id (KR-nnnn), the question, KAIN's answer, and the units that
went on under it. Then ask the owner, one reply at a time, in plain text: approve, change (and what
the answer should have been), or reject. Run exactly what the owner said:

```bash
node _wxAI/askgate/kain.mjs review KR-0001 approve
node _wxAI/askgate/kain.mjs review KR-0001 change "<the owner's answer, in their words>"
node _wxAI/askgate/kain.mjs review KR-0001 reject
```

Approve and change add an owner ledger entry; reject adds nothing. Each verdict is posted to the
project room so KAIN learns how the owner would have answered. For a change or a reject, the result
lists the units that went on under KAIN's answer: tell the owner they need checking. The owner can
also review from the room by writing `KR-0001 approve`, `KR-0001 change: <answer>` or
`KR-0001 reject`.

## Rules

- Never write `decisions/ledger.yaml` any other way. The hook denies it and so does this rule.
- Never review a KAIN reply without the owner's verdict in this conversation, and never write
  `decisions/kain-replies.yaml` by hand.
- Never approve on the owner's behalf. `--approve` is used only after the owner says yes in this
  conversation.
- No customer names, emails or phone numbers go into an entry; refer to a source by its id or date.
