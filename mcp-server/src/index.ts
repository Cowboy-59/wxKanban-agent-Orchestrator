#!/usr/bin/env node

import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import server from './server.js';
import { checkDatabaseConnection, closeDatabase, db } from './db/connection.js';
import logger from './utils/logger.js';
import config from './config.js';
import { companyprojects } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { resolveProjectContext } from './utils/project-context.js';
import { setMcpDbConnected, setMcpLoadedProject, setMcpProjectContext } from './utils/mcp-health.js';
import { AVAILABLE_COMMANDS, renderAvailableCommandsLines } from './utils/help-context.js';

function printBanner() {
  const lines = [
    '',
    '╔════════════════════════════════════════════════════════════════╗',
    '║           🚀 wxKanban MCP Project Hub Server                   ║',
    '║                  Version 0.1.0                                 ║',
    '╠════════════════════════════════════════════════════════════════╣',
    '║  📝 Project Management Integration for wxKanban Platform       ║',
    '║  🔗 Connected to PostgreSQL Database                           ║',
    '╚════════════════════════════════════════════════════════════════╝',
    '',
  ];
  lines.forEach(line => console.error(line));
}

function printConnectionStatus(connected: boolean, dbUrl: string) {
  const timestamp = new Date().toISOString();
  const dbName = dbUrl.includes('localhost') ? 'Local PostgreSQL' : 
                 dbUrl.includes('neon.tech') ? 'Neon PostgreSQL' : 
                 dbUrl.includes('supabase') ? 'Supabase PostgreSQL' : 'PostgreSQL';
  
  if (connected) {
    console.error('');
    console.error('## ✅ Database Connection Verified');
    console.error('');
    console.error('| Status | Database | Transport | Timestamp |');
    console.error('|--------|----------|-----------|-----------|');
    console.error(`| **CONNECTED** | ${dbName} | ${config.transport.toUpperCase()} | ${timestamp} |`);
    console.error('');
    console.error('✅ **Successfully connected to wxKanban database**');
    console.error('');
  } else {
    console.error('');
    console.error('## ❌ Database Connection Failed');
    console.error('');
    console.error('| Status | Timestamp |');
    console.error('|--------|-----------|');
    console.error(`| **FAILED** | ${timestamp} |`);
    console.error('');
    console.error('❌ **Could not connect to wxKanban database**');
    console.error('   Please check your DATABASE_URL configuration');
    console.error('');
  }
}

function printAvailableCommands() {
  const quickGuideCommands = [
    'help',
    'dbpush',
    'createspecs',
    'buildscope',
    'implement',
    'list',
    'gitcommit',
  ];

  console.error('## 📋 Available Commands');
  console.error('');
  renderAvailableCommandsLines().forEach((line) => {
    console.error(line);
  });
  console.error('');
  console.error('### 💡 Quick Usage Guide:');
  console.error('');
  quickGuideCommands.forEach((name) => {
    const command = AVAILABLE_COMMANDS.find((entry) => entry.alias === name);
    if (!command) {
      return;
    }

    console.error(`- alias \`${command.alias}\` -> \`${command.fullName}\`: ${command.description}`);
  });
  console.error('');
  console.error('---');
  console.error('');
  console.error('🌐 **Server Status: ONLINE and ready for requests**');
  console.error('');
}

async function loadProjectAtStartup(): Promise<void> {
  const context = resolveProjectContext(undefined);
  const projectId = context.projectId ?? null;
  setMcpProjectContext({
    projectId,
    source: context.source,
    projectFilePath: context.projectFilePath ?? null,
  });

  if (!projectId) {
    logger.warn('No project context resolved at startup');
    console.error('ℹ️  MCP startup project context: none resolved');
    return;
  }

  try {
    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);

    if (!project) {
      logger.warn(`Resolved projectId not found at startup: ${projectId}`);
      console.error(`⚠️  MCP startup project not found: ${projectId}`);
      setMcpLoadedProject(null);
      return;
    }

    setMcpLoadedProject({
      id: project.id,
      name: project.name,
      status: project.status ?? null,
      currentPhase: null,
      companyId: project.companyId ?? null,
      updatedAt: project.updatedAt ? project.updatedAt.toISOString() : null,
    });

    console.error(`✅ MCP startup project: ${project.name} (${project.id})`);
    logger.info(`Loaded startup project context: ${project.name} (${project.id}) source=${context.source}`);
  } catch (error) {
    logger.error('Failed to load startup project context', error as Error);
    setMcpLoadedProject(null);
  }
}

async function main() {
  // Print startup banner
  printBanner();
  
  logger.info('Starting MCP Project Hub Server...');
  logger.info(`Transport: ${config.transport}`);
  logger.info(`Log level: ${config.logLevel}`);

  // Check database connection
  const dbConnected = await checkDatabaseConnection();
  setMcpDbConnected(dbConnected);
  printConnectionStatus(dbConnected, config.databaseUrl);
  
  if (!dbConnected) {
    logger.error('Failed to connect to database. Exiting.');
    process.exit(1);
  }
  
  logger.info('Database connection established');
  await loadProjectAtStartup();
  
  // Print available commands after successful connection
  printAvailableCommands();

  // Create stdio transport
  const transport = new StdioServerTransport();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await closeDatabase();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await closeDatabase();
    process.exit(0);
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', reason as Error);
    process.exit(1);
  });

  // Connect server to transport
  try {
    await server.connect(transport);
    logger.info('MCP Project Hub Server running on stdio');
  } catch (error) {
    logger.error('Failed to start server', error as Error);
    await closeDatabase();
    process.exit(1);
  }
}

main();
