import { config } from "dotenv";
import { createRequire } from "module";

config();

const require = createRequire(import.meta.url);
const postgres = require("postgres");

console.log("🔍 Starting migration validation...\n");

let databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error("❌ DATABASE_URL environment variable is not set");
  process.exit(1);
}

// The postgres.js driver doesn't accept the 'schema' parameter in the URL
// So we need to remove it and set it separately if needed
const url = new URL(databaseUrl);
url.searchParams.delete("schema");
databaseUrl = url.toString();

const sql = postgres(databaseUrl);

interface ValidationResult {
  section: string;
  checks: Array<{
    name: string;
    status: "PASS" | "FAIL" | "WARN";
    message: string;
  }>;
}

async function main() {
  const results: ValidationResult[] = [];

  // 1. Validate new tables exist
  results.push(await validateNewTables());

  // 2. Validate table modifications
  results.push(await validateModifiedTables());

  // 3. Validate foreign keys
  results.push(await validateForeignKeys());

  // 4. Validate indexes
  results.push(await validateIndexes());

  // Print results
  printResults(results);

  // Summary
  const allPassed = results.every((r) =>
    r.checks.every((c) => c.status !== "FAIL"),
  );
  if (allPassed) {
    console.log("\n✅ ALL VALIDATION CHECKS PASSED!");
    console.log("Migration applied successfully to the database.\n");
    process.exit(0);
  } else {
    console.log("\n❌ SOME VALIDATION CHECKS FAILED!");
    console.log("Please review the errors above.\n");
    process.exit(1);
  }
}

async function validateNewTables(): Promise<ValidationResult> {
  const result: ValidationResult = {
    section: "New Tables",
    checks: [],
  };

  const tables = [
    "company",
    "userinvitation",
    "companyauditlog",
    "projectuser",
  ];

  for (const table of tables) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = $1
        ) as exists
      `;
      const [row] = await sql.unsafe(query, [table]);
      const exists = row.exists;

      result.checks.push({
        name: `Table "${table}" exists`,
        status: exists ? "PASS" : "FAIL",
        message: exists
          ? `✓ Table "${table}" found`
          : `✗ Table "${table}" NOT found`,
      });
    } catch (error) {
      result.checks.push({
        name: `Table "${table}" exists`,
        status: "FAIL",
        message: `✗ Error checking table: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return result;
}

async function validateModifiedTables(): Promise<ValidationResult> {
  const result: ValidationResult = {
    section: "Modified Tables",
    checks: [],
  };

  const modifications = [
    {
      table: "user",
      columns: [
        "companyid",
        "role",
        "activeflag",
        "payrate",
        "tracktimeflag",
        "timezone",
        "joinedat",
        "lastloginedat",
      ],
    },
    { table: "project", columns: ["companyid", "hourlyrate"] },
    {
      table: "invoice",
      columns: ["companyid", "invoicenumber", "billedto", "description"],
    },
  ];

  for (const mod of modifications) {
    for (const column of mod.columns) {
      try {
        const query = `
          SELECT EXISTS (
            SELECT 1 FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
          ) as exists
        `;
        const [row] = await sql.unsafe(query, [mod.table, column]);
        const exists = row.exists;

        result.checks.push({
          name: `Column "${mod.table}.${column}" exists`,
          status: exists ? "PASS" : "FAIL",
          message: exists
            ? `✓ Column "${column}" found in "${mod.table}"`
            : `✗ Column "${column}" NOT found in "${mod.table}"`,
        });
      } catch (error) {
        result.checks.push({
          name: `Column "${mod.table}.${column}" exists`,
          status: "FAIL",
          message: `✗ Error checking column: ${error instanceof Error ? error.message : "Unknown error"}`,
        });
      }
    }
  }

  return result;
}

async function validateForeignKeys(): Promise<ValidationResult> {
  const result: ValidationResult = {
    section: "Foreign Keys & Constraints",
    checks: [],
  };

  const foreignKeys = [
    {
      constraint: "user_companyid_fk",
      table: "user",
      column: "companyid",
      references: "company",
    },
    {
      constraint: "project_companyid_fk",
      table: "project",
      column: "companyid",
      references: "company",
    },
    {
      constraint: "invoice_companyid_fk",
      table: "invoice",
      column: "companyid",
      references: "company",
    },
    {
      constraint: "projectuser_projectid_fk",
      table: "projectuser",
      column: "projectid",
      references: "project",
    },
    {
      constraint: "projectuser_userid_fk",
      table: "projectuser",
      column: "userid",
      references: "user",
    },
    {
      constraint: "companyauditlog_companyid_fk",
      table: "companyauditlog",
      column: "companyid",
      references: "company",
    },
    {
      constraint: "userinvitation_companyid_fk",
      table: "userinvitation",
      column: "companyid",
      references: "company",
    },
  ];

  for (const fk of foreignKeys) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.table_constraints tc
          JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
          WHERE tc.table_schema = 'public' AND tc.table_name = $1
            AND kcu.column_name = $2 AND tc.constraint_type = 'FOREIGN KEY'
        ) as exists
      `;
      const [row] = await sql.unsafe(query, [fk.table, fk.column]);
      const exists = row.exists;

      result.checks.push({
        name: `Foreign key "${fk.table}.${fk.column}"`,
        status: exists ? "PASS" : "FAIL",
        message: exists
          ? `✓ FK "${fk.table}.${fk.column}" → "${fk.references}"`
          : `✗ FK NOT found`,
      });
    } catch (error) {
      result.checks.push({
        name: `Foreign key "${fk.table}.${fk.column}"`,
        status: "FAIL",
        message: `✗ Error checking FK: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  // Check unique constraints
  const uniqueConstraints = [
    { table: "user", column: "email" },
    { table: "company", column: "contactemail" },
    { table: "userinvitation", column: "token" },
  ];

  for (const uc of uniqueConstraints) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM information_schema.constraint_column_usage
          WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2
        ) as exists
      `;
      const [row] = await sql.unsafe(query, [uc.table, uc.column]);
      const exists = row.exists;

      result.checks.push({
        name: `Unique constraint "${uc.table}.${uc.column}"`,
        status: exists ? "PASS" : "WARN",
        message: exists
          ? `✓ UNIQUE constraint on "${uc.column}"`
          : `⚠ UNIQUE constraint may not be found`,
      });
    } catch (error) {
      result.checks.push({
        name: `Unique constraint "${uc.table}.${uc.column}"`,
        status: "WARN",
        message: `⚠ Could not verify constraint: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return result;
}

async function validateIndexes(): Promise<ValidationResult> {
  const result: ValidationResult = {
    section: "Performance Indexes",
    checks: [],
  };

  const indexes = [
    { name: "idx_user_companyid", table: "user", column: "companyid" },
    { name: "idx_project_companyid", table: "project", column: "companyid" },
    {
      name: "idx_projectuser_projectid",
      table: "projectuser",
      column: "projectid",
    },
    { name: "idx_projectuser_userid", table: "projectuser", column: "userid" },
    { name: "idx_invoice_companyid", table: "invoice", column: "companyid" },
    {
      name: "idx_companyauditlog_companyid",
      table: "companyauditlog",
      column: "companyid",
    },
    {
      name: "idx_userinvitation_token",
      table: "userinvitation",
      column: "token",
    },
  ];

  for (const idx of indexes) {
    try {
      const query = `
        SELECT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public' AND tablename = $1 AND indexname = $2
        ) as exists
      `;
      const [row] = await sql.unsafe(query, [idx.table, idx.name]);
      const exists = row.exists;

      result.checks.push({
        name: `Index on "${idx.table}.${idx.column}"`,
        status: exists ? "PASS" : "WARN",
        message: exists
          ? `✓ Index found on "${idx.column}"`
          : `⚠ Index not found (may need manual creation)`,
      });
    } catch (error) {
      result.checks.push({
        name: `Index on "${idx.table}.${idx.column}"`,
        status: "WARN",
        message: `⚠ Could not verify index: ${error instanceof Error ? error.message : "Unknown error"}`,
      });
    }
  }

  return result;
}

function printResults(results: ValidationResult[]): void {
  console.log("=".repeat(70));
  console.log("MIGRATION VALIDATION REPORT");
  console.log("=".repeat(70) + "\n");

  for (const result of results) {
    console.log(`📋 ${result.section}`);
    console.log("-".repeat(70));

    for (const check of result.checks) {
      const icon =
        check.status === "PASS" ? "✅" : check.status === "FAIL" ? "❌" : "⚠️";
      console.log(`${icon} ${check.name}`);
      console.log(`   ${check.message}`);
    }

    console.log();
  }

  // Summary stats
  const totalChecks = results.reduce((sum, r) => sum + r.checks.length, 0);
  const passCount = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => c.status === "PASS").length,
    0,
  );
  const failCount = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => c.status === "FAIL").length,
    0,
  );
  const warnCount = results.reduce(
    (sum, r) => sum + r.checks.filter((c) => c.status === "WARN").length,
    0,
  );

  console.log("=".repeat(70));
  console.log(
    `Summary: ${passCount}/${totalChecks} passed | ${failCount} failed | ${warnCount} warnings`,
  );
  console.log("=".repeat(70));
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
