import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Start the MCP server
const server = spawn('node', ['dist/index.js'], {
  cwd: __dirname,
  stdio: ['pipe', 'pipe', 'pipe']
});

let stdout = '';
let stderr = '';

server.stdout.on('data', (data) => {
  stdout += data.toString();
  console.log('STDOUT:', data.toString());
});

server.stderr.on('data', (data) => {
  stderr += data.toString();
  console.log('STDERR:', data.toString());
});

// Send the help request after server starts
setTimeout(() => {
  const request = {
    jsonrpc: '2.0',
    id: 1,
    method: 'tools/call',
    params: {
      name: 'project.help',
      arguments: {}
    }
  };
  
  server.stdin.write(JSON.stringify(request) + '\n');
  console.log('Sent request:', JSON.stringify(request));
}, 2000);

// Kill server after 5 seconds
setTimeout(() => {
  server.kill();
  console.log('\n--- Server stopped ---');
  process.exit(0);
}, 5000);
