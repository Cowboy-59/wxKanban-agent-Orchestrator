
# Podcast prep — founder's copy

**Not for the host.** Companion to `wxKanban-Podcast-Feature-Set.md`; part numbers below refer
to that document.

---

## 8. Accuracy guardrails

Say-this / not-that, so nothing needs walking back afterward.

| Do not say | Say instead | Why |
|---|---|---|
| "Click to convert your WINDEV app" | "A guided crossing, done *with* you, with real tooling for the mechanical half" | There is no self-serve in-app converter. The skills work from generated technical documentation and the engagement is founder-led. A prospect who signs up expecting a button will churn and say so publicly. |
| "Fully automated AI development" | "AI generates; the kit validates, fences, and audits; the gates decide" | Automation without the gates is exactly the failure mode this product exists to prevent. |
| "Everything is shipped" | Use the status column in Part 4 of the feature-set doc | Three items are genuinely not fully live. Naming them costs nothing and protects everything else. |
| "It replaces your PM tool" | "It works with your PM tool" | It syncs with Jira, Monday, Asana, and Trello. Rip-and-replace is not the offer. |
| Precise revenue, user, or customer counts | "Over a thousand registered interest before launch" | That figure is defensible. Others should not be stated live. |

One more, on naming names: the PCSoft and Constellation situation is factual and public, and the
Wx Alliance exists because of it. How explicitly to name the vendor on air is Andy's call —
visceral and specific lands harder, generic "your platform" is safer. Decide before recording
rather than in the moment.

---

## 9. Where every number came from

So the figures in Part 3 can be defended if challenged. All measured 2026-09-13 against the
repository at commit `ac15d380`.

| Figure | How it was measured |
|---|---|
| 102 scope documents | Count of `specs/Project-Scope/*.md` |
| 103 specification folders | Count of numbered directories under `specs/` |
| 1,400 tasks | Checklist task lines summed across every `specs/*/tasks.md` |
| 82 functional requirements | FR entries in `specs/main/spec.md` |
| 181,416 lines / 733 files | Line count over all `.ts` and `.tsx` under `src/` |
| 108 tables | `pgTable` declarations in `src/db/schema/` — the declared model |
| 247 test files | Files matching `*.test.ts`, `*.test.tsx`, `*.spec.ts`, excluding dependencies |
| 612 fences / 55 scopes | `[SCOPE nnn / Tnnn] BEGIN` markers in `src/`, and the distinct scope numbers among them |
| 73 slash commands | Command definitions in `.claude/commands/` |
| 34 skills | Skill directories in `.claude/skills/` |
| 52 MCP tools | Tools the hosted wxKanban MCP server exposes to a connected agent |
| Versions 1.5.316 / 1.7.62 | `src/client/version.ts` and `wxkanban-agent/package.json` |

A note on one of them: 108 is the count of tables *declared in the schema*. Declared and
deployed are tracked separately here and are not currently identical in both directions — which
is itself a scope with a spec. Do not present 108 as a production table count.

---

## 10. Open items before this becomes the PDF

- [ ] Andy decides how explicitly to name PCSoft / Constellation on air
- [ ] Confirm the "over a thousand" interest figure is still the one to use publicly
- [ ] Decide whether the host gets this whole document or Parts 1–5 only
- [ ] Pick the closing call to action — apply, email list, or just "come find me in the WINDEV groups"
- [ ] Andy's review pass on Part 7, since those answers should sound like him, not like a document