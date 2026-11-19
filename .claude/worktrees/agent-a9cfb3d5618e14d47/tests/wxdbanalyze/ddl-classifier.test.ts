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

describe("classifyStatement — ADD COLUMN NOT NULL DEFAULT literal-only", () => {
  it.each([
    'alter table "tasks" add column "note" timestamptz not null default now()',
    'alter table "tasks" add column "note" uuid not null default gen_random_uuid()',
    'alter table "tasks" add column "note" double precision not null default random()',
    "alter table \"tasks\" add column \"note\" bigint not null default nextval('s')",
    'alter table "tasks" add column "note" int not null default myfunc()',
  ])(
    "refuses a volatile/function-shaped NOT NULL DEFAULT as destructive: %s",
    (sql) => {
      const c = pg(sql);
      expect(c.class).toBe("destructive");
      expect(c.reason).toMatch(/literal/i);
    },
  );

  it.each([
    "alter table \"tasks\" add column \"note\" text not null default 'x'",
    'alter table "tasks" add column "note" int not null default 0',
    'alter table "tasks" add column "note" boolean not null default true',
    'alter table "tasks" add column "note" text not null default null',
  ])("accepts a literal NOT NULL DEFAULT: %s", (sql) => {
    expect(pg(sql).class).toBe("additive-safe");
  });
});

describe("classifyStatement — DEFAULT literal-only regardless of NOT NULL or its position", () => {
  const literals = ["'x'", "0", "-1", "1.5", "true", "false", "null"];
  const volatile = [
    "now()",
    "gen_random_uuid()",
    "random()",
    "nextval('s')",
    "myfunc()",
    "current_timestamp",
  ];

  const positions = (value: string) => ({
    "NOT NULL DEFAULT <value>": `alter table "tasks" add column "note" text not null default ${value}`,
    "DEFAULT <value> NOT NULL": `alter table "tasks" add column "note" text default ${value} not null`,
    "DEFAULT <value> (no NOT NULL)": `alter table "tasks" add column "note" text default ${value}`,
  });

  describe.each(literals)("literal default %s", (value) => {
    const statements = positions(value);
    it.each(Object.entries(statements))("%s is additive-safe", (_label, sql) => {
      expect(pg(sql).class).toBe("additive-safe");
    });
  });

  describe.each(volatile)("volatile/non-literal default %s", (value) => {
    const statements = positions(value);
    it.each(Object.entries(statements))("%s is refused, not additive-safe", (_label, sql) => {
      expect(pg(sql).class).not.toBe("additive-safe");
    });
  });
});

describe("classifyStatement — comma-smuggled second clause", () => {
  it.each([
    'alter table "tasks" add column "note" text, disable trigger "audit_trg"',
    'alter table "tasks" add column "note" text, force row level security',
    'alter table "tasks" add column "note" text, no force row level security',
    'alter table "tasks" add column "note" text, set (fillfactor=10)',
  ])(
    "refuses a depth-zero comma appending an unvetted clause: %s",
    (sql) => {
      expect(pg(sql).class).not.toBe("additive-safe");
    },
  );

  it.each([
    "create table foo (a int, b int)",
    'create index concurrently "idx_ab" on "tasks" ("a", "b")',
    'alter table "tasks" add constraint "fk" foreign key ("a", "b") references "projects" ("x", "y") not valid',
  ])(
    "still accepts legitimate composite forms whose commas sit inside parentheses: %s",
    (sql) => {
      expect(pg(sql).class).toBe("additive-safe");
    },
  );
});

// SCOPE-121 final wave, I1 [Important]: the ADD COLUMN veto only ever looked
// at the DEFAULT clause, so these four structural forms — all full table
// rewrites or blocking index builds — fell through as additive-safe with a
// false "catalog-only" lock class. The volatile-default hole re-entering
// through different syntax.
describe("classifyStatement — ADD COLUMN structural vetoes (inline UNIQUE / PRIMARY KEY / GENERATED)", () => {
  it.each([
    'alter table "tasks" add column "c" int generated always as identity',
    'alter table "tasks" add column "c" int generated always as (1) stored',
    'alter table "tasks" add column "c" text unique',
    'alter table "tasks" add column "c" uuid primary key',
  ])("refuses as destructive, not additive-safe: %s", (sql) => {
    const c = pg(sql);
    expect(c.class).toBe("destructive");
    expect(c.reason.length).toBeGreaterThan(0);
    // The old bug also misstated the lock class alongside the wrong
    // verdict — a refusal must never carry the catalog-only claim.
    expect(c.lockClass).not.toMatch(/catalog-only/i);
  });

  it("still accepts a plain nullable ADD COLUMN with no structural constraint", () => {
    expect(pg('alter table "tasks" add column "note" text').class).toBe("additive-safe");
  });

  it("still accepts a literal DEFAULT ADD COLUMN with no structural constraint", () => {
    expect(pg("alter table \"tasks\" add column \"note\" text default 'x'").class).toBe(
      "additive-safe",
    );
  });

  it("does not false-positive on a literal default value that merely contains a vetoed word", () => {
    const c = pg("alter table \"tasks\" add column \"note\" text default 'unique'");
    expect(c.class).toBe("additive-safe");
  });

  it("still accepts CREATE TABLE ... PRIMARY KEY, which is a new relation, not an existing-table rewrite", () => {
    expect(pg("create table foo (id uuid primary key)").class).toBe("additive-safe");
  });

  it("still refuses ADD COLUMN NOT NULL without a default the same as before", () => {
    const c = pg('alter table "tasks" add column "note" text not null');
    expect(c.class).toBe("destructive");
    expect(c.reason).toMatch(/not null/i);
  });
});

describe("classifyStatement — malformed statements", () => {
  it("refuses an unterminated block comment rather than ignoring it", () => {
    const c = pg("create table foo (id uuid) /* never closed drop table bar");
    expect(c.class).not.toBe("additive-safe");
  });

  it("refuses an unterminated string literal", () => {
    const c = pg("comment on table foo is 'never closed");
    expect(c.class).not.toBe("additive-safe");
  });
});
