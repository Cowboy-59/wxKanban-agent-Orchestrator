#!/bin/bash

# wxKanban Database Setup Script
# This script initializes the wxKanban database schema and tables

set -e

echo "🔧 wxKanban Database Setup"
echo "=================================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if .env exists
if [ ! -f .env ]; then
    echo -e "${RED}❌ .env file not found${NC}"
    echo "Please create .env from .env.example first"
    exit 1
fi

# Extract DATABASE_URL from .env
DATABASE_URL=$(grep "DATABASE_URL=" .env | cut -d'=' -f2- | tr -d '"')

echo -e "${YELLOW}📍 Database: ${DATABASE_URL}${NC}"

# Step 1: Create wxkanban schema
echo ""
echo "📋 Step 1: Creating wxkanban schema..."
node --import tsx -e "
import postgres from 'postgres';

const dbUrl = process.env.DATABASE_URL;
// Connect without schema param first to create it
const baseUrl = dbUrl.replace('?schema=wxkanban&sslmode=require', '?sslmode=require');
const client = postgres(baseUrl);

try {
  await client\`CREATE SCHEMA IF NOT EXISTS wxkanban\`;
  console.log('✅ Schema created or already exists');
} catch (err) {
  console.error('❌ Failed to create schema:', err.message);
  process.exit(1);
}

await client.end();
" || exit 1

# Step 2: Generate migrations (if not already done)
echo ""
echo "📋 Step 2: Checking migrations..."
if [ ! -d "drizzle" ]; then
    echo "Generating Drizzle migrations..."
    npm run db:generate
else
    echo "✅ Migrations already exist"
fi

# Step 3: Run migrations
echo ""
echo "📋 Step 3: Running migrations to create tables..."
npm run db:migrate || {
    echo -e "${RED}❌ Migration failed${NC}"
    echo "Check DATABASE_URL in .env and ensure database is accessible"
    exit 1
}

# Step 4: Verify tables were created
echo ""
echo "📋 Step 4: Verifying tables..."
node --import tsx -e "
import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL, { ssl: 'require' });

try {
  const tables = await client\`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'wxkanban'
    ORDER BY table_name
  \`;

  if (tables.length === 0) {
    console.log('❌ No tables found in wxkanban schema');
    process.exit(1);
  }

  console.log('✅ wxKanban Tables Created:');
  tables.forEach(row => console.log('   ✓', row.table_name));
  console.log('');
  console.log('Total:', tables.length, 'tables');
} catch (err) {
  console.error('❌ Verification failed:', err.message);
  process.exit(1);
}

await client.end();
" || exit 1

echo ""
echo -e "${GREEN}=================================================="
echo "✅ Database setup complete!"
echo "=================================================${NC}"
echo ""
echo "Next steps:"
echo "  1. npm run dev:server   # Start backend"
echo "  2. npm run dev:client   # Start frontend (in another terminal)"
echo "  3. Visit http://localhost:3000"
echo ""
