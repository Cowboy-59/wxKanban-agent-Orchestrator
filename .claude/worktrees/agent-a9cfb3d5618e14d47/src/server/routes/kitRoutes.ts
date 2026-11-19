/**
 * Kit API Routes
 * 
 * API endpoints for project kit management.
 * Part of Spec 011: New Project — AI-Ready Project Provisioning
 */

import { Router, Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../db/client';
import { projectkits } from '../../db/schema/projectkit';
import { projectkitfiles } from '../../db/schema/projectkitfile';
import { companyprojects } from '../../db/schema/companyproject';
import { kitGenerationService } from '../services/KitGenerationService';
import { apiTokenService } from '../services/ApiTokenService';
import { kitProxyService, derivePlatform, KitProxyError } from '../services/KitProxyService';
import {
  KIT_GATE_MESSAGE,
  decideGate,
  extractAcknowledgement,
  hasSeenPreservationGate,
  recordPreservationGate,
} from '../services/KitUpgradeGateService';
import { authenticateToken } from '../middleware/auth';
import { authenticateProjectKitAccess } from '../middleware/projectKitAuth';
import { requireAdmin } from '../middleware/requireAdmin';
import { canManageProjectKit, companyReachesProject } from '../lib/projectAccess.js'; // [SCOPE 143 / T031] FR-019

import { logger } from '../lib/logger.js';
import archiver from 'archiver';
import { readFileSync } from 'fs';
import * as path from 'path';

const KIT_VERSION: string = (() => {
  try {
    const pkgPath = path.resolve(process.cwd(), 'wxkanban-agent/package.json');
    return JSON.parse(readFileSync(pkgPath, 'utf8')).version;
  } catch {
    return '0.0.0';
  }
})();



const router = Router();

function getKitRuntimePreflight(projectId: string) {
  const databaseUrl = process.env.DATABASE_URL;
  const checks = {
    projectId: Boolean(projectId),
    databaseUrl: Boolean(databaseUrl),
  };

  const missing: string[] = [];
  if (!checks.projectId) missing.push('projectId');
  if (!checks.databaseUrl) missing.push('DATABASE_URL');

  logger.debug({ databaseUrl: databaseUrl ? '***PRESENT***' : '***MISSING***', checks, missing }, 'Preflight check running');

  return {
    ready: missing.length === 0,
    checks,
    missing,
    requiredAtRuntime: [
      'WXKANBAN_PROJECT_ID',
      'WXKANBAN_MCP_BASE_URL',
      'WXKANBAN_API_TOKEN',
    ],
  };
}

/**
 * GET /api/projects/:id/kit/preflight
 * Validate server-side prerequisites required to generate/download a runnable kit.
 */
router.get('/:id/kit/preflight', authenticateToken, async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const userId = (req as any).userid;
    const companyId = (req as any).companyid;
    const usertype = (req as any).usertype;
    const isAdmin = usertype === 'ADMIN';

    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);

    // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
    if (!project || !(await companyReachesProject(companyId, project))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Spec 011 Access Control — ADMIN or assigned user
    if (!(await canManageProjectKit(userId, projectId, isAdmin))) {
      return res.status(403).json({ error: 'You must be assigned to this project to access its kit.' });
    }

    const preflight = getKitRuntimePreflight(projectId);

    if (!preflight.ready) {
      return res.status(412).json({
        ...preflight,
        message: 'Kit preflight failed. Configure missing server variables before downloading kit.',
      });
    }

    return res.json({
      ...preflight,
      message: 'Kit preflight passed. Project kit can be generated/downloaded safely.',
    });
  } catch (error) {
    const errorDetails = error instanceof Error
      ? { message: error.message, stack: error.stack, name: error.name }
      : { raw: error, type: typeof error };
    logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed kit preflight');
    return res.status(500).json({ error: 'Failed kit preflight', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * GET /api/projects/:id/kit
 * Get kit status for a project
 */
router.get('/:id/kit', authenticateToken, async (req: Request, res: Response) => {
  try {
    const projectId = String(req.params.id);
    const userId = (req as any).userid;
    const companyId = (req as any).companyid;
    const usertype = (req as any).usertype;
    const isAdmin = usertype === 'ADMIN';

    // Check project access
    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);

    // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
    if (!project || !(await companyReachesProject(companyId, project))) {
      return res.status(404).json({ error: 'Project not found' });
    }

    // Spec 011 Access Control — canManage drives UI button visibility.
    // Status is visible to any company user; action buttons are not.
    const canManage = await canManageProjectKit(userId, projectId, isAdmin);

    // Hosted-MCP base URL (spec 028) — surfaced so the Environment Setup panel
    // can render the exact .env entries the kit ships, for copy/paste when the
    // dotfile didn't materialise on disk (e.g. macOS Finder hides dotfiles).
    const mcpBaseUrl = process.env.WXKANBAN_MCP_BASE_URL || 'https://mcp.wxperts.com';

    // Get kit
    const [kit] = await db
      .select()
      .from(projectkits)
      .where(eq(projectkits.projectid, projectId))
      .limit(1);

    if (!kit) {
      return res.json({
        status: 'not_found',
        message: 'No kit generated for this project',
        canManage,
        mcpBaseUrl,
      });
    }

    return res.json({
      kitId: kit.id,
      status: kit.status,
      primaryAi: kit.primaryai,
      kitVersion: KIT_VERSION,
      downloadCount: kit.downloadcount,
      generatedAt: kit.generatedat,
      createdAt: kit.createdat,
      updatedAt: kit.updatedat,
      canManage,
      mcpBaseUrl,
    });

  } catch (error) {
    const errorDetails = error instanceof Error 
      ? { message: error.message, stack: error.stack, name: error.name }
      : { raw: error, type: typeof error };
    logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed to get kit status');
    return res.status(500).json({ error: 'Failed to get kit status', details: error instanceof Error ? error.message : String(error) });
  }
});

/**
 * POST /api/projects/:id/kit/generate
 * Generate or regenerate kit for a project
 */
router.post(
  '/:id/kit/generate',
  authenticateToken,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);
      const userId = (req as any).userid;
      const companyId = (req as any).companyid;
      const usertype = (req as any).usertype;
      const isAdmin = usertype === 'ADMIN';

      const { primaryAi = 'generic' } = req.body;

      // Check project access
      const [project] = await db
        .select()
        .from(companyprojects)
        .where(eq(companyprojects.id, projectId))
        .limit(1);

      // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
      if (!project || !(await companyReachesProject(companyId, project))) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Spec 011 Access Control — ADMIN or assigned user
      if (!(await canManageProjectKit(userId, projectId, isAdmin))) {
        return res.status(403).json({ error: 'You must be assigned to this project to generate its kit.' });
      }

      // Start async generation
      const result = await kitGenerationService.generateKit({
        projectId,
        userId,
        companyId,
        primaryAi,
        importMode: false,
      });

      if (result.status === 'failed') {
        return res.status(500).json({
          error: 'Kit generation failed',
          message: result.error,
        });
      }

      return res.json({
        kitId: result.kitId,
        status: 'generating',
        message: 'Kit generation started',
      });

    } catch (error) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed to generate kit');
      return res.status(500).json({ error: 'Failed to generate kit', details: error instanceof Error ? error.message : String(error) });
    }
  }
);

/**
 * GET /api/projects/:id/kit/download
 * Download kit as ZIP file
 *
 * [SCOPE 083 / T007] Auth widened from authenticateToken (JWT only) to
 * authenticateProjectKitAccess (JWT first, then project-scoped API token).
 * The Dev Cockpit holds only an API token in SecretStorage, so it could not
 * call this route at all — which blocked bootstrapping a kit-less workspace.
 * Same middleware already guards /kit/upgrade and /kit/latest-version below;
 * JWT callers (the browser) are unaffected, and a token scoped to another
 * project is rejected with 403 by the middleware.
 */
router.get(
  '/:id/kit/download',
  authenticateProjectKitAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);
      const userId = (req as any).userid;
      const companyId = (req as any).companyid;
      const usertype = (req as any).usertype;
      const isAdmin = usertype === 'ADMIN';

      // Check project access
      const [project] = await db
        .select()
        .from(companyprojects)
        .where(eq(companyprojects.id, projectId))
        .limit(1);

      // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
      if (!project || !(await companyReachesProject(companyId, project))) {
        return res.status(404).json({ error: 'Project not found' });
      }

      // Spec 011 Access Control — ADMIN or assigned user
      if (!(await canManageProjectKit(userId, projectId, isAdmin))) {
        return res.status(403).json({ error: 'You must be assigned to this project to download its kit.' });
      }

      const preflight = getKitRuntimePreflight(projectId);
      if (!preflight.ready) {
        return res.status(412).json({
          error: 'Kit preflight failed',
          missing: preflight.missing,
          checks: preflight.checks,
          message: 'Server is missing required configuration for secure kit download.',
        });
      }

      // R14 feature-flag branch: serve from the GitHub orchestrator release
      // instead of assembling via KitGenerationService. The legacy path below
      // is retained for the 7-day bake + rollback per spec 019 R14 AC6.
      if (process.env.KIT_DOWNLOAD_SOURCE === 'orchestrator') {
        try {
          const version = typeof req.query.version === 'string' ? req.query.version : undefined;
          const ua = req.headers['user-agent'];
          const uaString = typeof ua === 'string' ? ua : undefined;
          const platform = derivePlatform(
            typeof req.query.platform === 'string' ? req.query.platform : undefined,
            uaString
          );
          await kitProxyService.serve(res, { projectId, userId, companyId, version, platform });
          return;
        } catch (proxyErr: unknown) {
          if (proxyErr instanceof KitProxyError) {
            const err: KitProxyError = proxyErr;
            logger.warn({ err, projectId, status: err.status }, 'kit proxy failure');
            return res.status(err.status).json({ error: err.message });
          }
          logger.error({ err: proxyErr, projectId }, 'kit proxy unexpected failure');
          return res.status(500).json({ error: 'kit personalization failed' });
        }
      }

      // Get kit
      const [kit] = await db
        .select()
        .from(projectkits)
        .where(eq(projectkits.projectid, projectId))
        .limit(1);

      if (!kit || kit.status !== 'ready') {
        return res.status(404).json({
          error: 'Kit not ready',
          message: kit?.status === 'generating'
            ? 'Kit is still being generated'
            : 'No kit available for this project',
        });
      }

      // Create a fresh token for each download so the kit always has a valid token.
      // Phase 11 (spec 028 amendment 2026-05-23): projectId is required —
      // tokens live in mcpapitokens and authenticate against both MCP and
      // wxKanban kit endpoints.
      const newToken = await apiTokenService.createToken(
        userId,
        companyId,
        projectId,
        `Kit Download Token ${new Date().toISOString()}`,
      );
      const apiTokenValue = newToken.token;
      res.setHeader('X-API-Token', apiTokenValue);

      // Get kit files
      const files = await db
        .select()
        .from(projectkitfiles)
        .where(eq(projectkitfiles.kitid, kit.id));

      if (files.length === 0) {
        return res.status(404).json({ error: 'Kit files not found' });
      }

      // [SPEC 028 / T050] Hosted MCP — no DB credentials shipped in the kit.
      const mcpBaseUrl = process.env.WXKANBAN_MCP_BASE_URL || 'https://mcp.wxperts.com';

      // Create ZIP archive
      const archive = archiver('zip', { zlib: { level: 9 } });

      // Set response headers for ZIP download
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename="${project.name.replace(/[^a-z0-9]/gi, '_')}-kit.zip"`);
      res.setHeader('X-Kit-Source', 'legacy-db');
      res.setHeader('X-Kit-Version', kit.kitversion || 'unknown');

      // Pipe archive to response
      archive.pipe(res);

      const runtimeEnvContent = `# wxKanban Project Environment (hosted MCP per spec 028)
WXKANBAN_MCP_BASE_URL=${mcpBaseUrl}
WXKANBAN_API_TOKEN=${apiTokenValue}
WXKANBAN_PROJECT_ID=${projectId}
`;

      // Add all kit files from database to the archive.
      // Always override .env at download time so token/API key are current.
      let envIncluded = false;
      for (const file of files) {
        if (file.filepath === '.env') {
          archive.append(runtimeEnvContent, { name: '.env' });
          envIncluded = true;
          continue;
        }
        archive.append(file.content, { name: file.filepath });
      }

      if (!envIncluded) {
        archive.append(runtimeEnvContent, { name: '.env' });
      }

      // Add README with setup instructions
      const readmeContent = `# ${project.name} - wxKanban Project Kit

## Setup Instructions

1. Extract this ZIP file to your desired location
2. Copy the API token from .env file (or use the one shown in the browser)
3. Run \`node scripts/setup-mcp.mjs\`
4. Validate runtime with \`node scripts/mcp-health-check.mjs\`
5. Edit \`ProjectOverview.md\` to give a general overview of the project


## Scope Editing and Creation of Features

\`specs/project-scope\` is where you add each feature scope you wish to generate for the application. Use a 001, 002, 003 prefix such as 001-initialization, 002-MainLandingPage, etc. to build these. That way you can use the 001, 002 to generate the documentation and tasks.

- \`createspecs 001\` will create a directory \`001-init\` (example) and fill in all documentation and update the wxKanban database with the information and tasks
- \`implement 001\` will create the code to build the application feature

Generated: ${new Date().toISOString()}

`;
      archive.append(readmeContent, { name: 'README-KIT.md' });

      // Update download count before finalizing archive stream
      await db
        .update(projectkits)
        .set({
          downloadcount: (kit.downloadcount || 0) + 1,
          updatedat: new Date(),
        })
        .where(eq(projectkits.id, kit.id));

      logger.info({ kitId: kit.id, userId }, 'Kit downloaded');

      // Finalize the archive
      await archive.finalize();
      return;

    } catch (error) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed to download kit');
      return res.status(500).json({ error: 'Failed to download kit', details: error instanceof Error ? error.message : String(error) });
    }
  }
);

/**
 * GET /api/projects/:id/kit/upgrade
 * Spec 019 R15 — preserve-mode kit upgrade.
 * Streams an archive that excludes per-project files + customizable templates,
 * so it can be safely extracted over an existing install.
 */
router.get(
  '/:id/kit/upgrade',
  authenticateProjectKitAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);
      const userId = (req as any).userid;
      const companyId = (req as any).companyid;
      const usertype = (req as any).usertype;
      const isAdmin = usertype === 'ADMIN';

      const [project] = await db
        .select()
        .from(companyprojects)
        .where(eq(companyprojects.id, projectId))
        .limit(1);

      // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
      if (!project || !(await companyReachesProject(companyId, project))) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!(await canManageProjectKit(userId, projectId, isAdmin))) {
        return res.status(403).json({ error: 'You must be assigned to this project to upgrade its kit.' });
      }

      const rawVersion = typeof req.query.version === 'string' ? req.query.version : undefined;
      const fromVersion = typeof req.query.fromVersion === 'string' ? req.query.fromVersion : undefined;
      const allowDowngrade = req.query.allowDowngrade === 'true';

      // [SCOPE 121 / T011] Preservation gate. The fix travels inside the kit, so
      // it arrives through the consumer's OWN pre-fix upgrader — the one that
      // overwrites their edits. This is the only place that window can be closed.
      // Plain text, not JSON: the shipped client prints body.slice(0, 300)
      // verbatim and every brace is a character stolen from the instruction.
      const { acknowledged, version } = extractAcknowledgement(rawVersion, req.query.ack);
      const alreadyWarned = await hasSeenPreservationGate(companyId, projectId);
      const gate = decideGate({ fromVersion, acknowledged, alreadyWarned });

      if (gate.gated) {
        await recordPreservationGate({
          companyId,
          projectId,
          userId,
          fromVersion,
          outcome: 'warned',
        });
        logger.warn({ projectId, fromVersion, reason: gate.reason }, 'kit upgrade gated for preservation');
        return res.status(409).type('text/plain').send(KIT_GATE_MESSAGE);
      }

      if (acknowledged) {
        await recordPreservationGate({
          companyId,
          projectId,
          userId,
          fromVersion,
          outcome: 'acknowledged',
        });
      }
      const ua = req.headers['user-agent'];
      const uaString = typeof ua === 'string' ? ua : undefined;
      const platform = derivePlatform(
        typeof req.query.platform === 'string' ? req.query.platform : undefined,
        uaString
      );

      try {
        await kitProxyService.serveUpgrade(res, {
          projectId,
          userId,
          companyId,
          version,
          fromVersion,
          allowDowngrade,
          platform,
        });
        return;
      } catch (proxyErr: unknown) {
        if (proxyErr instanceof KitProxyError) {
          const err: KitProxyError = proxyErr;
          logger.warn({ err, projectId, status: err.status }, 'kit upgrade proxy failure');
          return res.status(err.status).json({ error: err.message });
        }
        throw proxyErr;
      }
    } catch (error) {
      const errorDetails = error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed to serve kit upgrade');
      return res.status(500).json({ error: 'Failed to serve kit upgrade', details: error instanceof Error ? error.message : String(error) });
    }
  }
);

/**
 * GET /api/projects/:id/kit/latest-version
 * Spec 019 R15 AC8 — cheap "is there an upgrade?" check used by the VSCode
 * folder-open task. Returns currentVersion / latestVersion / upgradeAvailable.
 */
router.get(
  '/:id/kit/latest-version',
  authenticateProjectKitAccess,
  async (req: Request, res: Response) => {
    try {
      const projectId = String(req.params.id);
      const userId = (req as any).userid;
      const companyId = (req as any).companyid;
      const usertype = (req as any).usertype;
      const isAdmin = usertype === 'ADMIN';

      const [project] = await db
        .select()
        .from(companyprojects)
        .where(eq(companyprojects.id, projectId))
        .limit(1);

      // [SCOPE 143 / T031] owner company, or a consultant with a live engagement (FR-019)
      if (!project || !(await companyReachesProject(companyId, project))) {
        return res.status(404).json({ error: 'Project not found' });
      }

      if (!(await canManageProjectKit(userId, projectId, isAdmin))) {
        return res.status(403).json({ error: 'You must be assigned to this project to check its kit version.' });
      }

      const ua = req.headers['user-agent'];
      const uaString = typeof ua === 'string' ? ua : undefined;
      const platform = derivePlatform(
        typeof req.query.platform === 'string' ? req.query.platform : undefined,
        uaString
      );

      try {
        const result = await kitProxyService.latestVersion({ projectId, platform });
        return res.json(result);
      } catch (proxyErr: unknown) {
        if (proxyErr instanceof KitProxyError) {
          const err: KitProxyError = proxyErr;
          logger.warn({ err, projectId, status: err.status }, 'latest-version proxy failure');
          return res.status(err.status).json({ error: err.message });
        }
        throw proxyErr;
      }
    } catch (error) {
      const errorDetails = error instanceof Error
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      logger.error({ error: errorDetails, projectId: req.params.id }, 'Failed to fetch latest kit version');
      return res.status(500).json({ error: 'Failed to fetch latest kit version', details: error instanceof Error ? error.message : String(error) });
    }
  }
);

/**
 * POST /api/projects/import
 * Import an existing project and generate kit
 */
router.post(
  '/import',
  authenticateToken,
  requireAdmin,
  async (req: Request, res: Response) => {
    try {
      const {
        name,
        description,
        primaryAi = 'generic',
      } = req.body;

      const userId = (req as any).userid;
      const companyId = (req as any).companyid;

      // Create project first
      const { ProjectService } = await import('../services/ProjectService');
      const project = await ProjectService.createProject(
        userId,
        companyId,
        name,
        description,
        undefined,
        undefined,
        undefined,
        undefined,
        'ACTIVE',
        {},
        false, // Don't generate kit yet
        primaryAi
      );

      // Generate kit in import mode
      const kitResult = await kitGenerationService.generateKit({
        projectId: project.id,
        userId,
        companyId,
        primaryAi,
        importMode: true,
      });

      if (kitResult.status === 'failed') {
        // Project was created but kit failed — still return project
        logger.warn({ projectId: project.id }, 'Project created but kit generation failed');
      }

      return res.status(201).json({
        project: {
          id: project.id,
          name: project.name,
          description: project.description,
          status: project.status,
          createdAt: project.createdat,
        },
        kit: {
          kitId: kitResult.kitId,
          status: kitResult.status,
          importMode: true,
        },
        message: kitResult.status === 'ready'
          ? 'Project imported and kit generated'
          : 'Project imported but kit generation failed',
      });

    } catch (error) {
      const errorDetails = error instanceof Error 
        ? { message: error.message, stack: error.stack, name: error.name }
        : { raw: error, type: typeof error };
      logger.error({ error: errorDetails }, 'Failed to import project');
      return res.status(500).json({ error: 'Failed to import project', details: error instanceof Error ? error.message : String(error) });
    }
  }
);

// Spec 028 Phase 11 (2026-05-23): /api/user/tokens GET/POST/DELETE removed.
// Personal/user-scoped tokens are no longer supported — the unified
// `mcpapitokens` store requires projectid NOT NULL. Tokens are issued by the
// kit-download flow (per-project) and managed implicitly by the kit lifecycle.

export default router;
