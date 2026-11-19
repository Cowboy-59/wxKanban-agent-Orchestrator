/**
 * Migration 0013 Runner
 * 
 * Executes SQL migration for Spec 011: Project Kit Tables
 * Usage: npx tsx src/db/migrations/0013_runner.ts
 */

import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function runMigration() {
  const databaseUrl = process.env.DATABASE_URL;
  
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL environment variable is required');
    process.exit(1);
  }

  console.log('🔄 Connecting to database...');
  
  const pool = new Pool({ connectionString: databaseUrl });

  try {
    // Read and execute migration SQL
    const sqlPath = path.join(__dirname, '0013_add_project_kit_tables.sql');
    const sql = fs.readFileSync(sqlPath, 'utf-8');
    
    console.log('📦 Running migration 0013: Add Project Kit Tables...');
    
    // Execute SQL statements
    await pool.query(sql);
    
    console.log('✅ Migration 0013 completed successfully');
    console.log('');
    console.log('Created tables:');
    console.log('  - apitokens (personal API tokens for kit encryption)');
    console.log('  - projectkits (kit generation status and metadata)');
    console.log('  - projectkitfiles (individual kit files)');
    console.log('');
    console.log('Added notification types:');
    console.log('  - project_kit_ready');
    console.log('  - project_kit_failed');
    console.log('  - project_kit_regenerated');
    
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runMigration();
}

export { runMigration };
