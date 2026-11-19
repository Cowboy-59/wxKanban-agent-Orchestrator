#!/usr/bin/env tsx
/**
 * Create SysAdmin User CLI Script
 * 
 * Creates a new SYSADMIN user for platform administration.
 * Usage: npx tsx scripts/create-sysadmin.ts <email> <password> [companyId]
 */

import { db } from "../src/server/db/client.js";
import { userprofiles } from "../src/db/schema/userprofiles.js";
import { companies } from "../src/db/schema/company.js";
import { hashPassword } from "../src/server/lib/password.js";
import { createLogger } from "../src/server/lib/logger.js";

const logger = createLogger("create-sysadmin-script");

async function createSysAdmin() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log(`
Usage: npx tsx scripts/create-sysadmin.ts <email> <password> [companyId]

Arguments:
  email       - Email address for the SysAdmin user
  password    - Password (min 8 characters)
  companyId   - Optional: Company ID (will use first company if not provided)

Examples:
  npx tsx scripts/create-sysadmin.ts admin@wxkanban.com SecurePass123
  npx tsx scripts/create-sysadmin.ts admin@wxkanban.com SecurePass123 550e8400-e29b-41d4-a716-446655440000
    `);
    process.exit(1);
  }

  const [email, password, providedCompanyId] = args;

  // Validate email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    console.error("❌ Invalid email format");
    process.exit(1);
  }

  // Validate password
  if (password.length < 8) {
    console.error("❌ Password must be at least 8 characters");
    process.exit(1);
  }

  try {
    console.log("🔧 Creating SysAdmin user...");
    console.log(`   Email: ${email}`);

    // Check if user already exists
    const existingUser = await db
      .select({ id: userprofiles.id })
      .from(userprofiles)
      .where(eq(userprofiles.emailaddr, email))
      .limit(1);

    if (existingUser.length > 0) {
      console.error("❌ User with this email already exists");
      process.exit(1);
    }

    // Get or validate company
    let companyId = providedCompanyId;
    
    if (!companyId) {
      // Use first available company
      const firstCompany = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .limit(1);

      if (firstCompany.length === 0) {
        console.error("❌ No companies found. Please create a company first or provide a companyId.");
        process.exit(1);
      }

      companyId = firstCompany[0].id;
      console.log(`   Using company: ${firstCompany[0].name} (${companyId})`);
    } else {
      // Validate provided company ID
      const company = await db
        .select({ id: companies.id, name: companies.name })
        .from(companies)
        .where(eq(companies.id, companyId))
        .limit(1);

      if (company.length === 0) {
        console.error(`❌ Company with ID ${companyId} not found`);
        process.exit(1);
      }
      console.log(`   Using company: ${company[0].name} (${companyId})`);
    }

    // Create SysAdmin user
    const userId = crypto.randomUUID();
    const passwordHash = await hashPassword(password);
    const now = new Date();

    await db.insert(userprofiles).values({
      id: userId,
      emailaddr: email,
      password: passwordHash,
      fullname: "System Administrator",
      companyid: companyId,
      usertype: "SYSADMIN",
      active: true,
      securitylevel: 10, // Highest security level
      timezone: "UTC",
      tracktime: false,
      joinedat: now,
    });

    console.log("");
    console.log("✅ SysAdmin user created successfully!");
    console.log("");
    console.log("User Details:");
    console.log(`  ID:       ${userId}`);
    console.log(`  Email:    ${email}`);
    console.log(`  Type:     SYSADMIN`);
    console.log(`  Company:  ${companyId}`);
    console.log(`  Security: Level 10`);
    console.log("");
    console.log("You can now log in at: /login");
    console.log("");

    logger.info({ userId, email, companyId }, "SysAdmin user created via CLI");

  } catch (error) {
    console.error("");
    console.error("❌ Failed to create SysAdmin user:", error);
    process.exit(1);
  } finally {
    process.exit(0);
  }
}

// Import eq from drizzle-orm
import { eq } from "drizzle-orm";

createSysAdmin();
