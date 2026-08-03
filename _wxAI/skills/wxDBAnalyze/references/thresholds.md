# DBA heuristics

These are **guidance a reader qualifies by workload, not hardcoded pass/fail gates.** The DBA
persona (`SKILL.md` §1) uses these numbers the way a real senior DBA would — as a starting
sensitivity, not a law. A number here that "fails" on a low-traffic internal tool and a number here
that "fails" on a payments table are not the same finding, even when the raw metric is identical.
Every entry states what the number means and what would make it acceptable anyway.

## Referential integrity (implemented, Phase 1)

### Orphan rows on an unenforced relationship

**What it means**: a child row whose foreign-key-shaped column points at a parent row that no
longer exists. Counted by the anti-join in `scripts/engines/postgres/integrity.ts`.

**What would make it acceptable**: zero orphans with an unenforced relationship is a latent risk
(scheduled, not immediate) — the data is currently consistent, so the constraint is missing but not
yet causing harm. Any orphan count above zero is currently causing rows to silently vanish from
joins, which is why the analyser reports it `critical`/`immediate` rather than waiting for a
threshold. There is no "acceptable" nonzero orphan count for a relationship the code asserts is a
real FK — the question is only how the existing orphans got there and whether they should be
deleted or re-parented, which is a business decision this tool does not make.

### Unindexed foreign key

**What it means**: a child column enforced or implied as a foreign key with no supporting index. See
`scripts/dimensions/integrity.ts`'s `unindexedFk`.

**What the analyser currently does**: reports `high`/`scheduled` above 100,000 child rows,
`medium`/`deferred` below it. That split is a coarse proxy, not a real workload measurement — it
does not know the parent table's delete/update rate, which is the actual cost driver.

**What would make it acceptable regardless of row count**: a parent table that is never deleted from
or whose key is never updated. The cost this finding describes — every parent delete/update scanning
the whole child table under lock — never materialises if that operation never runs. A reader with
that knowledge should treat the finding as informational, not as a queue item.

**What would make it worse than the row count alone suggests**: a parent table under frequent
deletion (e.g. soft-delete reversal, cleanup jobs) even at moderate child row counts — the lock
duration compounds with delete frequency, not just table size.

### `ON DELETE`/`ON UPDATE` action mismatch

**What it means**: the database enforces a different referential action than the code declares.

**What would make a `cascade` mismatch acceptable**: never, on its own — a cascade the code doesn't
know about is a data-loss risk regardless of table size, because it means a delete the application
author reasoned about as scoped will actually take dependent rows with it. This is why the analyser
scores any mismatch involving `cascade` `critical` unconditionally.

**What would make a non-cascade mismatch (e.g. `restrict` vs `no action`) lower priority**: a table
whose deletion path is rarely exercised in practice, so the divergence, while real, has not yet
surfaced as an unexpected error.

### Cross-tenant consistency

**What it means**: a child row whose tenant column (`companyid` on wxKanban) disagrees with its
parent's. No foreign key can express this.

**What would make it acceptable**: nothing. Any nonzero count is a data-leak class of defect —
one tenant's rows become reachable through another tenant's join path. This is reported
`critical`/`immediate` unconditionally; there is no workload-dependent case where cross-tenant leak
is fine.

**Coverage gap, not a defect**: most relationships in a schema that is not multi-tenant on every
table will have the tenant sub-probe skipped because one side simply has no tenant column — that is
expected and rolled into one `tenant-coverage-gap` finding rather than treated as a threshold
breach. Absence of a cross-tenant finding elsewhere in the report is never proof that the relationships
in that coverage gap are clean; it means they were not checked.

## Schema drift (implemented, Phase 1)

### Missing table / missing column

**What it means**: something declared in code does not exist in the deployed database.

**What would make it acceptable**: nothing — this is always `critical`/`immediate`. Any code path
touching it raises a raw catalog error (`42P01`/`42703`) as an unhandled 500, not a degraded
response. There is no workload at which an undefined table or column is fine.

### Undeclared table / undeclared column

**What it means**: something exists live that no schema source declares.

**What would make it lower priority**: the table or column is one of the project's known,
deliberately-undeclared live objects (this database currently carries ~19, including
`marketingcontacts`) rather than a genuinely forgotten one. The analyser cannot distinguish the two
automatically — that judgment belongs to whoever reads the report and knows the project's history.

### Type / nullability mismatch

**What it means**: the deployed column's type or nullability disagrees with the declaration.

**What would make it acceptable**: a documented, intentional narrowing pattern — e.g. a read-only
mirror source (`mcp-server/src/db/schema.ts`) that deliberately types a column more loosely than the
authoritative source. An undocumented mismatch on the authoritative source itself has no acceptable
case; the type system's guarantees are already silently false.

## Source conflict (implemented, Phase 1)

**Subset** (one source's columns are a strict subset of the other's): often the shape of a
deliberate, documented mirror — reported `low`/`deferred` for confirmation, not automatically a
defect.

**Divergent** (each source has a column the other lacks): genuine two-directional disagreement with
no mirror relationship to explain it — reported `high`/`scheduled`, because one of the two sources
will emit SQL the database rejects and a drift check against either source alone reads clean.

## Not yet implemented (Phase 2)

Data health, conventions, performance, maintenance, security and availability thresholds (dead-tuple
ratios, index-scan ratios, cache hit ratios, connection saturation, NULL density, bloat estimates)
are not yet built — see `docs/superpowers/specs/2026-08-01-wxdbanalyze-design.md` §4.3–4.8 for the
design intent. Do not invent numeric gates for these dimensions ahead of the collectors that would
justify them; a threshold with no measurement behind it is exactly the un-evidenced "why" §7.1 of
the design doc (and `references/finding-contract.md`) warns against.
