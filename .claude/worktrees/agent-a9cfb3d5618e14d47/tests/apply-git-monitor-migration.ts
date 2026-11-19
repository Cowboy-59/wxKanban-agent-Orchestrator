/**
 * Apply Git Monitor Database Migration
 */

import { pool } from '../src/db/client.js';
import * as fs from 'fs';
import * as path from 'path';

async function applyMigration(): Promise<void> {
  console.log('Applying git monitor migration...');
  
  const migrationPath = path.join(process.cwd(), 'src/db/migrations/0015_git_command_logs.sql');
  const sql = fs.readFileSync(migrationPath, 'utf-8');
  
  const client = await pool.connect();
  try {
    await client.query(sql);
    console.log('✅ Migration applied successfully');
  } catch (err) {
    console.error('❌ Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

applyMigration()
  .then(() => {
    console.log('Migration complete');
    process.exit(0);
  })
  .catch((err) => {
    console.error('Migration failed:', err);
    process.exit(1);
  })
  .finally(() => {
    pool.end();
  });
