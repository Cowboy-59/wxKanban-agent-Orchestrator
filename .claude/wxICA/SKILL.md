---
name: wxICA
description: wxKanban (ICA) Improve Codebase Architecture — runs a mechanical drift audit (dangling references, cross-package source imports, build-mode coverage, spec-interaction conflicts) and then surfaces deepening opportunities. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, audit recent refactors for missed surfaces, or make a codebase more testable and AI-navigable.
---

# wxICA — Improve Codebase Architecture

## Why This Matters

Think about two workshops. One has every tool in its place, labeled, easy to find. The other has the same tools scattered across every surface. Same tools, completely different experience — and in the second one, you spend half your time looking instead of working.

A codebase works the same way. As software grows, it can become cluttered — logic scattered across many small pieces that all need to be understood together to get anything done. This skill helps you find those places and consolidate them: fewer moving parts, clearer interfaces, easier to test and change.

Senior developers do this instinctively. They ask: "if I deleted this piece, would the complexity disappear — or just move somewhere else?" If it moves, the piece was earning its keep. If it disappears, the piece was just passing work around without adding value. Learning to ask that question is one of the biggest jumps from junior to senior.

**This methodology is tool-agnostic.** The pattern applies whether you're working alone, with an AI, or on a team. The AI can explore and suggest — but the judgment call on what's worth changing is yours.

---

Surface architectural friction and propose **deepening opportunities** — refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point — don't drift into "component," "service," "API," or "boundary."

- **Module** — anything with an interface and an implementation (function, class, package, slice).
- **Interface** — everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation** — the code inside.
- **Depth** — leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam** — where an interface lives; a place behaviour can be altered without editing in place.
- **Adapter** — a concrete thing satisfying an interface at a seam.
- **Leverage** — what callers get from depth.
- **Locality** — what maintainers get from depth: change, bugs, knowledge concentrated in one place.

Key principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.**
- **One adapter = hypothetical seam. Two adapters = real seam.**

This skill is _informed_ by the project's domain model. Use `CONTEXT.md` for domain vocabulary. Check `docs/adr/` for decisions the skill should not re-litigate.

## Process

### 0. Drift Audit (mechanical, runs first)

Architectural friction also comes from **drift** — inconsistencies left behind by a refactor that didn't update every surface it touched. Deepening alone cannot find these; they require a mechanical sweep. Run all four checks before the judgment-heavy exploration in step 1.

1. **Dangling-reference sweep.** For every entity deleted or renamed in the recent diff (npm scripts, env keys, exported symbols, file-path strings, table/column names, fence IDs, HTTP routes), grep the whole tree for callers still using the old name. Any hit is a defect. *Why this matters: an orphan caller breaks the next fresh setup but compiles fine on the machine that made the change.*

2. **Cross-package source-import audit.** Find every TypeScript import that traverses out of its package (`grep -rn "from ['\"]\\.\\./\\.\\." --include="*.ts"`). For each, resolve the target. If it lands in a sibling package whose `tsconfig` ships `.ts` alongside `.d.ts`, and the importer has a restrictive `rootDir`, the build will fail under strict `tsc` (TS6059) even though `tsx watch` is happy. Fix by consuming compiled output, adding a project reference, or wrapping the import in a local file that uses `createRequire`.

3. **Build-mode coverage.** Any commit touching `.ts` files must pass the production build command (`npm run build` / `tsc`) for every affected package, not just the dev watcher. Dev tools (`tsx watch`, `ts-node`, Vite dev, Next dev) relax constraints the production build enforces. A green dev run does not substitute.

4. **Spec-interaction conflict scan.** When a recent spec touches a shared runtime concept (process lifecycle, port, env var, table column, fence ID format, lifecycle-stage strings), grep `specs/**/*.md` for every other spec that touches the same concept. Read each. If their assertions conflict, flag it. *Why this matters: each spec is correct in isolation; their composition isn't.*

Report drift findings as a flat numbered list — concrete defects with file:line and a one-line fix. Then stop. The deepening exploration in step 1 is a separate phase; do not bundle drift defects with deepening proposals.

### 1. Explore

Read `CONTEXT.md` and any ADRs in the area you're touching first.

Then use the Agent tool to walk the codebase organically and note friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** — interface nearly as complex as the implementation?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it? A "yes, concentrates" is the signal you want.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files** — which files/modules are involved
- **Problem** — why the current architecture is causing friction
- **Solution** — plain English description of what would change
- **Benefits** — explained in terms of locality and leverage, and how tests would improve

**Use `CONTEXT.md` vocabulary for the domain.** Talk about "the Time Entry service" not "the FooBarHandler".

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly (e.g. _"contradicts ADR-0007 — but worth reopening because…"_).

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them — constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md` right there.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR: _"Want me to record this as an ADR so future architecture reviews don't re-suggest it?"_ Only offer when the reason would actually be needed by a future explorer. Skip ephemeral reasons ("not worth it right now") and self-evident ones.
