/**
 * SysAdmin Creation Script
 * 
 * This script creates the initial SYSADMIN user for the wxKanban platform.
 * It should be run once during initial setup or when a new SYSADMIN needs to be created.
 * 
 * Usage:
 *   node --import tsx src/scripts/create-sysadmin.ts --email admin@example.com --name "Admin User" [--password "secure123"]
 *   
 * If password is not provided, a secure random password will be generated.
 */

import { db } from "../db/client.js";
import { userprofiles as users } from "../db/schema/userprofiles.js";

import { companies } from "../db/schema/company.js";
import { hashPassword } from "../server/lib/password.js";

import { randomUUID } from "crypto";
import { Command } from "commander";
import chalk from "chalk";
import { eq } from "drizzle-orm";


// Parse command line arguments
const program = new Command();
program
  .requiredOption("--email <email>", "Email address for the SysAdmin")
  .requiredOption("--name <name>", "Full name of the SysAdmin")
  .option("--password <password>", "Password (if not provided, will generate a secure one)")
  .option("--company <company>", "Company name (defaults to 'System Administration')")
  .option("--force", "Force creation even if SYSADMIN users already exist")
  .parse(process.argv);

const options = program.opts();

/**
 * Generate a secure random password
 */
function generateSecurePassword(length: number = 16): string {
  const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
  let password = "";
  for (let i = 0; i < length; i++) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    password += charset[randomIndex];
  }
  return password;
}

async function createSysAdmin() {
  try {
    console.log(chalk.blue("🔐 wxKanban SysAdmin Creation Tool 🔐"));
    console.log(chalk.gray("----------------------------------------"));

    // Check if any SYSADMIN users already exist
    const existingSysAdmins = await db
      .select({ id: users.id, email: users.emailaddr })
      .from(users)
      .where(eq(users.usertype, "SYSADMIN"));

    if (existingSysAdmins.length > 0 && !options.force) {
      console.log(chalk.yellow("⚠️  SYSADMIN users already exist:"));
      existingSysAdmins.forEach(admin => {
        console.log(chalk.yellow(`   - ${admin.email} (${admin.id})`));
      });
      console.log(chalk.yellow("\nUse --force to create another SYSADMIN anyway."));
      process.exit(1);
    }

    // Check if email already exists
    const existingUser = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.emailaddr, options.email))
      .limit(1);

    if (existingUser.length > 0) {
      console.log(chalk.red(`❌ Error: User with email ${options.email} already exists`));
      process.exit(1);
    }

    // Generate password if not provided
    const password = options.password || generateSecurePassword();
    const hashedPassword = await hashPassword(password);
    
    // Create or find system company
    const companyName = options.company || "System Administration";
    let companyId: string;
    
    const existingCompany = await db
      .select({ id: companies.id })
      .from(companies)
      .where(eq(companies.name, companyName))
      .limit(1);
      
    if (existingCompany.length > 0) {
      companyId = existingCompany[0].id;
      console.log(chalk.gray(`Using existing company: ${companyName} (${companyId})`));
    } else {
      companyId = randomUUID();
      await db.insert(companies).values({
        id: companyId,
        name: companyName,
        contactemail: options.email,
        billingplan: "ENTERPRISE",
        activeflag: true,
        subscriptionstatus: "ACTIVE",
        maxusers: 999,
      });

      console.log(chalk.green(`✅ Created system company: ${companyName} (${companyId})`));
    }
    
    // Create SYSADMIN user
    const userId = randomUUID();
    await db.insert(users).values({
      id: userId,
      emailaddr: options.email,
      fullname: options.name,
      password: hashedPassword,
      usertype: "SYSADMIN",
      companyid: companyId,
      active: true,
      securitylevel: 10, // Highest security level
      joinedat: new Date(),
    });
    
    console.log(chalk.green("\n✅ SYSADMIN created successfully!"));
    console.log(chalk.gray("----------------------------------------"));
    console.log(chalk.white("User ID:    "), chalk.cyan(userId));
    console.log(chalk.white("Email:      "), chalk.cyan(options.email));
    console.log(chalk.white("Name:       "), chalk.cyan(options.name));
    console.log(chalk.white("Company:    "), chalk.cyan(`${companyName} (${companyId})`));
    
    if (!options.password) {
      console.log(chalk.white("Password:   "), chalk.green(password));
      console.log(chalk.yellow("\n⚠️  IMPORTANT: Save this password securely. It will not be shown again."));
    }
    
    console.log(chalk.gray("\n----------------------------------------"));
    console.log(chalk.blue("🔐 Login at: https://app.wxkanban.com/login"));
    console.log(chalk.gray("----------------------------------------"));
    
  } catch (error) {
    console.error(chalk.red("❌ Error creating SYSADMIN:"));
    console.error(error);
    process.exit(1);
  } finally {
    // Close database connection
    process.exit(0);
  }
}

createSysAdmin();
