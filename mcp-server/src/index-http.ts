#!/usr/bin/env node
/**
 * MCP Server - HTTP/SSE Transport Mode
 * Allows CLI and other clients to connect via HTTP instead of spawning processes
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import server from './server.js';
import { checkDatabaseConnection, closeDatabase } from './db/connection.js';
import logger from './utils/logger.js';
import config from './config.js';
import { resolveProjectContext } from './utils/project-context.js';
import { setMcpDbConnected, setMcpLoadedProject, setMcpProjectContext } from './utils/mcp-health.js';
import { companyprojects } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from './db/connection.js';

const app = express();
const PORT = process.env.MCP_HTTP_PORT || 3002;

interface RequestWithId extends express.Request {
  requestId?: string;
}

function summarizeBody(body: unknown): Record<string, unknown> {
  if (!config.mcpLogPayloads) {
    if (body && typeof body === 'object') {
      return { keys: Object.keys(body as Record<string, unknown>) };
    }
    return { type: typeof body };
  }

  return {
    body,
  };
}



// Middleware
app.use(cors());
app.use(express.json());
app.use((req: RequestWithId, res, next) => {
  const requestId = randomUUID();
  req.requestId = requestId;
  const startedAt = Date.now();

  logger.info('http.request.start', {
    requestId,
    method: req.method,
    path: req.path,
    query: req.query,
  });

  res.on('finish', () => {
    logger.info('http.request.finish', {
      requestId,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Date.now() - startedAt,
    });
  });

  next();
});

// Health check endpoint
app.get('/health', (_req, res) => {
  const health = {
    status: 'ok',
    service: 'mcp-project-hub',
    version: '0.1.0',
    transport: 'http',
    dbConnected: config.databaseUrl ? true : false,
    timestamp: new Date().toISOString(),
  };
  return res.json(health);
});

// SSE endpoint for MCP communication
let sseTransport: SSEServerTransport | null = null;
let isSseConnected = false;

app.get('/sse', async (req: RequestWithId, res) => {
  logger.info('sse.connection.open', { requestId: req.requestId });

  if (!sseTransport || !isSseConnected) {
    sseTransport = new SSEServerTransport('/messages', res);
    await server.connect(sseTransport);
    isSseConnected = true;
    logger.info('sse.transport.connected', { requestId: req.requestId });
  }

  // Handle client disconnect
  req.on('close', () => {
    logger.info('sse.connection.closed', { requestId: req.requestId });
    isSseConnected = false;
    sseTransport = null;
  });
});

// Message endpoint for client-to-server communication
app.post('/messages', async (req: RequestWithId, res) => {
  const startedAt = Date.now();
  try {
    logger.info('mcp.messages.start', {
      requestId: req.requestId,
      ...summarizeBody(req.body),
    });

    if (!sseTransport || !isSseConnected) {
      return res.status(409).json({
        error: 'SSE transport not connected',
        message: 'Connect to /sse before posting MCP messages',
      });
    }

    await sseTransport.handlePostMessage(req, res);
    logger.info('mcp.messages.success', {
      requestId: req.requestId,
      durationMs: Date.now() - startedAt,
    });
    return;
  } catch (error) {
    logger.error('mcp.messages.error', error as Error, {
      requestId: req.requestId,
      durationMs: Date.now() - startedAt,
    });
    return res.status(500).json({
      error: 'Failed to process MCP message',
      message: (error as Error).message,
    });
  }
});

// Direct tool call endpoint (for simpler CLI usage)
app.post('/call', async (req: RequestWithId, res) => {
  const startedAt = Date.now();
  try {
    const { tool, args } = req.body;

    logger.info('mcp.call.start', {
      requestId: req.requestId,
      tool,
      ...(config.mcpLogPayloads ? { args } : { argKeys: args && typeof args === 'object' ? Object.keys(args as Record<string, unknown>) : [] }),
    });
    
    if (!tool) {
      return res.status(400).json({ error: 'Tool name is required' });
    }

    // Invoke the registered handler directly — server.request() requires an active
    // SSE transport which we don't have for direct HTTP calls.
    const handler = (server as any)._requestHandlers?.get('tools/call');
    if (!handler) {
      return res.status(503).json({ error: 'Tool handler not registered' });
    }

    const result = await handler(
      {
        method: 'tools/call',
        params: {
          name: tool,
          arguments: args || {},
          _meta: {
            requestId: req.requestId,
            source: 'http-call',
          },
        },
      },
      {}
    );

    logger.info('mcp.call.success', {
      requestId: req.requestId,
      tool,
      durationMs: Date.now() - startedAt,
    });

    return res.json(result);
  } catch (error) {
    logger.error('mcp.call.error', error as Error, {
      requestId: req.requestId,
      durationMs: Date.now() - startedAt,
    });
    return res.status(500).json({
      error: 'Tool execution failed',
      message: (error as Error).message,
    });
  }
});

// List tools endpoint
app.get('/tools', async (_req, res) => {
  try {
    const handler = (server as any)._requestHandlers?.get('tools/list');
    if (!handler) {
      return res.status(503).json({ error: 'Tools list handler not registered' });
    }
    const result = await handler({ method: 'tools/list', params: {} }, {});
    return res.json(result);
  } catch (error) {
    logger.error('Error listing tools', error as Error);
    return res.status(500).json({
      error: 'Failed to list tools',
      message: (error as Error).message,
    });
  }
});

// Note: CallToolRequestSchema / ListToolsRequestSchema no longer needed here (handlers invoked directly)

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
    console.log('ℹ️  MCP startup project context: none resolved');
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
      console.log(`⚠️  MCP startup project not found: ${projectId}`);
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

    console.log(`✅ MCP startup project: ${project.name} (${project.id})`);
    logger.info(`Loaded startup project context: ${project.name} (${project.id}) source=${context.source}`);
  } catch (error) {
    logger.error('Failed to load startup project context', error as Error);
    setMcpLoadedProject(null);
  }
}

async function main() {
  const startupStartedAt = Date.now();
  logger.info('startup.begin', { transport: 'http', port: PORT });

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           🚀 wxKanban MCP Project Hub Server                   ║');
  console.log('║              HTTP/SSE Transport Mode                           ║');
  console.log('║                  Version 0.1.0                                 ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  📝 Project Management Integration for wxKanban Platform       ║');
  console.log('║  🔗 HTTP API: http://localhost:' + PORT + '                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  logger.info('Starting MCP Project Hub Server (HTTP mode)...');
  logger.info(`Transport: HTTP/SSE`);
  logger.info(`Port: ${PORT}`);
  logger.info(`Log level: ${config.logLevel}`);
  logger.info('startup.config.loaded', {
    logPayloads: config.mcpLogPayloads,
    logRawChat: config.mcpLogRawChat,
    maxFieldChars: config.mcpLogMaxFieldChars,
  });

  // Check database connection
  logger.info('startup.db.check.start');
  const dbConnected = await checkDatabaseConnection();
  setMcpDbConnected(dbConnected);
  
  if (!dbConnected) {
    logger.error('startup.db.check.fail', new Error('Database connection failed'));
    logger.error('Failed to connect to database. Exiting.');
    console.error('❌ Database connection failed. Please check your DATABASE_URL configuration.');
    process.exit(1);
  }
  
  logger.info('startup.db.check.ok');
  logger.info('Database connection established');
  console.log('✅ Database connected');
  
  logger.info('startup.project_context.load.start');
  await loadProjectAtStartup();
  logger.info('startup.project_context.load.ok');

  // Start HTTP server
  logger.info('startup.http_listen.start', { port: PORT });
  app.listen(PORT, () => {
    console.log('');
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  • GET  http://localhost:${PORT}/health    - Health check`);
    console.log(`  • GET  http://localhost:${PORT}/sse       - SSE connection (MCP protocol)`);
    console.log(`  • POST http://localhost:${PORT}/messages  - MCP message endpoint`);
    console.log(`  • GET  http://localhost:${PORT}/tools     - List available tools`);
    console.log(`  • POST http://localhost:${PORT}/call      - Direct tool call`);
    console.log('');
    console.log('✅ MCP Server is ready for requests');
    console.log('');
    logger.info('startup.ready', {
      port: PORT,
      durationMs: Date.now() - startupStartedAt,
    });
  });

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
}

main();
