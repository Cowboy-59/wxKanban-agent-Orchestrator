# Generating an adapter

*SCOPE-127 / T010–T013 (FR-006, FR-007, FR-013). Read by `wxCreateTestPlan`, `implement` Phase 5b
and `/preTest` alike — this is the one copy of the procedure.*

When the resolver reports **`no-match`**, no adapter covers the declared stack. The run does not stop
there: it generates a candidate adapter for this project, completes it, checks it, and carries on —
with no approval prompt. That is safe only because the checks below fail closed. Do not skip one,
reorder them, or treat a refusal as advisory.

**This procedure is for `no-match` only.** No `stack.md` (`no-stack-md`) means there is nothing to
generate from, and a tie (`ambiguous`) means adapters already match — both remain hard stops. Say so
and stop.

**`<target>`** below is the folder the calling step writes this run's artifacts to,
`tests/testplans/<target>/` — the scope or spec id for a requirement-driven run, the path for a path
run, `all` for a whole-app run.

## 1. Write the candidate

```bash
node _wxAI/adapters/generate-adapter.mjs            # add --app-type web|desktop|mobile when stack.md declares several
```

| Exit | Meaning | Do |
|---|---|---|
| `6` | A candidate was written to `.wxai/adapters/<name>.md` | Complete it — step 2 |
| `0` | An adapter already exists for this stack | Re-resolve and use it. If it fails validation, complete it — step 2 — rather than generating another |
| `3` | Cannot generate | Stop, and report the reason it printed |
| `2` | Bad usage (an unknown `--app-type`) | Fix the command and re-run |

It never overwrites a file. The candidate holds the header, `**Status:** provisional`,
`**Origin:** generated`, the six headings and a security section — each with a
`<!-- wxai:generate … -->` placeholder. **The placeholders are instructions, not answers.**

## 2. Complete it

Replace every placeholder, including the one on the `**Inventory signal:**` line. Leave `**Matches:**`,
`**Application type:**`, `**Origin:**` and `**Status:**` as written — approval is the developer's.

### What counts as true

An adapter mixes two kinds of claim, and they are held to different standards:

| Kind | Examples | Standard |
|---|---|---|
| **Repository facts** | paths, file names, what a file contains, what is and is not installed, counts | **Checked here.** Open the file; run the search. Never from memory. |
| **Stack facts** | a tool's name and flags, which platforms it supports, a database's upsert syntax | From knowledge of the stack is acceptable — **but mark it as not run here.** |

Fill the **How this was completed** placeholder under the header block: which commands were run
here, and which named commands were not. Make it as long as it needs to be, and add what steps 3–5
returned once they have run. A reader must be able to tell an observed fact from a recalled one.

**When the repository has not set something up yet** — no UI test tooling, no seeds, an app that
does not build — answer with what this stack would use *here*, and say plainly that it does not
exist yet and what is missing. That is an answer. For the UI driver in particular: name the driver
this stack documents, even if it is not installed; the runtime proof (`ui-driver-proof.mjs`) will
refuse it until it really drives something, which is the intended result. Say "not set up yet" —
the validator reads phrasings that *decline* to drive the UI as a refusal: `no automated driver`,
`no UI driver`, `the UI is not automated`, `manual only`, `tested manually`, `human walkthrough`,
`Driver: none`.

**Leave a placeholder only when you cannot say what this stack would use at all.** Say which question
and why. Validation then refuses the file and the run stops (FR-008) — better than a confident wrong
adapter.

### The answers

- **Never transliterate wxKanban's machinery.** No `tests/seeds/*.ts`, Drizzle, `runSeed` or
  `wxktest_` in a project whose stack does not use them.
- **Inventory signal** — one line per kind of unit:
  `**Inventory signal (<kind>):** <glob> :: <regex>`. Replace `<kind>` with the `kind` those units
  carry in `inventory.json` (`command`, `route`, `table` …). The pattern matches where each unit is
  **declared** — the `#[tauri::command]` attribute on the function, the `<Route>` element, the
  `router.get(` call — not a central list that names units declared elsewhere, because the guard
  compares counts **per file and per kind**: a unit's `file` must be the file where the signal
  matches it, and its `kind` the kind the signal names. Write the pattern for the variants this stack
  allows (`#\[(?:tauri::)?command\b`, not `#\[tauri::command\]`, which misses
  `#[tauri::command(async)]` and a bare `#[command]`). It is a JavaScript regular expression; write
  `/pattern/i` for case-insensitive matching (SQL DDL usually needs it). Check it with a search
  before relying on it. Units of a kind with no signal may also be listed; they are simply not
  counted.
- **UI driver** — a runnable command for a driver that boots this app and drives its screens (see
  *What counts as true*). Declining is refused.
- **DB posture** — production's connection, then `### Disposable target (/preTest Phase 1-2)` as a
  table or labelled lines: a **Posture** line naming exactly one of **schema**, **file** or
  **container** in bold — name only the chosen one in bold there — then how the target is
  **created** (schema: `clone-test-schema.mjs`), how **isolation** is proven, the **faithfulness**
  check, and the write **boundary**.
  **Prefer `file` or `schema`.** `container` is valid to describe, but `posture-boundary.mjs` refuses
  every write on it today, so the CRUD tier cannot run until that posture is verified. On a `file`
  posture no kit script checks faithfulness — `clone-test-schema.mjs` is PostgreSQL-only — so name
  the check this project must run (for example, the catalogue's tables and constraints counted
  against the DDL) and say the CRUD tier stops until it exists.
- **Test substitutes** — for each substitute, what it **cannot** enforce.
- **Security test cases** — concrete cases for this stack, each naming the unit or file it targets.

## 3. Validate

```bash
node _wxAI/adapters/validate-adapter.mjs .wxai/adapters/<name>.md
```

Exit `0` or stop. A project adapter is checked for the six answers **and** for a Matches line, a
parseable Inventory signal, a Disposable target that names one posture and addresses creation,
isolation, faithfulness and boundary, security cases, and no leftover placeholder. Fix what it names
and re-run.

**Validation is a floor, not a review.** It confirms each part is *addressed* — it reads for the word
"faithful", not for a faithfulness check that works. Passing it does not make the adapter right, and
an adapter whose own answers say a tier cannot run yet is still valid: that tier will stop at run
time, which is correct. The runtime guards in step 5 decide.

## 4. Re-resolve and announce

```bash
node _wxAI/adapters/resolve-adapter.mjs
```

It must name the file you completed, with provenance **provisional**. Announce it in those words:

> Using a GENERATED adapter — `<name>` (**provisional**) at `<path>`. It was written for this project
> because no shipped adapter covers its stack, and it has not been reviewed.

Never describe a generated adapter as shipped, verified or approved.

## 5. Carry on — with the guards in force

**Inventory — now, before planning.** Write `tests/testplans/<target>/inventory.json`:

```json
{
  "generatedFor": "<target>",
  "units": [
    { "id": "command:<name>", "file": "<repo-relative file where the signal matches>", "line": 0,
      "name": "<name>", "kind": "command", "risk": "HIGH", "mutates": true }
  ]
}
```

- `id` is unique and is `<kind>:<name>`; a test item's `unitId` is exactly this `id`.
- `kind` is a short word for what the unit is on this stack (`command`, `route`, `table`, …) — the
  same word prefixes its `id` and names its signal line. `line` is the line the signal matches.
- `risk` follows the rule the shipped extractor applies: **HIGH** if the unit changes state, touches
  authentication, secrets or payments, or calls out over the network; **MEDIUM** if it reads or
  writes the database, files or configuration; **LOW** otherwise. `mutates` says whether it changes
  state.
- Further fields are welcome where they help later phases — `deps` (what a unit depends on; test
  items take their tags from it), `signature`, `exported`. The values above are placeholders, not an
  example to copy.

Write `tests/testplans/<target>/INVENTORY.md` beside it — the same units as a table per file — as
the calling skill's Phase 1 expects.

Then check it against the adapter's own signal:

```bash
node _wxAI/adapters/inventory-guard.mjs --adapter .wxai/adapters/<name>.md \
     --inventory tests/testplans/<target>/inventory.json
```

Add `--scope <path>` **only when the run's target is a path**, and use that path — never narrow the
scope to make a refusal go away; the guard reports every registration it left out. Exit `3` is a
refusal — zero units, a signal that matches nothing, or a file registering more units than the
inventory lists (it names each file). Do not plan against a refused inventory.

**Later phases — the other two guards fire where they apply:**

- **UI** (`/preTest`, `--Execute`): no UI result is recorded until `ui-driver-proof.mjs` accepts proof
  that the driver drove something — a booted target and a real element tree or frame.
- **Database** (the CRUD tier): the Disposable target's faithfulness check is blocking, and nothing
  is written outside its boundary (`posture-boundary.mjs`).

## 6. Hand it over

Tell the developer the file is theirs: plain markdown in `.wxai/adapters/`, never overwritten by the
kit, reused on every later run. Ask them to review it — the **How this was completed** note says what
was observed and what was recalled — and to set `**Status:** approved` when they trust it. Every run
calls it provisional until then. Do not change the status yourself.
