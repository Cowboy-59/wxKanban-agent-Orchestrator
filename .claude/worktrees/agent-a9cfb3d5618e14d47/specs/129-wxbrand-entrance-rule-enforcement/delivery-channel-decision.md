# wxBrand delivery channel — decision

**Spec**: SPEC-129 / T001 · **Decided**: 2026-09-20 · **Status**: decided

T001 exists because the two answers have different release mechanics, and choosing by accident
during implementation is how the wrong one gets shipped.

## The decision

**wxBrand ships kit-side only. No hosted MCP prompt twin in this release.**

## The two channels

| Channel | What it is | Release cost |
|---|---|---|
| Kit-side markdown | `.claude/` and `_wxAI/` — command + skill, synced to consumer projects by the kit | None. Ships with the kit |
| Hosted MCP prompt | A `.md` under `mcp-server/src/prompts/`, base64'd into a registry | Regenerate the prompt registry **and** redeploy the hosted MCP |

## Why kit-side

wxBrand's work is local. It reads and writes documents on disk, drives a headless browser against a
page, and emits artifacts into a project. A hosted prompt would describe a workflow the hosted
server cannot perform, because the server has no access to the operator's working tree.

This matches the existing split: the conversion commands and the review skill carry hosted twins
because their prompts are instructions a hosted agent can act on. wxDesigner — the closest
neighbour to wxBrand, and equally filesystem-bound — carries none.

## What this costs, stated plainly

A consumer who reaches wxKanban **only** through the hosted MCP, and never syncs the kit, will not
see wxBrand. That is a real gap, not a non-issue. It is accepted here because the alternative is a
prompt that promises a capability the hosted side cannot deliver, which is worse than an absence:
an absence is noticed, and a broken promise is discovered halfway through.

## When this should be revisited

Add a hosted twin if any of these becomes true:

1. A consumer needs to start a brand capture without a synced kit.
2. Capture moves server-side — if the headless read runs on the server rather than the operator's
   machine, the hosted side becomes capable of the work and the prompt stops being a promise it
   cannot keep.
3. The hosted registry gains a way to describe a local-only command honestly, so a consumer is told
   where to run it rather than being handed instructions that will not work.

## Related, and deliberately not fixed here

`mcp-server/src/prompts/` has no `wxdesigner.md`. That absence is a known defect with its own
cause, and it is outside this spec's boundary. It is noted because it is the reason this decision
was written down rather than assumed: the same gap already exists next door, unrecorded, and
nobody can tell whether it was a decision or an oversight.
