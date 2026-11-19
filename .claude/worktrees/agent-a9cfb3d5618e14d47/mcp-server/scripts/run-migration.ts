import { db } from '../src/db/connection.js';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { sql } from 'drizzle-orm';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

async function runMigration() {
  console.log('Running MCP migration: 001_add_mcp_columns.sql');
  
  try {
    const migrationPath = resolve(__dirname, '../migrations/001_add_mcp_columns.sql');
    const sqlContent = readFileSync(migrationPath, 'utf-8');
    
    // Execute the SQL statements
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    
    for (const statement of statements) {
      await db.execute(sql.raw(statement + ';'));
    }
    
    console.log('✅ Migration completed successfully');
    process.exit(0);
  } catch (error) {
    console.error('❌ Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
