# Rule — Token-Saving Advisor (SCOPE-093 / FR-010–FR-014)

**Read this when you are about to surface a token-saving suggestion.** The always-on summary
lives in `CLAUDE.md` → *AI Behavior → Token-saving advisor*; this file holds the detail so the
core stays thin.

## Principle

Tokens burn in **your** context window (the editor AI), not in the kit. Your job is to *notice*
a concrete saving and *offer* it — the user always decides. This is a suggest-and-decide advisor,
never an automation. It mirrors the project's core philosophy: surface the opportunity, let the
human choose.

## The protocol (FR-010, FR-011)

When you detect an opportunity:

1. **State it in one or two lines** — what you noticed and why it costs tokens.
2. **Give an estimated saving** — a rough token range (see heuristics below). Approximate is fine;
   say "≈" and never present a false-precision number.
3. **Offer exactly three choices:** `apply` / `skip` / `silence-for-session`.
4. **Never auto-apply.** If the user does not respond, take **no action** — leave state unchanged.
5. **Honor silence per class.** If the user says silence-for-session, stop raising *that class* of
   suggestion for the rest of the session; keep raising the other classes. Silencing "context-bloat"
   does not silence "deterministic-doc".

Keep it lightweight — one short prompt, not a wall of text. A dismissed suggestion should cost the
user a glance; do not re-raise a skipped one for the same trigger instance.

## The four detection classes (FR-012 — minimum set)

| Class | You notice… | Suggest |
|-------|-------------|---------|
| `covered-buildscope` | a `buildscope` request an existing scope already substantially covers | Reuse/extend the existing scope instead of generating a new one. **Already wired** — the buildscope reuse-check (SCOPE-093/FR-008) surfaces this before the interview; this advisor just reinforces it if it comes up again mid-flow. |
| `deterministic-doc` | the user asks you to hand-write/regenerate a document that has a **deterministic generator** | Point them at the generator instead of spending model tokens. Deterministic doctypes: `lifecycle`, `devplan`, `scopeflow`, `ProjectLifecycle`, `DevelopmentPlan`, `AuditReport`, `help`, the `CompoundLearnings` aggregate (see `specs/093-token-efficiency-context-reuse/T007-doctype-audit.md` for the full list + how each regenerates). |
| `context-bloat` | the working context has grown well beyond what the current task needs (large files read that are no longer relevant, a finished sub-task's output still resident) | Suggest `/clear` or narrowing to the active files before continuing. |
| `cold-command-batching` | repeated **cold** runs of kit commands spaced apart, each re-paying the fixed preamble, where grouping them would ride the Anthropic prompt cache (~5-minute TTL) | Suggest batching the next few kit commands together within the cache window. |

You may raise opportunities outside these four when they are clearly real — the four are the
**minimum**, not the ceiling. Same protocol applies.

## Estimation heuristics

You will not have exact session telemetry. Estimate from what you *can* see; label everything "≈".

- **Rough token count of any text** ≈ characters ÷ 4 (English). For a file, `bytes ÷ 4`.
- **`covered-buildscope`** — a full buildscope interview + generated scope doc is easily several
  thousand tokens of generation plus the back-and-forth; reusing an existing scope saves ≈ the
  whole generation. Estimate "≈ a few thousand tokens + the interview turns."
- **`deterministic-doc`** — saving ≈ the size of the document you would otherwise generate
  (bytes ÷ 4), since the generator produces it with **zero** model tokens.
- **`context-bloat`** — saving ≈ (bytes ÷ 4) of the no-longer-needed files/output that would
  otherwise ride along in every subsequent turn of the session. Multiply by the turns remaining if
  you want to convey the compounding cost.
- **`cold-command-batching`** — saving ≈ the fixed preamble footprint × (cold runs − 1), because a
  warm cache hit avoids re-billing the preamble. Get the preamble footprint from the measurement
  surface below.

## Measurement surface (FR-013, FR-014) — `token-footprint`

Run `node scripts/token-footprint.mjs` to get the concrete numbers that back your estimates and to
show **before/after** when a saving is applied:

- **Per-session preamble** — the fixed footprint that loads every session: `CLAUDE.md` + the
  `MEMORY.md` index (the on-demand reference/rule modules are reported separately and marked
  *not loaded unless triggered*).
- **Per-flow estimate** — the command-prompt cost of a flow such as `buildscope → createSpecs →
  implement`, summed from the served MCP prompts.
- **Before/after** — `node scripts/token-footprint.mjs --baseline` snapshots the current numbers;
  a later plain run prints the delta against that snapshot, so an applied change's effect is
  attributable to it.

Use it to replace a hand-waved estimate with a measured one whenever the user asks "by how much?"

## Anti-noise guardrails

- One suggestion at a time; don't stack advisories.
- Don't interrupt a focused edit to advertise a marginal (< ~a few hundred token) saving.
- If you already suggested a class this session and were skipped, wait for a *new* trigger instance
  before raising it again; if silenced, don't raise it at all.
- The advisor must never delay or block the user's actual request — surface, then proceed with what
  they asked.
