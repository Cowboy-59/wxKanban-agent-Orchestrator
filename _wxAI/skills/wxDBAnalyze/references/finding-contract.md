# The finding contract

Every finding, in every dimension, carries all nine fields below. A finding missing any field is
not emitted — `partitionFindings` (in `scripts/core/finding.js`) withholds it and returns it in
`rejected` instead, which the report renders as an analyser defect, never as a clean result.

| Field | Requirement |
| --- | --- |
| Observation | What was measured, with the actual numbers |
| Evidence | The exact query that produced it, so the reader can re-run it and disagree |
| **Why it needs changing** | The concrete consequence of leaving it alone, stated as a failure mode with a mechanism: what breaks, under what conditions, and how it will present |
| Business impact | What the failure costs in availability, correctness, latency, spend or compliance exposure |
| Severity **and** urgency, separately | A missing FK on a table nobody writes to is high severity, low urgency; connection saturation is the reverse. Collapsing them loses the scheduling information the reader actually needs |
| Remediation | The SQL or the procedure, classified `additive-safe` or `manual-only` |
| Cost and risk of the fix itself | Lock class, duration, rollback path. Some fixes are worse than the finding |
| Consequence of doing nothing | The honest baseline, including "nothing — this is acceptable as-is" |
| Confidence | `proven` by direct evidence versus `inferred` from naming or heuristics. An orphan count is proven; a convention-inferred relationship is not |

## The rule that makes it work

**The "why" must be derived from this database's evidence, not recited from a textbook.** If the
reason cannot be made specific to what was actually measured, the finding is downgraded to an
observation or dropped. A "why" that could be pasted, unchanged, into another project's report is
not a "why" — it has not actually explained anything about *this* database.

## Worked example

**Weak** (textbook, not evidence):

> Unused index — consider dropping.

**Strong** (this database's own numbers, doing the work the field exists to do):

> `idx_tasks_status` has zero scans across 34 days of accumulated statistics while `tasks` takes
> ~12k inserts/day. Each insert pays maintenance on an index no query reads, and it holds 340 MB.
>
> **Why it needs changing**: write amplification and buffer-cache pollution on the hottest write
> path, with no read benefit.
>
> **Doing nothing**: no outage risk — this is pure ongoing waste, safe to defer.
>
> **Fix risk**: `DROP INDEX CONCURRENTLY` takes no exclusive lock, but the index cannot be recreated
> cheaply if a future query needs it. Drop is destructive, so it is emitted for manual application.

Notice what makes the strong version strong: it names the specific index, the specific table, the
specific measured numbers (34 days, ~12k/day, 340 MB), and ties the mechanism (write amplification,
buffer-cache pollution) to those numbers rather than to a general principle. The weak version would
be equally true — and equally useless — for any unused index on any database anywhere.
