---
id: known-drift
part: command-reference
audience: internal
sources: docs-workspace/tooling/manual/command-reference.mts
generated: true
---

# Known drift

Generated on every build: references to commands that do not exist, CLI commands with no handler, and live commands that still point at retired ones.

## References to commands that do not exist (4)

| From | Target | How sure | Detail |
|---|---|---|---|
| /buildscope | /scope-validate | Confirmed | Referenced as a step or next step, but no such command exists. |
| /validateScope | /scope-builder | Confirmed | Referenced as a step or next step, but no such command exists. |
| /validateScope | /scope-validate | Confirmed | Referenced as a step or next step, but no such command exists. |
| /wxG-O-D | /scope-validate | Likely | Referenced as a step or next step, but no such command exists. |

## CLI commands with no handler (6)

| From | Target | How sure | Detail |
|---|---|---|---|
| wxkanban-agent createtesttasks | wxkanban-agent createtesttasks | — | Registered in the CLI but the workflow engine has no handler for it. |
| wxkanban-agent finalizeRelease | wxkanban-agent finalizeRelease | — | Registered in the CLI but the workflow engine has no handler for it. |
| wxkanban-agent pipeline-agent | wxkanban-agent pipeline-agent | — | Registered in the CLI but the workflow engine has no handler for it. |
| wxkanban-agent prepareRelease | wxkanban-agent prepareRelease | — | Registered in the CLI but the workflow engine has no handler for it. |
| wxkanban-agent runhuman | wxkanban-agent runhuman | — | Registered in the CLI but the workflow engine has no handler for it. |
| wxkanban-agent runqa | wxkanban-agent runqa | — | Registered in the CLI but the workflow engine has no handler for it. |

## Live commands that point at retired commands (4)

| From | Target | How sure | Detail |
|---|---|---|---|
| /buildscope | /wxAI-pipeline | Confirmed | Replaced by /createSpecs. |
| /validateScope | /wxAI-pipeline | Confirmed | Replaced by /createSpecs. |
| /wxG-O-D | /dev-plan | Confirmed | Replaced by /wxG-O-D --roadmap. |
| /wxG-O-D | /wxAI-pipeline | Likely | Replaced by /createSpecs. |
