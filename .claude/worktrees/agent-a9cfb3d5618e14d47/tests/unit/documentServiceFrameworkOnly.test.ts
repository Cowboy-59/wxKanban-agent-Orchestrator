/**
 * SPEC-146 / T003 (FR-003) — DocumentService narrows a non-SYSADMIN read to framework rule
 * documents in the SQL it sends, not only in the route. The db is stubbed; each WHERE is rendered
 * with drizzle's PgDialect so the assertion checks the predicate production would send.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

const h = vi.hoisted(() => ({ wheres: [] as unknown[], executed: [] as unknown[] }));

vi.mock("../../src/db/client.js", () => {
  const chain = {
    from: () => chain,
    where: (w: unknown) => {
      h.wheres.push(w);
      return {
        limit: async () => [],
        orderBy: () => ({ limit: () => ({ offset: async () => [] }) }),
      };
    },
  };
  return {
    db: {
      select: () => chain,
      execute: async (q: unknown) => {
        h.executed.push(q);
        return { rows: [] };
      },
    },
  };
});

import { getDocument, listDocuments, searchDocuments, FRAMEWORK_DOCUMENT_TYPE } from "../../src/server/services/DocumentService.js";

// [SCOPE 146 / T003] BEGIN — the framework-only predicate reaches the SQL
const dialect = new PgDialect();
const render = (q: unknown) => dialect.sqlToQuery(q as SQL);

beforeEach(() => {
  h.wheres.length = 0;
  h.executed.length = 0;
});

describe("DocumentService framework-only reads (FR-003)", () => {
  it("listDocuments ANDs the framework type with a requested documenttype", async () => {
    await listDocuments({ frameworkOnly: true, documenttype: "db_analysis" });
    const q = render(h.wheres[0]);
    expect(q.params).toEqual(expect.arrayContaining([FRAMEWORK_DOCUMENT_TYPE, "db_analysis"]));
    expect(q.sql).toMatch(/ and /);
  });

  it("listDocuments without frameworkOnly sends no type predicate", async () => {
    await listDocuments({});
    expect(h.wheres[0]).toBeUndefined();
  });

  it("getDocument with frameworkOnly adds the type to the id predicate", async () => {
    await getDocument("doc-1", { frameworkOnly: true });
    const q = render(h.wheres[0]);
    expect(q.params).toEqual(["doc-1", FRAMEWORK_DOCUMENT_TYPE]);
  });

  it("getDocument without options matches on the id alone", async () => {
    await getDocument("doc-1");
    expect(render(h.wheres[0]).params).toEqual(["doc-1"]);
  });

  it("searchDocuments with frameworkOnly carries the type into the search SQL", async () => {
    await searchDocuments("access control", { frameworkOnly: true });
    const q = render(h.executed[0]);
    expect(q.sql).toMatch(/documenttype = /);
    expect(q.params).toContain(FRAMEWORK_DOCUMENT_TYPE);
  });

  it("searchDocuments without options has no type predicate", async () => {
    await searchDocuments("access control");
    expect(render(h.executed[0]).sql).not.toMatch(/documenttype = /);
  });
});
// [SCOPE 146 / T003] END
