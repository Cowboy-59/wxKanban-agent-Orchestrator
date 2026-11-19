import { describe, it, expect } from "vitest";
import {
  classifyEdgelessPath,
  subjectCoversTable,
} from "~/server/services/TestImpactService.js";

/**
 * FR-049b3 — changes that carry no import edges.
 *
 * A migration, a config or env change, static content, or a dependency bump
 * changes behaviour, but nothing in the codebase imports it. The transitive
 * dependency walk therefore reaches nothing from it, and without these rules the
 * change reads as affecting no tests at all — a human signoff stands, and the
 * release ships under a verification that never covered the change.
 *
 * The scope names this as the one place under-marking actually happens, and the
 * errors are not symmetric: an over-mark costs a tester one dismissal with a
 * reason, an under-mark ships a defect under a green signoff with no recovery.
 * So every ambiguity in here must resolve toward marking, and these tests assert
 * that direction as much as the mapping itself.
 */
describe("FR-049b3 — edgeless change classification", () => {
  it("recognises a migration, which is the highest-consequence case", () => {
    expect(classifyEdgelessPath("src/db/migrations/0056_scope111c.sql")).toBe("migration");
    expect(classifyEdgelessPath("migrations/0001_init.sql")).toBe("migration");
  });

  it("classifies env, dependency and lockfile changes as unscopable", () => {
    expect(classifyEdgelessPath(".env")).toBe("env");
    expect(classifyEdgelessPath(".env.production")).toBe("env");
    expect(classifyEdgelessPath("package-lock.json")).toBe("dependency");
    expect(classifyEdgelessPath("pnpm-lock.yaml")).toBe("dependency");
    expect(classifyEdgelessPath("package.json")).toBe("dependency");
  });

  it("treats translation payloads as content, not configuration", () => {
    // Both are .json. A locale file changes what a screen SAYS, which narrows to
    // client subjects; a config file can change anything and must mark the lot.
    // Getting these the wrong way round either floods testers on every copy
    // tweak or silently under-marks a real config change.
    expect(classifyEdgelessPath("src/client/i18n/locales/en.json")).toBe("static");
    expect(classifyEdgelessPath("src/client/locales/fr.json")).toBe("static");
    expect(classifyEdgelessPath("tsconfig.json")).toBe("config");
    expect(classifyEdgelessPath("playwright.config.ts")).not.toBe("config"); // .ts has real import edges
  });

  it("classifies styling and asset changes as static", () => {
    expect(classifyEdgelessPath("src/client/styles/index.css")).toBe("static");
    expect(classifyEdgelessPath("public/logo.svg")).toBe("static");
    expect(classifyEdgelessPath("README.md")).toBe("static");
  });

  it("returns null for ordinary source, which the import walk already covers", () => {
    // A false positive here would divert a normally-reachable file into the
    // edgeless path and mark far more than the graph would have.
    expect(classifyEdgelessPath("src/server/services/TestRunService.ts")).toBeNull();
    expect(classifyEdgelessPath("src/client/components/Tests/TestSuitePanel.tsx")).toBeNull();
    expect(classifyEdgelessPath("scripts/apply-migration-0056.mjs")).toBeNull();
  });
});

describe("FR-049b3 — mapping a migration's tables to a test's subjects", () => {
  const subject = (sourcepath: string, unitid: string | null = null) => ({ sourcepath, unitid });

  it("matches the precise inventory unit id", () => {
    expect(subjectCoversTable(subject("src/db/schema/testruns.ts", "drizzle-table:testruns"), "testruns")).toBe(true);
    expect(subjectCoversTable(subject("src/db/schema/testruns.ts", "drizzle-table:testruns"), "testcycles")).toBe(false);
  });

  it("matches a schema module by filename when no unit id is declared", () => {
    expect(subjectCoversTable(subject("src/db/schema/testruns.ts"), "testruns")).toBe(true);
  });

  it("bridges the singular-file / plural-table naming convention", () => {
    // The repo's own mismatch: the table is `testplans`, the file is `testPlan.ts`.
    // Without this the single most-changed table in SCOPE-111 maps to nothing.
    expect(subjectCoversTable(subject("src/db/schema/testPlan.ts"), "testplans")).toBe(true);
    expect(subjectCoversTable(subject("src/db/schema/companyproject.ts"), "companyprojects")).toBe(true);
    // -ies plural: timeentry.ts ↔ timeentries
    expect(subjectCoversTable(subject("src/db/schema/timeentry.ts"), "timeentries")).toBe(true);
  });

  it("does not treat a non-schema file as covering a table", () => {
    // A service that happens to be named after a table is not the table. Marking
    // on this would make almost every migration look broad.
    expect(subjectCoversTable(subject("src/server/services/TestRunService.ts"), "testruns")).toBe(false);
    expect(subjectCoversTable(subject("src/client/components/Tests/TestSuitePanel.tsx"), "testplans")).toBe(false);
  });

  it("is case-insensitive on both sides", () => {
    expect(subjectCoversTable(subject("src/db/schema/TestPlan.ts"), "TESTPLANS")).toBe(true);
    expect(subjectCoversTable(subject("src/db/schema/testruns.ts", "DRIZZLE-TABLE:TESTRUNS"), "testruns")).toBe(true);
  });

  it("does not match an unrelated table that shares a prefix", () => {
    // `testruns` and `testrunresults` are different tables; a prefix match would
    // silently widen every migration touching one into the other.
    expect(subjectCoversTable(subject("src/db/schema/testrunresults.ts"), "testruns")).toBe(false);
    expect(subjectCoversTable(subject("src/db/schema/testruns.ts"), "testrunresults")).toBe(false);
  });
});
