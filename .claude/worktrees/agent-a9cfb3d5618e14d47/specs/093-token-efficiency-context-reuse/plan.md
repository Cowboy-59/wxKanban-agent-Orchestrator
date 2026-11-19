# Plan: Token-Efficiency — Context Footprint & Reuse (Spec 093)

Spec ID: e55be53d-228c-4279-b5e3-157c590c9ad9 · Scope: SCOPE-093

## Premise

Tokens burn in the customer's editor-AI context window, not in the kit (the kit validates/writes/fences/audits; the AI generates). Every lever is either "load less" or "reuse instead of regenerate." This plan sequences the 11 tasks so the highest-multiplier, lowest-risk work lands first and the foundational-file changes are guarded.

## Build order

1. **Foundation — preamble footprint (T001 → T002 → T003 → T004).** Restructure CLAUDE.md and the rules directory to load on demand, with T004 as the always-on guard so no mandatory constraint slips behind an import. Highest multiplier (every session, every project); T004 gates the risk.
2. **Cache alignment (T005 → T006).** Make the preamble byte-stable/cache-eligible, then add the Cockpit batch guidance that makes the cache win real for customers.
3. **Reuse before generate (T008).** Run the Capability Index reuse-check ahead of buildscope — reuses shipped SCOPE-074/077 machinery, low risk, cuts the most expensive operation.
4. **Deterministic migration (T007).** Audit first, migrate only clear wins; leave judgment-dependent doctypes on the model.
5. **Pipeline handoffs (T009).** Structured stage-to-stage data in create_specs.
6. **Advisor + measurement (T010, T011).** The in-the-moment suggest-and-decide layer and the per-session/per-flow token report that makes all of the above visible.

## Gates / constraints

- **Disciplines held, not relaxed:** kit-generates-vs-AI-generates split, fencing, spec-first, orchestrator-first unchanged. FR-004 guards the mandatory rules.
- **User decides:** no saving is applied without explicit consent (FR-011).
- **Kit-synced blast radius:** T001–T004 touch kit-synced CLAUDE.md and `_wxAI/rules/` shipped to every customer — change carefully, verify enforcement intact before push.
- **Cross-surface:** touches the kit, the MCP server (T007/T009), and the Dev Cockpit (T006/T010) — Cockpit changes follow Marketplace release discipline (VSIX build + `vsce publish`).
- **No push until the user says push.**

## Known risks

- Over-aggressive CLAUDE.md splitting could weaken enforcement — mitigated by T004.
- Advisor noise — mitigated by silence-for-session + a conservative detection set.
- Token measurement approximate across sessions — targets carry margin.
- Deterministic migration could regress quality where judgment is needed — audit candidates, migrate only clear wins.
