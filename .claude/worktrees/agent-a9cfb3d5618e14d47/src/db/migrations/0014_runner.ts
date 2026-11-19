/**
 * Migration Runner for 0014_fix_userprofiles_columns
 * 
 * This script applies the migration to fix missing columns in the userprofiles table
 * Run with: npx tsx src/db/migrations/0014_runner.ts
 */

import { config } from 'dotenv';
import { Pool } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

// Load environment variables
config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runMigration() {
  // Validate DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ Error: DATABASE_URL environment variable is not set');
    process.exit(1);
  }

  // Strip sslmode from connection string
  const dbUrl = process.env.DATABASE_URL.replace(/([?&])sslmode=[^&]*/g, "$1").replace(/[?&]$/, "");

  const pool = new Pool({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    console.log('🔧 Applying migration 0014_fix_userprofiles_columns...');
    
    // Read the SQL file
    const sqlPath = join(__dirname, '0014_fix_userprofiles_columns.sql');
    const sql = readFileSync(sqlPath, 'utf-8');
    
    // Execute the migration
    await pool.query(sql);
    
    console.log('✅ Migration 0014 applied successfully!');
    console.log('');
    console.log('📋 Summary of changes:');
    console.log('  - Added missing columns to userprofiles table');
    console.log('  - Created indexes for performance');
    console.log('  - Added column comments for documentation');
    console.log('');
    console.log('🔍 You can now test login with devteam@alitho.com');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
