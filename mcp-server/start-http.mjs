import { spawn } from 'child_process';
import crypto from 'crypto';

// Decrypt the database URL
const encrypted = 'c1606b7c174540f61d3542a0f8cfe098:a05c8c62831b57b24871d941c6a0e4d4:fc671e2ecbe89b75433930f9186e74982485d1b6c5f78d1d8543d4177871d85fd54bef07445a111546b908c069a58788e915376a7c236adec6996fa016434734bcb16bff62a07e549dc948950fbb59ab0b34241286e9dc56623febb797515ceba00bd679c53d7230db31b5efd5c0a3';
const token = 'wxk_live_d7839f38ec3942157d520e2a4f9bdb93884afb3e6b648c24cead6d5a0a631ff3';

const [ivHex, authTagHex, encryptedData] = encrypted.split(':');
const key = crypto.scryptSync(token, 'wxkanban-kit-salt', 32);
const iv = Buffer.from(ivHex, 'hex');
const authTag = Buffer.from(authTagHex, 'hex');
const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
decipher.setAuthTag(authTag);
let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
decrypted += decipher.final('utf8');

// Clean up URL (remove sslmode for compatibility)
const dbUrl = decrypted.replace(/[?&]sslmode=[^&]*/g, '').replace(/\?$/, '');

console.log('Starting MCP HTTP Server...');
console.log('Port:', process.env.MCP_HTTP_PORT || 3002);

// Start the server with the decrypted URL
const proc = spawn('node', ['dist/index-http.js'], {
  stdio: 'inherit',
  env: {
    ...process.env,
    WXKANBAN_MCP_DATABASE_URL: dbUrl,
    MCP_HTTP_PORT: process.env.MCP_HTTP_PORT || '3002',
    API_KEY: 'wxkanban-mcp-local-dev-key'
  }
});

proc.on('exit', (code) => {
  process.exit(code);
});
