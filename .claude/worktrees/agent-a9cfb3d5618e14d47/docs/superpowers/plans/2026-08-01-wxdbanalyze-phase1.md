# wxDBAnalyze Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the wxDBAnalyze skill end to end — finding contract, engine adapter layer, PostgreSQL collectors for schema integrity and referential integrity, ranked report, policy-driven additive-only apply path, and the `/wxDBAnalyze` command — plus refusing stubs for the four non-PostgreSQL engines.

**Architecture:** Collection is engine-specific and lives behind an adapter interface; analysis is engine-neutral and operates on a normalised snapshot. Every probe opens a read-only connection and touches only `pg_catalog` and `pg_stat_*`. A single module (`apply/apply-ddl.ts`) is the only code permitted to open a writable connection, and it re-derives its own safety classification rather than trusting its caller.

**Tech Stack:** TypeScript (ESM, `"type": "module"`), run via `tsx`. Vitest for tests. `postgres` (postgres-js) and `drizzle-orm` loaded by dynamic import so the kit can ship to consumers that have neither.

## Global Constraints

- **TypeScript 100%.** No `any`, no `@ts-ignore`. Typecheck via `npm run typecheck:dbanalyze` (added in Task 1).
- **No `console.log` in src/.** These scripts are CLI tools outside `src/`, so `console.log` is the correct output channel here — Pino is for the server.
- **`pg_catalog` only, never `information_schema`.** `information_schema` is privilege-filtered; a least-privilege role sees a truncated list and every unseen object reads as missing.
- **Read-only by construction.** Probe connections set `default_transaction_read_only = on` and verify it before running any query.
- **No secret values are ever printed.** Security findings name the column and the exposure, never the content.
- **Never silently drop a check.** Unsupported, unimplemented and rejected items are reported explicitly. A missing check that reads as "clean" is the failure mode this whole design exists to prevent.
- **Git actions require explicit operator approval.** CLAUDE.md forbids proactive git. The commit steps below are part of the task definition, but the operator must authorise each one.
- **Live-verification one-liners must load dotenv.** `DATABASE_URL` lives in the repo-root `.env`, not the shell environment. Every `npx tsx -e ...` verification step below must begin with `import('dotenv/config')`, matching `scripts/check-schema-drift.ts`. Without it the command fails on authentication before reaching the database. Ignore the promotional banner dotenv prints on load — it is hardcoded in the package.
- **Code fences.** Every top-level declaration needs a `[SCOPE 121 / Tnnn]` fence. Fences are orchestrator-authored; do not hand-edit an existing fence.

---

## File Structure

```text
_wxAI/skills/wxDBAnalyze/
  SKILL.md                          DBA persona, phase order, doctrine, refusal rules
  scripts/
    cli.ts                          argument parsing, run orchestration, exit codes
    core/finding.ts                 Finding type + contract validator + partitioning
    core/identifiers.ts             safe SQL identifier validation and quoting
    core/engine.ts                  EngineId, adapter interface, registry, resolution
    core/snapshot.ts                snapshot envelope, run directory, JSON persistence
    core/policy.ts                  .wxai/db-policy.json resolution
    core/ddl-classifier.ts          per-engine additive whitelist
    core/report.ts                  terminal + markdown renderers
    engines/registry.ts             engine id -> adapter (real or refusing stub)
    engines/stub.ts                 refusing adapter factory (mssql/mysql/oracle/firebird)
    engines/postgres/connect.ts     read-only connection guard
    engines/postgres/declared.ts    Drizzle metadata extraction
    engines/postgres/schema.ts      D1 collection
    engines/postgres/integrity.ts   D2 collection
    engines/postgres/index.ts       adapter assembly
    dimensions/schema.ts            D1 analysis (pure)
    dimensions/integrity.ts         D2 analysis (pure)
    apply/ledger.ts                 schema-change-log.md append
    apply/apply-ddl.ts              guarded writable executor
  references/finding-contract.md
  references/thresholds.md

tests/wxdbanalyze/                  vitest suites (pure units; DB tests self-skip)
tsconfig.wxdbanalyze.json           typecheck scope for the skill
.claude/commands/wxDBAnalyze.md     command (duplicated below)
_wxAI/commands/wxDBAnalyze.md
```

**Responsibility boundaries.** `core/` is engine-neutral and has no database imports. `engines/` is the only place that speaks a dialect. `dimensions/` is pure analysis over normalised input and must be testable with zero I/O. `apply/` is the only writable path.

---

## Task 1: Finding contract

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/finding.ts`
- Create: `tsconfig.wxdbanalyze.json`
- Modify: `package.json` (add `typecheck:dbanalyze` script)
- Test: `tests/wxdbanalyze/finding.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Finding`, `DimensionId`, `Severity`, `Urgency`, `Confidence`, `FixClass`, `Remediation`, `validateFinding(candidate: unknown): string[]`, `partitionFindings(candidates: unknown[]): { emitted: Finding[]; rejected: RejectedFinding[] }`, `RejectedFinding`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/finding.test.ts
import { describe, expect, it } from "vitest";
import {
  partitionFindings,
  validateFinding,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";

const complete = {
  id: "integrity.missing-fk.tasks.projectid",
  dimension: "integrity",
  rule: "missing-fk",
  subject: "tasks.projectid",
  observation: "tasks.projectid has no FK constraint; 412 orphaned rows.",
  evidence: { query: "select count(*) ...", rows: [{ orphans: 412 }] },
  whyItNeedsChanging:
    "Nothing prevents a task pointing at a deleted project; those 412 rows already 404 on load.",
  businessImpact: "Users see broken tasks; per-project billing rollups undercount.",
  severity: "high",
  urgency: "scheduled",
  remediation: {
    statements: ["alter table \"tasks\" add constraint ... not valid"],
    fixClass: "additive-safe",
    lockClass: "SHARE ROW EXCLUSIVE",
    estimatedDuration: "under 1s",
    rollback: "drop constraint",
  },
  fixRisk: "Brief lock; existing orphans remain until cleaned manually.",
  doingNothing: "Orphan count grows with every project deletion.",
  confidence: "proven",
};

describe("validateFinding", () => {
  it("accepts a complete finding", () => {
    expect(validateFinding(complete)).toEqual([]);
  });

  it("names every missing contract field", () => {
    const { whyItNeedsChanging, doingNothing, ...partial } = complete;
    expect(validateFinding(partial).sort()).toEqual([
      "doingNothing",
      "whyItNeedsChanging",
    ]);
  });

  it("rejects a field that is present but blank", () => {
    expect(validateFinding({ ...complete, businessImpact: "   " })).toEqual([
      "businessImpact",
    ]);
  });

  it("rejects an unknown severity", () => {
    expect(validateFinding({ ...complete, severity: "urgent" })).toEqual([
      "severity",
    ]);
  });
});

describe("partitionFindings", () => {
  it("emits valid findings and reports rejects rather than dropping them", () => {
    const { emitted, rejected } = partitionFindings([
      complete,
      { ...complete, id: "x", whyItNeedsChanging: "" },
    ]);
    expect(emitted).toHaveLength(1);
    expect(rejected).toEqual([
      { id: "x", missingFields: ["whyItNeedsChanging"] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/finding.test.ts`
Expected: FAIL — cannot resolve `core/finding.js`.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/finding.ts

// [SCOPE 121 / T001] BEGIN — Finding contract types
export type DimensionId =
  | "schema"
  | "integrity"
  | "data"
  | "conventions"
  | "performance"
  | "maintenance"
  | "security"
  | "availability"
  | "impact";

export type Severity = "critical" | "high" | "medium" | "low" | "info";
export type Urgency = "immediate" | "scheduled" | "deferred" | "none";
export type Confidence = "proven" | "inferred";
export type FixClass = "additive-safe" | "manual-only" | "none";

export interface Remediation {
  statements: string[];
  fixClass: FixClass;
  lockClass: string;
  estimatedDuration: string;
  rollback: string;
}

export interface Evidence {
  query: string;
  rows: ReadonlyArray<Record<string, unknown>>;
}

export interface Finding {
  id: string;
  dimension: DimensionId;
  rule: string;
  subject: string;
  observation: string;
  evidence: Evidence;
  whyItNeedsChanging: string;
  businessImpact: string;
  severity: Severity;
  urgency: Urgency;
  remediation: Remediation;
  fixRisk: string;
  doingNothing: string;
  confidence: Confidence;
}

export interface RejectedFinding {
  id: string;
  missingFields: string[];
}
// [SCOPE 121 / T001] END

// [SCOPE 121 / T001] BEGIN — Finding contract validation
const SEVERITIES: ReadonlySet<string> = new Set([
  "critical",
  "high",
  "medium",
  "low",
  "info",
]);
const URGENCIES: ReadonlySet<string> = new Set([
  "immediate",
  "scheduled",
  "deferred",
  "none",
]);
const CONFIDENCES: ReadonlySet<string> = new Set(["proven", "inferred"]);
const FIX_CLASSES: ReadonlySet<string> = new Set([
  "additive-safe",
  "manual-only",
  "none",
]);

/**
 * `dimension` gets a membership check rather than a blank check, because it is
 * the field downstream code groups and routes findings by. A typo'd dimension
 * that passed as valid would be filed nowhere and read as clean.
 */
const DIMENSIONS: ReadonlySet<string> = new Set([
  "schema", "integrity", "data", "conventions", "performance",
  "maintenance", "security", "availability", "impact",
]);

const REQUIRED_TEXT_FIELDS = [
  "id",
  "rule",
  "subject",
  "observation",
  "whyItNeedsChanging",
  "businessImpact",
  "fixRisk",
  "doingNothing",
] as const;

function isFilledString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/**
 * Return the names of every contract field that is missing, blank or invalid.
 * An empty array means the finding satisfies the contract in full.
 */
export function validateFinding(candidate: unknown): string[] {
  if (typeof candidate !== "object" || candidate === null) return ["<root>"];
  const f = candidate as Record<string, unknown>;
  const missing: string[] = [];

  for (const field of REQUIRED_TEXT_FIELDS) {
    if (!isFilledString(f[field])) missing.push(field);
  }

  if (!DIMENSIONS.has(String(f.dimension))) missing.push("dimension");
  if (!SEVERITIES.has(String(f.severity))) missing.push("severity");
  if (!URGENCIES.has(String(f.urgency))) missing.push("urgency");
  if (!CONFIDENCES.has(String(f.confidence))) missing.push("confidence");

  const evidence = f.evidence as Record<string, unknown> | undefined;
  if (
    !evidence ||
    !isFilledString(evidence.query) ||
    !Array.isArray(evidence.rows)
  ) {
    missing.push("evidence");
  }

  const remediation = f.remediation as Record<string, unknown> | undefined;
  if (
    !remediation ||
    !Array.isArray(remediation.statements) ||
    !FIX_CLASSES.has(String(remediation.fixClass)) ||
    !isFilledString(remediation.lockClass) ||
    !isFilledString(remediation.estimatedDuration) ||
    !isFilledString(remediation.rollback)
  ) {
    missing.push("remediation");
  }

  return missing.sort();
}

/**
 * Split candidates into contract-satisfying findings and rejects.
 *
 * Rejects are RETURNED, never discarded. A finding that vanishes because it was
 * incomplete would leave the report reading as clean, which is the exact
 * pathology this contract exists to prevent.
 */
export function partitionFindings(candidates: unknown[]): {
  emitted: Finding[];
  rejected: RejectedFinding[];
} {
  const emitted: Finding[] = [];
  const rejected: RejectedFinding[] = [];

  for (const candidate of candidates) {
    const missingFields = validateFinding(candidate);
    if (missingFields.length === 0) {
      emitted.push(candidate as Finding);
      continue;
    }
    const id = (candidate as { id?: unknown } | null)?.id;
    rejected.push({
      id: typeof id === "string" ? id : "<unidentified>",
      missingFields,
    });
  }

  return { emitted, rejected };
}
// [SCOPE 121 / T001] END
```

- [ ] **Step 4: Add the typecheck scope**

```json
// tsconfig.wxdbanalyze.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "node16",
    "strict": true,
    "noImplicitAny": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["_wxAI/skills/wxDBAnalyze/scripts/**/*.ts"]
}
```

Add to `package.json` scripts:

```json
"typecheck:dbanalyze": "tsc -p tsconfig.wxdbanalyze.json"
```

- [ ] **Step 5: Run test and typecheck to verify both pass**

Run: `npx vitest run tests/wxdbanalyze/finding.test.ts && npm run typecheck:dbanalyze`
Expected: 5 tests PASS, typecheck exits 0.

- [ ] **Step 6: Commit** *(operator approval required)*

```bash
git add tsconfig.wxdbanalyze.json package.json _wxAI/skills/wxDBAnalyze/scripts/core/finding.ts tests/wxdbanalyze/finding.test.ts
git commit -m "feat(SCOPE-121): add wxDBAnalyze finding contract and validator"
```

---

## Task 2: Safe identifier handling

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/identifiers.ts`
- Test: `tests/wxdbanalyze/identifiers.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `isSafeIdentifier(name: string): boolean`, `quoteIdent(name: string): string`, `qualify(table: string, column?: string): string`, `UnsafeIdentifierError`

Dimension 2 builds anti-join SQL from catalog-derived table and column names. Those names come from the database rather than from a user, but they are still interpolated into SQL text, so they get validated and quoted rather than trusted.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/identifiers.test.ts
import { describe, expect, it } from "vitest";
import {
  UnsafeIdentifierError,
  isSafeIdentifier,
  qualify,
  quoteIdent,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/identifiers.js";

describe("isSafeIdentifier", () => {
  it.each(["users", "project_users", "companyId", "t1"])("accepts %s", (n) => {
    expect(isSafeIdentifier(n)).toBe(true);
  });

  it.each([
    "users; drop table x",
    'users"',
    "users--",
    "",
    "a".repeat(64),
    "user name",
  ])("rejects %s", (n) => {
    expect(isSafeIdentifier(n)).toBe(false);
  });
});

describe("quoteIdent", () => {
  it("double-quotes a safe identifier", () => {
    expect(quoteIdent("tasks")).toBe('"tasks"');
  });

  it("throws rather than emitting an unsafe identifier", () => {
    expect(() => quoteIdent('x"; drop table y --')).toThrow(
      UnsafeIdentifierError,
    );
  });
});

describe("qualify", () => {
  it("qualifies a column against its table", () => {
    expect(qualify("tasks", "projectid")).toBe('"tasks"."projectid"');
  });

  it("qualifies a bare table", () => {
    expect(qualify("tasks")).toBe('"tasks"');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/identifiers.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/identifiers.ts

// [SCOPE 121 / T002] BEGIN — Safe SQL identifier handling
/** Postgres truncates identifiers at 63 bytes; anything longer is not a real name. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export class UnsafeIdentifierError extends Error {
  constructor(name: string) {
    super(
      `refusing to build SQL with the identifier ${JSON.stringify(name)} — ` +
        "it is not a plain catalog identifier",
    );
    this.name = "UnsafeIdentifierError";
  }
}

/**
 * Catalog-derived names are still interpolated into SQL text, so they are
 * validated rather than trusted. Anything outside the plain-identifier grammar
 * is refused instead of escaped: an object we cannot name safely is one we
 * decline to probe, and that refusal is reported.
 */
export function isSafeIdentifier(name: string): boolean {
  return typeof name === "string" && IDENTIFIER_RE.test(name);
}

export function quoteIdent(name: string): string {
  if (!isSafeIdentifier(name)) throw new UnsafeIdentifierError(name);
  return `"${name}"`;
}

export function qualify(table: string, column?: string): string {
  const quotedTable = quoteIdent(table);
  return column === undefined
    ? quotedTable
    : `${quotedTable}.${quoteIdent(column)}`;
}
// [SCOPE 121 / T002] END
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/wxdbanalyze/identifiers.test.ts && npm run typecheck:dbanalyze`
Expected: PASS, typecheck exits 0.

- [ ] **Step 5: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/core/identifiers.ts tests/wxdbanalyze/identifiers.test.ts
git commit -m "feat(SCOPE-121): add safe identifier handling for probe SQL"
```

---

## Task 3: Engine layer and refusing stubs

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/engine.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/stub.ts`
- Test: `tests/wxdbanalyze/engine.test.ts`

**Interfaces:**
- Consumes: `DimensionId` from `core/finding.js`
- Produces: `EngineId`, `SupportLevel`, `EngineAdapter`, `DbConnection`, `RawDimensionData`, `AdapterNotImplementedError`, `resolveEngine(opts)`, `createRefusingAdapter(engine)`, `ENGINE_IDS`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/engine.test.ts
import { describe, expect, it } from "vitest";
import { resolveEngine } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/engine.js";
import {
  AdapterNotImplementedError,
  createRefusingAdapter,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/stub.js";

describe("resolveEngine", () => {
  it("prefers an explicit engine over the url", () => {
    expect(
      resolveEngine({ explicit: "mssql", url: "postgres://h/db" }),
    ).toBe("mssql");
  });

  it.each([
    ["postgres://h/db", "postgres"],
    ["postgresql://h/db", "postgres"],
    ["mssql://h/db", "mssql"],
    ["sqlserver://h/db", "mssql"],
    ["mysql://h/db", "mysql"],
    ["mariadb://h/db", "mysql"],
    ["oracle://h/db", "oracle"],
    ["firebird://h/db", "firebird"],
  ])("derives %s from the url scheme", (url, expected) => {
    expect(resolveEngine({ url })).toBe(expected);
  });

  it("falls back to the declared project stack", () => {
    expect(resolveEngine({ projectStack: "PostgreSQL 15" })).toBe("postgres");
  });

  it("throws rather than guessing when nothing identifies the engine", () => {
    expect(() => resolveEngine({})).toThrow(/cannot determine the database engine/i);
  });

  it("throws on an unrecognised explicit engine", () => {
    expect(() => resolveEngine({ explicit: "sqlite" })).toThrow(/sqlite/);
  });
});

describe("createRefusingAdapter", () => {
  it("reports every dimension as not-implemented", () => {
    const adapter = createRefusingAdapter("firebird");
    expect(adapter.supports("schema")).toBe("not-implemented");
    expect(adapter.supports("integrity")).toBe("not-implemented");
  });

  it("refuses to connect", async () => {
    const adapter = createRefusingAdapter("oracle");
    await expect(adapter.connect("oracle://h/db")).rejects.toThrow(
      AdapterNotImplementedError,
    );
  });

  it("names the engine in the refusal so the message is actionable", async () => {
    const adapter = createRefusingAdapter("mysql");
    await expect(adapter.connect("mysql://h/db")).rejects.toThrow(
      /mysql adapter is not implemented/i,
    );
  });

  it("exposes an empty additive whitelist, so nothing can be applied", () => {
    expect(createRefusingAdapter("mssql").additiveWhitelist()).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/engine.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `core/engine.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/engine.ts
import type { DimensionId } from "./finding.js";

// [SCOPE 121 / T003] BEGIN — Engine identity and adapter contract
export const ENGINE_IDS = [
  "postgres",
  "mssql",
  "mysql",
  "oracle",
  "firebird",
] as const;

export type EngineId = (typeof ENGINE_IDS)[number];

/**
 * "not-applicable" means the engine has no analogue for the check (an honest
 * absence). "not-implemented" means we have not written it yet (a gap). They
 * are reported differently and must never be collapsed.
 */
export type SupportLevel =
  | "full"
  | "partial"
  | "not-applicable"
  | "not-implemented";

export interface DbConnection {
  query(
    sql: string,
    params?: readonly unknown[],
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  close(): Promise<void>;
}

export interface RawDimensionData {
  dimension: DimensionId;
  engine: EngineId;
  support: SupportLevel;
  /** Populated only when support is "full" or "partial". */
  data: Record<string, unknown>;
  /** Present when support is not "full" — states why, in operator-readable terms. */
  note?: string;
}

export interface AdditiveRule {
  pattern: RegExp;
  lockClass: string;
  rationale: string;
}

export interface EngineAdapter {
  readonly engine: EngineId;
  supports(dimension: DimensionId): SupportLevel;
  connect(url: string): Promise<DbConnection>;
  collect(
    dimension: DimensionId,
    connection: DbConnection,
  ): Promise<RawDimensionData>;
  additiveWhitelist(): AdditiveRule[];
}
// [SCOPE 121 / T003] END

// [SCOPE 121 / T003] BEGIN — Engine resolution
const SCHEME_TO_ENGINE: ReadonlyMap<string, EngineId> = new Map([
  ["postgres", "postgres"],
  ["postgresql", "postgres"],
  ["mssql", "mssql"],
  ["sqlserver", "mssql"],
  ["mysql", "mysql"],
  ["mariadb", "mysql"],
  ["oracle", "oracle"],
  ["oracledb", "oracle"],
  ["firebird", "firebird"],
  ["fb", "firebird"],
]);

const STACK_KEYWORDS: ReadonlyArray<[RegExp, EngineId]> = [
  [/postgres/i, "postgres"],
  [/sql\s*server|mssql/i, "mssql"],
  [/mysql|mariadb/i, "mysql"],
  [/oracle/i, "oracle"],
  [/firebird|interbase/i, "firebird"],
];

function isEngineId(value: string): value is EngineId {
  return (ENGINE_IDS as readonly string[]).includes(value);
}

/**
 * Resolve the engine from, in order: an explicit flag, the connection-string
 * scheme, then the project's declared stack. Throws rather than defaulting —
 * guessing the engine would mean running one dialect's SQL against another.
 */
export function resolveEngine(opts: {
  explicit?: string;
  url?: string;
  projectStack?: string;
}): EngineId {
  if (opts.explicit) {
    if (!isEngineId(opts.explicit)) {
      throw new Error(
        `unknown engine ${JSON.stringify(opts.explicit)} — supported: ${ENGINE_IDS.join(", ")}`,
      );
    }
    return opts.explicit;
  }

  if (opts.url) {
    const scheme = opts.url.split(":", 1)[0]?.toLowerCase() ?? "";
    const fromScheme = SCHEME_TO_ENGINE.get(scheme);
    if (fromScheme) return fromScheme;
  }

  if (opts.projectStack) {
    for (const [pattern, engine] of STACK_KEYWORDS) {
      if (pattern.test(opts.projectStack)) return engine;
    }
  }

  throw new Error(
    "cannot determine the database engine — pass --engine, or supply a " +
      "connection string whose scheme names the engine",
  );
}
// [SCOPE 121 / T003] END
```

- [ ] **Step 4: Write `engines/stub.ts`**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/stub.ts
import type { DimensionId } from "../core/finding.js";
import type {
  AdditiveRule,
  DbConnection,
  EngineAdapter,
  EngineId,
  RawDimensionData,
  SupportLevel,
} from "../core/engine.js";

// [SCOPE 121 / T003] BEGIN — Refusing adapter for unimplemented engines
export class AdapterNotImplementedError extends Error {
  readonly engine: EngineId;

  constructor(engine: EngineId) {
    super(
      `the ${engine} adapter is not implemented — wxDBAnalyze Phase 1 ships ` +
        "PostgreSQL only. Nothing was read and nothing was written.",
    );
    this.name = "AdapterNotImplementedError";
    this.engine = engine;
  }
}

/**
 * A stub that REFUSES rather than one that returns empty results.
 *
 * An adapter returning zero findings is indistinguishable from a clean
 * database, which would report a customer's unexamined schema as healthy.
 * Refusing is the only honest behaviour for an engine we have not built.
 */
export function createRefusingAdapter(engine: EngineId): EngineAdapter {
  const refuse = (): never => {
    throw new AdapterNotImplementedError(engine);
  };

  return {
    engine,
    supports(_dimension: DimensionId): SupportLevel {
      return "not-implemented";
    },
    async connect(_url: string): Promise<DbConnection> {
      return refuse();
    },
    async collect(
      _dimension: DimensionId,
      _connection: DbConnection,
    ): Promise<RawDimensionData> {
      return refuse();
    },
    additiveWhitelist(): AdditiveRule[] {
      return [];
    },
  };
}
// [SCOPE 121 / T003] END
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/engine.test.ts && npm run typecheck:dbanalyze`
Expected: 13 tests PASS, typecheck exits 0.

- [ ] **Step 6: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/core/engine.ts _wxAI/skills/wxDBAnalyze/scripts/engines/stub.ts tests/wxdbanalyze/engine.test.ts
git commit -m "feat(SCOPE-121): add engine adapter contract and refusing stubs"
```

---

## Task 4: Read-only PostgreSQL connection guard

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.ts`
- Test: `tests/wxdbanalyze/pg-connect.test.ts`

**Interfaces:**
- Consumes: `DbConnection` from `core/engine.js`
- Produces: `createReadOnlyConnection(url: string): Promise<DbConnection>`, `ReadOnlyGuardError`, `loadPostgresDriver()`

The driver is loaded by dynamic import because the kit deliberately strips database dependencies before shipping to consumer projects — a missing driver must produce a clear message, not a module-not-found crash. This mirrors `wxkanban-agent/core/orchestrator/schema-drift.ts`.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/pg-connect.test.ts
import { describe, expect, it, vi } from "vitest";
import {
  ReadOnlyGuardError,
  buildReadOnlyConnection,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js";

function fakeSql(readOnlyReport: string) {
  const executed: string[] = [];
  const sql = Object.assign(
    async (strings: TemplateStringsArray, ...values: unknown[]) => {
      const text = strings.join("?");
      executed.push(text.trim());
      if (text.includes("show default_transaction_read_only")) {
        return [{ default_transaction_read_only: readOnlyReport }];
      }
      return [];
    },
    { end: vi.fn(async () => undefined), unsafe: vi.fn(async () => []) },
  );
  return { sql, executed };
}

describe("buildReadOnlyConnection", () => {
  it("sets and then verifies read-only before returning", async () => {
    const { sql, executed } = fakeSql("on");
    await buildReadOnlyConnection(sql as never);
    expect(executed[0]).toContain("set default_transaction_read_only");
    expect(executed[1]).toContain("show default_transaction_read_only");
  });

  it("refuses the connection when the guard did not take effect", async () => {
    const { sql } = fakeSql("off");
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow(
      ReadOnlyGuardError,
    );
  });

  it("closes the connection when it refuses, leaving nothing open", async () => {
    const { sql } = fakeSql("off");
    await expect(buildReadOnlyConnection(sql as never)).rejects.toThrow();
    expect(sql.end).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/pg-connect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.ts
import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T004] BEGIN — Postgres driver loading
interface TaggedSql {
  (
    strings: TemplateStringsArray,
    ...values: readonly unknown[]
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  unsafe(
    sql: string,
    params?: readonly unknown[],
    options?: { simple?: boolean },
  ): Promise<ReadonlyArray<Record<string, unknown>>>;
  end(options?: { timeout?: number }): Promise<void>;
}

type PostgresFactory = (
  url: string,
  options?: { prepare?: boolean; max?: number },
) => TaggedSql;

/**
 * The kit strips database dependencies before shipping to consumers, so the
 * driver is imported dynamically and its absence is reported as guidance.
 */
export async function loadPostgresDriver(): Promise<PostgresFactory> {
  let mod: unknown;
  try {
    mod = await import("postgres");
  } catch {
    throw new Error(
      "wxDBAnalyze needs the 'postgres' driver, which is not installed here. " +
        "Run it from a project that has database dependencies installed.",
    );
  }
  const candidate = (mod as { default?: unknown }).default ?? mod;
  if (typeof candidate !== "function") {
    throw new Error("the 'postgres' module did not export a callable factory");
  }
  return candidate as PostgresFactory;
}
// [SCOPE 121 / T004] END

// [SCOPE 121 / T004] BEGIN — Read-only connection guard
export class ReadOnlyGuardError extends Error {
  constructor(reported: string) {
    super(
      "refusing to probe: default_transaction_read_only reported " +
        `${JSON.stringify(reported)} rather than "on". wxDBAnalyze will not ` +
        "read from a connection that is capable of writing.",
    );
    this.name = "ReadOnlyGuardError";
  }
}

/**
 * Wrap a live driver handle in the read-only guard.
 *
 * The guard is SET and then independently VERIFIED. Setting alone is a silent
 * check: if the statement were ignored, every subsequent probe would run on a
 * writable session while appearing safe.
 */
export async function buildReadOnlyConnection(
  sql: TaggedSql,
): Promise<DbConnection> {
  try {
    await sql`set default_transaction_read_only = on`;
    const rows = await sql`show default_transaction_read_only`;
    const reported = String(
      rows[0]?.default_transaction_read_only ?? "<absent>",
    );
    if (reported !== "on") throw new ReadOnlyGuardError(reported);
  } catch (error) {
    await sql.end({ timeout: 5 }).catch(() => undefined);
    throw error;
  }

  return {
    async query(text: string, params: readonly unknown[] = []) {
      // `simple: false` forces the extended protocol. postgres-js otherwise
      // selects the SIMPLE protocol whenever there are no bind params — the
      // normal shape for catalog introspection — and simple mode permits
      // several `;`-separated statements per call. `SET
      // default_transaction_read_only` is session state rather than a write,
      // so it can be legally reissued INSIDE a read-only session: a query
      // string that ever picked up an unvalidated `;` could re-arm writes on
      // the very connection the guard secured.
      return sql.unsafe(text, params, { simple: false });
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}

/** Open a guarded read-only connection to a PostgreSQL database. */
export async function createReadOnlyConnection(
  url: string,
): Promise<DbConnection> {
  const factory = await loadPostgresDriver();
  // max: 1, deliberately. postgres-js dispatches each query to whichever
  // pooled socket is idle — a physical connection is not pinned to the handle.
  // With a larger pool the read-only SET would arm only the socket that ran
  // it, and a concurrent query could open a second, unguarded connection on
  // which a write would succeed silently. Do not raise this for throughput.
  return buildReadOnlyConnection(factory(url, { prepare: false, max: 1 }));
}
// [SCOPE 121 / T004] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-connect.test.ts && npm run typecheck:dbanalyze`
Expected: 3 tests PASS, typecheck exits 0.

- [ ] **Step 5: Verify the guard against the live database**

Run:

```bash
npx tsx -e "import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js').then(async m=>{const c=await m.createReadOnlyConnection(process.env.DATABASE_URL);try{await c.query('create temp table wxdb_guard_probe(x int)');console.log('FAIL: write succeeded');process.exit(1)}catch(e){console.log('OK refused:',e.message)}finally{await c.close()}})"
```

Expected: `OK refused: cannot execute CREATE TABLE in a read-only transaction`. This is the fail-first proof that the guard actually blocks writes rather than merely claiming to.

- [ ] **Step 6: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.ts tests/wxdbanalyze/pg-connect.test.ts
git commit -m "feat(SCOPE-121): add verified read-only Postgres connection guard"
```

---

## Task 5: Declared-schema extraction from Drizzle metadata

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.ts`
- Test: `tests/wxdbanalyze/declared.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks
- Produces: `DeclaredColumn`, `DeclaredForeignKey`, `DeclaredIndex`, `DeclaredTable`, `DeclaredSchema`, `SourceConflict`, `extractDeclaredSchema(sources: DeclaredSource[]): DeclaredSchema`, `DeclaredSource`, `loadSchemaModules(paths: string[]): Promise<DeclaredSource[]>`

The existing `collectDeclaredTables` in `wxkanban-agent/core/orchestrator/schema-drift.ts` regexes `pgTable("name")` and yields table names only. Column-level work needs real metadata, so this task reads Drizzle's own `getTableConfig()` instead of parsing text.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/declared.test.ts
import { describe, expect, it } from "vitest";
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { extractDeclaredSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";

const projects = pgTable("projects", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
});

const tasks = pgTable("tasks", {
  id: uuid("id").primaryKey(),
  projectid: uuid("projectid").references(() => projects.id, {
    onDelete: "cascade",
  }),
  createdat: timestamp("createdat").defaultNow().notNull(),
});

describe("extractDeclaredSchema", () => {
  it("extracts tables with their columns", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    expect([...schema.tables.keys()].sort()).toEqual(["projects", "tasks"]);
    expect(
      schema.tables.get("tasks")?.columns.map((c) => c.name).sort(),
    ).toEqual(["createdat", "id", "projectid"]);
  });

  it("records nullability, defaults and primary keys", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    const columns = schema.tables.get("tasks")!.columns;
    const byName = (n: string) => columns.find((c) => c.name === n)!;
    expect(byName("id").isPrimaryKey).toBe(true);
    expect(byName("projectid").notNull).toBe(false);
    expect(byName("createdat").hasDefault).toBe(true);
  });

  it("extracts foreign keys with their referential action", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects, tasks } },
    ]);
    expect(schema.tables.get("tasks")?.foreignKeys).toEqual([
      {
        columns: ["projectid"],
        foreignTable: "projects",
        foreignColumns: ["id"],
        onDelete: "cascade",
        // drizzle-orm ^0.45.2 materialises an unset onUpdate as "no action"
        // rather than leaving it undefined. Downstream findings must not read
        // this as an explicit authoring choice.
        onUpdate: "no action",
      },
    ]);
  });

  it("ignores non-table exports without throwing", () => {
    const schema = extractDeclaredSchema([
      {
        label: "app",
        module: { projects, someHelper: () => 1, CONSTANT: "x", nothing: null },
      },
    ]);
    expect([...schema.tables.keys()]).toEqual(["projects"]);
  });

  it("reports a table declared in two sources with differing columns", () => {
    const mcpTasks = pgTable("tasks", {
      id: uuid("id").primaryKey(),
      projectid: uuid("projectid"),
    });
    const schema = extractDeclaredSchema([
      { label: "app", module: { tasks } },
      { label: "mcp", module: { tasks: mcpTasks } },
    ]);
    expect(schema.conflicts).toEqual([
      {
        table: "tasks",
        sources: ["app", "mcp"],
        difference: "columns only in app: createdat",
      },
    ]);
  });

  it("does not report a conflict when both sources agree", () => {
    const schema = extractDeclaredSchema([
      { label: "app", module: { projects } },
      { label: "mcp", module: { projects } },
    ]);
    expect(schema.conflicts).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/declared.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.ts

// [SCOPE 121 / T005] BEGIN — Declared schema types
export interface DeclaredColumn {
  name: string;
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
}

export interface DeclaredForeignKey {
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface DeclaredIndex {
  name: string;
  columns: string[];
  unique: boolean;
}

export interface DeclaredTable {
  name: string;
  sources: string[];
  columns: DeclaredColumn[];
  foreignKeys: DeclaredForeignKey[];
  indexes: DeclaredIndex[];
}

export interface SourceConflict {
  table: string;
  sources: string[];
  difference: string;
}

export interface DeclaredSchema {
  tables: Map<string, DeclaredTable>;
  conflicts: SourceConflict[];
}

export interface DeclaredSource {
  label: string;
  module: Record<string, unknown>;
}
// [SCOPE 121 / T005] END

// [SCOPE 121 / T005] BEGIN — Drizzle metadata extraction
/**
 * Drizzle's own table config is the source of truth here rather than a regex
 * over the source text. Regex parsing yields table names and nothing more;
 * column types, nullability, defaults and referential actions all live in the
 * builder metadata and cannot be recovered from a name match.
 */
type TableConfigFn = (table: unknown) => {
  name: string;
  columns: ReadonlyArray<{
    name: string;
    getSQLType(): string;
    notNull: boolean;
    hasDefault: boolean;
    primary: boolean;
  }>;
  foreignKeys: ReadonlyArray<{
    reference(): {
      columns: ReadonlyArray<{ name: string }>;
      foreignColumns: ReadonlyArray<{ name: string; table: unknown }>;
    };
    onDelete?: string;
    onUpdate?: string;
  }>;
  indexes: ReadonlyArray<{
    config: {
      name: string;
      unique: boolean;
      columns: ReadonlyArray<{ name?: string }>;
    };
  }>;
};

let cachedConfigFn: TableConfigFn | undefined;

async function loadTableConfigFn(): Promise<TableConfigFn> {
  if (cachedConfigFn) return cachedConfigFn;
  let mod: unknown;
  try {
    mod = await import("drizzle-orm/pg-core");
  } catch {
    throw new Error(
      "wxDBAnalyze needs 'drizzle-orm', which is not installed here. " +
        "Run it from a project that has database dependencies installed.",
    );
  }
  const fn = (mod as { getTableConfig?: unknown }).getTableConfig;
  if (typeof fn !== "function") {
    throw new Error("drizzle-orm/pg-core did not export getTableConfig");
  }
  cachedConfigFn = fn as TableConfigFn;
  return cachedConfigFn;
}

/** Set by `primeTableConfig` in tests, or lazily by `loadSchemaModules`. */
export function primeTableConfig(fn: TableConfigFn): void {
  cachedConfigFn = fn;
}

function readTable(
  getTableConfig: TableConfigFn,
  value: unknown,
): DeclaredTable | undefined {
  let config: ReturnType<TableConfigFn>;
  try {
    config = getTableConfig(value);
  } catch {
    return undefined; // not a Drizzle table — a helper, constant or type export
  }
  if (!config || typeof config.name !== "string") return undefined;

  return {
    name: config.name,
    sources: [],
    columns: config.columns.map((c) => ({
      name: c.name,
      sqlType: c.getSQLType(),
      notNull: c.notNull,
      hasDefault: c.hasDefault,
      isPrimaryKey: c.primary,
    })),
    foreignKeys: config.foreignKeys.map((fk) => {
      const ref = fk.reference();
      const foreignTable = getTableConfig(ref.foreignColumns[0]?.table).name;
      return {
        columns: ref.columns.map((c) => c.name),
        foreignTable,
        foreignColumns: ref.foreignColumns.map((c) => c.name),
        onDelete: fk.onDelete,
        onUpdate: fk.onUpdate,
      };
    }),
    indexes: config.indexes.map((i) => ({
      name: i.config.name,
      unique: i.config.unique,
      columns: i.config.columns
        .map((c) => c.name)
        .filter((n): n is string => typeof n === "string"),
    })),
  };
}

function describeDifference(a: DeclaredTable, b: DeclaredTable): string | undefined {
  const aNames = new Set(a.columns.map((c) => c.name));
  const bNames = new Set(b.columns.map((c) => c.name));
  const onlyA = [...aNames].filter((n) => !bNames.has(n)).sort();
  const onlyB = [...bNames].filter((n) => !aNames.has(n)).sort();
  const parts: string[] = [];
  if (onlyA.length) parts.push(`columns only in ${a.sources[0]}: ${onlyA.join(", ")}`);
  if (onlyB.length) parts.push(`columns only in ${b.sources[0]}: ${onlyB.join(", ")}`);
  return parts.length ? parts.join("; ") : undefined;
}

/**
 * Merge every declared source into one schema, recording disagreement between
 * sources rather than letting the last one win. This project declares schema in
 * both `src/db/schema/` and `mcp-server/src/db/schema.ts`; silent last-wins
 * merging would hide exactly the divergence worth reporting.
 */
export function extractDeclaredSchema(
  sources: DeclaredSource[],
  getTableConfig: TableConfigFn = cachedConfigFn as TableConfigFn,
): DeclaredSchema {
  const tables = new Map<string, DeclaredTable>();
  const conflicts: SourceConflict[] = [];

  for (const source of sources) {
    for (const exported of Object.values(source.module)) {
      const table = readTable(getTableConfig, exported);
      if (!table) continue;
      table.sources = [source.label];

      const existing = tables.get(table.name);
      if (!existing) {
        tables.set(table.name, table);
        continue;
      }

      const difference = describeDifference(existing, table);
      if (difference) {
        conflicts.push({
          table: table.name,
          sources: [...existing.sources, source.label],
          difference,
        });
      }
      existing.sources.push(source.label);
    }
  }

  return { tables, conflicts };
}
// [SCOPE 121 / T005] END

// [SCOPE 121 / T005] BEGIN — Schema module loading
/**
 * Import each declared schema path. Directories are imported via their
 * `index.ts` barrel; single files are imported directly.
 */
export async function loadSchemaModules(
  paths: ReadonlyArray<{ label: string; path: string }>,
): Promise<DeclaredSource[]> {
  await loadTableConfigFn();
  const { pathToFileURL } = await import("node:url");
  const { existsSync, statSync } = await import("node:fs");
  const { resolve, join } = await import("node:path");

  const sources: DeclaredSource[] = [];
  for (const entry of paths) {
    const target = resolve(entry.path);
    if (!existsSync(target)) continue;
    const file = statSync(target).isDirectory()
      ? join(target, "index.ts")
      : target;
    if (!existsSync(file)) continue;
    const module = (await import(pathToFileURL(file).href)) as Record<
      string,
      unknown
    >;
    sources.push({ label: entry.label, module });
  }
  return sources;
}
// [SCOPE 121 / T005] END
```

- [ ] **Step 4: Wire the test to real Drizzle metadata**

The test imports real `pgTable` builders, so `extractDeclaredSchema` needs the real `getTableConfig`. Add this to the top of `tests/wxdbanalyze/declared.test.ts`:

```ts
import { getTableConfig } from "drizzle-orm/pg-core";
import { primeTableConfig } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";

primeTableConfig(getTableConfig as never);
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/declared.test.ts && npm run typecheck:dbanalyze`
Expected: 6 tests PASS, typecheck exits 0.

- [ ] **Step 6: Verify against the real schema**

Run:

```bash
npx tsx -e "import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js').then(async m=>{const s=await m.loadSchemaModules([{label:'app',path:'src/db/schema'},{label:'mcp',path:'mcp-server/src/db/schema.ts'}]);const d=m.extractDeclaredSchema(s);console.log('tables:',d.tables.size);console.log('conflicts:',d.conflicts.length);for(const c of d.conflicts)console.log(' -',c.table,c.difference)})"
```

Expected: a table count in the low hundreds, and any app-versus-mcp divergence listed by name. Record the output — it is the first real evidence of dual-source drift on this project.

- [ ] **Step 7: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.ts tests/wxdbanalyze/declared.test.ts
git commit -m "feat(SCOPE-121): extract declared schema from Drizzle metadata"
```

---

## Task 6: Dimension 1 — live schema collection

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.ts`
- Test: `tests/wxdbanalyze/pg-schema-collect.test.ts`

**Interfaces:**
- Consumes: `DbConnection` from `core/engine.js`
- Produces: `LiveColumn`, `LiveForeignKey`, `LiveIndex`, `LiveTable`, `LiveSchema`, `collectLiveSchema(conn: DbConnection): Promise<LiveSchema>`, and the exported query constants `COLUMNS_SQL`, `CONSTRAINTS_SQL`, `INDEXES_SQL`

`LiveTable` deliberately mirrors `DeclaredTable` from Task 5 field-for-field, so the analysis in Task 7 can diff two structures of the same shape rather than translating between them.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/pg-schema-collect.test.ts
import { describe, expect, it } from "vitest";
import {
  COLUMNS_SQL,
  collectLiveSchema,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js";

function connFrom(responses: Record<string, Record<string, unknown>[]>) {
  const seen: string[] = [];
  return {
    seen,
    conn: {
      async query(sql: string) {
        seen.push(sql);
        const key = Object.keys(responses).find((k) => sql.includes(k));
        return key ? responses[key] : [];
      },
      async close() {},
    },
  };
}

describe("collectLiveSchema", () => {
  it("reads from pg_catalog, never information_schema", () => {
    expect(COLUMNS_SQL).toContain("pg_catalog");
    expect(COLUMNS_SQL).not.toContain("information_schema");
  });

  it("groups columns under their table", async () => {
    const { conn } = connFrom({
      pg_attribute: [
        {
          table_name: "tasks",
          column_name: "id",
          sql_type: "uuid",
          not_null: true,
          has_default: true,
          is_primary_key: true,
        },
        {
          table_name: "tasks",
          column_name: "projectid",
          sql_type: "uuid",
          not_null: false,
          has_default: false,
          is_primary_key: false,
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("tasks")?.columns.map((c) => c.name)).toEqual([
      "id",
      "projectid",
    ]);
    expect(live.tables.get("tasks")?.columns[0]?.isPrimaryKey).toBe(true);
  });

  it("attaches foreign keys with their referential actions", async () => {
    const { conn } = connFrom({
      pg_attribute: [
        {
          table_name: "tasks",
          column_name: "projectid",
          sql_type: "uuid",
          not_null: false,
          has_default: false,
          is_primary_key: false,
        },
      ],
      contype: [
        {
          constraint_name: "tasks_projectid_fkey",
          table_name: "tasks",
          columns: ["projectid"],
          foreign_table: "projects",
          foreign_columns: ["id"],
          on_delete: "cascade",
          on_update: "no action",
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("tasks")?.foreignKeys).toEqual([
      {
        name: "tasks_projectid_fkey",
        columns: ["projectid"],
        foreignTable: "projects",
        foreignColumns: ["id"],
        onDelete: "cascade",
        onUpdate: "no action",
      },
    ]);
  });

  it("creates a table entry for an index on a table with no columns returned", async () => {
    const { conn } = connFrom({
      pg_index: [
        {
          table_name: "orphantable",
          index_name: "idx_x",
          columns: ["a"],
          is_unique: false,
        },
      ],
    });
    const live = await collectLiveSchema(conn);
    expect(live.tables.get("orphantable")?.indexes).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/pg-schema-collect.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.ts
import type { DbConnection } from "../../core/engine.js";

// [SCOPE 121 / T006] BEGIN — Live schema types
export interface LiveColumn {
  name: string;
  sqlType: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
}

export interface LiveForeignKey {
  name: string;
  columns: string[];
  foreignTable: string;
  foreignColumns: string[];
  onDelete?: string;
  onUpdate?: string;
}

export interface LiveIndex {
  name: string;
  /**
   * Expression positions appear as the literal `(expression)` rather than being
   * omitted, so the array keeps the index's true length and ordinal alignment.
   * Dropping them produced a shorter, plausible, wrong index definition.
   */
  columns: string[];
  unique: boolean;
  /** Partial-index WHERE clause, or null when the index is not partial. */
  predicate: string | null;
  /** From `pg_index.indexprs`, not inferred from the marker string. */
  hasExpression: boolean;
}

export interface LiveTable {
  name: string;
  columns: LiveColumn[];
  foreignKeys: LiveForeignKey[];
  indexes: LiveIndex[];
}

export interface LiveSchema {
  tables: Map<string, LiveTable>;
}
// [SCOPE 121 / T006] END

// [SCOPE 121 / T006] BEGIN — Catalog queries
/**
 * pg_catalog, NOT information_schema.
 *
 * information_schema is privilege-filtered: it lists only objects the
 * connecting role holds a privilege on. A least-privilege role would therefore
 * see a short list, and every unseen object would be reported as missing —
 * turning a permissions difference into a false drift report. pg_catalog is
 * unfiltered and needs only CONNECT plus schema USAGE.
 */
export const COLUMNS_SQL = `
  select
    c.relname                                  as table_name,
    a.attname                                  as column_name,
    pg_catalog.format_type(a.atttypid, a.atttypmod) as sql_type,
    a.attnotnull                               as not_null,
    (a.atthasdef or a.attidentity <> '')       as has_default,
    coalesce(pk.is_pk, false)                  as is_primary_key
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  join pg_catalog.pg_attribute a on a.attrelid = c.oid
  left join lateral (
    select true as is_pk
    from pg_catalog.pg_constraint pc
    where pc.conrelid = c.oid and pc.contype = 'p' and a.attnum = any(pc.conkey)
  ) pk on true
  where n.nspname = 'public'
    and c.relkind in ('r', 'p')
    and a.attnum > 0
    and not a.attisdropped
  order by c.relname, a.attnum`;

export const CONSTRAINTS_SQL = `
  select
    con.conname as constraint_name,
    child.relname as table_name,
    (select array_agg(att.attname order by k.ord)
       from unnest(con.conkey) with ordinality k(attnum, ord)
       join pg_catalog.pg_attribute att
         on att.attrelid = con.conrelid and att.attnum = k.attnum) as columns,
    parent.relname as foreign_table,
    (select array_agg(att.attname order by k.ord)
       from unnest(con.confkey) with ordinality k(attnum, ord)
       join pg_catalog.pg_attribute att
         on att.attrelid = con.confrelid and att.attnum = k.attnum) as foreign_columns,
    case con.confdeltype when 'a' then 'no action' when 'r' then 'restrict'
         when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' end as on_delete,
    case con.confupdtype when 'a' then 'no action' when 'r' then 'restrict'
         when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' end as on_update
  from pg_catalog.pg_constraint con
  join pg_catalog.pg_class child on child.oid = con.conrelid
  join pg_catalog.pg_class parent on parent.oid = con.confrelid
  join pg_catalog.pg_namespace n on n.oid = child.relnamespace
  where con.contype = 'f' and n.nspname = 'public'
  order by child.relname, con.conname`;

// LEFT JOIN plus a marker, deliberately. An expression index stores attnum = 0
// at each expression position (the expression itself lives in pg_index.indexprs),
// and 0 matches no pg_attribute row. An INNER JOIN therefore DROPS that position
// silently, yielding a shorter, plausible, wrong index — production's
// `idx_customers_consultant_name_live` on `customers(consultantid, lower(name))`
// would report as a one-column index. The marker keeps the array's true length
// and ordinal alignment.
export const INDEXES_SQL = `
  select
    t.relname as table_name,
    i.relname as index_name,
    ix.indisunique as is_unique,
    (ix.indexprs is not null) as has_expression,
    pg_catalog.pg_get_expr(ix.indpred, ix.indrelid) as predicate,
    (select array_agg(coalesce(att.attname, '(expression)') order by k.ord)
       from unnest(ix.indkey::int[]) with ordinality k(attnum, ord)
       left join pg_catalog.pg_attribute att
         on att.attrelid = t.oid and att.attnum = k.attnum) as columns
  from pg_catalog.pg_index ix
  join pg_catalog.pg_class i on i.oid = ix.indexrelid
  join pg_catalog.pg_class t on t.oid = ix.indrelid
  join pg_catalog.pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
  order by t.relname, i.relname`;
// [SCOPE 121 / T006] END

// [SCOPE 121 / T006] BEGIN — Live schema collection
function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function tableEntry(tables: Map<string, LiveTable>, name: string): LiveTable {
  const existing = tables.get(name);
  if (existing) return existing;
  const created: LiveTable = {
    name,
    columns: [],
    foreignKeys: [],
    indexes: [],
  };
  tables.set(name, created);
  return created;
}

/** Read the deployed shape of every table in the public schema. */
export async function collectLiveSchema(
  connection: DbConnection,
): Promise<LiveSchema> {
  const tables = new Map<string, LiveTable>();

  for (const row of await connection.query(COLUMNS_SQL)) {
    tableEntry(tables, String(row.table_name)).columns.push({
      name: String(row.column_name),
      sqlType: String(row.sql_type),
      notNull: row.not_null === true,
      hasDefault: row.has_default === true,
      isPrimaryKey: row.is_primary_key === true,
    });
  }

  for (const row of await connection.query(CONSTRAINTS_SQL)) {
    tableEntry(tables, String(row.table_name)).foreignKeys.push({
      name: String(row.constraint_name),
      columns: toStringArray(row.columns),
      foreignTable: String(row.foreign_table),
      foreignColumns: toStringArray(row.foreign_columns),
      onDelete: row.on_delete ? String(row.on_delete) : undefined,
      onUpdate: row.on_update ? String(row.on_update) : undefined,
    });
  }

  for (const row of await connection.query(INDEXES_SQL)) {
    tableEntry(tables, String(row.table_name)).indexes.push({
      name: String(row.index_name),
      columns: toStringArray(row.columns),
      unique: row.is_unique === true,
      predicate: row.predicate === null || row.predicate === undefined
        ? null
        : String(row.predicate),
      hasExpression: row.has_expression === true,
    });
  }

  return { tables };
}
// [SCOPE 121 / T006] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-schema-collect.test.ts && npm run typecheck:dbanalyze`
Expected: 4 tests PASS, typecheck exits 0.

- [ ] **Step 5: Verify every query runs against the live catalog**

Run:

```bash
npx tsx -e "Promise.all([import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js'),import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js')]).then(async([c,s])=>{const conn=await c.createReadOnlyConnection(process.env.DATABASE_URL);const live=await s.collectLiveSchema(conn);console.log('live tables:',live.tables.size);const t=live.tables.get('tasks');console.log('tasks cols:',t?.columns.length,'fks:',t?.foreignKeys.length,'idx:',t?.indexes.length);await conn.close()})"
```

Expected: a non-zero table count and a populated `tasks` entry. If any query errors, the SQL is wrong — fix it here rather than in the analysis task.

- [ ] **Step 6: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.ts tests/wxdbanalyze/pg-schema-collect.test.ts
git commit -m "feat(SCOPE-121): collect live Postgres schema from pg_catalog"
```

---

## Task 7: Dimension 1 — schema analysis

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/schema.ts`
- Test: `tests/wxdbanalyze/dimension-schema.test.ts`

**Interfaces:**
- Consumes: `DeclaredSchema` (Task 5), `LiveSchema` (Task 6), `Finding` (Task 1)
- Produces: `analyzeSchema(declared: DeclaredSchema, live: LiveSchema): Finding[]`

Pure. No I/O, no database, no clock. Every rule below states a consequence derived from what was measured, because a finding whose "why" could be pasted into any other project's report is not a finding.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/dimension-schema.test.ts
import { describe, expect, it } from "vitest";
import { analyzeSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/schema.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import type { DeclaredSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js";
import type { LiveSchema } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js";

const col = (name: string, over: Partial<{ sqlType: string; notNull: boolean; hasDefault: boolean; isPrimaryKey: boolean }> = {}) => ({
  name,
  sqlType: "uuid",
  notNull: false,
  hasDefault: false,
  isPrimaryKey: false,
  ...over,
});

function declared(tables: Record<string, string[]>, conflicts: DeclaredSchema["conflicts"] = []): DeclaredSchema {
  return {
    conflicts,
    tables: new Map(
      Object.entries(tables).map(([name, cols]) => [
        name,
        { name, sources: ["app"], columns: cols.map((c) => col(c)), foreignKeys: [], indexes: [] },
      ]),
    ),
  };
}

function live(tables: Record<string, string[]>): LiveSchema {
  return {
    tables: new Map(
      Object.entries(tables).map(([name, cols]) => [
        name,
        { name, columns: cols.map((c) => col(c)), foreignKeys: [], indexes: [] },
      ]),
    ),
  };
}

const ids = (f: ReturnType<typeof analyzeSchema>) => f.map((x) => x.id).sort();

describe("analyzeSchema", () => {
  it("every finding it produces satisfies the contract", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id", "projectid"], gone: ["id"] }, [
        { table: "tasks", sources: ["app", "mcp"], difference: "columns only in app: projectid" },
      ]),
      live({ tasks: ["id"], extra: ["id"] }),
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const f of findings) expect(validateFinding(f)).toEqual([]);
  });

  it("reports a declared table absent from the database", () => {
    const findings = analyzeSchema(declared({ gone: ["id"] }), live({}));
    expect(ids(findings)).toContain("schema.missing-table.gone");
    const f = findings.find((x) => x.id === "schema.missing-table.gone")!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/42P01/);
  });

  it("reports a declared column absent from a live table as critical", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id", "projectid"] }),
      live({ tasks: ["id"] }),
    );
    const f = findings.find((x) => x.id === "schema.missing-column.tasks.projectid")!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/every read of tasks/i);
    expect(f.remediation.fixClass).toBe("additive-safe");
  });

  it("reports a live table nothing declares, and warns about push", () => {
    const findings = analyzeSchema(declared({}), live({ marketingcontacts: ["id"] }));
    const f = findings.find((x) => x.id === "schema.undeclared-table.marketingcontacts")!;
    expect(f.remediation.fixClass).toBe("manual-only");
    expect(f.doingNothing).toMatch(/drizzle-kit push/i);
  });

  it("reports a type mismatch with both types named", () => {
    const d = declared({ tasks: ["id"] });
    d.tables.get("tasks")!.columns = [col("id", { sqlType: "uuid" })];
    const l = live({ tasks: [] });
    l.tables.get("tasks")!.columns = [col("id", { sqlType: "text" })];
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.type-mismatch.tasks.id")!;
    expect(f.observation).toContain("uuid");
    expect(f.observation).toContain("text");
  });

  it("reports a nullability mismatch where code assumes NOT NULL", () => {
    const d = declared({ tasks: [] });
    d.tables.get("tasks")!.columns = [col("name", { notNull: true })];
    const l = live({ tasks: [] });
    l.tables.get("tasks")!.columns = [col("name", { notNull: false })];
    const f = analyzeSchema(d, l).find((x) => x.id === "schema.nullability-mismatch.tasks.name")!;
    expect(f.confidence).toBe("proven");
  });

  it("reports disagreement between declaration sources", () => {
    const findings = analyzeSchema(
      declared({ tasks: ["id"] }, [
        { table: "tasks", sources: ["app", "mcp"], difference: "columns only in app: projectid" },
      ]),
      live({ tasks: ["id"] }),
    );
    expect(ids(findings)).toContain("schema.source-conflict.tasks");
  });

  it("returns nothing when declared and live agree", () => {
    expect(analyzeSchema(declared({ tasks: ["id"] }), live({ tasks: ["id"] }))).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/dimension-schema.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/dimensions/schema.ts
import type { Finding, Remediation } from "../core/finding.js";
import { quoteIdent } from "../core/identifiers.js";
import type {
  DeclaredSchema,
  DeclaredTable,
} from "../engines/postgres/declared.js";
import type { LiveSchema, LiveTable } from "../engines/postgres/schema.js";

// [SCOPE 121 / T007] BEGIN — Schema dimension remediation helpers
const MANUAL: Remediation = {
  statements: [],
  fixClass: "manual-only",
  lockClass: "n/a — no statement is generated",
  estimatedDuration: "n/a",
  rollback: "n/a",
};

function addColumn(table: string, column: string, sqlType: string): Remediation {
  return {
    statements: [
      `alter table ${quoteIdent(table)} add column ${quoteIdent(column)} ${sqlType};`,
    ],
    fixClass: "additive-safe",
    lockClass: "ACCESS EXCLUSIVE, held briefly (catalog-only on PG 11+)",
    estimatedDuration: "milliseconds — no table rewrite for a nullable column",
    rollback: `alter table ${quoteIdent(table)} drop column ${quoteIdent(column)};`,
  };
}
// [SCOPE 121 / T007] END

// [SCOPE 121 / T007] BEGIN — Schema dimension analysis
function missingTable(table: DeclaredTable): Finding {
  return {
    id: `schema.missing-table.${table.name}`,
    dimension: "schema",
    rule: "missing-table",
    subject: table.name,
    observation:
      `${table.name} is declared in ${table.sources.join(" and ")} with ` +
      `${table.columns.length} columns but does not exist in the database.`,
    evidence: {
      query: "select relname from pg_catalog.pg_class where relkind in ('r','p')",
      rows: [{ table: table.name, declared_in: table.sources.join(",") }],
    },
    whyItNeedsChanging:
      `Any code path touching ${table.name} raises 42P01 (undefined_table), ` +
      "which surfaces as a 500 rather than a handled error. The failure is " +
      "total for that path, not degraded.",
    businessImpact:
      `Every feature backed by ${table.name} is unavailable, and the failure ` +
      "is invisible to schema tooling that only compares declarations.",
    severity: "critical",
    urgency: "immediate",
    remediation: MANUAL,
    fixRisk:
      "Creating the table is additive, but the correct DDL must come from the " +
      "reviewed migration for the scope that introduced it, not be synthesised here.",
    doingNothing:
      "The 500s continue at the rate that code path is exercised, with no alarm " +
      "distinguishing them from any other server error.",
    confidence: "proven",
  };
}

function undeclaredTable(table: LiveTable): Finding {
  return {
    id: `schema.undeclared-table.${table.name}`,
    dimension: "schema",
    rule: "undeclared-table",
    subject: table.name,
    observation:
      `${table.name} exists in the database with ${table.columns.length} ` +
      "columns but is declared in no schema source.",
    evidence: {
      query: "select relname from pg_catalog.pg_class where relkind in ('r','p')",
      rows: [{ table: table.name, columns: table.columns.length }],
    },
    whyItNeedsChanging:
      "Schema tooling treats undeclared tables as removable. The application " +
      "also cannot read it through the ORM, so whatever writes it is doing so " +
      "outside the declared model and is unprotected by type checking.",
    businessImpact:
      `If ${table.name} holds live data, an automated reconciliation would ` +
      "propose dropping it.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "Declaring it retroactively is safe; the risk lies in declaring it " +
      "inaccurately, which converts a silent table into a wrong one.",
    doingNothing:
      "`drizzle-kit push` would propose dropping this table — which is why it " +
      "is prohibited against this database. The prohibition is the mitigation, " +
      "and it depends on nobody forgetting.",
    confidence: "proven",
  };
}

function missingColumn(
  table: string,
  column: { name: string; sqlType: string },
): Finding {
  return {
    id: `schema.missing-column.${table}.${column.name}`,
    dimension: "schema",
    rule: "missing-column",
    subject: `${table}.${column.name}`,
    observation:
      `${table}.${column.name} (${column.sqlType}) is declared but absent ` +
      `from the deployed ${table}.`,
    evidence: {
      query: "select attname from pg_catalog.pg_attribute where attrelid = $table",
      rows: [{ table, column: column.name, declared_type: column.sqlType }],
    },
    whyItNeedsChanging:
      `Drizzle emits every declared column in its SELECT list, so every read ` +
      `of ${table} — not merely reads of ${column.name} — fails with 42703. ` +
      "One missing column disables the whole table.",
    businessImpact:
      `All functionality backed by ${table} returns 500 until the column is added.`,
    severity: "critical",
    urgency: "immediate",
    remediation: addColumn(table, column.name, column.sqlType),
    fixRisk:
      "Adding a nullable column takes a brief catalog-only lock on PG 11+ and " +
      "does not rewrite the table.",
    doingNothing:
      `Every request touching ${table} continues to fail.`,
    confidence: "proven",
  };
}

function undeclaredColumn(table: string, column: { name: string; notNull: boolean; hasDefault: boolean }): Finding {
  const blocksInsert = column.notNull && !column.hasDefault;
  return {
    id: `schema.undeclared-column.${table}.${column.name}`,
    dimension: "schema",
    rule: "undeclared-column",
    subject: `${table}.${column.name}`,
    observation:
      `${table}.${column.name} exists in the database but is not declared` +
      (blocksInsert ? " and is NOT NULL with no default." : "."),
    evidence: {
      query: "select attname, attnotnull, atthasdef from pg_catalog.pg_attribute",
      rows: [{ table, column: column.name, not_null: column.notNull, has_default: column.hasDefault }],
    },
    whyItNeedsChanging: blocksInsert
      ? `Every INSERT into ${table} issued by the application omits ` +
        `${column.name}, and the column is NOT NULL with no default — so ` +
        "every insert fails with 23502."
      : `The application cannot read or write ${column.name}, so any data in ` +
        "it is inaccessible to the product and invisible to type checking.",
    businessImpact: blocksInsert
      ? `No row can be created in ${table} through the application.`
      : "Data written by another process is stranded outside the model.",
    severity: blocksInsert ? "critical" : "medium",
    urgency: blocksInsert ? "immediate" : "deferred",
    remediation: MANUAL,
    fixRisk:
      "Declaring the column in code is inert until deployed; no database change is required.",
    doingNothing: blocksInsert
      ? "Inserts continue to fail for every user."
      : "The column stays invisible to the application indefinitely.",
    confidence: "proven",
  };
}

function typeMismatch(
  table: string,
  column: string,
  declaredType: string,
  liveType: string,
): Finding {
  return {
    id: `schema.type-mismatch.${table}.${column}`,
    dimension: "schema",
    rule: "type-mismatch",
    subject: `${table}.${column}`,
    observation:
      `${table}.${column} is declared ${declaredType} but deployed as ${liveType}.`,
    evidence: {
      query: "select pg_catalog.format_type(atttypid, atttypmod) from pg_catalog.pg_attribute",
      rows: [{ table, column, declared: declaredType, live: liveType }],
    },
    whyItNeedsChanging:
      `The driver decodes ${column} as ${liveType} while the application's ` +
      `types assert ${declaredType}. Comparisons and joins against this column ` +
      "may silently fall back to a cast, defeating any index on it.",
    businessImpact:
      "Queries filtering on this column can degrade to sequential scans, and " +
      "values may round-trip differently than the code expects.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "ALTER COLUMN TYPE rewrites the table and takes ACCESS EXCLUSIVE for the " +
      "duration; it is destructive and must be applied by hand in a window.",
    doingNothing:
      "The mismatch persists silently — it produces no error, only wrong plans " +
      "and occasional wrong comparisons.",
    confidence: "proven",
  };
}

function nullabilityMismatch(table: string, column: string): Finding {
  return {
    id: `schema.nullability-mismatch.${table}.${column}`,
    dimension: "schema",
    rule: "nullability-mismatch",
    subject: `${table}.${column}`,
    observation:
      `${table}.${column} is declared NOT NULL but is nullable in the database.`,
    evidence: {
      query: "select attnotnull from pg_catalog.pg_attribute",
      rows: [{ table, column, declared_not_null: true, live_not_null: false }],
    },
    whyItNeedsChanging:
      `TypeScript types ${column} as non-optional, so no code path guards ` +
      "against null. Any null already present, or inserted by another writer, " +
      "reaches code that will dereference it.",
    businessImpact:
      "A runtime null produces a TypeError rather than a handled validation " +
      "error, and the type system gives no warning at build time.",
    severity: "high",
    urgency: "scheduled",
    remediation: MANUAL,
    fixRisk:
      "SET NOT NULL scans the whole table and takes ACCESS EXCLUSIVE; it also " +
      "fails outright if nulls exist, so existing nulls must be resolved first.",
    doingNothing:
      "The code keeps asserting a guarantee the database does not enforce.",
    confidence: "proven",
  };
}

function sourceConflict(conflict: DeclaredSchema["conflicts"][number]): Finding {
  // `subset` means one source declares a strict subset of the other's columns —
  // the documented read-only-mirror pattern in mcp-server/src/db/schema.ts, and
  // usually deliberate. `divergent` means each source holds a column the other
  // lacks, which no mirror explains. Reporting both at the same severity would
  // push the operator to "fix" intentional narrowing.
  const divergent = conflict.direction === "divergent";
  return {
    id: `schema.source-conflict.${conflict.table}`,
    dimension: "schema",
    rule: "source-conflict",
    subject: conflict.table,
    observation:
      `${conflict.table} is declared in ${conflict.sources.join(" and ")} ` +
      `with differing shapes — ${conflict.difference}.`,
    evidence: {
      query: "declared-schema comparison across sources",
      rows: [{ table: conflict.table, sources: conflict.sources.join(","), difference: conflict.difference }],
    },
    whyItNeedsChanging: divergent
      ? "Each source declares a column the other lacks, so neither is a subset " +
        "of the other and no mirror relationship explains it. Whichever is " +
        "wrong will emit SQL the database rejects, and a drift check comparing " +
        "against either source alone reports clean."
      : "One source declares a strict subset of the other's columns. That is " +
        "the read-only-mirror pattern this project uses deliberately, so it is " +
        "reported for confirmation rather than as a defect — but an " +
        "undocumented subset is indistinguishable from a stale declaration.",
    businessImpact: divergent
      ? "One of the two components fails against the deployed schema, and which " +
        "one depends on which source happens to be correct."
      : "None if the narrowing is intentional. If it is not, the narrower " +
        "source cannot read the columns it omits.",
    severity: divergent ? "high" : "low",
    urgency: divergent ? "scheduled" : "deferred",
    remediation: MANUAL,
    fixRisk:
      "Reconciling is a code change only; the risk is choosing the wrong source as authoritative.",
    doingNothing:
      "The divergence widens with each change applied to one source and not the other.",
    confidence: "proven",
  };
}

/** Diff declared against live and produce contract-complete findings. */
export function analyzeSchema(
  declared: DeclaredSchema,
  live: LiveSchema,
): Finding[] {
  const findings: Finding[] = [];

  for (const conflict of declared.conflicts) findings.push(sourceConflict(conflict));

  for (const [name, table] of declared.tables) {
    const liveTable = live.tables.get(name);
    if (!liveTable) {
      findings.push(missingTable(table));
      continue;
    }
    const liveColumns = new Map(liveTable.columns.map((c) => [c.name, c]));
    for (const column of table.columns) {
      const liveColumn = liveColumns.get(column.name);
      if (!liveColumn) {
        findings.push(missingColumn(name, column));
        continue;
      }
      if (liveColumn.sqlType !== column.sqlType) {
        findings.push(typeMismatch(name, column.name, column.sqlType, liveColumn.sqlType));
      }
      if (column.notNull && !liveColumn.notNull) {
        findings.push(nullabilityMismatch(name, column.name));
      }
    }
    const declaredColumns = new Set(table.columns.map((c) => c.name));
    for (const liveColumn of liveTable.columns) {
      if (!declaredColumns.has(liveColumn.name)) {
        findings.push(undeclaredColumn(name, liveColumn));
      }
    }
  }

  for (const [name, liveTable] of live.tables) {
    if (!declared.tables.has(name)) findings.push(undeclaredTable(liveTable));
  }

  return findings;
}
// [SCOPE 121 / T007] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/dimension-schema.test.ts && npm run typecheck:dbanalyze`
Expected: 8 tests PASS, typecheck exits 0. The first test — every finding satisfying the contract — is the one that matters most; it makes the contract enforceable rather than aspirational.

- [ ] **Step 5: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/dimensions/schema.ts tests/wxdbanalyze/dimension-schema.test.ts
git commit -m "feat(SCOPE-121): analyse schema drift into contract-complete findings"
```

---

## Task 8: Dimension 2 — relationship inference

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.ts`
- Test: `tests/wxdbanalyze/relationships.test.ts`

**Interfaces:**
- Consumes: `DeclaredSchema` (Task 5), `LiveSchema` (Task 6)
- Produces: `RelationshipSource`, `Relationship`, `FkNamingPattern`, `resolveParentTable(column, tables, pattern)`, `inferRelationships(input: { declared: DeclaredSchema; live: LiveSchema; dataModel?: DataModelEdge[]; pattern?: FkNamingPattern }): Relationship[]`, `DataModelEdge`

Pure. This is the cross-tabulation step: a relationship carries the set of sources that assert it, and the analysis in Task 9 reads that set to decide what kind of defect it represents.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/relationships.test.ts
import { describe, expect, it } from "vitest";
import {
  inferRelationships,
  resolveParentTable,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

const tables = new Set(["projects", "users", "companies", "tasks", "boxes"]);

describe("resolveParentTable", () => {
  it.each([
    ["projectid", "projects"],
    ["userid", "users"],
    ["companyid", "companies"],
    ["boxid", "boxes"],
  ])("resolves %s to %s", (column, expected) => {
    expect(resolveParentTable(column, tables, "lowercase-concat")).toBe(expected);
  });

  it("returns undefined when no plausible parent exists", () => {
    expect(resolveParentTable("externalid", tables, "lowercase-concat")).toBeUndefined();
  });

  it("ignores a column that does not match the pattern", () => {
    expect(resolveParentTable("name", tables, "lowercase-concat")).toBeUndefined();
  });

  it("never resolves a table to itself via its own id column", () => {
    expect(resolveParentTable("id", tables, "lowercase-concat")).toBeUndefined();
  });

  it("handles snake_case and PascalCase patterns", () => {
    expect(resolveParentTable("project_id", tables, "snake_case")).toBe("projects");
    expect(resolveParentTable("ProjectId", tables, "pascal-case")).toBe("projects");
  });
});

function schemas(opts: {
  declaredFk?: boolean;
  liveFk?: boolean;
  conventionColumn?: boolean;
}) {
  const declaredTasks = {
    name: "tasks",
    sources: ["app"],
    columns: opts.conventionColumn === false
      ? [{ name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true }]
      : [
          { name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true },
          { name: "projectid", sqlType: "uuid", notNull: false, hasDefault: false, isPrimaryKey: false },
        ],
    foreignKeys: opts.declaredFk
      ? [{ columns: ["projectid"], foreignTable: "projects", foreignColumns: ["id"], onDelete: "cascade", onUpdate: undefined }]
      : [],
    indexes: [],
  };
  const liveTasks = {
    name: "tasks",
    columns: declaredTasks.columns.map((c) => ({ ...c })),
    foreignKeys: opts.liveFk
      ? [{ name: "tasks_projectid_fkey", columns: ["projectid"], foreignTable: "projects", foreignColumns: ["id"], onDelete: "cascade", onUpdate: "no action" }]
      : [],
    indexes: [],
  };
  const projects = { name: "projects", columns: [{ name: "id", sqlType: "uuid", notNull: true, hasDefault: true, isPrimaryKey: true }], foreignKeys: [], indexes: [] };
  return {
    declared: { tables: new Map([["tasks", declaredTasks], ["projects", { ...projects, sources: ["app"] }]]), conflicts: [] },
    live: { tables: new Map([["tasks", liveTasks], ["projects", projects]]) },
  };
}

describe("inferRelationships", () => {
  it("marks a relationship asserted by all three available sources", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    const rel = inferRelationships({ declared: declared as never, live: live as never })[0]!;
    expect(rel.sources.sort()).toEqual(["convention", "declared", "live"]);
  });

  it("infers a relationship from naming alone when nothing declares it", () => {
    const { declared, live } = schemas({});
    const rel = inferRelationships({ declared: declared as never, live: live as never })[0]!;
    expect(rel.sources).toEqual(["convention"]);
    expect(rel.parent).toBe("projects");
    expect(rel.constraintName).toBeUndefined();
  });

  it("captures the child column's nullability, type and index state", () => {
    const { declared, live } = schemas({});
    const rel = inferRelationships({ declared: declared as never, live: live as never })[0]!;
    expect(rel.childColumnNullable).toBe(true);
    expect(rel.childColumnType).toBe("uuid");
    expect(rel.parentColumnType).toBe("uuid");
    expect(rel.indexedOnChild).toBe(false);
  });

  it("merges a data-model edge into the same relationship", () => {
    const { declared, live } = schemas({});
    const rel = inferRelationships({
      declared: declared as never,
      live: live as never,
      dataModel: [{ child: "tasks", childColumn: "projectid", parent: "projects", parentColumn: "id" }],
    })[0]!;
    expect(rel.sources.sort()).toEqual(["convention", "datamodel"]);
  });

  it("produces one relationship per child column, not one per source", () => {
    const { declared, live } = schemas({ declaredFk: true, liveFk: true });
    expect(inferRelationships({ declared: declared as never, live: live as never })).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/relationships.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.ts
import type { DeclaredSchema } from "../engines/postgres/declared.js";
import type { LiveSchema } from "../engines/postgres/schema.js";

// [SCOPE 121 / T008] BEGIN — Relationship types
export type RelationshipSource =
  | "declared"
  | "live"
  | "convention"
  | "datamodel";

export type FkNamingPattern = "lowercase-concat" | "snake_case" | "pascal-case";

export interface DataModelEdge {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
}

export interface Relationship {
  child: string;
  childColumn: string;
  parent: string;
  parentColumn: string;
  sources: RelationshipSource[];
  constraintName?: string;
  onDelete?: string;
  onUpdate?: string;
  childColumnNullable: boolean;
  childColumnType: string;
  parentColumnType: string;
  indexedOnChild: boolean;
}
// [SCOPE 121 / T008] END

// [SCOPE 121 / T008] BEGIN — Convention-based parent resolution
/**
 * Candidate parent table names for a singular stem, most-likely first.
 * Deliberately small: over-eager pluralisation invents relationships, and a
 * relationship invented here becomes an orphan query against a table that has
 * nothing to do with the child.
 */
function pluralCandidates(stem: string): string[] {
  const candidates = [`${stem}s`, stem, `${stem}es`];
  if (stem.endsWith("y")) candidates.push(`${stem.slice(0, -1)}ies`);
  if (stem.endsWith("s") || stem.endsWith("x") || stem.endsWith("ch")) {
    candidates.push(`${stem}es`);
  }
  return candidates;
}

function stemFor(column: string, pattern: FkNamingPattern): string | undefined {
  if (pattern === "snake_case") {
    return column.endsWith("_id") ? column.slice(0, -3) : undefined;
  }
  if (pattern === "pascal-case") {
    return column.endsWith("Id") && column.length > 2
      ? column.slice(0, -2).toLowerCase()
      : undefined;
  }
  // lowercase-concat: "projectid" -> "project". "id" itself is the PK, not an FK.
  return column.endsWith("id") && column.length > 2
    ? column.slice(0, -2)
    : undefined;
}

/**
 * Resolve the parent table a foreign-key-shaped column points at, using naming
 * convention alone. Returns undefined when no plausible parent exists — an
 * unresolvable name is reported as unresolvable, never guessed at.
 */
export function resolveParentTable(
  column: string,
  tables: ReadonlySet<string>,
  pattern: FkNamingPattern,
): string | undefined {
  const stem = stemFor(column, pattern);
  if (!stem) return undefined;
  return pluralCandidates(stem).find((candidate) => tables.has(candidate));
}
// [SCOPE 121 / T008] END

// [SCOPE 121 / T008] BEGIN — Relationship cross-tabulation
function key(child: string, childColumn: string): string {
  return `${child}.${childColumn}`;
}

/**
 * Cross-tabulate every source that asserts a parent/child link.
 *
 * The output is one relationship per child column carrying the SET of sources
 * that assert it. That set is the whole point: a link asserted by convention
 * but not by the live catalog is an unenforced relationship, and a link
 * enforced live but undeclared is a cascade the code knows nothing about.
 */
export function inferRelationships(input: {
  declared: DeclaredSchema;
  live: LiveSchema;
  dataModel?: DataModelEdge[];
  pattern?: FkNamingPattern;
}): Relationship[] {
  const pattern = input.pattern ?? "lowercase-concat";
  const liveTableNames = new Set(input.live.tables.keys());
  const found = new Map<string, Relationship>();

  const upsert = (
    base: Omit<Relationship, "sources">,
    source: RelationshipSource,
  ): void => {
    const k = key(base.child, base.childColumn);
    const existing = found.get(k);
    if (existing) {
      if (!existing.sources.includes(source)) existing.sources.push(source);
      existing.constraintName ??= base.constraintName;
      existing.onDelete ??= base.onDelete;
      existing.onUpdate ??= base.onUpdate;
      return;
    }
    found.set(k, { ...base, sources: [source] });
  };

  const describe = (
    child: string,
    childColumn: string,
    parent: string,
    parentColumn: string,
    extra: Partial<Relationship> = {},
  ): Omit<Relationship, "sources"> => {
    const childTable = input.live.tables.get(child);
    const parentTable = input.live.tables.get(parent);
    const childCol = childTable?.columns.find((c) => c.name === childColumn);
    const parentCol = parentTable?.columns.find((c) => c.name === parentColumn);
    return {
      child,
      childColumn,
      parent,
      parentColumn,
      childColumnNullable: childCol ? !childCol.notNull : true,
      childColumnType: childCol?.sqlType ?? "unknown",
      parentColumnType: parentCol?.sqlType ?? "unknown",
      indexedOnChild:
        childTable?.indexes.some((i) => i.columns[0] === childColumn) ?? false,
      ...extra,
    };
  };

  for (const [child, table] of input.declared.tables) {
    for (const fk of table.foreignKeys) {
      const childColumn = fk.columns[0];
      const parentColumn = fk.foreignColumns[0];
      if (!childColumn || !parentColumn) continue;
      upsert(
        describe(child, childColumn, fk.foreignTable, parentColumn, {
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }),
        "declared",
      );
    }
  }

  for (const [child, table] of input.live.tables) {
    for (const fk of table.foreignKeys) {
      const childColumn = fk.columns[0];
      const parentColumn = fk.foreignColumns[0];
      if (!childColumn || !parentColumn) continue;
      upsert(
        describe(child, childColumn, fk.foreignTable, parentColumn, {
          constraintName: fk.name,
          onDelete: fk.onDelete,
          onUpdate: fk.onUpdate,
        }),
        "live",
      );
    }
  }

  for (const [child, table] of input.live.tables) {
    for (const column of table.columns) {
      if (column.isPrimaryKey) continue;
      const parent = resolveParentTable(column.name, liveTableNames, pattern);
      if (!parent || parent === child) continue;
      const parentPk = input.live.tables
        .get(parent)
        ?.columns.find((c) => c.isPrimaryKey);
      if (!parentPk) continue;
      upsert(describe(child, column.name, parent, parentPk.name), "convention");
    }
  }

  for (const edge of input.dataModel ?? []) {
    upsert(
      describe(edge.child, edge.childColumn, edge.parent, edge.parentColumn),
      "datamodel",
    );
  }

  return [...found.values()].sort((a, b) =>
    key(a.child, a.childColumn).localeCompare(key(b.child, b.childColumn)),
  );
}
// [SCOPE 121 / T008] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/relationships.test.ts && npm run typecheck:dbanalyze`
Expected: 10 tests PASS, typecheck exits 0.

- [ ] **Step 5: Verify inference against the real schema**

Run:

```bash
npx tsx -e "Promise.all([import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/connect.js'),import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/schema.js'),import('./_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/declared.js'),import('./_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js')]).then(async([c,s,d,r])=>{const conn=await c.createReadOnlyConnection(process.env.DATABASE_URL);const live=await s.collectLiveSchema(conn);const declared=d.extractDeclaredSchema(await d.loadSchemaModules([{label:'app',path:'src/db/schema'}]));const rels=r.inferRelationships({declared,live});const unenforced=rels.filter(x=>!x.sources.includes('live'));console.log('relationships:',rels.length,'unenforced:',unenforced.length);for(const u of unenforced.slice(0,20))console.log(' -',u.child+'.'+u.childColumn,'->',u.parent,'via',u.sources.join('+'));await conn.close()})"
```

Expected: a list of parent/child links the database does not enforce. Record the count — Task 9 turns each of these into an orphan measurement.

- [ ] **Step 6: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.ts tests/wxdbanalyze/relationships.test.ts
git commit -m "feat(SCOPE-121): cross-tabulate parent/child relationships from four sources"
```

---

## Task 9: Dimension 2 — orphan probing

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.ts`
- Test: `tests/wxdbanalyze/pg-integrity-probe.test.ts`

**Interfaces:**
- Consumes: `Relationship` (Task 8), `DbConnection` (Task 3), `quoteIdent`/`qualify` (Task 2)
- Produces: `OrphanProbe`, `ProbeOptions`, `buildOrphanQuery(rel): string`, `buildTenantQuery(rel, tenantColumn): string`, `probeIntegrity(conn, relationships, opts?): Promise<OrphanProbe[]>`, `estimateRowCounts(conn): Promise<Map<string, number>>`

Expensive by nature — an anti-join per relationship. The guard is explicit: relationships whose child column is unindexed on a large table are **skipped with a stated reason**, never skipped silently.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/pg-integrity-probe.test.ts
import { describe, expect, it } from "vitest";
import {
  buildOrphanQuery,
  buildTenantQuery,
  probeIntegrity,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.js";
import type { Relationship } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

const rel = (over: Partial<Relationship> = {}): Relationship => ({
  child: "tasks",
  childColumn: "projectid",
  parent: "projects",
  parentColumn: "id",
  sources: ["convention"],
  childColumnNullable: true,
  childColumnType: "uuid",
  parentColumnType: "uuid",
  indexedOnChild: true,
  ...over,
});

describe("buildOrphanQuery", () => {
  it("builds a left-join anti-join with quoted identifiers", () => {
    const sql = buildOrphanQuery(rel());
    expect(sql).toContain('from "tasks" c');
    expect(sql).toContain('left join "projects" p on c."projectid" = p."id"');
    expect(sql).toContain('where c."projectid" is not null and p."id" is null');
  });

  it("refuses to build SQL from an unsafe identifier", () => {
    expect(() => buildOrphanQuery(rel({ child: 'x"; drop table y --' }))).toThrow();
  });
});

describe("buildTenantQuery", () => {
  it("compares the child's tenant column against the parent's", () => {
    const sql = buildTenantQuery(rel(), "companyid");
    expect(sql).toContain('c."companyid" <> p."companyid"');
  });
});

describe("probeIntegrity", () => {
  function conn(handler: (sql: string) => Record<string, unknown>[]) {
    return { async query(sql: string) { return handler(sql); }, async close() {} };
  }

  it("returns the orphan count for a probed relationship", async () => {
    const results = await probeIntegrity(
      conn((sql) => (sql.includes("orphans") ? [{ orphans: "412" }] : [])),
      [rel()],
      { rowCounts: new Map([["tasks", 5000]]) },
    );
    expect(results[0]?.orphanRows).toBe(412);
    expect(results[0]?.skipped).toBeUndefined();
  });

  it("skips an unindexed anti-join on a large table, and says why", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ indexedOnChild: false })],
      { rowCounts: new Map([["tasks", 20_000_000]]), maxUnindexedRows: 1_000_000 },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/unindexed.*20000000/i);
  });

  it("skips a relationship whose column types cannot be compared", async () => {
    const results = await probeIntegrity(
      conn(() => [{ orphans: "0" }]),
      [rel({ childColumnType: "text", parentColumnType: "uuid" })],
      { rowCounts: new Map([["tasks", 10]]) },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/text.*uuid/);
  });

  it("records a query failure as a skip rather than aborting the run", async () => {
    const results = await probeIntegrity(
      conn(() => { throw new Error("permission denied for table tasks"); }),
      [rel()],
      { rowCounts: new Map([["tasks", 10]]) },
    );
    expect(results[0]?.orphanRows).toBeNull();
    expect(results[0]?.skipped).toMatch(/permission denied/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/pg-integrity-probe.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.ts
import type { DbConnection } from "../../core/engine.js";
import { quoteIdent } from "../../core/identifiers.js";
import type { Relationship } from "../../dimensions/relationships.js";

// [SCOPE 121 / T009] BEGIN — Orphan probe types
export interface OrphanProbe {
  relationship: Relationship;
  childRows: number;
  /** null when the probe did not run; `skipped` then states why. */
  orphanRows: number | null;
  tenantMismatches: number | null;
  query: string;
  skipped?: string;
}

export interface ProbeOptions {
  rowCounts?: Map<string, number>;
  /** Above this row count an unindexed anti-join is skipped rather than run. */
  maxUnindexedRows?: number;
  /** Column used for the multi-tenant consistency check, when both sides carry it. */
  tenantColumn?: string;
}
// [SCOPE 121 / T009] END

// [SCOPE 121 / T009] BEGIN — Integrity query construction
export function buildOrphanQuery(rel: Relationship): string {
  const child = quoteIdent(rel.child);
  const parent = quoteIdent(rel.parent);
  const fk = quoteIdent(rel.childColumn);
  const pk = quoteIdent(rel.parentColumn);
  return (
    `select count(*)::bigint as orphans ` +
    `from ${child} c left join ${parent} p on c.${fk} = p.${pk} ` +
    `where c.${fk} is not null and p.${pk} is null`
  );
}

/**
 * Cross-tenant consistency: a child row whose tenant column disagrees with its
 * parent's. No foreign key can express this, so it is invisible to every
 * constraint-based check while being a data-leak class of defect.
 */
export function buildTenantQuery(
  rel: Relationship,
  tenantColumn: string,
): string {
  const child = quoteIdent(rel.child);
  const parent = quoteIdent(rel.parent);
  const fk = quoteIdent(rel.childColumn);
  const pk = quoteIdent(rel.parentColumn);
  const tenant = quoteIdent(tenantColumn);
  return (
    `select count(*)::bigint as mismatches ` +
    `from ${child} c join ${parent} p on c.${fk} = p.${pk} ` +
    `where c.${tenant} is not null and p.${tenant} is not null ` +
    `and c.${tenant} <> p.${tenant}`
  );
}

/** Planner row estimates — cheap, and accurate enough to size a probe. */
export async function estimateRowCounts(
  connection: DbConnection,
): Promise<Map<string, number>> {
  const rows = await connection.query(
    `select c.relname as table_name, greatest(c.reltuples, 0)::bigint as rows
       from pg_catalog.pg_class c
       join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind in ('r','p')`,
  );
  return new Map(
    rows.map((r) => [String(r.table_name), Number(r.rows ?? 0)]),
  );
}
// [SCOPE 121 / T009] END

// [SCOPE 121 / T009] BEGIN — Integrity probing
const DEFAULT_MAX_UNINDEXED_ROWS = 2_000_000;

function comparable(rel: Relationship): boolean {
  if (rel.childColumnType === "unknown" || rel.parentColumnType === "unknown") {
    return false;
  }
  return rel.childColumnType === rel.parentColumnType;
}

/**
 * Measure orphans for every relationship.
 *
 * Every non-probe is RECORDED with its reason. A skipped anti-join that
 * reported zero would be indistinguishable from a clean relationship, which
 * would make the most valuable dimension in this tool quietly dishonest.
 */
export async function probeIntegrity(
  connection: DbConnection,
  relationships: Relationship[],
  options: ProbeOptions = {},
): Promise<OrphanProbe[]> {
  const rowCounts = options.rowCounts ?? new Map<string, number>();
  const ceiling = options.maxUnindexedRows ?? DEFAULT_MAX_UNINDEXED_ROWS;
  const results: OrphanProbe[] = [];

  for (const relationship of relationships) {
    const childRows = rowCounts.get(relationship.child) ?? 0;
    const base: OrphanProbe = {
      relationship,
      childRows,
      orphanRows: null,
      tenantMismatches: null,
      query: "",
    };

    if (!comparable(relationship)) {
      results.push({
        ...base,
        skipped:
          `child column is ${relationship.childColumnType} but parent key is ` +
          `${relationship.parentColumnType} — the comparison would require a ` +
          "cast, which no foreign key could express either",
      });
      continue;
    }

    if (!relationship.indexedOnChild && childRows > ceiling) {
      results.push({
        ...base,
        skipped:
          `anti-join skipped: ${relationship.child}.${relationship.childColumn} ` +
          `is unindexed and ${relationship.child} holds ~${childRows} rows ` +
          `(ceiling ${ceiling}). Re-run with --deep to probe it anyway.`,
      });
      continue;
    }

    const query = buildOrphanQuery(relationship);
    try {
      const rows = await connection.query(query);
      const orphanRows = Number(rows[0]?.orphans ?? 0);

      let tenantMismatches: number | null = null;
      if (options.tenantColumn) {
        try {
          const tenantRows = await connection.query(
            buildTenantQuery(relationship, options.tenantColumn),
          );
          tenantMismatches = Number(tenantRows[0]?.mismatches ?? 0);
        } catch {
          tenantMismatches = null; // one side lacks the tenant column
        }
      }

      results.push({ ...base, query, orphanRows, tenantMismatches });
    } catch (error) {
      results.push({
        ...base,
        query,
        skipped: `probe failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }

  return results;
}
// [SCOPE 121 / T009] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/pg-integrity-probe.test.ts && npm run typecheck:dbanalyze`
Expected: 6 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.ts tests/wxdbanalyze/pg-integrity-probe.test.ts
git commit -m "feat(SCOPE-121): probe referential integrity with recorded skips"
```

---

## Task 10: Dimension 2 — integrity analysis

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/dimensions/integrity.ts`
- Test: `tests/wxdbanalyze/dimension-integrity.test.ts`

**Interfaces:**
- Consumes: `OrphanProbe` (Task 9), `Finding` (Task 1), `quoteIdent` (Task 2)
- Produces: `analyzeIntegrity(probes: OrphanProbe[]): Finding[]`

Pure. The severity of a missing foreign key is decided by its measured orphan count, not by its existence — that is the difference between a risk and an incident, and the report must not blur them.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/dimension-integrity.test.ts
import { describe, expect, it } from "vitest";
import { analyzeIntegrity } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/integrity.js";
import { validateFinding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";
import type { OrphanProbe } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/integrity.js";
import type { Relationship } from "../../_wxAI/skills/wxDBAnalyze/scripts/dimensions/relationships.js";

const rel = (over: Partial<Relationship> = {}): Relationship => ({
  child: "tasks",
  childColumn: "projectid",
  parent: "projects",
  parentColumn: "id",
  sources: ["convention"],
  childColumnNullable: true,
  childColumnType: "uuid",
  parentColumnType: "uuid",
  indexedOnChild: true,
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

  it("reports cross-tenant mismatches as a leak, not a constraint gap", () => {
    const f = find(
      analyzeIntegrity([probe({ tenantMismatches: 3 })]),
      "integrity.cross-tenant.tasks.projectid",
    )!;
    expect(f.severity).toBe("critical");
    expect(f.whyItNeedsChanging).toMatch(/no foreign key/i);
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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/dimension-integrity.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/dimensions/integrity.ts
import type { Finding, Severity, Urgency } from "../core/finding.js";
import { quoteIdent } from "../core/identifiers.js";
import type { OrphanProbe } from "../engines/postgres/integrity.js";
import type { Relationship } from "./relationships.js";

// [SCOPE 121 / T010] BEGIN — Integrity remediation builders
function constraintName(rel: Relationship): string {
  return `${rel.child}_${rel.childColumn}_fkey`;
}

function indexName(rel: Relationship): string {
  return `idx_${rel.child}_${rel.childColumn}`;
}

/**
 * Two-phase FK repair. ADD CONSTRAINT ... NOT VALID takes only a brief
 * SHARE ROW EXCLUSIVE lock and stops NEW bad rows immediately; VALIDATE then
 * scans without blocking writes.
 *
 * VALIDATE is omitted when orphans exist, because it would fail against them.
 * Emitting a statement we know will error would make the apply path
 * untrustworthy, and cleaning orphans is a business decision — delete or
 * re-parent — that does not belong to this tool.
 */
function addForeignKey(rel: Relationship, orphans: number | null): string[] {
  const name = quoteIdent(constraintName(rel));
  const statements = [
    `alter table ${quoteIdent(rel.child)} add constraint ${name} ` +
      `foreign key (${quoteIdent(rel.childColumn)}) references ` +
      `${quoteIdent(rel.parent)} (${quoteIdent(rel.parentColumn)}) not valid;`,
  ];
  if (orphans === 0) {
    statements.push(
      `alter table ${quoteIdent(rel.child)} validate constraint ${name};`,
    );
  }
  return statements;
}
// [SCOPE 121 / T010] END

// [SCOPE 121 / T010] BEGIN — Integrity findings
function missingFk(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const orphans = probe.orphanRows;
  const measured = orphans !== null;
  const hasOrphans = measured && orphans > 0;

  const severity: Severity = hasOrphans
    ? "critical"
    : measured
      ? "medium"
      : "high";
  const urgency: Urgency = hasOrphans
    ? "immediate"
    : measured
      ? "scheduled"
      : "scheduled";

  const observation = measured
    ? `${rel.child}.${rel.childColumn} references ${rel.parent}.${rel.parentColumn} ` +
      `(asserted by ${rel.sources.join(" + ")}) but no foreign key enforces it. ` +
      `${orphans} of ~${probe.childRows} rows are orphaned.`
    : `${rel.child}.${rel.childColumn} references ${rel.parent}.${rel.parentColumn} ` +
      `(asserted by ${rel.sources.join(" + ")}) but no foreign key enforces it. ` +
      `Orphans were not measured — ${probe.skipped ?? "probe did not run"}.`;

  return {
    id: `integrity.missing-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "missing-fk",
    subject: `${rel.child}.${rel.childColumn}`,
    observation,
    evidence: {
      query: probe.query || "anti-join not executed",
      rows: [
        {
          child: rel.child,
          column: rel.childColumn,
          parent: rel.parent,
          orphans: orphans ?? "not measured",
          child_rows: probe.childRows,
          asserted_by: rel.sources.join(","),
        },
      ],
    },
    whyItNeedsChanging: hasOrphans
      ? `Nothing stops a ${rel.child} row pointing at a ${rel.parent} that no ` +
        `longer exists, and ${orphans} rows already do. Any join to ` +
        `${rel.parent} silently drops those rows, so they vanish from lists and ` +
        "aggregates rather than raising an error anyone would notice."
      : `Nothing prevents a ${rel.child} row from pointing at a deleted ` +
        `${rel.parent}. The data is currently consistent, which means the gap ` +
        "is a latent defect rather than an active one — the next parent " +
        "deletion is what creates the orphan.",
    businessImpact: hasOrphans
      ? `${orphans} rows are already unreachable through their parent. Any ` +
        `per-${rel.parent} count, total or report built on a join undercounts ` +
        "by that amount, silently."
      : `A single ${rel.parent} deletion converts every referencing ` +
        `${rel.child} row into an invisible orphan.`,
    severity,
    urgency,
    remediation: {
      statements: addForeignKey(rel, orphans),
      fixClass: "additive-safe",
      lockClass: "SHARE ROW EXCLUSIVE, held briefly",
      estimatedDuration: hasOrphans
        ? "milliseconds — NOT VALID does not scan existing rows"
        : `NOT VALID is instant; VALIDATE scans ~${probe.childRows} rows without blocking writes`,
      rollback: `alter table ${quoteIdent(rel.child)} drop constraint ${quoteIdent(constraintName(rel))};`,
    },
    fixRisk: hasOrphans
      ? "NOT VALID is safe and immediate, but it does not repair the existing " +
        `${orphans} orphans — those are emitted separately for manual handling, ` +
        "because deleting versus re-parenting is a business decision."
      : "Brief lock on the child table; the validating scan does not block reads or writes.",
    doingNothing: hasOrphans
      ? "The orphan count grows with every parent deletion, and the affected " +
        "rows stay invisible to anyone reading through the parent."
      : "The relationship stays unenforced; correctness depends entirely on " +
        "application code getting every deletion path right, forever.",
    confidence: measured ? "proven" : "inferred",
  };
}

function undeclaredFk(rel: Relationship): Finding {
  return {
    id: `integrity.undeclared-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "undeclared-fk",
    subject: `${rel.child}.${rel.childColumn}`,
    observation:
      `Constraint ${rel.constraintName} enforces ${rel.child}.${rel.childColumn} ` +
      `-> ${rel.parent}.${rel.parentColumn} with ON DELETE ` +
      `${rel.onDelete ?? "no action"}, but no schema source declares it.`,
    evidence: {
      query: "select conname, confdeltype from pg_catalog.pg_constraint where contype = 'f'",
      rows: [
        {
          constraint: rel.constraintName,
          child: rel.child,
          parent: rel.parent,
          on_delete: rel.onDelete ?? "no action",
        },
      ],
    },
    whyItNeedsChanging:
      `The database will apply ON DELETE ${rel.onDelete ?? "no action"} when a ` +
      `${rel.parent} row is removed, and no code declares that behaviour. A ` +
      "cascade the application does not know about deletes rows nobody expected " +
      "to lose; a restrict it does not know about turns an ordinary delete into " +
      "an unexplained constraint error.",
    businessImpact:
      `Deletion behaviour for ${rel.child} is decided by the database and is ` +
      "invisible in code review.",
    severity: rel.onDelete === "cascade" ? "high" : "medium",
    urgency: "scheduled",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a — code change only",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Declaring the existing constraint in the ORM is inert at runtime; the " +
      "risk is declaring a different action than the one deployed.",
    doingNothing:
      "The gap between declared and enforced deletion semantics persists, and " +
      "the next person to read the schema in code will be misled.",
    confidence: "proven",
  };
}

function unindexedFk(rel: Relationship, childRows: number): Finding {
  return {
    id: `integrity.unindexed-fk.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "unindexed-fk",
    subject: `${rel.child}.${rel.childColumn}`,
    observation:
      `${rel.child}.${rel.childColumn} references ${rel.parent} but has no ` +
      `index; ${rel.child} holds ~${childRows} rows.`,
    evidence: {
      query: "select indkey from pg_catalog.pg_index where indrelid = $child",
      rows: [{ child: rel.child, column: rel.childColumn, rows: childRows, indexed: false }],
    },
    whyItNeedsChanging:
      `Every delete or key update on ${rel.parent} must scan all ~${childRows} ` +
      `rows of ${rel.child} to check for referencing rows, and it holds a lock ` +
      "for the duration of that scan. The cost falls on the parent's writes, " +
      "which is why it is easy to miss when profiling the child.",
    businessImpact:
      `Deleting a ${rel.parent} is slow and blocks concurrent writes to ` +
      `${rel.child} for the length of the scan.`,
    severity: childRows > 100_000 ? "high" : "medium",
    urgency: childRows > 100_000 ? "scheduled" : "deferred",
    remediation: {
      statements: [
        `create index concurrently ${quoteIdent(indexName(rel))} on ` +
          `${quoteIdent(rel.child)} (${quoteIdent(rel.childColumn)});`,
      ],
      fixClass: "additive-safe",
      lockClass: "SHARE UPDATE EXCLUSIVE — concurrent build, does not block writes",
      estimatedDuration: `proportional to ~${childRows} rows; runs online`,
      rollback: `drop index concurrently ${quoteIdent(indexName(rel))};`,
    },
    fixRisk:
      "CREATE INDEX CONCURRENTLY cannot run inside a transaction block and " +
      "leaves an INVALID index behind if it fails, which must then be dropped. " +
      "It does not block reads or writes while building.",
    doingNothing:
      `Parent deletions stay slow and get slower as ${rel.child} grows.`,
    confidence: "proven",
  };
}

function crossTenant(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  const count = probe.tenantMismatches ?? 0;
  return {
    id: `integrity.cross-tenant.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "cross-tenant",
    subject: `${rel.child}.${rel.childColumn}`,
    observation:
      `${count} ${rel.child} rows carry a tenant that disagrees with their ` +
      `parent ${rel.parent} row.`,
    evidence: {
      query: probe.query,
      rows: [{ child: rel.child, parent: rel.parent, mismatches: count }],
    },
    whyItNeedsChanging:
      "No foreign key can express this — a constraint checks that the parent " +
      "exists, not that it belongs to the same tenant. Any query filtering by " +
      "tenant on the child while joining through the parent (or the reverse) " +
      "returns rows belonging to a different customer.",
    businessImpact:
      "Cross-tenant data exposure: one customer can see another customer's " +
      "rows through whichever of the two paths disagrees.",
    severity: "critical",
    urgency: "immediate",
    remediation: {
      statements: [],
      fixClass: "manual-only",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Correcting the tenant on an affected row moves data between customers; " +
      "it must be decided per row, not applied in bulk.",
    doingNothing:
      "The exposure persists and grows with every write that repeats the defect.",
    confidence: "proven",
  };
}

function notProbed(probe: OrphanProbe): Finding {
  const rel = probe.relationship;
  return {
    id: `integrity.not-probed.${rel.child}.${rel.childColumn}`,
    dimension: "integrity",
    rule: "not-probed",
    subject: `${rel.child}.${rel.childColumn}`,
    observation:
      `Orphans for ${rel.child}.${rel.childColumn} -> ${rel.parent} were not ` +
      `measured: ${probe.skipped}.`,
    evidence: {
      query: probe.query || "not executed",
      rows: [{ child: rel.child, column: rel.childColumn, reason: probe.skipped ?? "unknown" }],
    },
    whyItNeedsChanging:
      "This relationship is unverified, not verified-clean. Treating an " +
      "unmeasured link as healthy is how an audit reports green while proving " +
      "nothing about the rows it never looked at.",
    businessImpact:
      "The integrity of this relationship is unknown; it may hold orphans " +
      "nobody has counted.",
    severity: "info",
    urgency: "deferred",
    remediation: {
      statements: [],
      fixClass: "none",
      lockClass: "n/a",
      estimatedDuration: "n/a",
      rollback: "n/a",
    },
    fixRisk:
      "Re-running with --deep executes the anti-join and may be slow on a " +
      "large unindexed table.",
    doingNothing: "This relationship remains unaudited.",
    confidence: "proven",
  };
}
// [SCOPE 121 / T010] END

// [SCOPE 121 / T010] BEGIN — Integrity analysis
/** Turn orphan probes into contract-complete findings. */
export function analyzeIntegrity(probes: OrphanProbe[]): Finding[] {
  const findings: Finding[] = [];

  for (const probe of probes) {
    const rel = probe.relationship;
    const enforced = rel.sources.includes("live");

    if (!enforced) findings.push(missingFk(probe));
    if (enforced && !rel.sources.includes("declared")) {
      findings.push(undeclaredFk(rel));
    }
    if (!rel.indexedOnChild) findings.push(unindexedFk(rel, probe.childRows));
    if ((probe.tenantMismatches ?? 0) > 0) findings.push(crossTenant(probe));
    if (probe.skipped && enforced) findings.push(notProbed(probe));
  }

  return findings;
}
// [SCOPE 121 / T010] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/dimension-integrity.test.ts && npm run typecheck:dbanalyze`
Expected: 10 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/dimensions/integrity.ts tests/wxdbanalyze/dimension-integrity.test.ts
git commit -m "feat(SCOPE-121): turn integrity probes into contract-complete findings"
```

---

## Task 11: Apply policy and the additive whitelist

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/policy.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/ddl-classifier.ts`
- Test: `tests/wxdbanalyze/policy.test.ts`
- Test: `tests/wxdbanalyze/ddl-classifier.test.ts`

**Interfaces:**
- Consumes: `EngineId` (Task 3)
- Produces: `ApplyMode`, `ApplyPolicy`, `resolveApplyPolicy(raw: unknown): ApplyPolicy`, `loadApplyPolicy(cwd: string): Promise<ApplyPolicy>`, `DdlClass`, `Classification`, `classifyStatement(engine: EngineId, sql: string): Classification`

This is the safety-critical pair. Both are pure and both are tested adversarially — the classifier's job is to be hard to trick, so the tests try to trick it.

- [ ] **Step 1: Write the failing classifier test**

```ts
// tests/wxdbanalyze/ddl-classifier.test.ts
import { describe, expect, it } from "vitest";
import { classifyStatement } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/ddl-classifier.js";

const pg = (sql: string) => classifyStatement("postgres", sql);

describe("classifyStatement — additive-safe", () => {
  it.each([
    "create table foo (id uuid primary key)",
    "CREATE TABLE IF NOT EXISTS foo (id uuid)",
    'alter table "tasks" add column "note" text',
    'alter table "tasks" add column "note" text default \'\'',
    'create index concurrently "idx_a" on "tasks" ("projectid")',
    'alter table "tasks" add constraint "fk" foreign key ("projectid") references "projects" ("id") not valid',
    'alter table "tasks" validate constraint "fk"',
    "comment on table foo is 'x'",
  ])("accepts %s", (sql) => {
    expect(pg(sql).class).toBe("additive-safe");
  });
});

describe("classifyStatement — refused", () => {
  it.each([
    ["drop table foo", "destructive"],
    ['alter table "tasks" drop column "note"', "destructive"],
    ['alter table "tasks" alter column "id" type text', "destructive"],
    ['alter table "tasks" alter column "name" set not null', "destructive"],
    ['alter table "tasks" rename to "jobs"', "destructive"],
    ["truncate tasks", "destructive"],
    ["delete from tasks", "destructive"],
    ["update tasks set x = 1", "destructive"],
  ])("refuses %s as %s", (sql, expected) => {
    expect(pg(sql).class).toBe(expected);
  });

  it("refuses a non-concurrent CREATE INDEX because it blocks writes", () => {
    expect(pg('create index "idx_a" on "tasks" ("projectid")').class).toBe(
      "destructive",
    );
    expect(pg('create index "idx_a" on "tasks" ("projectid")').reason).toMatch(
      /concurrently/i,
    );
  });

  it("refuses ADD COLUMN NOT NULL without a default, which rewrites and can fail", () => {
    const c = pg('alter table "tasks" add column "note" text not null');
    expect(c.class).toBe("destructive");
    expect(c.reason).toMatch(/not null/i);
  });

  it("refuses anything it does not recognise rather than allowing it", () => {
    expect(pg("vacuum full tasks").class).toBe("unrecognised");
    expect(pg("do $$ begin end $$").class).toBe("unrecognised");
  });
});

describe("classifyStatement — smuggling", () => {
  it("refuses two statements in one string", () => {
    const c = pg("create table foo (id uuid); drop table bar");
    expect(c.class).not.toBe("additive-safe");
    expect(c.reason).toMatch(/one statement/i);
  });

  it("refuses a statement hidden behind a line comment", () => {
    const c = pg("create table foo (id uuid); -- ok\ndrop table bar");
    expect(c.class).not.toBe("additive-safe");
  });

  it("refuses a statement hidden behind a block comment", () => {
    const c = pg("/* create table foo */ drop table bar");
    expect(c.class).toBe("destructive");
  });

  it("allows exactly one trailing semicolon", () => {
    expect(pg("create table foo (id uuid);").class).toBe("additive-safe");
  });

  it("refuses an empty statement", () => {
    expect(pg("   ").class).toBe("unrecognised");
  });
});

describe("classifyStatement — per engine", () => {
  it("refuses NOT VALID on Firebird, which has no deferred validation", () => {
    const c = classifyStatement(
      "firebird",
      'alter table "tasks" add constraint "fk" foreign key ("projectid") references "projects" ("id") not valid',
    );
    expect(c.class).not.toBe("additive-safe");
  });

  it("refuses every statement on an engine with no whitelist", () => {
    expect(classifyStatement("oracle", "create table foo (id number)").class).toBe(
      "unrecognised",
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/ddl-classifier.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the classifier**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/ddl-classifier.ts
import type { EngineId } from "./engine.js";

// [SCOPE 121 / T011] BEGIN — DDL classification types
export type DdlClass = "additive-safe" | "destructive" | "unrecognised";

export interface Classification {
  class: DdlClass;
  reason: string;
  lockClass: string;
}

interface Rule {
  pattern: RegExp;
  /** A statement matching `pattern` is refused when `veto` also matches. */
  veto?: { pattern: RegExp; reason: string };
  lockClass: string;
  reason: string;
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Statement normalisation
/**
 * Strip comments and normalise whitespace so classification sees the statement
 * the server will see. Comments are removed BEFORE the single-statement check,
 * because `create table x; -- ok\ndrop table y` is two statements wearing a
 * comment as a disguise.
 */
function normalise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text contains exactly one statement, ignoring a trailing `;`. */
function isSingleStatement(normalised: string): boolean {
  const body = normalised.replace(/;\s*$/, "");
  return !body.includes(";");
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Per-engine additive whitelists
const POSTGRES_RULES: Rule[] = [
  {
    pattern: /^create table (if not exists )?/i,
    lockClass: "none — new relation",
    reason: "creates a new table; touches no existing data",
  },
  {
    pattern: /^alter table .+ add column /i,
    veto: {
      pattern: /\bnot null\b(?!.*\bdefault\b)/i,
      reason:
        "ADD COLUMN NOT NULL without a DEFAULT rewrites the table and fails " +
        "outright if any row exists",
    },
    lockClass: "ACCESS EXCLUSIVE, catalog-only on PG 11+",
    reason: "adds a nullable or defaulted column without rewriting the table",
  },
  {
    pattern: /^create (unique )?index concurrently /i,
    lockClass: "SHARE UPDATE EXCLUSIVE — does not block reads or writes",
    reason: "builds the index online",
  },
  {
    pattern: /^alter table .+ add constraint .+ not valid\s*;?$/i,
    lockClass: "SHARE ROW EXCLUSIVE, held briefly",
    reason: "constrains new rows without scanning existing ones",
  },
  {
    pattern: /^alter table .+ validate constraint /i,
    lockClass: "SHARE UPDATE EXCLUSIVE — does not block writes",
    reason: "validates an existing NOT VALID constraint without blocking writes",
  },
  { pattern: /^comment on /i, lockClass: "none", reason: "metadata only" },
  {
    pattern: /^create schema (if not exists )?/i,
    lockClass: "none",
    reason: "creates a new namespace",
  },
];

/**
 * Firebird deliberately has NO foreign-key rule. It has no NOT VALID, so
 * adding a constraint validates immediately and needs effectively exclusive
 * access. "Safe" is not portable, and copying the Postgres list here would
 * apply a blocking statement to a customer's live database.
 */
const FIREBIRD_RULES: Rule[] = [
  {
    pattern: /^create table /i,
    lockClass: "none — new relation",
    reason: "creates a new table",
  },
  {
    pattern: /^alter table .+ add /i,
    veto: {
      pattern: /\b(not null|constraint)\b/i,
      reason:
        "Firebird validates NOT NULL and constraint additions immediately, " +
        "requiring exclusive access on a live table",
    },
    lockClass: "metadata lock",
    reason: "adds a nullable column",
  },
];

const DESTRUCTIVE_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/^drop /i, "DROP removes an object and its data"],
  [/^truncate /i, "TRUNCATE removes all rows"],
  [/^delete from /i, "DELETE modifies data"],
  [/^update /i, "UPDATE modifies data"],
  [/\balter column\b/i, "ALTER COLUMN can rewrite the table and change semantics"],
  [/\bdrop column\b/i, "DROP COLUMN removes data"],
  [/\brename\b/i, "RENAME breaks every existing reference to the old name"],
  [
    /^create (unique )?index (?!concurrently)/i,
    "CREATE INDEX without CONCURRENTLY holds a lock that blocks writes for the build",
  ],
];

const WHITELISTS: Partial<Record<EngineId, Rule[]>> = {
  postgres: POSTGRES_RULES,
  firebird: FIREBIRD_RULES,
};
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Statement classification
const REFUSED_LOCK = "n/a — statement refused";

/**
 * Classify one DDL statement for one engine.
 *
 * Default-deny: a statement is additive-safe only if it matches an explicit
 * rule for that engine. Everything else is refused, including statements this
 * classifier simply does not recognise. Permitting the unrecognised case would
 * mean the whitelist protects only against mistakes it already anticipated.
 */
export function classifyStatement(
  engine: EngineId,
  sql: string,
): Classification {
  const normalised = normalise(sql);

  if (normalised.length === 0) {
    return { class: "unrecognised", reason: "empty statement", lockClass: REFUSED_LOCK };
  }

  if (!isSingleStatement(normalised)) {
    return {
      class: "unrecognised",
      reason:
        "refused: the text contains more than one statement. Exactly one " +
        "statement is classified and applied at a time.",
      lockClass: REFUSED_LOCK,
    };
  }

  for (const [pattern, reason] of DESTRUCTIVE_HINTS) {
    if (pattern.test(normalised)) {
      return { class: "destructive", reason, lockClass: REFUSED_LOCK };
    }
  }

  for (const rule of WHITELISTS[engine] ?? []) {
    if (!rule.pattern.test(normalised)) continue;
    if (rule.veto?.pattern.test(normalised)) {
      return {
        class: "destructive",
        reason: rule.veto.reason,
        lockClass: REFUSED_LOCK,
      };
    }
    return { class: "additive-safe", reason: rule.reason, lockClass: rule.lockClass };
  }

  return {
    class: "unrecognised",
    reason:
      `no additive rule for ${engine} matches this statement, so it is ` +
      "refused by default",
    lockClass: REFUSED_LOCK,
  };
}
// [SCOPE 121 / T011] END
```

- [ ] **Step 4: Write the failing policy test**

```ts
// tests/wxdbanalyze/policy.test.ts
import { describe, expect, it } from "vitest";
import { resolveApplyPolicy } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/policy.js";

describe("resolveApplyPolicy", () => {
  it("defaults to approve-each when no policy file exists", () => {
    expect(resolveApplyPolicy(undefined)).toEqual({
      mode: "approve-each",
      source: "default (no .wxai/db-policy.json)",
    });
  });

  it.each(["manual", "approve-each", "auto-additive"] as const)(
    "accepts the %s mode",
    (mode) => {
      expect(resolveApplyPolicy({ apply: { mode } }).mode).toBe(mode);
    },
  );

  it("throws on an unknown mode rather than falling back", () => {
    expect(() => resolveApplyPolicy({ apply: { mode: "yolo" } })).toThrow(/yolo/);
  });

  it("throws when apply.mode is missing from a present policy file", () => {
    expect(() => resolveApplyPolicy({ apply: {} })).toThrow(/apply\.mode/);
  });

  it("reports the file as the source when one was read", () => {
    expect(resolveApplyPolicy({ apply: { mode: "manual" } }).source).toMatch(
      /db-policy\.json/,
    );
  });
});
```

- [ ] **Step 5: Write the policy module**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/policy.ts

// [SCOPE 121 / T011] BEGIN — Apply policy resolution
export type ApplyMode = "manual" | "approve-each" | "auto-additive";

export interface ApplyPolicy {
  mode: ApplyMode;
  source: string;
}

const MODES: ReadonlySet<string> = new Set([
  "manual",
  "approve-each",
  "auto-additive",
]);

const DEFAULT_SOURCE = "default (no .wxai/db-policy.json)";

/**
 * Resolve the apply mode from parsed policy JSON.
 *
 * Absent a file the mode is `approve-each` — the skill asks before it writes.
 * A file that IS present but malformed throws rather than falling back: a typo
 * silently downgrading to a permissive default is the one failure this
 * function exists to prevent.
 */
export function resolveApplyPolicy(raw: unknown): ApplyPolicy {
  if (raw === undefined || raw === null) {
    return { mode: "approve-each", source: DEFAULT_SOURCE };
  }

  const apply = (raw as { apply?: { mode?: unknown } }).apply;
  const mode = apply?.mode;

  if (typeof mode !== "string") {
    throw new Error(
      ".wxai/db-policy.json is present but apply.mode is missing — set it to " +
        "one of: manual, approve-each, auto-additive",
    );
  }
  if (!MODES.has(mode)) {
    throw new Error(
      `.wxai/db-policy.json declares an unknown apply.mode ${JSON.stringify(mode)} — ` +
        "valid values: manual, approve-each, auto-additive",
    );
  }

  return { mode: mode as ApplyMode, source: ".wxai/db-policy.json" };
}

/** Read and resolve the policy from a project root. */
export async function loadApplyPolicy(cwd: string): Promise<ApplyPolicy> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const text = await readFile(join(cwd, ".wxai", "db-policy.json"), "utf8");
    return resolveApplyPolicy(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return resolveApplyPolicy(undefined);
    }
    throw error;
  }
}
// [SCOPE 121 / T011] END
```

- [ ] **Step 6: Run both suites and typecheck**

Run: `npx vitest run tests/wxdbanalyze/ddl-classifier.test.ts tests/wxdbanalyze/policy.test.ts && npm run typecheck:dbanalyze`
Expected: 26 tests PASS, typecheck exits 0. The smuggling block is the one to watch — if any of those five pass classification as `additive-safe`, stop and fix before continuing to Task 12.

- [ ] **Step 7: Create wxKanban's own policy file**

```json
// .wxai/db-policy.json
{
  "apply": {
    "mode": "approve-each"
  }
}
```

- [ ] **Step 8: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/core/policy.ts _wxAI/skills/wxDBAnalyze/scripts/core/ddl-classifier.ts .wxai/db-policy.json tests/wxdbanalyze/policy.test.ts tests/wxdbanalyze/ddl-classifier.test.ts
git commit -m "feat(SCOPE-121): add apply policy and per-engine additive whitelist"
```

---

## Task 12: Guarded apply executor and ledger

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/apply/ledger.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/apply/apply-ddl.ts`
- Test: `tests/wxdbanalyze/apply-ddl.test.ts`

**Interfaces:**
- Consumes: `classifyStatement` (Task 11), `ApplyMode` (Task 11), `EngineId` (Task 3)
- Produces: `LedgerEntry`, `appendLedger(path, entry): Promise<void>`, `formatLedgerEntry(entry): string`, `PendingStatement`, `ApplyOutcome`, `ApplyDeps`, `applyStatements(opts): Promise<ApplyOutcome[]>`

The only writable path in the skill. It re-classifies every statement itself rather than trusting the classification its caller passed in — a guard that depends on its caller being honest is not a guard.

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/apply-ddl.test.ts
import { describe, expect, it, vi } from "vitest";
import { applyStatements } from "../../_wxAI/skills/wxDBAnalyze/scripts/apply/apply-ddl.js";
import { formatLedgerEntry } from "../../_wxAI/skills/wxDBAnalyze/scripts/apply/ledger.js";

const additive = {
  sql: 'alter table "tasks" add column "note" text',
  rationale: "declared column missing from the database",
  findingId: "schema.missing-column.tasks.note",
};
const destructive = {
  sql: 'alter table "tasks" drop column "note"',
  rationale: "column no longer declared",
  findingId: "schema.undeclared-column.tasks.note",
};

function deps(overrides: Partial<Parameters<typeof applyStatements>[0]["deps"]> = {}) {
  const executed: string[] = [];
  const ledger: string[] = [];
  return {
    executed,
    ledger,
    deps: {
      execute: vi.fn(async (sql: string) => { executed.push(sql); }),
      appendLedger: vi.fn(async (entry: { sql: string }) => { ledger.push(entry.sql); }),
      ...overrides,
    },
  };
}

describe("applyStatements", () => {
  it("refuses everything in manual mode, writing nothing", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "manual", statements: [additive], deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(out[0]?.reason).toMatch(/manual/);
    expect(executed).toEqual([]);
  });

  it("refuses a destructive statement even in auto-additive mode", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [destructive], deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(executed).toEqual([]);
  });

  it("re-classifies rather than trusting a caller-supplied verdict", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres",
      mode: "auto-additive",
      statements: [{ ...destructive, preclassified: "additive-safe" } as never],
      deps: d,
    });
    expect(out[0]?.status).toBe("refused");
    expect(executed).toEqual([]);
  });

  it("asks before applying in approve-each mode", async () => {
    const { deps: d, executed } = deps();
    const approve = vi.fn(async () => true);
    await applyStatements({
      engine: "postgres", mode: "approve-each", statements: [additive], deps: d, approve,
    });
    expect(approve).toHaveBeenCalledTimes(1);
    expect(executed).toEqual([additive.sql]);
  });

  it("skips a statement the operator rejects", async () => {
    const { deps: d, executed } = deps();
    const out = await applyStatements({
      engine: "postgres", mode: "approve-each", statements: [additive], deps: d,
      approve: async () => false,
    });
    expect(out[0]?.status).toBe("skipped");
    expect(executed).toEqual([]);
  });

  it("applies without asking in auto-additive mode", async () => {
    const { deps: d, executed } = deps();
    const approve = vi.fn(async () => true);
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d, approve,
    });
    expect(approve).not.toHaveBeenCalled();
    expect(executed).toEqual([additive.sql]);
  });

  it("records every applied statement in the ledger", async () => {
    const { deps: d, ledger } = deps();
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d,
    });
    expect(ledger).toEqual([additive.sql]);
  });

  it("halts on failure and marks the remainder skipped", async () => {
    const { deps: d } = deps({
      execute: vi.fn(async () => { throw new Error("deadlock detected"); }),
    });
    const out = await applyStatements({
      engine: "postgres", mode: "auto-additive",
      statements: [additive, { ...additive, findingId: "second" }], deps: d,
    });
    expect(out[0]?.status).toBe("failed");
    expect(out[0]?.reason).toMatch(/deadlock/);
    expect(out[1]?.status).toBe("skipped");
    expect(out[1]?.reason).toMatch(/halted/i);
  });

  it("records a failed statement in the ledger too", async () => {
    const { deps: d, ledger } = deps({
      execute: vi.fn(async () => { throw new Error("boom"); }),
    });
    await applyStatements({
      engine: "postgres", mode: "auto-additive", statements: [additive], deps: d,
    });
    expect(ledger).toEqual([additive.sql]);
  });
});

describe("formatLedgerEntry", () => {
  it("records timestamp, reason, statement and result", () => {
    const text = formatLedgerEntry({
      timestamp: "2026-08-01T10:00:00.000Z",
      sql: 'alter table "tasks" add column "note" text',
      rationale: "declared column missing",
      findingId: "schema.missing-column.tasks.note",
      result: "applied",
      mode: "approve-each",
    });
    expect(text).toContain("2026-08-01T10:00:00.000Z");
    expect(text).toContain("declared column missing");
    expect(text).toContain("applied");
    expect(text).toContain("approve-each");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/apply-ddl.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write the ledger**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/apply/ledger.ts
import type { ApplyMode } from "../core/policy.js";

// [SCOPE 121 / T012] BEGIN — Schema change ledger
export interface LedgerEntry {
  timestamp: string;
  sql: string;
  rationale: string;
  findingId: string;
  result: "applied" | "failed";
  mode: ApplyMode;
}

export function formatLedgerEntry(entry: LedgerEntry): string {
  return [
    "",
    `### ${entry.timestamp} — ${entry.result}`,
    "",
    `- **Finding**: ${entry.findingId}`,
    `- **Reason**: ${entry.rationale}`,
    `- **Applied by**: wxDBAnalyze (policy mode: ${entry.mode})`,
    "",
    "```sql",
    entry.sql.trim().replace(/;?$/, ";"),
    "```",
    "",
  ].join("\n");
}

/**
 * Append to the manual change log.
 *
 * Every applied statement is recorded in every policy mode, including
 * auto-additive. The ledger is the only record this project has — there is no
 * migration table — so an unattended apply that skipped it would leave the
 * documented history quietly wrong.
 */
export async function appendLedger(
  path: string,
  entry: LedgerEntry,
): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, formatLedgerEntry(entry), "utf8");
}
// [SCOPE 121 / T012] END
```

- [ ] **Step 4: Write the executor**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/apply/apply-ddl.ts
import { classifyStatement, type Classification } from "../core/ddl-classifier.js";
import type { EngineId } from "../core/engine.js";
import type { ApplyMode } from "../core/policy.js";
import { appendLedger, type LedgerEntry } from "./ledger.js";

// [SCOPE 121 / T012] BEGIN — Apply types
export interface PendingStatement {
  sql: string;
  rationale: string;
  findingId: string;
}

export interface ApplyOutcome {
  findingId: string;
  sql: string;
  status: "applied" | "refused" | "skipped" | "failed";
  reason: string;
}

export interface ApplyDeps {
  execute(sql: string): Promise<void>;
  appendLedger(entry: LedgerEntry): Promise<void>;
  now?(): string;
}
// [SCOPE 121 / T012] END

// [SCOPE 121 / T012] BEGIN — Guarded apply
/**
 * Apply pending DDL under the resolved policy.
 *
 * The classification is recomputed HERE. Callers assemble statements from
 * findings, and a finding is model-authored text; trusting a verdict that
 * arrived alongside the statement would make the whitelist advisory. The only
 * classification that gates a write is the one this function derives itself.
 */
export async function applyStatements(opts: {
  engine: EngineId;
  mode: ApplyMode;
  statements: PendingStatement[];
  deps: ApplyDeps;
  approve?: (
    statement: PendingStatement,
    classification: Classification,
  ) => Promise<boolean>;
}): Promise<ApplyOutcome[]> {
  const outcomes: ApplyOutcome[] = [];
  const now = opts.deps.now ?? (() => new Date().toISOString());
  let halted = false;

  for (const statement of opts.statements) {
    if (halted) {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "skipped",
        reason: "run halted after an earlier statement failed",
      });
      continue;
    }

    if (opts.mode === "manual") {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "refused",
        reason:
          "policy mode is manual — the statement is emitted for hand " +
          "application and nothing is executed",
      });
      continue;
    }

    const classification = classifyStatement(opts.engine, statement.sql);
    if (classification.class !== "additive-safe") {
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "refused",
        reason: `${classification.class}: ${classification.reason}`,
      });
      continue;
    }

    if (opts.mode === "approve-each") {
      const approved = opts.approve
        ? await opts.approve(statement, classification)
        : false;
      if (!approved) {
        outcomes.push({
          findingId: statement.findingId,
          sql: statement.sql,
          status: "skipped",
          reason: opts.approve
            ? "not approved by the operator"
            : "approve-each mode requires an approval callback; none was supplied",
        });
        continue;
      }
    }

    try {
      await opts.deps.execute(statement.sql);
      await opts.deps.appendLedger({
        timestamp: now(),
        sql: statement.sql,
        rationale: statement.rationale,
        findingId: statement.findingId,
        result: "applied",
        mode: opts.mode,
      });
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "applied",
        reason: classification.reason,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await opts.deps.appendLedger({
        timestamp: now(),
        sql: statement.sql,
        rationale: statement.rationale,
        findingId: statement.findingId,
        result: "failed",
        mode: opts.mode,
      });
      outcomes.push({
        findingId: statement.findingId,
        sql: statement.sql,
        status: "failed",
        reason: message,
      });
      halted = true;
    }
  }

  return outcomes;
}
// [SCOPE 121 / T012] END

// [SCOPE 121 / T012] BEGIN — Writable connection
/**
 * The single writable connection in this skill. Deliberately separate from the
 * read-only probe path so that "can this code write?" is answerable by looking
 * at which module opened the handle.
 */
export async function createApplyDeps(
  url: string,
  ledgerPath: string,
): Promise<ApplyDeps & { close(): Promise<void> }> {
  const { loadPostgresDriver } = await import("../engines/postgres/connect.js");
  const factory = await loadPostgresDriver();
  const sql = factory(url, { prepare: false, max: 1 });

  return {
    async execute(text: string) {
      // Each statement in its own transaction: a failure rolls back exactly
      // one change, and everything already applied stays applied and logged.
      await sql.unsafe(`begin; ${text.replace(/;?\s*$/, "")}; commit;`);
    },
    async appendLedger(entry: LedgerEntry) {
      await appendLedger(ledgerPath, entry);
    },
    async close() {
      await sql.end({ timeout: 5 });
    },
  };
}
// [SCOPE 121 / T012] END
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/apply-ddl.test.ts && npm run typecheck:dbanalyze`
Expected: 10 tests PASS, typecheck exits 0.

- [ ] **Step 6: Prove the guard refuses before trusting it to accept**

Run:

```bash
npx tsx -e "import('./_wxAI/skills/wxDBAnalyze/scripts/apply/apply-ddl.js').then(async m=>{const calls=[];const deps={execute:async s=>{calls.push(s)},appendLedger:async()=>{}};for(const mode of ['manual','approve-each','auto-additive']){const out=await m.applyStatements({engine:'postgres',mode,statements:[{sql:'drop table users',rationale:'x',findingId:'y'}],deps,approve:async()=>true});console.log(mode,'->',out[0].status,'|',out[0].reason.slice(0,60))}console.log('statements executed:',calls.length)})"
```

Expected: `refused` in all three modes and `statements executed: 0`. If any mode executes a `drop table`, stop — the whitelist is not holding.

- [ ] **Step 7: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/apply/ tests/wxdbanalyze/apply-ddl.test.ts
git commit -m "feat(SCOPE-121): add guarded additive-only apply path with ledger"
```

---

## Task 13: Report rendering

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/core/report.ts`
- Test: `tests/wxdbanalyze/report.test.ts`

**Interfaces:**
- Consumes: `Finding`, `RejectedFinding` (Task 1), `EngineId`, `SupportLevel`, `DimensionId` (Task 3)
- Produces: `DimensionStatus`, `AnalysisReport`, `rankFindings(findings): Finding[]`, `renderTerminal(report): string`, `renderMarkdown(report): string`, `writeReport(dir: string, report: AnalysisReport, snapshot: unknown): Promise<ReportPaths>`, `ReportPaths`

- [ ] **Step 1: Write the failing test**

```ts
// tests/wxdbanalyze/report.test.ts
import { describe, expect, it } from "vitest";
import {
  rankFindings,
  renderMarkdown,
  renderTerminal,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/report.js";
import type { Finding } from "../../_wxAI/skills/wxDBAnalyze/scripts/core/finding.js";

const f = (over: Partial<Finding>): Finding => ({
  id: "x", dimension: "schema", rule: "r", subject: "s",
  observation: "obs", evidence: { query: "select 1", rows: [] },
  whyItNeedsChanging: "why", businessImpact: "impact",
  severity: "medium", urgency: "scheduled",
  remediation: { statements: [], fixClass: "none", lockClass: "n/a", estimatedDuration: "n/a", rollback: "n/a" },
  fixRisk: "risk", doingNothing: "nothing", confidence: "proven",
  ...over,
});

const report = (over = {}) => ({
  runAt: "2026-08-01T10:00:00.000Z",
  engine: "postgres" as const,
  database: "wxkanban",
  dimensions: [
    { id: "schema" as const, support: "full" as const },
    { id: "performance" as const, support: "not-implemented" as const, note: "lands in Phase 2" },
  ],
  findings: [f({ id: "a", severity: "critical", urgency: "immediate" })],
  rejected: [],
  ...over,
});

describe("rankFindings", () => {
  it("orders by severity, then urgency", () => {
    const ranked = rankFindings([
      f({ id: "low", severity: "low", urgency: "deferred" }),
      f({ id: "crit", severity: "critical", urgency: "immediate" }),
      f({ id: "high-def", severity: "high", urgency: "deferred" }),
      f({ id: "high-now", severity: "high", urgency: "immediate" }),
    ]);
    expect(ranked.map((x) => x.id)).toEqual(["crit", "high-now", "high-def", "low"]);
  });
});

describe("renderTerminal", () => {
  it("leads with the severity counts", () => {
    expect(renderTerminal(report())).toMatch(/1 critical/);
  });

  it("prints the why for each finding, not only the observation", () => {
    const text = renderTerminal(report());
    expect(text).toContain("why");
    expect(text).toContain("impact");
  });

  it("lists dimensions that did not run, so the gap is visible", () => {
    const text = renderTerminal(report());
    expect(text).toMatch(/performance.*not-implemented/i);
    expect(text).toContain("lands in Phase 2");
  });

  it("reports rejected findings rather than hiding them", () => {
    const text = renderTerminal(
      report({ rejected: [{ id: "bad", missingFields: ["whyItNeedsChanging"] }] }),
    );
    expect(text).toMatch(/1 finding was withheld/i);
    expect(text).toContain("whyItNeedsChanging");
  });

  it("says so plainly when nothing was found", () => {
    expect(renderTerminal(report({ findings: [] }))).toMatch(/no findings/i);
  });
});

describe("renderMarkdown", () => {
  it("includes every contract field for each finding", () => {
    const md = renderMarkdown(report());
    for (const label of [
      "Why it needs changing", "Business impact", "Severity", "Urgency",
      "Remediation", "Fix risk", "Doing nothing", "Confidence", "Evidence",
    ]) {
      expect(md).toContain(label);
    }
  });

  it("renders remediation SQL in a sql code fence", () => {
    const md = renderMarkdown(
      report({
        findings: [f({ remediation: { statements: ["alter table x add column y text;"], fixClass: "additive-safe", lockClass: "brief", estimatedDuration: "ms", rollback: "drop" } })],
      }),
    );
    expect(md).toContain("```sql");
    expect(md).toContain("alter table x add column y text;");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/report.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// _wxAI/skills/wxDBAnalyze/scripts/core/report.ts
import type { EngineId, SupportLevel } from "./engine.js";
import type {
  DimensionId,
  Finding,
  RejectedFinding,
  Severity,
  Urgency,
} from "./finding.js";

// [SCOPE 121 / T013] BEGIN — Report types
export interface DimensionStatus {
  id: DimensionId;
  support: SupportLevel;
  note?: string;
}

export interface AnalysisReport {
  runAt: string;
  engine: EngineId;
  database: string;
  dimensions: DimensionStatus[];
  findings: Finding[];
  rejected: RejectedFinding[];
}

export interface ReportPaths {
  reportPath: string;
  latestPath: string;
  snapshotPath: string;
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Ranking
const SEVERITY_ORDER: Record<Severity, number> = {
  critical: 0, high: 1, medium: 2, low: 3, info: 4,
};
const URGENCY_ORDER: Record<Urgency, number> = {
  immediate: 0, scheduled: 1, deferred: 2, none: 3,
};

/**
 * Severity first, then urgency. They are ranked separately because they answer
 * different questions — how bad is it, and when must it be dealt with — and a
 * single blended score would lose the scheduling information.
 */
export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort(
    (a, b) =>
      SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
      URGENCY_ORDER[a.urgency] - URGENCY_ORDER[b.urgency] ||
      a.id.localeCompare(b.id),
  );
}

function severityCounts(findings: Finding[]): string {
  const counts = new Map<Severity, number>();
  for (const f of findings) counts.set(f.severity, (counts.get(f.severity) ?? 0) + 1);
  return (["critical", "high", "medium", "low", "info"] as Severity[])
    .filter((s) => counts.has(s))
    .map((s) => `${counts.get(s)} ${s}`)
    .join(", ");
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Renderers
export function renderTerminal(report: AnalysisReport): string {
  const lines: string[] = [
    `wxDBAnalyze — ${report.database} (${report.engine}) — ${report.runAt}`,
    "",
  ];

  const ranked = rankFindings(report.findings);
  lines.push(
    ranked.length === 0
      ? "No findings. Every dimension that ran found nothing to report."
      : `${ranked.length} findings: ${severityCounts(ranked)}`,
    "",
  );

  let currentDimension = "";
  for (const finding of ranked) {
    if (finding.dimension !== currentDimension) {
      currentDimension = finding.dimension;
      lines.push(`── ${currentDimension} ──`);
    }
    lines.push(
      `  [${finding.severity}/${finding.urgency}] ${finding.subject} — ${finding.observation}`,
      `      why: ${finding.whyItNeedsChanging}`,
      `      impact: ${finding.businessImpact}`,
      `      fix: ${finding.remediation.fixClass}`,
      "",
    );
  }

  const notRun = report.dimensions.filter((d) => d.support !== "full");
  if (notRun.length > 0) {
    lines.push("Dimensions that did not run in full:");
    for (const d of notRun) {
      lines.push(`  - ${d.id}: ${d.support}${d.note ? ` — ${d.note}` : ""}`);
    }
    lines.push("");
  }

  if (report.rejected.length > 0) {
    lines.push(
      `${report.rejected.length} finding was withheld for failing the finding ` +
        "contract — this is a defect in the analyser, not a clean result:",
    );
    for (const r of report.rejected) {
      lines.push(`  - ${r.id}: missing ${r.missingFields.join(", ")}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

export function renderMarkdown(report: AnalysisReport): string {
  const ranked = rankFindings(report.findings);
  const out: string[] = [
    `# Database Analysis — ${report.database}`,
    "",
    `**Engine**: ${report.engine}  `,
    `**Run at**: ${report.runAt}  `,
    `**Findings**: ${ranked.length === 0 ? "none" : severityCounts(ranked)}`,
    "",
    "## Dimension coverage",
    "",
    "| Dimension | Support | Note |",
    "| --- | --- | --- |",
    ...report.dimensions.map(
      (d) => `| ${d.id} | ${d.support} | ${d.note ?? ""} |`,
    ),
    "",
    "## Findings",
    "",
  ];

  if (ranked.length === 0) out.push("No findings.", "");

  for (const f of ranked) {
    out.push(
      `### ${f.severity.toUpperCase()} — ${f.subject}`,
      "",
      `**Rule**: \`${f.dimension}.${f.rule}\`  `,
      `**Severity**: ${f.severity}  `,
      `**Urgency**: ${f.urgency}  `,
      `**Confidence**: ${f.confidence}`,
      "",
      f.observation,
      "",
      `**Why it needs changing**: ${f.whyItNeedsChanging}`,
      "",
      `**Business impact**: ${f.businessImpact}`,
      "",
      `**Doing nothing**: ${f.doingNothing}`,
      "",
      `**Remediation** (${f.remediation.fixClass}, lock: ${f.remediation.lockClass}, ` +
        `duration: ${f.remediation.estimatedDuration})`,
      "",
    );
    if (f.remediation.statements.length > 0) {
      out.push("```sql", ...f.remediation.statements, "```", "");
    } else {
      out.push("_No statement is generated; this requires manual handling._", "");
    }
    out.push(
      `**Fix risk**: ${f.fixRisk}`,
      "",
      `**Rollback**: ${f.remediation.rollback}`,
      "",
      "**Evidence**",
      "",
      "```sql",
      f.evidence.query.trim(),
      "```",
      "",
      "---",
      "",
    );
  }

  if (report.rejected.length > 0) {
    out.push(
      "## Withheld findings",
      "",
      "These failed the finding contract and were not emitted. They are listed " +
        "because a silently dropped finding would make this report read as more " +
        "complete than it is.",
      "",
      ...report.rejected.map((r) => `- \`${r.id}\` — missing ${r.missingFields.join(", ")}`),
      "",
    );
  }

  return out.join("\n");
}
// [SCOPE 121 / T013] END

// [SCOPE 121 / T013] BEGIN — Report persistence
/** Write the markdown report, refresh `latest.md`, and retain the raw snapshot. */
export async function writeReport(
  directory: string,
  report: AnalysisReport,
  snapshot: unknown,
): Promise<ReportPaths> {
  const { mkdir, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");

  await mkdir(directory, { recursive: true });
  const stamp = report.runAt.replace(/[:.]/g, "-").replace("T", "-").slice(0, 16);
  const reportPath = join(directory, `${stamp}.md`);
  const latestPath = join(directory, "latest.md");
  const snapshotPath = join(directory, `${stamp}.snapshot.json`);
  const markdown = renderMarkdown(report);

  await writeFile(reportPath, markdown, "utf8");
  await writeFile(latestPath, markdown, "utf8");
  await writeFile(snapshotPath, JSON.stringify(snapshot, null, 2), "utf8");

  return { reportPath, latestPath, snapshotPath };
}
// [SCOPE 121 / T013] END
```

- [ ] **Step 4: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/report.test.ts && npm run typecheck:dbanalyze`
Expected: 8 tests PASS, typecheck exits 0.

- [ ] **Step 5: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/scripts/core/report.ts tests/wxdbanalyze/report.test.ts
git commit -m "feat(SCOPE-121): render ranked findings to terminal and markdown"
```

---

## Task 14: CLI, skill and command registration

**Files:**
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/postgres/index.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/engines/registry.ts`
- Create: `_wxAI/skills/wxDBAnalyze/scripts/cli.ts`
- Modify: `tests/wxdbanalyze/engine.test.ts` (registry coverage)
- Create: `_wxAI/skills/wxDBAnalyze/SKILL.md`
- Create: `_wxAI/skills/wxDBAnalyze/references/finding-contract.md`
- Create: `_wxAI/skills/wxDBAnalyze/references/thresholds.md`
- Create: `.claude/commands/wxDBAnalyze.md`
- Create: `_wxAI/commands/wxDBAnalyze.md`
- Modify: `src/server/routes/helpCatalog.ts`
- Modify: `vscode-extension/src/services/helpCatalog.ts`
- Modify: `package.json` (add `db:analyze` script)
- Test: `tests/wxdbanalyze/cli.test.ts`

**Interfaces:**
- Consumes: every module from Tasks 1–13
- Produces: `parseArgs(argv: string[]): CliOptions`, `CliOptions`, `run(options): Promise<number>`

- [ ] **Step 1: Write the failing CLI test**

```ts
// tests/wxdbanalyze/cli.test.ts
import { describe, expect, it } from "vitest";
import { parseArgs } from "../../_wxAI/skills/wxDBAnalyze/scripts/cli.js";

describe("parseArgs", () => {
  it("defaults to every implemented dimension, read-only, no apply", () => {
    const o = parseArgs([]);
    expect(o.dimensions).toEqual(["schema", "integrity"]);
    expect(o.apply).toBe(false);
    expect(o.dryRun).toBe(false);
    expect(o.deep).toBe(false);
  });

  it("parses a dimension filter", () => {
    expect(parseArgs(["--dimension", "integrity"]).dimensions).toEqual(["integrity"]);
  });

  it("accepts --key=value as well as spaced form", () => {
    expect(parseArgs(["--dimension=schema"]).dimensions).toEqual(["schema"]);
  });

  it("rejects an unknown dimension by name", () => {
    expect(() => parseArgs(["--dimension", "gravity"])).toThrow(/gravity/);
  });

  it("treats --dry-run as implying --apply planning without writes", () => {
    const o = parseArgs(["--dry-run"]);
    expect(o.dryRun).toBe(true);
    expect(o.apply).toBe(false);
  });

  it("parses engine and url overrides", () => {
    const o = parseArgs(["--engine", "mssql", "--url", "mssql://h/db"]);
    expect(o.engine).toBe("mssql");
    expect(o.url).toBe("mssql://h/db");
  });

  it("rejects --apply together with --dry-run, which contradict", () => {
    expect(() => parseArgs(["--apply", "--dry-run"])).toThrow(/both/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/wxdbanalyze/cli.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the PostgreSQL adapter and the registry**

Without this, PostgreSQL would bypass the `EngineAdapter` interface entirely and the abstraction would be exercised only by the four refusing stubs — which proves nothing. Every engine, including the implemented one, is reached the same way.

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/postgres/index.ts
import type { DimensionId } from "../../core/finding.js";
import type { EngineAdapter, SupportLevel } from "../../core/engine.js";
import { createReadOnlyConnection } from "./connect.js";

// [SCOPE 121 / T014] BEGIN — PostgreSQL adapter
const SUPPORT: Partial<Record<DimensionId, SupportLevel>> = {
  schema: "full",
  integrity: "full",
};

export const postgresAdapter: EngineAdapter = {
  engine: "postgres",
  supports(dimension: DimensionId): SupportLevel {
    return SUPPORT[dimension] ?? "not-implemented";
  },
  connect: createReadOnlyConnection,
  async collect() {
    // Phase 1 drives the schema and integrity collectors directly from the CLI,
    // which needs both live and declared input that this signature does not
    // carry. Left refusing rather than returning empty: an adapter that answers
    // "nothing found" for a path it does not implement is the failure this
    // whole design is built to avoid.
    throw new Error(
      "postgres adapter: collect() is not the Phase 1 collection path — " +
        "the CLI calls collectLiveSchema and probeIntegrity directly",
    );
  },
  additiveWhitelist() {
    return [];
  },
};
// [SCOPE 121 / T014] END
```

```ts
// _wxAI/skills/wxDBAnalyze/scripts/engines/registry.ts
import type { EngineAdapter, EngineId } from "../core/engine.js";
import { createRefusingAdapter } from "./stub.js";
import { postgresAdapter } from "./postgres/index.js";

// [SCOPE 121 / T014] BEGIN — Adapter registry
const IMPLEMENTED_ADAPTERS: Partial<Record<EngineId, EngineAdapter>> = {
  postgres: postgresAdapter,
};

/** Every engine resolves to an adapter; unimplemented ones resolve to a refusing stub. */
export function adapterFor(engine: EngineId): EngineAdapter {
  return IMPLEMENTED_ADAPTERS[engine] ?? createRefusingAdapter(engine);
}
// [SCOPE 121 / T014] END
```

Add to `tests/wxdbanalyze/engine.test.ts`:

```ts
import { adapterFor } from "../../_wxAI/skills/wxDBAnalyze/scripts/engines/registry.js";

describe("adapterFor", () => {
  it("returns the real adapter for postgres", () => {
    expect(adapterFor("postgres").supports("schema")).toBe("full");
  });

  it("returns a refusing adapter for every unimplemented engine", () => {
    for (const engine of ["mssql", "mysql", "oracle", "firebird"] as const) {
      expect(adapterFor(engine).supports("schema")).toBe("not-implemented");
    }
  });

  it("reports Phase 2 dimensions as not-implemented even on postgres", () => {
    expect(adapterFor("postgres").supports("performance")).toBe("not-implemented");
  });
});
```

- [ ] **Step 3b: Write the CLI**

The CLI resolves its engine through `adapterFor` and refuses on `not-implemented`, so adding an engine in Plan 3 requires no CLI change.

```ts
// _wxAI/skills/wxDBAnalyze/scripts/cli.ts
import { ENGINE_IDS, resolveEngine, type EngineId } from "./core/engine.js";
import type { DimensionId } from "./core/finding.js";
import { partitionFindings } from "./core/finding.js";
import { loadApplyPolicy } from "./core/policy.js";
import { renderTerminal, writeReport, type AnalysisReport, type DimensionStatus } from "./core/report.js";
import { adapterFor } from "./engines/registry.js";
import { extractDeclaredSchema, loadSchemaModules } from "./engines/postgres/declared.js";
import { collectLiveSchema } from "./engines/postgres/schema.js";
import { estimateRowCounts, probeIntegrity } from "./engines/postgres/integrity.js";
import { analyzeSchema } from "./dimensions/schema.js";
import { analyzeIntegrity } from "./dimensions/integrity.js";
import { inferRelationships } from "./dimensions/relationships.js";

// [SCOPE 121 / T014] BEGIN — CLI argument parsing
/** Dimensions implemented in Phase 1. The other seven arrive in Phase 2. */
const IMPLEMENTED: DimensionId[] = ["schema", "integrity"];

const PHASE_2: DimensionId[] = [
  "data", "conventions", "performance", "maintenance", "security", "availability", "impact",
];

export interface CliOptions {
  dimensions: DimensionId[];
  engine?: EngineId;
  url?: string;
  apply: boolean;
  dryRun: boolean;
  deep: boolean;
  reportDir: string;
}

function readFlags(argv: string[]): Map<string, string | true> {
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]!;
    if (!token.startsWith("--")) continue;
    const eq = token.indexOf("=");
    if (eq > -1) {
      flags.set(token.slice(2, eq), token.slice(eq + 1));
      continue;
    }
    const next = argv[i + 1];
    if (next && !next.startsWith("--")) {
      flags.set(token.slice(2), next);
      i += 1;
    } else {
      flags.set(token.slice(2), true);
    }
  }
  return flags;
}

export function parseArgs(argv: string[]): CliOptions {
  const flags = readFlags(argv);

  const apply = flags.get("apply") === true;
  const dryRun = flags.get("dry-run") === true;
  if (apply && dryRun) {
    throw new Error("--apply and --dry-run cannot both be given; they contradict");
  }

  const raw = flags.get("dimension");
  let dimensions = IMPLEMENTED;
  if (typeof raw === "string") {
    dimensions = raw.split(",").map((d) => d.trim()) as DimensionId[];
    for (const d of dimensions) {
      if (IMPLEMENTED.includes(d)) continue;
      throw new Error(
        PHASE_2.includes(d)
          ? `dimension ${JSON.stringify(d)} is not implemented in Phase 1`
          : `unknown dimension ${JSON.stringify(d)} — available: ${IMPLEMENTED.join(", ")}`,
      );
    }
  }

  const engine = flags.get("engine");
  if (typeof engine === "string" && !(ENGINE_IDS as readonly string[]).includes(engine)) {
    throw new Error(`unknown engine ${JSON.stringify(engine)}`);
  }

  return {
    dimensions,
    engine: typeof engine === "string" ? (engine as EngineId) : undefined,
    url: typeof flags.get("url") === "string" ? (flags.get("url") as string) : undefined,
    apply,
    dryRun,
    deep: flags.get("deep") === true,
    reportDir: typeof flags.get("report-dir") === "string"
      ? (flags.get("report-dir") as string)
      : "docs/db-analysis",
  };
}
// [SCOPE 121 / T014] END

// [SCOPE 121 / T014] BEGIN — Run orchestration
function dimensionStatuses(selected: DimensionId[]): DimensionStatus[] {
  return [
    ...selected.map((id) => ({ id, support: "full" as const })),
    ...PHASE_2.filter((id) => !selected.includes(id)).map((id) => ({
      id,
      support: "not-implemented" as const,
      note: "arrives in wxDBAnalyze Phase 2",
    })),
  ];
}

export async function run(options: CliOptions): Promise<number> {
  const url = options.url ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("wxDBAnalyze: no --url and no DATABASE_URL in the environment.");
    return 2;
  }

  const engine = resolveEngine({ explicit: options.engine, url });
  const adapter = adapterFor(engine);

  const unsupported = options.dimensions.filter(
    (d) => adapter.supports(d) === "not-implemented",
  );
  if (unsupported.length > 0) {
    console.error(
      `wxDBAnalyze: the ${engine} adapter does not implement ` +
        `${unsupported.join(", ")}. Nothing was read and nothing was written.`,
    );
    return 3;
  }

  const policy = await loadApplyPolicy(process.cwd());
  const connection = await adapter.connect(url);

  try {
    const live = await collectLiveSchema(connection);
    const { sources, unresolved } = await loadSchemaModules([
      { label: "app", path: "src/db/schema" },
      { label: "mcp", path: "mcp-server/src/db/schema.ts" },
    ]);
    // An unresolved schema source is reported, never swallowed: a moved or
    // renamed declaration file would otherwise turn the whole drift report
    // silently clean.
    for (const miss of unresolved) {
      console.error(
        `wxDBAnalyze: schema source "${miss.label}" (${miss.path}) was not ` +
          `loaded — ${miss.reason}. Findings below are incomplete.`,
      );
    }
    const declared = extractDeclaredSchema(sources);

    const candidates: unknown[] = [];
    if (options.dimensions.includes("schema")) {
      candidates.push(...analyzeSchema(declared, live));
    }
    if (options.dimensions.includes("integrity")) {
      const rowCounts = await estimateRowCounts(connection);
      const relationships = inferRelationships({ declared, live });
      const probes = await probeIntegrity(connection, relationships, {
        rowCounts,
        tenantColumn: "companyid",
        maxUnindexedRows: options.deep ? Number.MAX_SAFE_INTEGER : undefined,
      });
      candidates.push(...analyzeIntegrity(probes));
    }

    const { emitted, rejected } = partitionFindings(candidates);
    const report: AnalysisReport = {
      runAt: new Date().toISOString(),
      engine,
      database: new URL(url).pathname.replace(/^\//, "") || "unknown",
      dimensions: dimensionStatuses(options.dimensions),
      findings: emitted,
      rejected,
    };

    console.log(renderTerminal(report));
    const paths = await writeReport(options.reportDir, report, {
      declaredTables: [...declared.tables.keys()],
      liveTables: [...live.tables.keys()],
    });
    console.log(`Report: ${paths.reportPath}`);
    console.log(`Apply policy: ${policy.mode} (${policy.source})`);

    if (options.apply || options.dryRun) {
      console.log(
        "Apply is driven by the skill, which presents each statement with its " +
          "classification before anything is executed. See SKILL.md.",
      );
    }

    return emitted.some((f) => f.severity === "critical") ? 1 : 0;
  } finally {
    await connection.close();
  }
}
// [SCOPE 121 / T014] END
```

- [ ] **Step 4: Add the entry point and npm script**

Append to `cli.ts`:

```ts
// [SCOPE 121 / T014] BEGIN — Entry point
if (process.argv[1]?.endsWith("cli.ts") || process.argv[1]?.endsWith("cli.js")) {
  run(parseArgs(process.argv.slice(2)))
    .then((code) => process.exit(code))
    .catch((error: unknown) => {
      console.error(
        `wxDBAnalyze failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      process.exit(2);
    });
}
// [SCOPE 121 / T014] END
```

Add to `package.json` scripts:

```json
"db:analyze": "tsx _wxAI/skills/wxDBAnalyze/scripts/cli.ts"
```

- [ ] **Step 5: Run tests and typecheck**

Run: `npx vitest run tests/wxdbanalyze/cli.test.ts && npm run typecheck:dbanalyze`
Expected: 7 tests PASS, typecheck exits 0.

- [ ] **Step 6: Run the whole thing against the live database**

Run: `npm run db:analyze`

Expected: a ranked terminal report, a written file under `docs/db-analysis/`, and the apply policy line reading `approve-each (.wxai/db-policy.json)`. Read the findings — this is the first real answer this project has had about its own schema. Record the counts.

- [ ] **Step 7: Write `SKILL.md`**

Create `_wxAI/skills/wxDBAnalyze/SKILL.md` with YAML frontmatter (`name: wxDBAnalyze`, and a `description` covering: senior-DBA review of a project's database across schema integrity, referential integrity, and — from Phase 2 — data health, conventions, performance, maintenance, security, availability and change impact; multi-engine; every finding states why it needs changing; guarded additive-only apply). The body must carry:

1. **The DBA persona** from §2 of the design doc, verbatim in substance.
2. **The finding contract** — all nine fields, and the rule that a "why" which could be pasted into another project's report is not a "why". Point at `references/finding-contract.md`.
3. **Phase order** — resolve engine → resolve policy → read-only connect → collect → analyse → rank → report → (only if asked) apply.
4. **Refusal rules** — non-PostgreSQL engines refuse; unwhitelisted DDL refuses; a failed read-only guard refuses; nothing is applied in `manual` mode.
5. **The apply protocol** — how to present each statement (rationale, classification, lock class, target row count, estimated duration) and collect per-statement approval under `approve-each`.
6. **What it never does** — apply destructive DDL, print secret values, self-certify a fix, or report an unrun check as clean.

- [ ] **Step 8: Write the reference files**

`references/finding-contract.md` — the nine fields as a table with the worked example from §7.2 of the design doc, showing the weak version and the strong version side by side.

`references/thresholds.md` — DBA heuristics as *guidance the model qualifies by workload*, not gates: orphan counts, unindexed-FK row thresholds, index-scan ratios, dead-tuple ratios. Each entry states what the number means and what would make it acceptable.

- [ ] **Step 9: Write the command file**

Create `.claude/commands/wxDBAnalyze.md` following the shape of `.claude/commands/preTest.md` — frontmatter with `description`, `args: "{{args}}"`, `ai-compat: universal`, `claude-code: true`, `cursor: true`, `blackboxai: true`; body covering purpose, usage block (the seven invocations from §9 of the design), the dimension table with Phase 1 versus Phase 2 marked, and the result contract. State that it loads `_wxAI/skills/wxDBAnalyze/SKILL.md`.

Copy the identical file to `_wxAI/commands/wxDBAnalyze.md` — every command in this project exists in both locations.

- [ ] **Step 10: Register in both help catalogs**

Read `src/server/routes/helpCatalog.ts` and `vscode-extension/src/services/helpCatalog.ts`, then add a `wxDBAnalyze` entry to each following the existing entry shape in that file. Without this the command does not appear in the Cockpit and is undiscoverable.

Verify: `npx vitest run tests/unit/helpCatalog.test.ts`

- [ ] **Step 11: Full suite, fence audit and build**

```bash
npm run typecheck:dbanalyze
npx vitest run tests/wxdbanalyze
npx vitest run tests/unit
npx tsx wxkanban-agent/bin/wxkanban-agent.ts auditfences
```

Expected: all green, and `auditfences` reporting no unfenced declarations in the new files.

- [ ] **Step 12: Commit** *(operator approval required)*

```bash
git add _wxAI/skills/wxDBAnalyze/ .claude/commands/wxDBAnalyze.md _wxAI/commands/wxDBAnalyze.md src/server/routes/helpCatalog.ts vscode-extension/src/services/helpCatalog.ts package.json tests/wxdbanalyze/cli.test.ts
git commit -m "feat(SCOPE-121): add wxDBAnalyze skill, command and cockpit registration"
```

---

## Post-Phase-1 follow-ups

These are **not** part of this plan, and are recorded so they are not mistaken for oversights:

1. **Plan 2 — dimensions 3 through 9.** Data health, conventions, performance, maintenance, security, availability and impact analysis. Each follows the collect/analyse split proven here.
2. **Plan 3 — the four remaining engine adapters.** MSSQL, MySQL, Oracle and Firebird, replacing their refusing stubs one at a time against a live instance.
3. **The VSIX rebuild and publish.** Registering in `helpCatalog.ts` makes the command known; the extension still needs rebuilding and publishing for it to reach anyone.
4. **`auto-additive` needs a fail-first proof against a clone** before any customer project is told it is safe. wxKanban pins `approve-each`, so that path is otherwise unexercised.
5. **The nullable-FK-never-null rule** was deliberately left out of Task 10. It needs NULL-density measurement, which arrives with dimension 3 in Plan 2.
