#!/usr/bin/env node

import { execSync, spawn } from 'child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PID_FILE = join(ROOT_DIR, '.mcp-server.pid');
const LOG_FILE = join(ROOT_DIR, 'logs', 'mcp-server.log');

const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
};

function log(color, message) {
  console.log(`${color}${message}${colors.reset}`);
}

function isRunning() {
  if (!existsSync(PID_FILE)) return false;
  try {
    const pid = parseInt(readFileSync(PID_FILE, 'utf8').trim(), 10);
    process.kill(pid, 0);
    return pid;
  } catch {
    if (existsSync(PID_FILE)) rmSync(PID_FILE);
    return false;
  }
}

async function start() {
  if (isRunning()) {
    log(colors.yellow, 'MCP server is already running');
    return;
  }

  const logsDir = join(ROOT_DIR, 'logs');
  if (!existsSync(logsDir)) {
    mkdirSync(logsDir, { recursive: true });
  }

  const child = spawn('node', [join(ROOT_DIR, 'scripts', 'setup-mcp.mjs')], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
    shell: false,
  });

  await new Promise((resolve) => child.on('exit', resolve));
}

function stop() {
  const pid = isRunning();
  if (!pid) {
    log(colors.yellow, 'MCP server is not running');
    return;
  }

  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /pid ${pid} /T /F`, { stdio: 'ignore' });
    } else {
      process.kill(pid, 'SIGTERM');
    }
    if (existsSync(PID_FILE)) rmSync(PID_FILE);
    log(colors.green, 'MCP server stopped');
  } catch (error) {
    log(colors.red, `Error stopping server: ${error.message}`);
  }
}

function status() {
  const pid = isRunning();
  if (pid) {
    log(colors.green, `MCP server is running (PID: ${pid})`);
  } else {
    log(colors.yellow, 'MCP server is not running');
  }
}

function logs() {
  if (!existsSync(LOG_FILE)) {
    log(colors.yellow, 'No log file found');
    return;
  }
  const content = readFileSync(LOG_FILE, 'utf8');
  process.stdout.write(content || 'Log file is empty');
}

const command = process.argv[2] || 'status';

switch (command) {
  case 'start':
    await start();
    break;
  case 'stop':
    stop();
    break;
  case 'restart':
    stop();
    await start();
    break;
  case 'logs':
    logs();
    break;
  case 'status':
  default:
    status();
    break;
}