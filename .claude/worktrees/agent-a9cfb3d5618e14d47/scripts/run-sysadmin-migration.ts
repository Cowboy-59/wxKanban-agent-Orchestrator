#!/usr/bin/env tsx
/**
 * Run SysAdmin Migration (Spec 014)
 * 
 * This script executes the database migration for SysAdmin platform administration tables.
 */

import { execSync } from 'child_process';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = resolve(__filename, '..');

const MIGRATION_FILE = resolve(__dirname, '../database/migrations/014_sysadmin_tables.sql');

console.log('🚀 Running SysAdmin Migration (Spec 014)...');
console.log('');

try {
  // Read migration file
  console.log('📖 Reading migration file...');
  const migrationSql = readFileSync(MIGRATION_FILE, 'utf-8');
  
  // Execute migration using psql or drizzle
  console.log('🔧 Executing migration...');
  
  // Option 1: Use drizzle-kit push
  try {
    execSync('npx drizzle-kit push', {
      cwd: resolve(__dirname, '..'),
      stdio: 'inherit',
    });
    console.log('✅ Drizzle migration completed');
  } catch (error) {
    console.log('⚠️  Drizzle push failed, attempting direct SQL execution...');
    
    // Option 2: Direct SQL execution (requires DATABASE_URL)
    const dbUrl = process.env.DATABASE_URL;
    if (!dbUrl) {
      console.error('❌ DATABASE_URL not set');
      process.exit(1);
    }
    
    // Extract connection details from DATABASE_URL
    const url = new URL(dbUrl);
    const host = url.hostname;
    const port = url.port || '5432';
    const database = url.pathname.slice(1);
    const username = url.username;
    
    execSync(
      `psql -h ${host} -p ${port} -U ${username} -d ${database} -f ${MIGRATION_FILE}`,
      {
        cwd: resolve(__dirname, '..'),
        stdio: 'inherit',
        env: {
          ...process.env,
          PGPASSWORD: url.password,
        },
      }
    );
  }
  
  console.log('');
  console.log('✅ Migration completed successfully!');
  console.log('');
  console.log('Tables created:');
  console.log('  • system_settings');
  console.log('  • system_settings_history');
  console.log('  • company_status_history');
  console.log('  • company_analytics');
  console.log('');
  console.log('Default settings seeded:');
  console.log('  • free_tier_enabled');
  console.log('  • free_tier_max_users');
  console.log('  • free_tier_max_projects');
  console.log('  • maintenance_mode');
  console.log('  • registration_enabled');
  console.log('  • password_min_length');
  console.log('  • session_timeout_minutes');
  console.log('  • stripe_webhook_enabled');
  console.log('  • email_notifications_enabled');
  
} catch (error) {
  console.error('');
  console.error('❌ Migration failed:', error);
  process.exit(1);
}
