#!/usr/bin/env node
/**
 * MCP Server - HTTP/SSE Transport Mode
 * Allows CLI and other clients to connect via HTTP instead of spawning processes
 */

import express from 'express';
import cors from 'cors';
import { randomUUID } from 'crypto';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import server, { createRequestServer } from './server.js';
import { checkDatabaseConnection, closeDatabase } from './db/connection.js';
import logger from './utils/logger.js';
import config from './config.js';
import { resolveProjectContext } from './utils/project-context.js';
import { setMcpDbConnected, setMcpLoadedProject, setMcpProjectContext } from './utils/mcp-health.js';
import { inferBlockedStatus } from './utils/blocked-status.js';
import { isProjectAccessDenial } from './utils/project-access.js'; // [SCOPE 043 / T023]
import { companyprojects } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from './db/connection.js';
import {
  findFreePort,
  writeServiceEntry,
  removeServiceEntry,
  startParentWatcher,
  resolveParentPid,
  PortRangeExhaustedError,
} from './runtime/kit-hygiene.js';
import { authMiddleware } from './middleware/auth.js';
import { rateLimitMiddleware } from './middleware/rate-limit.js';
import { auditStartMiddleware, auditFinishMiddleware } from './middleware/audit.js';
import { securityHeadersMiddleware } from './middleware/security-headers.js';
import { WXKANBAN_VERSION } from './version.js'; // [SCOPE 133 / T017]

const app = express();
const PREFERRED_PORT = parseInt(String(process.env.MCP_HTTP_PORT || 3002), 10);
const SHUTDOWN_GRACE_MS = parseInt(String(process.env.KIT_SHUTDOWN_GRACE_MS || 5000), 10);

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
// [SCOPE 090 / BUG-2026-07-22] express.json() defaults to a 100kb body limit,
// which is the real ceiling on every MCP tool payload. That was already reachable
// by upsert_document (bodyMarkdown is uncapped) and by a buildscope call carrying
// several full narrative sections — and it fails as an opaque 413 well before any
// schema validation runs, so the caller sees a transport error rather than a
// useful message. Raised to give the field limits in schemas.ts real headroom.
app.use(express.json({ limit: process.env.MCP_MAX_BODY_SIZE || '10mb' }));
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

// Spec 028 middleware chain — order matters:
//   1. security-headers (always; cheap; sets HSTS/nosniff/no-referrer)
//   2. audit-start      (attach mutable audit record; needed by downstream)
//   3. rate-limit       (cheap reject before any DB hit)
//   4. auth             (validates bearer, attaches mcpScope)
//   5. audit-finish     (registers res.finish handler; writes audit row async)
// /health is exempt from every layer (each middleware short-circuits on it).
app.use(securityHeadersMiddleware);
app.use(auditStartMiddleware);
app.use(rateLimitMiddleware);
app.use(authMiddleware);
app.use(auditFinishMiddleware);

// SOC 2 H-3 (2026-08-03) — `_meta` is a TRUST BOUNDARY, not a hint.
//
// Every tool handler reads both its identity and its tenancy out of
// `request.params._meta`: `extractAuth()` takes `role`/`userId`/`apiKey` from
// it, and `getRequestScope()` takes the entire `mcpScope` from it. Whatever a
// transport leaves in `_meta` is what authorization then runs on.
//
// Only /call used to build `_meta` itself. /mcp spread the client's `_meta` and
// overrode three keys; /messages passed the body through untouched. So a caller
// holding any valid token could send:
//   _meta.role     = "admin"  -> reaches admin-only tools, including
//                                project.upgrade_mcp, which installs code
//   _meta.mcpScope = {...}    -> names another tenant's project, which every
//                                scoped-query check then trusts as the caller's
//                                own resolved scope
//
// One rule closes both: the server REPLACES these keys on every transport, so a
// client-supplied copy never reaches a handler.
// [SCOPE 043 / T025] `recordDenial` joins the strip list for the same reason as the
// rest: it is server-owned. A client cannot send a function, but it can send the KEY
// carrying a string, and the tool layer would then call a non-callable.
const SERVER_OWNED_META_KEYS = ['mcpScope', 'role', 'userId', 'apiKey', 'recordDenial'] as const;

function trustedMeta(req: RequestWithId, source: string): Record<string, unknown> {
  return {
    requestId: req.requestId,
    source,
    mcpScope: req.mcpScope,
    // [SCOPE 043 / T025] The tool layer's only way back to this request's audit row.
    // /call gets its denial outcome from the 403 (T023); /mcp and /messages return
    // JSON-RPC errors inside HTTP 200/202, where no status-code mapping can fire —
    // so on those transports this callback is what stops a denial auditing as
    // 'success'. Set here rather than in the handler because `req` lives here.
    recordDenial: (): void => {
      if (!req.mcpAudit) return;
      req.mcpAudit.outcome = 'scope-violation';
      req.mcpAudit.errorcode = req.mcpAudit.errorcode ?? 'cross-scope';
    },
    // `mcpapitokens` has no role column, so a token cannot express a role yet.
    // 'editor' is exactly what /call has always produced, so this changes no
    // working behaviour; admin-gated tools stay unreachable over HTTP until a
    // real role lands on the token. Never read this from the request.
    role: 'editor',
    userId: req.mcpScope?.userId ?? undefined,
  };
}

function withTrustedMeta(
  clientMeta: unknown,
  req: RequestWithId,
  source: string,
): Record<string, unknown> {
  const incoming = { ...((clientMeta as Record<string, unknown>) ?? {}) };
  for (const key of SERVER_OWNED_META_KEYS) delete incoming[key];
  return { ...incoming, ...trustedMeta(req, source) };
}

// Health check endpoint
app.get('/health', (_req, res) => {
  const health = {
    status: 'ok',
    service: 'mcp-project-hub',
    // [SCOPE 133 / T017] was a literal '0.1.0'. /health is what uptime checks and
    // App Runner read, so a frozen value here reports healthy-and-current for a build
    // that may be neither.
    version: WXKANBAN_VERSION,
    transport: 'http',
    dbConnected: config.databaseUrl ? true : false,
    timestamp: new Date().toISOString(),
  };
  return res.json(health);
});

// Spec 029 / T007 — HTTP 422 helper lives in utils/blocked-status.ts so
// unit tests can import it without pulling in this file's config + DB
// initialization.

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

    // Pass the already-parsed body. The global `express.json()` (above) has
    // already drained the request stream, so handlePostMessage must NOT re-read
    // it — otherwise getRawBody() sees an exhausted stream and the POST fails
    // with `400 stream is not readable`, breaking EVERY MCP client (Claude Code
    // included). The SDK uses this third `parsedBody` arg when provided.
    //
    // SOC 2 H-3: this body used to reach the handler verbatim, which made both
    // `_meta.role` and `_meta.mcpScope` caller-controlled on this path. Same
    // trusted-`_meta` rule as /call and /mcp now applies. It also gives the SSE
    // path a real scope for the first time, closing the scope-required defect
    // noted on injectScopeIntoMcpBody.
    const sseBody = injectScopeIntoMcpBody(req.body, req, 'http-sse');
    await sseTransport.handlePostMessage(req, res, sseBody);
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
          // Spec 028 / T010 — pipe the request's resolved scope into the tool
          // handler so it can build a scoped-query wrapper. SOC 2 H-3: built
          // server-side from the authenticated request, never from the body.
          _meta: trustedMeta(req, 'http-call'),
        },
      },
      {}
    );

    logger.info('mcp.call.success', {
      requestId: req.requestId,
      tool,
      durationMs: Date.now() - startedAt,
    });

    // Spec 029 / T007 / FR-012 — preflight-blocked envelopes surface as
    // HTTP 422 Unprocessable Entity so clients can branch on status code.
    // We detect by parsing the inner content[0].text JSON for the canonical
    // {success:false, blocked:true} pair. Body shape is unchanged
    // (FR-013), so legacy clients that only read the body still work.
    const innerStatus = inferBlockedStatus(result);
    if (innerStatus === 422) {
      return res.status(422).json(result);
    }
    return res.json(result);
  } catch (error) {
    // [SCOPE 043 / T023] Amendment D (FR-021) — this catch returned 500 for
    // EVERYTHING, so a refused request was reported to the caller as a server
    // failure and logged at ERROR a second time (the tool layer had already logged
    // it once). 403 is the honest status, and it is the one auditFinishMiddleware
    // maps to outcome 'scope-violation' — so the audit trail starts recording
    // denials as denials without any new plumbing, closing the residual left after
    // Amendment B where they were written as 'success'.
    if (isProjectAccessDenial(error)) {
      logger.warn('mcp.call.denied', {
        requestId: req.requestId,
        tool: (req.body as { tool?: unknown } | undefined)?.tool,
        durationMs: Date.now() - startedAt,
      });
      return res.status(403).json({
        error: 'scope-violation',
        message: (error as Error).message,
      });
    }
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

// [SCOPE 028 / Amendment A] Streamable HTTP transport (MCP).
// Proxy-friendly: stateless (plain-JSON responses, no long-lived stream), so it
// survives TLS-inspection / SSE-buffering proxies (e.g. Cisco Secure Access) that
// break /sse. Per-request server + transport avoids the singleton _transport race.
// Applies the trusted-`_meta` rule (see SERVER_OWNED_META_KEYS above) to every
// tools/call message in a JSON-RPC body, single or batched. Used by BOTH the
// streamable /mcp path and the /sse + /messages path, which previously passed
// the client's body through untouched.
function injectScopeIntoMcpBody(body: unknown, req: RequestWithId, source: string): unknown {
  const withMeta = (msg: unknown): unknown => {
    const m = msg as { method?: string; params?: Record<string, unknown> } | null;
    if (m && typeof m === 'object' && m.method === 'tools/call') {
      const params = (m.params ?? {}) as Record<string, unknown>;
      params._meta = withTrustedMeta(params._meta, req, source);
      m.params = params;
    }
    return m;
  };
  return Array.isArray(body) ? body.map(withMeta) : withMeta(body);
}

async function handleMcpRequest(req: RequestWithId, res: express.Response): Promise<void> {
  const requestServer = createRequestServer();
  // Stateless + JSON responses (no text/event-stream): plain application/json
  // request/response, the most proxy-safe shape for TLS-inspection proxies.
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });
  res.on('close', () => {
    void transport.close();
    void requestServer.close();
  });
  try {
    await requestServer.connect(transport);
    const body = req.method === 'POST' ? injectScopeIntoMcpBody(req.body, req, 'http-mcp') : undefined;
    // express req/res extend node's IncomingMessage/ServerResponse (same as the SSE path).
    await transport.handleRequest(req as never, res as never, body);
  } catch (error) {
    logger.error('mcp.streamablehttp.error', error as Error, { requestId: req.requestId });
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  }
}

app.post('/mcp', (req: RequestWithId, res) => { void handleMcpRequest(req, res); });
app.get('/mcp', (req: RequestWithId, res) => { void handleMcpRequest(req, res); });
app.delete('/mcp', (req: RequestWithId, res) => { void handleMcpRequest(req, res); });

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

  // [SCOPE 027 / T008] BEGIN — Resolve PORT via autoselect before banner
  let PORT: number;
  try {
    PORT = await findFreePort(PREFERRED_PORT);
  } catch (err) {
    if (err instanceof PortRangeExhaustedError) {
      console.error(
        `ERROR: cannot find a free port for MCP in range ${err.preferredPort}–${err.preferredPort + err.scanRange - 1}.\n` +
        `Suggestions:\n` +
        `  - Kill stale processes: wxkanban-agent kit:stop\n` +
        `  - Override the start port: MCP_HTTP_PORT=4000 npm run kit:start`,
      );
      process.exit(1);
    }
    throw err;
  }
  // [SCOPE 027 / T008] END

  // [SCOPE 133 / T017] The banner used to carry a hardcoded "Version 0.1.0", which
  // made a rolled-back build look like the current one in the very place a deploy
  // gets diagnosed. The version now rides the structured startup record instead of
  // an ASCII box: a log query can read this, and it cannot go stale independently.
  logger.info('startup.begin', { transport: 'http', port: PORT, version: WXKANBAN_VERSION });

  console.log('');
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║           🚀 wxKanban MCP Project Hub Server                   ║');
  console.log('║              HTTP/SSE Transport Mode                           ║');
  console.log('╠════════════════════════════════════════════════════════════════╣');
  console.log('║  📝 Project Management Integration for wxKanban Platform       ║');
  console.log('║  🔗 HTTP API: http://localhost:' + PORT + '                      ║');
  console.log('╚════════════════════════════════════════════════════════════════╝');
  console.log('');

  logger.info('Starting MCP Project Hub Server (HTTP mode)...');
  logger.info(`Transport: HTTP/SSE`);
  logger.info(`Port: ${PORT} (preferred ${PREFERRED_PORT})`);
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
  const httpServer = app.listen(PORT, () => {
    console.log('');
    console.log(`🌐 Server running at http://localhost:${PORT}`);
    console.log('');
    console.log('Available endpoints:');
    console.log(`  • GET  http://localhost:${PORT}/health    - Health check`);
    console.log(`  • GET  http://localhost:${PORT}/sse       - SSE connection (MCP protocol)`);
    console.log(`  • POST http://localhost:${PORT}/messages  - MCP message endpoint`);
    console.log(`  • GET  http://localhost:${PORT}/tools     - List available tools`);
    console.log(`  • POST http://localhost:${PORT}/call      - Direct tool call`);
    console.log(`  • POST http://localhost:${PORT}/mcp       - Streamable HTTP (MCP; proxy-friendly)`);
    console.log('');
    console.log('✅ MCP Server is ready for requests');
    console.log('');
    logger.info('startup.ready', {
      port: PORT,
      durationMs: Date.now() - startupStartedAt,
    });
  });

  // [SCOPE 027 / T008] BEGIN — Runtime-state write + parent-watcher
  const parentpid = resolveParentPid();
  writeServiceEntry('mcp', {
    port: PORT,
    pid: process.pid,
    parentpid,
    startedAt: new Date().toISOString(),
    cmd: 'node mcp-server/dist/index-http.js',
  });

  let shuttingDown = false;
  const gracefulShutdown = async (reason: string): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info(`mcp: shutting down (${reason})`);
    try { removeServiceEntry('mcp'); } catch { /* best effort */ }
    const closed = new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        try { (httpServer as unknown as { closeAllConnections?: () => void }).closeAllConnections?.(); } catch { /* node < 18.2 */ }
        resolve();
      }, SHUTDOWN_GRACE_MS);
      httpServer.close(() => { clearTimeout(timer); resolve(); });
    });
    await closed;
    await closeDatabase();
    process.exit(0);
  };

  const watcher = startParentWatcher(parentpid, () => {
    void gracefulShutdown('parent-gone');
  });
  void watcher;
  // [SCOPE 027 / T008] END

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await gracefulShutdown('SIGINT');
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await gracefulShutdown('SIGTERM');
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
