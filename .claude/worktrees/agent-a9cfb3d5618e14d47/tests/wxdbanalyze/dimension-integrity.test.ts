// tests/wxdbanalyze/dimension-integrity.test.ts
import { describe, expect, it } from "vitest";
import { analyzeIntegrity } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/integrity.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import type { OrphanProbe } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.js";
import type { Relationship } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

// DEVIATION (controller decision, SCOPE-121/T010): the brief's `rel()` factory
// predates Task 8, which added required fields (`childColumns`,
// `parentColumns`, `isComposite`) to `Relationship`. Extended here so the
// fixture still satisfies the current (post-Task-8) type.
const rel = (over: Partial<Relationship> = {}): Relationship => ({
  child: "tasks",
  childColumn: "projectid",
  childColumns: ["projectid"],
  parent: "projects",
  parentColumn: "id",
  parentColumns: ["id"],
  isComposite: false,
  sources: ["convention"],
  childColumnNullable: true,
  childColumnType: "uuid",
  parentColumnType: "uuid",
  indexedOnChild: true,
  ...over,
});

// A real composite relationship in this database:
// testsignoffs.(itemid, itemexecutor) -> testplanitems.(id, executor).
const compositeRel = (over: Partial<Relationship> = {}): Relationship => ({
  ...rel({
    child: "testsignoffs",
    childColumn: "itemid",
    childColumns: ["itemid", "itemexecutor"],
    parent: "testplanitems",
    parentColumn: "id",
    parentColumns: ["id", "executor"],
    isComposite: true,
  }),
  ...over,
});

const probe = (over: Partial<OrphanProbe> = {}): OrphanProbe => ({
  relationship: rel(),
  childRows: 5000,
  orphanRows: 0,
  tenantMismatches: null,
  query: "select count(*) ...",
  ...over,
});

const find = (findings: ReturnType<typeof analyzeIntegrity>, id: string) =>
  findings.find((f) => f.id === id);

describe("analyzeIntegrity", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzeIntegrity([
      probe({ orphanRows: 412 }),
      probe({ relationship: rel({ sources: ["live"], constraintName: "fk1" }) }),
      probe({ relationship: rel({ indexedOnChild: false }) }),
      probe({ orphanRows: null, skipped: "unindexed on a large table" }),
      probe({ tenantMismatches: 3 }),
      probe({
        relationship: rel({
          sources: ["declared", "live"],
          constraintName: "fk1",
          onDelete: "restrict",
          declaredOnDelete: "cascade",
        }),
      }),
      probe({
        relationship: rel({
          sources: ["declared", "live"],
          constraintName: "fk2",
          onUpdate: "cascade",
          declaredOnUpdate: "no action",
        }),
      }),
      probe({ tenantSkipped: "tenant probe failed: permission denied", tenantSkippedKind: "probe-error" }),
      probe({ tenantSkipped: "tenant column does not exist on one side (SQLSTATE 42703)", tenantSkippedKind: "column-missing" }),
      probe({
        relationship: compositeRel({ sources: ["convention"] }),
        childRows: 900,
        orphanRows: 5,
      }),
      probe({
        relationship: compositeRel({ sources: ["live"], indexedOnChild: false }),
      }),
      probe({
        relationship: rel({
          child: "a".repeat(40),
          childColumn: "b".repeat(30),
          childColumns: ["b".repeat(30)],
          sources: ["convention"],
        }),
        childRows: 10,
        orphanRows: 0,
      }),
    ]);
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("rates an unenforced relationship with orphans as an incident", () => {
    const f = find(
      analyzeIntegrity([probe({ orphanRows: 412 })]),
      "integrity.missing-fk.tasks.projectid",
    )!;
    expect(f.severity).toBe("critical");
    expect(f.urgency).toBe("immediate");
    expect(f.observation).toContain("412");
    expect(f.confidence).toBe("proven");
  });

  it("rates an unenforced relationship with no orphans as a risk, not an incident", () => {
    const f = find(
      analyzeIntegrity([probe({ orphanRows: 0 })]),
      "integrity.missing-fk.tasks.projectid",
    )!;
    expect(f.severity).toBe("medium");
    expect(f.urgency).toBe("scheduled");
    expect(f.remediation.fixClass).toBe("additive-safe");
    expect(f.remediation.statements.join(" ")).toContain("validate constraint");
  });

  it("omits VALIDATE when orphans exist, because it would fail", () => {
    const f = find(
      analyzeIntegrity([probe({ orphanRows: 412 })]),
      "integrity.missing-fk.tasks.projectid",
    )!;
    const sql = f.remediation.statements.join(" ");
    expect(sql).toContain("not valid");
    expect(sql).not.toContain("validate constraint");
    expect(f.remediation.fixClass).toBe("additive-safe");
  });

  it("marks an unprobed relationship as inferred, not proven", () => {
    const f = find(
      analyzeIntegrity([probe({ orphanRows: null, skipped: "unindexed on a large table" })]),
      "integrity.missing-fk.tasks.projectid",
    )!;
    expect(f.confidence).toBe("inferred");
    expect(f.observation).toMatch(/not measured/i);
  });

  it("reports a live FK the code does not declare", () => {
    const f = find(
      analyzeIntegrity([
        probe({ relationship: rel({ sources: ["live"], constraintName: "tasks_projectid_fkey", onDelete: "cascade" }) }),
      ]),
      "integrity.undeclared-fk.tasks.projectid",
    )!;
    expect(f.whyItNeedsChanging).toMatch(/cascade/i);
  });

  it("reports an unindexed foreign-key column", () => {
    const f = find(
      analyzeIntegrity([probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }) })]),
      "integrity.unindexed-fk.tasks.projectid",
    )!;
    expect(f.remediation.statements.join(" ")).toContain("create index concurrently");
    expect(f.remediation.fixClass).toBe("additive-safe");
  });

  it("phrases the unindexed-fk observation without a 'leading column' claim for a single-column relationship", () => {
    // Round 1, Finding 5: "leading column" only makes sense once there is
    // more than one column to lead.
    const f = find(
      analyzeIntegrity([probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }) })]),
      "integrity.unindexed-fk.tasks.projectid",
    )!;
    expect(f.observation).not.toMatch(/leading column/i);
  });

  it("reports cross-tenant mismatches as a leak, not a constraint gap", () => {
    const f = find(
      analyzeIntegrity([probe({ tenantMismatches: 3 })]),
      "integrity.cross-tenant.tasks.projectid",
    )!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/no foreign key/i);
  });

  // --- SCOPE-121 final wave, C1 [CRITICAL] — tenant evidence must carry the
  // tenant query, never the orphan anti-join, so re-running it reproduces
  // the number the finding actually reports.
  it("carries the TENANT query as evidence for a cross-tenant finding, not the orphan anti-join query", () => {
    const f = find(
      analyzeIntegrity([
        probe({
          tenantMismatches: 3,
          query: "select count(*)::bigint as orphans from ...",
          tenantQuery: "select count(*)::bigint as mismatches from ...",
        }),
      ]),
      "integrity.cross-tenant.tasks.projectid",
    )!;
    expect(f.evidence.query).toBe("select count(*)::bigint as mismatches from ...");
    expect(f.evidence.query).not.toContain("orphans");
  });

  it("carries the TENANT query as evidence for a tenant-not-probed finding, not the orphan anti-join query", () => {
    const f = find(
      analyzeIntegrity([
        probe({
          query: "select count(*)::bigint as orphans from ...",
          tenantQuery: "select count(*)::bigint as mismatches from ...",
          tenantSkipped: "tenant probe failed: permission denied",
          tenantSkippedKind: "probe-error",
        }),
      ]),
      "integrity.tenant-not-probed.tasks.projectid",
    )!;
    expect(f.evidence.query).toBe("select count(*)::bigint as mismatches from ...");
    expect(f.evidence.query).not.toContain("orphans");
  });

  it("surfaces a skipped probe so the gap is visible", () => {
    const findings = analyzeIntegrity([
      probe({ relationship: rel({ sources: ["live"] }), orphanRows: null, skipped: "types differ" }),
    ]);
    expect(find(findings, "integrity.not-probed.tasks.projectid")).toBeDefined();
  });

  it("says nothing about a fully enforced, clean, indexed relationship", () => {
    expect(
      analyzeIntegrity([
        probe({ relationship: rel({ sources: ["declared", "live"], constraintName: "fk1" }), orphanRows: 0 }),
      ]),
    ).toEqual([]);
  });

  // --- 3(a) composite keys -------------------------------------------------

  it("builds composite FK DDL naming every column, in order, through quoteIdent", () => {
    const f = find(
      analyzeIntegrity([
        probe({ relationship: compositeRel({ sources: ["convention"] }), orphanRows: 0, childRows: 900 }),
      ]),
      "integrity.missing-fk.testsignoffs.itemid",
    )!;
    const sql = f.remediation.statements.join(" ");
    expect(sql).toContain('foreign key ("itemid", "itemexecutor")');
    expect(sql).toContain('references "testplanitems" ("id", "executor")');
    expect(f.subject).toBe("testsignoffs.(itemid, itemexecutor)");
    // Round 1, Finding 4: evidence rows must carry the full column list.
    expect(f.evidence.rows[0]).toMatchObject({ columns: "itemid,itemexecutor" });
  });

  it("names every composite column in the unindexed-fk index DDL", () => {
    const f = find(
      analyzeIntegrity([
        probe({ relationship: compositeRel({ sources: ["live"], indexedOnChild: false }) }),
      ]),
      "integrity.unindexed-fk.testsignoffs.itemid",
    )!;
    const sql = f.remediation.statements.join(" ");
    expect(sql).toContain('on "testsignoffs" ("itemid", "itemexecutor")');
    // 3(d): the leading-column-only caveat must be visible in the prose.
    expect(f.observation).toMatch(/leading column/i);
  });

  // --- 3(b) / round 1 Finding 1 — declared-vs-live referential action mismatch

  it("reports a declared-vs-live ON DELETE mismatch as a distinct defect", () => {
    const f = find(
      analyzeIntegrity([
        probe({
          relationship: rel({
            sources: ["declared", "live"],
            constraintName: "fk1",
            onDelete: "restrict",
            declaredOnDelete: "cascade",
          }),
        }),
      ]),
      "integrity.action-mismatch.tasks.projectid",
    )!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical"); // cascade is on one side
    expect(f.whyItNeedsChanging).toMatch(/code review/i);
    expect(f.observation).toContain("cascade");
    expect(f.observation).toContain("restrict");
  });

  it("reports a declared-vs-live ON UPDATE mismatch (round 1, Finding 1: onUpdate is not ignored)", () => {
    const f = find(
      analyzeIntegrity([
        probe({
          relationship: rel({
            sources: ["declared", "live"],
            constraintName: "fk1",
            onUpdate: "cascade",
            declaredOnUpdate: "no action",
          }),
        }),
      ]),
      "integrity.action-mismatch.tasks.projectid",
    )!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("critical"); // cascade is on one side
    expect(f.observation).toContain("UPDATE");
    expect(f.observation).toContain("cascade");
    expect(f.evidence.rows[0]).toMatchObject({ declared_on_update: "no action", live_on_update: "cascade" });
  });

  it("reports one finding covering both actions when both ON DELETE and ON UPDATE disagree", () => {
    const f = find(
      analyzeIntegrity([
        probe({
          relationship: rel({
            sources: ["declared", "live"],
            constraintName: "fk1",
            onDelete: "restrict",
            declaredOnDelete: "no action",
            onUpdate: "set null",
            declaredOnUpdate: "no action",
          }),
        }),
      ]),
      "integrity.action-mismatch.tasks.projectid",
    )!;
    expect(f).toBeDefined();
    expect(f.observation).toMatch(/DELETE/);
    expect(f.observation).toMatch(/UPDATE/);
    const rows = f.evidence.rows[0] as Record<string, unknown>;
    expect(rows.declared_on_delete).toBe("no action");
    expect(rows.live_on_delete).toBe("restrict");
    expect(rows.declared_on_update).toBe("no action");
    expect(rows.live_on_update).toBe("set null");
  });

  it("does not report a mismatch when neither side declares an ON DELETE/ON UPDATE opinion", () => {
    const findings = analyzeIntegrity([
      probe({
        relationship: rel({
          sources: ["declared", "live"],
          constraintName: "fk1",
          // onDelete / declaredOnDelete / onUpdate / declaredOnUpdate all left undefined
        }),
      }),
    ]);
    expect(find(findings, "integrity.action-mismatch.tasks.projectid")).toBeUndefined();
  });

  it("does not report a mismatch when declared and live agree on both actions", () => {
    const findings = analyzeIntegrity([
      probe({
        relationship: rel({
          sources: ["declared", "live"],
          constraintName: "fk1",
          onDelete: "cascade",
          declaredOnDelete: "cascade",
          onUpdate: "no action",
          declaredOnUpdate: "no action",
        }),
      }),
    ]);
    expect(find(findings, "integrity.action-mismatch.tasks.projectid")).toBeUndefined();
  });

  // --- round 1, Finding 2 — bounded, collision-resistant identifiers -------

  it("bounds a generated identifier to 63 bytes and keeps forward/rollback names identical", () => {
    const longChild = "a".repeat(40);
    const longCol = "b".repeat(30);
    const longRel = rel({
      child: longChild,
      childColumn: longCol,
      childColumns: [longCol],
      sources: ["convention"],
    });
    const f = find(
      analyzeIntegrity([probe({ relationship: longRel, orphanRows: 0, childRows: 10 })]),
      `integrity.missing-fk.${longChild}.${longCol}`,
    )!;
    const forwardSql = f.remediation.statements.join(" ");
    const nameMatch = forwardSql.match(/add constraint "([^"]+)"/);
    expect(nameMatch).not.toBeNull();
    const name = nameMatch![1]!;
    expect(name.length).toBeLessThanOrEqual(63);
    expect(f.remediation.rollback).toContain(`"${name}"`);
  });

  it("produces different bounded names for two different long relationships (collision resistance)", () => {
    const longChild = "a".repeat(40);
    const relA = rel({
      child: longChild,
      childColumn: "b".repeat(30),
      childColumns: ["b".repeat(30)],
      sources: ["convention"],
    });
    const relB = rel({
      child: longChild,
      childColumn: "c".repeat(30),
      childColumns: ["c".repeat(30)],
      sources: ["convention"],
    });
    const fA = find(
      analyzeIntegrity([probe({ relationship: relA, orphanRows: 0, childRows: 10 })]),
      `integrity.missing-fk.${longChild}.${relA.childColumn}`,
    )!;
    const fB = find(
      analyzeIntegrity([probe({ relationship: relB, orphanRows: 0, childRows: 10 })]),
      `integrity.missing-fk.${longChild}.${relB.childColumn}`,
    )!;
    const nameA = fA.remediation.statements.join(" ").match(/add constraint "([^"]+)"/)![1]!;
    const nameB = fB.remediation.statements.join(" ").match(/add constraint "([^"]+)"/)![1]!;
    expect(nameA).not.toBe(nameB);
    expect(nameA.length).toBeLessThanOrEqual(63);
    expect(nameB.length).toBeLessThanOrEqual(63);
  });

  it("also bounds the unindexed-fk index name", () => {
    const longChild = "d".repeat(45);
    const longCol = "e".repeat(30);
    const longRel = rel({
      child: longChild,
      childColumn: longCol,
      childColumns: [longCol],
      sources: ["live"],
      indexedOnChild: false,
    });
    const f = find(
      analyzeIntegrity([probe({ relationship: longRel })]),
      `integrity.unindexed-fk.${longChild}.${longCol}`,
    )!;
    const sql = f.remediation.statements.join(" ");
    const nameMatch = sql.match(/create index concurrently "([^"]+)"/);
    expect(nameMatch).not.toBeNull();
    const name = nameMatch![1]!;
    expect(name.length).toBeLessThanOrEqual(63);
    expect(f.remediation.rollback).toContain(`"${name}"`);
  });

  // --- round 1, Finding 3 — tenant probe visibility without noise ----------

  it("reports an individual finding for a genuine tenant probe error", () => {
    const findings = analyzeIntegrity([
      probe({ tenantSkipped: "tenant probe failed: permission denied", tenantSkippedKind: "probe-error" }),
    ]);
    const f = find(findings, "integrity.tenant-not-probed.tasks.projectid")!;
    expect(f).toBeDefined();
    expect(f.severity).toBe("info");
    expect(f.observation).toMatch(/not measured/i);
    expect(find(findings, "integrity.tenant-coverage-gap")).toBeUndefined();
  });

  it("treats an unclassified tenant skip as an individual finding (safe default), not silently rolled up", () => {
    const findings = analyzeIntegrity([
      probe({ tenantSkipped: "tenant probe failed: something odd" /* no tenantSkippedKind */ }),
    ]);
    expect(find(findings, "integrity.tenant-not-probed.tasks.projectid")).toBeDefined();
    expect(find(findings, "integrity.tenant-coverage-gap")).toBeUndefined();
  });

  it("rolls up expected column-missing tenant skips into one aggregate finding, not one per relationship", () => {
    const findings = analyzeIntegrity([
      probe({
        relationship: rel({ child: "tasks", childColumn: "projectid", childColumns: ["projectid"] }),
        tenantSkipped: "tenant column does not exist (SQLSTATE 42703)",
        tenantSkippedKind: "column-missing",
      }),
      probe({
        relationship: rel({ child: "notes", childColumn: "taskid", childColumns: ["taskid"], parent: "tasks" }),
        tenantSkipped: "tenant column does not exist (SQLSTATE 42703)",
        tenantSkippedKind: "column-missing",
      }),
    ]);
    expect(find(findings, "integrity.tenant-not-probed.tasks.projectid")).toBeUndefined();
    expect(find(findings, "integrity.tenant-not-probed.notes.taskid")).toBeUndefined();
    const rollup = find(findings, "integrity.tenant-coverage-gap")!;
    expect(rollup).toBeDefined();
    expect(rollup.severity).toBe("info");
    expect(rollup.observation).toContain("2");
    expect(rollup.evidence.rows.length).toBe(2);
  });

  it("reports both a skipped orphan probe and a skipped tenant probe when both fail independently", () => {
    const findings = analyzeIntegrity([
      probe({
        relationship: rel({ sources: ["live"] }),
        orphanRows: null,
        skipped: "types differ",
        tenantSkipped: "tenant probe failed: permission denied",
        tenantSkippedKind: "probe-error",
      }),
    ]);
    expect(find(findings, "integrity.not-probed.tasks.projectid")).toBeDefined();
    expect(find(findings, "integrity.tenant-not-probed.tasks.projectid")).toBeDefined();
  });

  // --- SCOPE-121 final wave, I4 [Important] — unknown row count must never
  // read as small, and must be honestly labelled rather than quoted as a
  // number.
  describe("unknown row counts (never-analyzed tables)", () => {
    it("labels an unknown row count honestly instead of quoting it as a number", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }), childRows: "unknown" }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.observation).toMatch(/row count unknown/i);
      expect(f.observation).toMatch(/never.*analyz/i);
      expect(f.observation).not.toMatch(/~unknown/);
    });

    it("rates an unindexed FK on an unknown-size table as high/scheduled, never silently as small", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }), childRows: "unknown" }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.severity).toBe("high");
      expect(f.urgency).toBe("scheduled");
    });

    it("carries the unknown state through remediation duration text too", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }), childRows: "unknown" }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.remediation.estimatedDuration).toMatch(/row count unknown/i);
    });

    it("carries the unknown state through the missing-fk VALIDATE duration text", () => {
      const f = find(
        analyzeIntegrity([probe({ orphanRows: 0, childRows: "unknown" })]),
        "integrity.missing-fk.tasks.projectid",
      )!;
      expect(f.remediation.estimatedDuration).toMatch(/row count unknown/i);
    });
  });

  // --- SCOPE-121 final wave, I6 [Important] — orphan count vs. planner
  // estimate: a measured count exceeding a stale estimate must be caveated,
  // never presented as a nonsensical ratio.
  describe("orphan count vs. planner estimate", () => {
    it("caveats an orphan count that exceeds the planner's row estimate instead of printing a nonsensical ratio", () => {
      const f = find(
        analyzeIntegrity([probe({ orphanRows: 385_039, childRows: 369_427 })]),
        "integrity.missing-fk.tasks.projectid",
      )!;
      expect(f.observation).toContain("385039");
      expect(f.observation).toMatch(/more than|exceeds|stale/i);
      expect(f.observation).toMatch(/estimate/i);
      // The old, un-caveated phrasing this replaces:
      expect(f.observation).not.toContain("385039 of ~369427 rows are orphaned");
    });

    it("uses the plain ratio phrasing when the orphan count is within the estimate", () => {
      const f = find(
        analyzeIntegrity([probe({ orphanRows: 5, childRows: 5000 })]),
        "integrity.missing-fk.tasks.projectid",
      )!;
      expect(f.observation).toContain("5 of ~5000 rows are orphaned");
    });
  });

  // --- SCOPE-121 final wave, I7 [Important] — confidence must be derived
  // from rel.sources, and evidence rows must carry sources, for every
  // integrity finding that previously hardcoded "proven".
  describe("confidence derived from rel.sources", () => {
    it("rates an undeclared-fk finding as proven (always backed by a live constraint)", () => {
      const f = find(
        analyzeIntegrity([probe({ relationship: rel({ sources: ["live"], constraintName: "fk1" }) })]),
        "integrity.undeclared-fk.tasks.projectid",
      )!;
      expect(f.confidence).toBe("proven");
      expect(f.evidence.rows[0]).toMatchObject({ sources: "live" });
    });

    it("rates an unindexed-fk finding on a convention-only relationship as inferred, not proven", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["convention"], indexedOnChild: false }) }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.confidence).toBe("inferred");
      expect(f.evidence.rows[0]).toMatchObject({ sources: "convention" });
    });

    it("rates an unindexed-fk finding on a live-confirmed relationship as proven", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }) }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.confidence).toBe("proven");
    });

    it("rates a cross-tenant finding on a convention-only relationship as inferred", () => {
      const f = find(
        analyzeIntegrity([probe({ relationship: rel({ sources: ["convention"] }), tenantMismatches: 3 })]),
        "integrity.cross-tenant.tasks.projectid",
      )!;
      expect(f.confidence).toBe("inferred");
      expect(f.evidence.rows[0]).toMatchObject({ sources: "convention" });
    });

    it("rates a not-probed finding as proven — analyzeIntegrity only ever emits it for an enforced (live-sourced) relationship", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"] }), orphanRows: null, skipped: "types differ" }),
        ]),
        "integrity.not-probed.tasks.projectid",
      )!;
      expect(f.confidence).toBe("proven");
    });

    it("rates a tenant-not-probed finding on a convention-only relationship as inferred", () => {
      const f = find(
        analyzeIntegrity([
          probe({
            relationship: rel({ sources: ["convention"] }),
            tenantSkipped: "tenant probe failed: permission denied",
            tenantSkippedKind: "probe-error",
          }),
        ]),
        "integrity.tenant-not-probed.tasks.projectid",
      )!;
      expect(f.confidence).toBe("inferred");
    });
  });

  // --- SCOPE-121 final wave, I8 [Important] — the unindexed-fk mechanism
  // must not assert a parent-delete scan for a relationship with no
  // enforced foreign key at all.
  describe("unindexed-fk mechanism conditioned on enforcement", () => {
    it("asserts the parent-delete scan mechanism only when a live FK actually enforces the relationship", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["live"], indexedOnChild: false }) }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.whyItNeedsChanging).toMatch(/must scan/i);
      expect(f.whyItNeedsChanging).toMatch(/holds a lock/i);
    });

    it("does not assert a scan mechanism for a relationship with no enforced foreign key (co-occurring with missing-fk)", () => {
      const f = find(
        analyzeIntegrity([
          probe({ relationship: rel({ sources: ["convention"], indexedOnChild: false }) }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.whyItNeedsChanging).not.toMatch(/must scan .* to check for referencing rows, and it holds a lock/i);
      expect(f.whyItNeedsChanging).toMatch(/no foreign key enforces/i);
      expect(f.whyItNeedsChanging).toMatch(/before the foreign key/i);
    });

    // --- Phase 1 punch list P3a — the unknown-row-count branch of an
    // unenforced relationship's whyItNeedsChanging used to interpolate the
    // "row count unknown (table has never been analyzed)" fragment straight
    // into a "scan N of table sequentially" template, producing "would
    // otherwise scan row count unknown (table has never been analyzed) of
    // tasks sequentially" — a string substituted where a number belonged.
    it("reads as a grammatical sentence, not an interpolated fragment, when the table has never been analyzed and no FK is enforced", () => {
      const f = find(
        analyzeIntegrity([
          probe({
            relationship: rel({ sources: ["convention"], indexedOnChild: false }),
            childRows: "unknown",
          }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      // The old broken phrasing, verbatim, must never reappear.
      expect(f.whyItNeedsChanging).not.toMatch(
        /scan row count unknown \(table has never been analyzed\) of/i,
      );
      expect(f.whyItNeedsChanging).not.toMatch(/scan ~unknown/i);
      // The sentence still conveys: unknown because never analyzed, cost
      // unquantifiable, and that is a reason to add the index, not defer it.
      expect(f.whyItNeedsChanging).toMatch(/never been analyzed/i);
      expect(f.whyItNeedsChanging).toMatch(/cannot be quantified/i);
      expect(f.whyItNeedsChanging).toMatch(/reason to add the index/i);
      expect(f.whyItNeedsChanging).toMatch(/no foreign key enforces/i);
      expect(f.whyItNeedsChanging).toMatch(/before the foreign key/i);
    });

    it("still asserts the parent-delete scan mechanism with unknown row count when a live FK enforces the relationship", () => {
      // The enforced branch is untouched by P3a; pin that it keeps working
      // (and reads sensibly) with an unknown row count too.
      const f = find(
        analyzeIntegrity([
          probe({
            relationship: rel({ sources: ["live"], indexedOnChild: false }),
            childRows: "unknown",
          }),
        ]),
        "integrity.unindexed-fk.tasks.projectid",
      )!;
      expect(f.whyItNeedsChanging).toMatch(/must scan/i);
      expect(f.whyItNeedsChanging).toMatch(/row count unknown/i);
      expect(f.whyItNeedsChanging).toMatch(/holds a lock/i);
    });
  });

  // --- every rule class, contract-complete ---------------------------------

  it("every rule class produces a contract-complete finding", () => {
    const findings = analyzeIntegrity([
      probe({ orphanRows: 412 }), // missing-fk
      probe({ relationship: rel({ sources: ["live"], constraintName: "fk1" }) }), // undeclared-fk
      probe({ relationship: rel({ indexedOnChild: false }) }), // unindexed-fk
      probe({ tenantMismatches: 3 }), // cross-tenant
      probe({ relationship: rel({ sources: ["live"] }), orphanRows: null, skipped: "types differ" }), // not-probed
      probe({
        relationship: rel({
          sources: ["declared", "live"],
          constraintName: "fk1",
          onDelete: "restrict",
          declaredOnDelete: "cascade",
        }),
      }), // action-mismatch
      probe({ tenantSkipped: "tenant probe failed: x", tenantSkippedKind: "probe-error" }), // tenant-not-probed
      probe({ tenantSkipped: "column missing (42703)", tenantSkippedKind: "column-missing" }), // tenant-coverage-gap
    ]);
    const rules = new Set(findings.map((f) => f.rule));
    expect(rules).toEqual(
      new Set([
        "missing-fk",
        "undeclared-fk",
        "unindexed-fk",
        "cross-tenant",
        "not-probed",
        "action-mismatch",
        "tenant-not-probed",
        "tenant-coverage-gap",
      ]),
    );
    expect(findings.length).toBeGreaterThanOrEqual(8);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });
});
