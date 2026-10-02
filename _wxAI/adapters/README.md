# Stack adapters

*Moved here from `_wxAI/skills/wxCreateTestPlan/adapters/` under SCOPE-127 / T001.*

Three layers of the test pipeline resolve an adapter — `wxCreateTestPlan`, `implement` Phase 5b and
`/preTest`. While this directory sat under one skill, only that skill could legitimately read it,
and the other two had no seam to resolve anything through. It lives at the top of `_wxAI/` so all
three read one place, and so a fourth skill-mirror drift trap is not created.

## Where an adapter lives decides whether it ships

| Directory | Ships to consumers | Holds |
|---|---|---|
| `_wxAI/adapters/` | **Yes** — `_wxAI` is in `KIT_DIRS` | Adapters wxperts authors and supports |
| `.wxai/adapters/` | **No** — outside `KIT_DIRS` | Generated and user-added adapters, per project |

This split is not tidiness. **Kit sync mirrors the filesystem, not git**, so a generated adapter
written into this tree during development would ship in a public release — carrying whatever a
customer's `stack.md` happened to say. Generated adapters therefore land in the project's own
`.wxai/`, which the kit never packages.

`SKILL.md` holds the **method**: the phases, the three signoff gates, both personas, the risk tiers
and caps, the item schema, and the guardrails. All of it is stack-neutral and none of it belongs
here.

An **adapter** holds the **machinery**: the concrete commands, file locations and substitutes that
make the method executable on one particular stack. Every fact lives in exactly one place — if a
command appears in `SKILL.md`, it does not appear in an adapter, and vice versa.

## Why this split exists

The skill was written against wxKanban's own stack and its machinery silently assumed it. Run on a
C#/.NET repository, the TypeScript extractor walked 316 `.cs` files, matched nothing, wrote a
valid-looking inventory of **zero units**, and exited 0. Phase 2 would then have produced a
confident, empty test plan — which is worse than an error, because it reads as a result.

Two things now prevent that: the scripts hard-stop on an unsupported tree (exit 3, naming what they
found), and the skill resolves an adapter before Phase 0 rather than assuming one.

## Available adapters

| Adapter | Stack | Status |
|---|---|---|
| [`wxkanban-express.md`](wxkanban-express.md) | TypeScript · Express · Drizzle · PostgreSQL · Vitest/supertest · Playwright | Reference implementation — wxKanban's own |
| [`dotnet-wpf.md`](dotnet-wpf.md) | C# · .NET 8 · WPF/MVVM · EF Core 8 · PostgreSQL · xUnit + FluentAssertions | Verified on an 18-surface audit, 2026-08-11 |

## Resolution

All three layers resolve through one script, so they cannot disagree about which adapter a project
uses:

```bash
node _wxAI/adapters/resolve-adapter.mjs --json     # exit 0 resolved · 3 no match or a tie · 2 bad usage
node _wxAI/adapters/validate-adapter.mjs <path>    # exit 0 all six answered · 1 at least one is not
```

1. The resolver reads `stack.md` at the repo root. It is materialized by the kit from the project's
   Stack & Style document; do not hand-edit it (use `/buildstack`).
2. It compares the declared stack against every adapter's `**Matches:**` line, in both directories
   above, and returns the best match with its **provenance** (FR-010):

   | Provenance | Means |
   |---|---|
   | `shipped` | Authored and verified by wxperts, in `_wxAI/adapters/`. Never provisional. |
   | `provisional` | A project adapter in `.wxai/adapters/` — generated, or written by hand — not yet approved. |
   | `approved` | A project adapter whose developer set `**Status:** approved` in the file. |

3. The caller validates that adapter and **announces it out loud**, with its provenance, before
   Phase 0 does anything else. Then it follows `SKILL.md` for what to do and the adapter for how to
   do it here.

**A stack no adapter covers (`no-match`) → generate one** and carry on, following
[`GENERATE.md`](GENERATE.md). There is no approval prompt; what makes that safe is the guards, which
fail closed — see *Generated adapters* below.

**No `stack.md`, or two adapters tied → stop and say so.** Do not run the TypeScript extractor
speculatively to "see what comes back"; a zero-unit inventory from the wrong stack is
indistinguishable from a codebase that genuinely has nothing in it.

## The adapter contract

Every adapter answers these six questions and nothing else. Anything that would be true on any
stack belongs in `SKILL.md`.

| § | Question | Feeds |
|---|---|---|
| **Inventory source** | What enumerates every callable unit here, and what does that command miss? | Phase 1 |
| **Schema source** | Where does the schema of record live, and what must it be reconciled against? | Phase 1B |
| **Harness** | How are units driven under test, the way production wires them? | Phase 3 |
| **UI driver** | What drives the running UI and captures evidence? | UI/UX coverage, walkthroughs |
| **DB posture** | Which connection is production, how is a non-prod target proven, what is the disposable option? | Phase 0 step 3 |
| **Test substitutes** | What stands in for the real database/clock/network, and **which constraints can it not enforce**? | Phase 2A risk register, `test-validity` |

The last one is the least obvious and the most valuable. A substitute that cannot enforce the
constraint under test makes every assertion about that constraint **unfailable** — the suite goes
green while testing nothing. Name those limits in the adapter so they land in the risk register at
Phase 2A instead of being discovered at Gate 2, or never.

## Writing your own adapter

*SCOPE-127 / T017 (FR-015).*

When no adapter matches your stack, the pipeline generates one for you (see *Generated adapters*).
You can also write one yourself, or edit the one it generated. Either way it is plain markdown, it
lives in your project, and the pipeline uses it exactly as it uses one wxperts ships. This section
is the whole contract — you do not need to read any pipeline source.

### 1. Where it goes

`.wxai/adapters/<name>.md` at your project root. That directory is yours: the kit never packages it
and never overwrites it, and a kit upgrade leaves it alone. Every run announces an adapter found
there as `provisional` until you approve it, so its output is never mistaken for a shipped adapter's.

### 2. The header — how the resolver finds it

```markdown
# Adapter — Tauri 2 · Rust · React · embedded Firebird (desktop)

**Stack:** Rust (Tauri core) with a React webview, Firebird 5 embedded, cargo test + Vitest.

**Application type:** desktop
**Matches:** rust tauri firebird webview
**Status:** provisional
**Inventory signal (command):** `src-tauri/src/**/*.rs` :: `#\[(?:tauri::)?command\b`
```

| Line | Rule |
|---|---|
| `**Application type:**` | `web`, `desktop` or `mobile`. It must equal the type in the `## Target Stack — <Type>` heading of `stack.md`, or the adapter is never considered. Leave the line out and it is considered for every type. |
| `**Matches:**` | **Required.** Space-separated tokens. The resolver lower-cases the **Choice** column of `stack.md` (the *Why* column is ignored), strips punctuation, and counts how many of your tokens appear in it. |
| `**Status:**` | `provisional` or `approved`. Leave it `provisional` until you trust the adapter; changing it to `approved` is the whole approval step, and it never blocks a run. Anything other than `approved` reads as provisional. |
| `**Inventory signal (<kind>):**` | **Required**, one line per kind. `<kind>` is the `kind` those units carry in `inventory.json`; `<glob> :: <regex>` is the files, and the pattern, where each unit of that kind is *declared*: the attribute on a command function, a `<Route>` element, a `router.get(` call — not a central list naming units declared elsewhere. One line per kind. `inventory-guard.mjs` counts it per file and per kind, independently of the inventory, and refuses a file that declares more units of that kind than the inventory lists — so a unit's `file` must be the file where the signal matches it, and its `kind` the kind the signal names. The pattern is a JavaScript regular expression; write `/pattern/i` for flags. Cover the variants your stack allows (`#\[(?:tauri::)?command\b` also catches `#[tauri::command(async)]` and a bare `#[command]`). Backticks are optional. |

Rules worth knowing before you pick tokens:

- **At least two tokens must overlap.** One shared word is never enough — a database name alone
  would match every adapter that uses that database.
- **The highest count wins; a tie is a miss**, reported rather than guessed. If yours ties with
  another adapter, add a token only your stack's Choice column contains.
- **Pick tokens that tell your stack apart.** `react` or `vitest` describe half the projects there
  are; `tauri` and `firebird` describe the example above.
- Some words are dropped before matching and can never count: `core`, `embedded`, `native`,
  `shell`, `sidecar`, `optional`, `required`, and connectives such as `and`, `or`, `with`, `only`.
  Write `firebird`, not `embedded`.
- `node _wxAI/adapters/resolve-adapter.mjs --json` prints the tokens your `stack.md` produced and
  how each adapter scored against them.

### 3. The six answers — what the validator checks

Use exactly these six `##` headings. `validate-adapter.mjs` checks each one, and no layer proceeds
on an adapter that fails any of them.

| Heading | Must contain |
|---|---|
| `## Inventory source` | At least **80 characters** of answer. Every heading has this floor: a heading with one line under it is not an answer. |
| `## Schema source` | The floor. |
| `## Harness` | The floor. If `implement` should seed on this stack, add a `### Seeding form (Phase 5b)` subsection: where a seed lives, what runs it, how it is made idempotent, how a shared base is reused, where it may write, and how it is verified. |
| `## UI driver` | A driver that really runs. The answer may not decline — `none`, `no automated`, `not automated`, `no UI driver`, `manual only`, `human walkthrough` and `tested manually` all fail it. It must also name something runnable: an `npx …`, `node …`, `dotnet …`, `npm run …`, `cargo test …`, `flutter test …` (or similar) command, or a driver such as Playwright, WebdriverIO (`wdio`), `tauri-driver`, Appium, WinAppDriver, Selenium, Cypress, Maestro, Detox, XCUITest, Espresso or pytest. |
| `## DB posture` | The floor, plus a `### Disposable target (/preTest Phase 1-2)` subsection containing: a **Posture** line — a `\| Posture \|` table row or a `Posture:` line — naming exactly one of `**schema**`, `**file**` or `**container**` in bold (only the chosen one in bold on that line); how the target is **created** — a schema posture must use `clone-test-schema.mjs`, so its faithfulness refusal is what fires; how **isolation** is proven; the **faithfulness** check; and the write **boundary**. Prefer `file` or `schema`: `container` is valid to describe, but `posture-boundary.mjs` refuses every write on it today, so the CRUD tier cannot run on it yet. |
| `## Test substitutes` | What each substitute **cannot** enforce. The validator looks for `cannot`, `does not enforce`, `not enforced` or `unfailable`; a list of substitutes without their limits fails. |

A **generated** adapter must also carry `## Security test cases` (FR-014, SOC 2 CC7.1) — concrete
cases for its stack, each naming the unit or file it targets. A hand-written one should; it is not
yet enforced. Any `<!-- wxai:generate … -->` placeholder left anywhere in the file fails validation.

The UI driver rule is strict on purpose. No UI result is recorded until the driver proves it drove
something — a target that booted, and a non-empty element tree or a real captured frame
(`ui-driver-proof.mjs`). An adapter that names no runnable driver leaves nothing to prove, and the
UI gate would quietly stop existing.

### 4. Check it

```bash
node _wxAI/adapters/validate-adapter.mjs .wxai/adapters/<name>.md   # OK, or FAIL naming each gap
node _wxAI/adapters/resolve-adapter.mjs                             # Resolved adapter: <name> (provisional)
```

Both must pass before `/wxCreateTestPlan`, `/preTest` or `implement` will use it. Once an inventory
exists, `inventory-guard.mjs` checks it against your signal on every run.

## Generated adapters

*SCOPE-127 / T010–T013 (FR-006, FR-007, FR-013).*

When the resolver reports `no-match`, every layer follows [`GENERATE.md`](GENERATE.md):
`generate-adapter.mjs` writes a candidate into `.wxai/adapters/` — header, `**Status:** provisional`,
`**Origin:** generated`, the six headings and a security section, each holding a placeholder — and the
agent completes it from `stack.md` and the repository, validates it, and carries on. No approval
prompt. The next run finds the file and reuses it; nothing is regenerated or overwritten. Its
**How this was completed** note says which claims were observed in the repository and which come
from knowledge of the stack — read that first when reviewing one.

A generated `**Matches:**` line lists every token of the project's stack, generic ones included.
That is deliberate: the file exists only in this project, so it competes with nothing but the
shipped adapters, and the full list guarantees it resolves here.

No human approves a generated adapter before it runs, so these checks carry the safety burden
(ADR `docs/adr/0001`), and each fails closed:

| Guard | When | Refuses |
|---|---|---|
| `validate-adapter.mjs` | Before the adapter is used | A placeholder left unfilled; a missing answer, Matches line or Inventory signal; a Disposable target that names no single posture or leaves out creation, isolation, faithfulness or boundary; a schema posture that bypasses `clone-test-schema.mjs`. **A floor, not a review** — it checks each part is addressed, not that it is right |
| `inventory-guard.mjs` | Phase 1, every inventory | Zero units, a signal that matches nothing, or a file that declares more units than the inventory lists. The scope comes from the run's own target (`--scope`), never from the inventory, and every exclusion is reported |
| `ui-driver-proof.mjs` | The UI tier | A UI result with no proof the driver booted the target and saw a real element tree or frame |
| `posture-boundary.mjs` | The CRUD tier | A write outside the disposable target's boundary — and, today, every write on a `container` posture |

### Worked example

[`dotnet-wpf.md`](dotnet-wpf.md) is a complete adapter, verified on a real 32,000-line codebase.
Read it against the table above: it answers the six headings, carries both subsections, and its
*Test substitutes* answer shows the part most worth copying — it names exactly which constraints the
in-memory provider cannot enforce, so those cases route to a real-engine tier instead of passing
unfailably. Do not copy its posture: it uses **container**, which `posture-boundary.mjs` does not
yet accept writes on. A project adapter should use **file** or **schema**.

## Shipping an adapter (wxperts)

Write it as above, but into `_wxAI/adapters/`, answering the six headings with commands and paths
that are real in that stack, and cite where each claim was verified. Keep anecdotes only when they
carry a reusable rule — the 53-vs-55 schema discrepancy in `dotnet-wpf.md` is there because it
generalizes to every ORM-first stack, not because it happened.

Then add a row to *Available adapters*, and — if a deterministic extractor exists for the stack — teach
the corresponding script to recognize it rather than hard-stopping. Until it does, the hard stop is
the correct behavior.
