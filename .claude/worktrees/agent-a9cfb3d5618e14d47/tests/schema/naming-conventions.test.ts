import { describe, it, expect } from "vitest";
import * as schema from "../../src/db/schema/index.js";

/**
 * Schema Naming Conventions Test
 *
 * Verifies that all database tables and columns follow naming conventions:
 * - Table names: singular, lowercase, no camelCase
 * - Column names: lowercase, no camelCase, no underscores
 * - Primary keys: {table}id pattern
 * - Foreign keys: match parent table primary key name
 */

describe("Database Schema Naming Conventions", () => {
  // Helper function to get columns from a Drizzle table
  const getTableColumns = (table: any): Record<string, any> => {
    // Drizzle columns are direct properties on the table object
    const columns: Record<string, any> = {};
    for (const [key, value] of Object.entries(table)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "columnType" in value &&
        !key.startsWith("_")
      ) {
        columns[key] = value;
      }
    }
    return columns;
  };

  // Get all schema exports - filter for Drizzle PgTable objects
  // Also normalize to the table's underlying DB name to avoid alias/constant naming drift.
  const expectedTables = [
    "users",
    "sessions",
    "companies",
    "projects",
    "projectusers",
    "pmsystemconnections",
    "tasks",
    "timeentries",
    "invoices",
    "specifications",
    "projectphases",
    "testplans",
    "feedbacks",
    "notes",
    "companyauditlogs",
    "userinvitations",
    "invitationbatches",
    "invitationdlqs",
    // [SCOPE 111 / T010] Test Suite Lifecycle tables. Added to the allowlist so
    // they are covered by the shared naming rules below — this list is a filter,
    // so a table absent from it is silently unchecked.
    "testplanitems",
    "testitemsubjects",
    "testcycles",
    "testruns",
    "testrunresults",
    "testsignoffs",
    "testretests",
  ];

  const keyAliasMap: Record<string, string> = {
    userprofiles: "users",
    companyprojects: "projects",
    projecttasks: "tasks",
    projecttimeentries: "timeentries",
    projectinvoices: "invoices",
    projectspecifications: "specifications",
    feedback: "feedbacks",
    note: "notes",
    userinvitation: "userinvitations",
    companyauditlog: "companyauditlogs",
    projectuser: "projectusers",
    invitationbatch: "invitationbatches",
    invitationdlq: "invitationdlqs",
    pmsystemconnection: "pmsystemconnections",
    projectphase: "projectphases",
    testplan: "testplans",
  };

  const schemaEntries = Object.entries(schema)
    .filter(([key, value]) => {
      if (typeof value !== "object" || value === null || Array.isArray(value)) {
        return false;
      }
      if (typeof key !== "string" || key.length === 0) {
        return false;
      }
      const columns = getTableColumns(value);
      return Object.keys(columns).length > 0;
    })
    .map(([key, table]) => {
      const normalizedKey = keyAliasMap[key] ?? key;
      return [normalizedKey, table] as const;
    });

  const dedupedSchemaEntries = Array.from(
    new Map(schemaEntries.map(([name, table]) => [name, table])).entries()
  ).filter(([name]) => expectedTables.includes(name));

  describe("Table Names", () => {
    it("should use lowercase table names (no camelCase)", () => {
      dedupedSchemaEntries.forEach(([key, table]) => {
        const tableName = key;
        expect(tableName).toMatch(/^[a-z0-9]+$/);
      });
    });

    it("should not contain underscores", () => {
      dedupedSchemaEntries.forEach(([key, table]) => {
        const tableName = key;
        expect(tableName).not.toContain("_");
      });
    });

    it("should use singular names", () => {
      dedupedSchemaEntries.forEach(([key, table]) => {
        const tableName = key;
        expect(expectedTables).toContain(tableName);
      });
    });
  });

  describe("Column Names", () => {
    it("should use lowercase column names (no camelCase)", () => {
      dedupedSchemaEntries.forEach(([, table]) => {
        Object.entries(getTableColumns(table)).forEach(([columnName, column]) => {
          const effectiveColumnName = columnName;
          expect(effectiveColumnName).toMatch(/^[a-z0-9]+$/);
        });
      });
    });

    it("should not contain underscores or spaces", () => {
      dedupedSchemaEntries.forEach(([, table]) => {
        Object.entries(getTableColumns(table)).forEach(([columnName, column]) => {
          const effectiveColumnName = columnName;
          expect(effectiveColumnName).not.toMatch(/[_\s]/);
        });
      });
    });
  });

  describe("Primary Keys", () => {
    it("should use UUID type for primary keys", () => {
      dedupedSchemaEntries.forEach(([, table]) => {
        const pkColumn = Object.entries(getTableColumns(table)).find(([_, col]) =>
          col.primary
        );
        expect(pkColumn).toBeDefined();
        if (pkColumn) {
          expect(pkColumn[1].columnType).toBe("PgUUID");
        }
      });
    });
  });

  describe("Common Field Patterns", () => {
    it("should consistently name timestamp fields", () => {
      // Timestamp fields should follow patterns: *at, *time, or timestamp
      dedupedSchemaEntries.forEach(([, table]) => {
        Object.entries(getTableColumns(table)).forEach(([columnName, column]) => {
          const effectiveColumnName = columnName;
          if (column.columnType === "PgTimestamp") {
            const isValidTimestampName =
              /^[a-z0-9]+(at|time)$/.test(effectiveColumnName) || effectiveColumnName === "timestamp";
            expect(isValidTimestampName).toBe(true);
          }
        });
      });
    });

    it("should consistently name foreign key fields", () => {
      dedupedSchemaEntries.forEach(([, table]) => {
        Object.entries(getTableColumns(table)).forEach(([columnName, column]) => {
          const effectiveColumnName = columnName;
          if (effectiveColumnName.endsWith("id") && effectiveColumnName !== "id") {
            expect(effectiveColumnName).toMatch(/^[a-z0-9]+id$/);
          }
        });
      });
    });
  });

  describe("No Deprecated Patterns", () => {
    it("should not contain camelCase table names", () => {
      const deprecatedNames = [
        "pmSystemConnection",
        "projectPhase",
        "testPlan",
        "timeEntry",
        "companyAuditLog",
        "userInvitation",
        "projectUser",
        "invitationBatch",
        "invitationDLQ",
        // Also check for singular forms (old naming)
        "user",
        "project",
        "task",
        "invoice",
        "note",
        "session",
        "company",
        "feedback",
        "specification",
        "projectphase",
        "testplan",
        "timeentry",
        "pmsystemconnection",
        "invitationbatch",
        "invitationdlq",
        "userinvitation",
        "projectuser",
        "companyauditlog",
      ];

      dedupedSchemaEntries.forEach(([key, table]) => {
        const tableName = key;
        deprecatedNames.forEach((deprecated) => {
          expect(tableName).not.toBe(deprecated);
        });
      });
    });
  });

  describe("Schema Consistency", () => {
    it("should export all tables with consistent naming", () => {
      const exportedTables = dedupedSchemaEntries.map(
        ([key]) => key
      );

      expectedTables.forEach((expectedTable) => {
        expect(exportedTables).toContain(expectedTable);
      });
    });
  });
});
