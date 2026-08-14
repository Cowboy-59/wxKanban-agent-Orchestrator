# Adapter — .NET / C# / WPF / EF Core (desktop)

**Stack:** C# · .NET 8 · WPF (XAML) / MVVM · EF Core 8 · PostgreSQL · xUnit + FluentAssertions.
No REST/GraphQL tier — the desktop client reaches the database through EF Core directly.

Verified on the HourGlass2025 desktop rebuild, 2026-08-11: an 18-of-18-surface audit over 32,758
lines of product code (28,320 `.cs` + 4,438 `.xaml`) and 991 existing test cases across 87 files,
including a live walkthrough of 16 of 31 views. Every concrete number below is an observation from
that run, not an estimate.

Read `SKILL.md` for the method; this file is only the machinery. See [`README.md`](README.md) for
the adapter contract.

> **None of the wxKanban scripts apply here.** `inventory-functions.mjs` and `schema-analyze.mjs`
> now exit 3 on this tree rather than returning an empty result. `clone-test-schema.mjs` is the one
> portable script — it targets PostgreSQL, not Drizzle — but see *Schema source* before preferring
> it to a model-built database.

---

## Inventory source (Phase 1)

**The composition root is the authoritative unit list.** `App.xaml.cs` `BuildServices` registers
every service and ViewModel, so it enumerates the capability surface in a way no regex extractor
could infer. Start there, then add:

| Add | Why it is a unit |
|---|---|
| `[RelayCommand]` methods | The behavior units — what a button actually invokes |
| `DbSet<>` properties | The data units, equivalent to Drizzle tables for CRUD targeting |
| `Register<TViewModel, TWindow>()` calls | The navigation graph — the desktop equivalent of routes |

`grep -c "Demand"` (or the project's authorization primitive) per service gives an
**authorization-coverage column for free**. An inverted profile — reference tables gated, core
business entities not — is a finding, and it is invisible file by file.

**What this misses:** anything resolved by reflection or registered outside `BuildServices`. Walk
the navigation graph and confirm every registered window is reachable; a `Window` registered and
unreachable from any navigation path is a wiring finding, not an inventory gap.

---

## Schema source (Phase 1B)

**Two sources that must be reconciled**, and neither alone is trustworthy:

1. **The EF model** — `OnModelCreating`, `HasIndex`, `HasQueryFilter`, entity annotations.
2. **The physical database** — `information_schema.tables` and `information_schema.columns`.

Compare `DbSet` count against `information_schema.tables`, and per-entity properties against
`information_schema.columns`. **A mismatch is a must-fix finding.**

### Schema provenance — the trap that cost the most here

The HourGlass repository ships `rebuild/db/schema.postgres.sql` as its only schema artifact and has
**no EF migrations anywhere**. Applying it produced **53 tables**; the EF model needs **55**. Two
`DbSet`s (`Allegati`, `PersistentLoginToken`) had no table, and every soft-deletable/auditable entity
was missing its seven audit columns — `Aziende` had 5 columns against the model's 12. The first
insert failed with `column "IsDeleted" of relation "Aziende" does not exist`, and since the global
query filter `!e.IsDeleted` is in *every* query, no screen could have loaded.

**Therefore, on any ORM-first stack:** never assume a checked-in `.sql` describes the model. Build
the Gate-2 database with `context.Database.EnsureCreated()` from the model (a ten-line throwaway
console app referencing the data project), then diff it against the shipped schema. **The diff is a
finding**, and it is the kind that blocks an entire release. `EnsureCreated` is fine for a test
database and is **not** a release strategy — say so in the plan.

### Also check

- **Are global query filters actually activated?** `HasQueryFilter` reading context state is inert
  unless something sets that state. Search for **production** callers of the setter, not just its
  definition. A filter whose only callers are tests degrades to "see everything" in production while
  the suite stays green.
- **Column widths.** Silent `Truncate(value, n)` before a uniqueness check, or truncation that
  removes a file extension, are data defects that read as defensive code.

---

## Harness (Phase 3)

**Desktop apps have no HTTP surface** — there is no supertest equivalent and nothing to mount.

- Test **services directly through the DI container the way production builds it**. Resolving a
  service the way production resolves it is the whole point: a test that news-up the class bypasses
  exactly the registration defects worth catching.
- Test **ViewModels headlessly** — construct, invoke the `[RelayCommand]`, assert on observable
  state.
- **The existing xUnit suite is the harness.** Do not build a parallel one; extend it.

### xUnit specifics for Phase 2

- Default parallelism is **per test class**. Any test mutating process-wide state —
  `CultureInfo.DefaultThreadCurrentCulture`, environment variables, a shared fixture name — must sit
  in its own `[Collection]` and restore in a `finally`. A restore on the happy path only leaks the
  mutation to every concurrently running class the moment an assertion fails.
- Fixed in-memory database names shared across methods make tests order-dependent. Prefer
  `Guid.NewGuid().ToString()`.
- Tests that assert on **source text** (`File.ReadAllText(...).Should().Contain("…")`) pin
  implementation shape, not behavior. One here guards the exact condition that causes a known
  navigation defect, so fixing the defect turns the test red — flag this class explicitly in the
  risk register, because the natural reaction is to re-pin the defect.
- Characterization tests naming observed-but-unfixed behavior (here: an `OSSERVATO_` prefix) are
  **legitimate and valuable**. Do not report them as defect-pinning; do check each still describes
  reality.

---

## UI driver (UI/UX coverage)

**UI Automation** (`System.Windows.Automation`) plus `PrintWindow` for pixels. Playwright does not
apply — there are no URLs, no routes and no DOM.

Driving a WPF app is entirely feasible and yields evidence static review cannot reach.

### WPF walkthrough recipe

This is the single authoritative copy of the recipe; `wxUIUXCodeReview` points here rather than
duplicating it. Each pitfall below cost a failed script run during the verification session.

- **`FindFirst` by `NameProperty` returns the inner `TextBlock`, not the `Button`.** Every templated
  WPF button carries a child `Text` element with the same name, and the `TextBlock` has no
  `InvokePattern`. Always compose the condition with `ControlType`, or enumerate buttons by type.
- **`GetCurrentPattern([InvokePattern]::Pattern)` can throw "pattern not supported" in PowerShell**
  even when `GetSupportedPatterns()` lists it — a type-resolution quirk. Take the pattern object
  from `GetSupportedPatterns()` and pass that instead.
- **`PasswordBox` deliberately exposes no writable `ValuePattern`.** Use `SetFocus()` + `SendKeys`,
  and screenshot before submitting to prove the field was actually filled.
- **Use `PrintWindow` on the window handle, not `CopyFromScreen`.** Screen-coordinate capture grabs
  whatever is on top, and on multi-monitor / per-monitor-DPI setups it captures the wrong region
  entirely.
- **Wait on the window, never on a fixed sleep.** With an unreachable database this app took
  **21.8 s** to show its first window (`SeedSettings` blocking the UI thread ahead of `Show()`), so
  an 8-second sleep concluded "no window" and would have been reported as a crash.
- Load `System.Windows.Forms` alongside `UIAutomationClient`; save scripts as UTF-8 **with BOM** or
  accented control names will not match under Windows PowerShell 5.1.

### What the walkthrough measures for free

- **`AutomationElement.FocusedElement`** answers "does this screen focus anything on open?" — the
  first-run-defaults dimension, objectively, on every screen.
- **Counting `Edit`/`ComboBox`/`CheckBox` elements whose `Name` is empty** measures missing
  accessible names across the whole app. Here: 27 of 40 fields, and the three clean screens were
  exactly the ones using `AutomationProperties` in XAML.
- Rendered geometry catches what source cannot: a `UniformGrid` allocating 37px rows to 44px buttons
  overlaps them, and truncated `DataGrid` headers only exist once laid out.

---

## DB posture (Phase 0 step 3)

The rule in `SKILL.md` is unchanged: identify the production connection from configuration, prove
the target differs, prefer a disposable database. Only the addresses change.

- **Production connection** comes from the app's configuration (`appsettings.json` / user secrets /
  environment), not from a `.env`. Read it and state it out loud before writing anything.
- **Gate-2 database** — build it from the **model** with `EnsureCreated()`, not from the checked-in
  `.sql` (see *Schema source*). A disposable container is the natural host; the verification session
  used one on a non-default port with throwaway credentials.
- `clone-test-schema.mjs` still works if the target *is* PostgreSQL and you want a schema clone of a
  live database rather than a model build — but on this stack the model build is usually right,
  because it is also the diff that finds the drift.

---

## Test substitutes — what they cannot enforce

**EF Core's InMemory provider enforces no foreign keys, `varchar` lengths, unique indexes or
cascades.** Any test asserting "the database rejects this" against InMemory **cannot fail**. This is
the canonical `test-validity` defect and it belongs in the risk register at **Phase 2A**, not
discovered at Gate 2.

Route those cases to a real-engine tier. If the project already has one, check whether it **skips
silently** when the engine is unreachable: a skipped constraint suite reports success while testing
nothing. Require one environment where it must **fail rather than skip**.

Two more, both observed here:

- **A busy flag bound to nothing.** 26 ViewModels declared `IsBusy`; zero XAML files bound it. Every
  screen was inert during async work with the primary button still enabled and re-entrant — and no
  test could see it, because the flag's value was correct.
- **Singleton ViewModels reused without re-navigation.** A navigation service that reuses an open
  window must still call `OnNavigatedTo` with the new parameter. Reusing without re-navigating shows
  the *previous* record while the caller believes it navigated; here it let a stopwatch bill time to
  the wrong customer.
