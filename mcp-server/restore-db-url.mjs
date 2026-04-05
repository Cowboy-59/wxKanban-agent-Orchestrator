import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The decrypted database URL
const dbUrl = 'postgresql://wxKanban:pK%25wjT2BFE%25%23mU0h@pgkanban.wxperts.com:5432/wxKanban?schema=wxkanban&sslmode=require';

const envPath = path.join(__dirname, '.env');

// Read current .env
let envContent = fs.readFileSync(envPath, 'utf-8');

// Add the plain DATABASE_URL at the top (before the encrypted section)
const plainDbUrlLine = `# Plain database URL for re-initialization\nDATABASE_URL=${dbUrl}\n\n`;

// Insert after the Project ID comment
envContent = envContent.replace(
  '# Project ID: ba924193-0335-4080-9fa6-33cd6b81300a\n\n# ============================================',
  '# Project ID: ba924193-0335-4080-9fa6-33cd6b81300a\n\n' + plainDbUrlLine + '# ============================================'
);

fs.writeFileSync(envPath, envContent);
console.log('✅ Added plain DATABASE_URL to .env file');
console.log('URL:', dbUrl.substring(0, 50) + '...');
