import { Router, Response, NextFunction } from 'express';
import { z } from 'zod';
import { ProjectService } from '~/server/services/ProjectService.js';
import { PhaseService } from '~/server/services/PhaseService.js';
import { ProjectDocumentService } from '~/server/services/ProjectDocumentService.js';
import { renderStackMarkdown, DEFAULT_DESIGN_TOKENS, type DesignTokens } from '~/shared/stack-defaults.js';
import { generateOnce } from '~/server/ai/llm-provider.js';
import { ScopeService } from '~/server/services/ScopeService.js';
import { TaskService } from '~/server/services/taskService.js';
import { ScopeStageService } from '~/server/services/ScopeStageService.js'; // [SCOPE 123 / T019]
import { ScopeChatService } from '~/server/services/ScopeChatService.js';
import { getProposalById, linkProposalToProject } from '~/server/services/proposalService.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { db } from '~/db/client.js';
import { companyprojects as projects } from '~/db/schema/companyproject.js';
import { projectphases } from '~/db/schema/projectphase.js';
import { projecttasks as tasks } from '~/db/schema/projecttask.js';
import { projectspecifications as specifications } from '~/db/schema/projectspecification.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { companyauditlogs } from '~/db/schema/companyauditlog.js';
import { projecttimeentries as timeentries } from '~/db/schema/projecttimeentry.js';
import { eq, and, isNull, inArray, count, sql, desc } from 'drizzle-orm';
import { validateBody, validateParams, validateQuery } from '~/server/middleware/validation.js';
import { authenticateToken, requireAuth, AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { assertConsultantCannotAdvancePhase } from '~/server/services/EngagementVisibility.js';
import type { PhaseCompletion } from '~/shared/types/projects.js';

const router = Router();
const logger = createLogger('projects-routes');

// ─── Validation schemas ───────────────────────────────────────────────────────

// [SCOPE 055] One captured stack choice — value + one-line rationale.
const stackChoiceSchema = z.object({ value: z.string(), rationale: z.string() });
const appTypeEnum = z.enum(["web", "desktop", "mobile"]);
const stackChoicesSchema = z.object({
  backend: stackChoiceSchema,
  frontend: stackChoiceSchema,
  database: stackChoiceSchema,
  styling: stackChoiceSchema,
  testing: stackChoiceSchema,
  hosting: stackChoiceSchema,
});
const lookFeelSchema = z
  .object({ galleryKey: z.string().nullable(), cited: z.string().nullable() })
  .nullable();
const tokensSchema = z.object({
  colors: z.object({
    primary: z.string(),
    secondary: z.string(),
    neutral: z.string(),
    background: z.string(),
    foreground: z.string(),
  }),
  typography: z.object({ fontFamily: z.string(), scale: z.string() }),
  spacing: z.object({ base: z.string(), radius: z.string() }),
});

// [SCOPE 055 / Amendment C] Accept BOTH the multi-type shape (appTypes[] + stacks
// record) and the legacy single-type shape ({appType, stack}), normalizing the
// legacy form into the multi-type form. This keeps project creation working for any
// still-cached old client bundle during/after the rollout. Output is always the new
// shape, so downstream renderStackMarkdown / logging see one consistent structure.
const stackPayloadSchema = z.union([
  z.object({
    appTypes: z.array(appTypeEnum).min(1),
    // partialRecord: the client only sends entries for the SELECTED app types, not
    // all three. z.record(enum, …) would (in zod 4) require every enum key present.
    stacks: z.partialRecord(appTypeEnum, stackChoicesSchema),
    lookFeelReference: lookFeelSchema,
    tokens: tokensSchema,
  }),
  z
    .object({
      appType: appTypeEnum,
      stack: stackChoicesSchema,
      lookFeelReference: lookFeelSchema,
      tokens: tokensSchema,
    })
    .transform((old) => ({
      appTypes: [old.appType],
      stacks: { [old.appType]: old.stack },
      lookFeelReference: old.lookFeelReference,
      tokens: old.tokens,
    })),
]);

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name required'),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVE", "BRANCHED"]).optional(),
  hourlyrate: z.number().min(0).optional(),
  allocatedhours: z.number().min(0).optional(),
  pmsystems: z.string().optional(),
  securityclassification: z.string().max(50).optional(),
  phaseassignments: z.record(z.string(), z.string().uuid()).optional(),
  generatekit: z.boolean().optional(),
  primaryai: z.string().optional(),
  proposalid: z.string().uuid().optional(),
  // When true, bypass the duplicate-name guard (user confirmed "create anyway").
  allowduplicate: z.boolean().optional(),
  // [SCOPE 055] Optional stack & style captured in the new-project walkthrough.
  // Persisted as the project's ProjectStack document (DB source of truth; the kit
  // materializes stack.md on next project open). Default-first: omitted when the
  // user skipped the step. Accepts both the multi-type and legacy single-type shapes.
  stack: stackPayloadSchema.optional(),
});

const updateProjectSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "ARCHIVE", "BRANCHED"]).optional(),
  hourlyrate: z.number().min(0).optional(),
  allocatedhours: z.number().min(0).optional(),
  pmsystems: z.string().optional(),
  securityclassification: z.string().optional(),
  // [SCOPE 119 / T008] The client this project is done for (SPEC-119 FR-006).
  // Nullable — passing null clears the association. One customer per project;
  // many-to-many would leave invoicing unable to say which client to bill.
  // Reassignment never rewrites historical time entries: those reference the
  // project, which is unaffected.
  customerid: z.string().uuid().nullable().optional(),
  // [SCOPE 112 / T006] `audittype` retired from the write surface. Compliance
  // enablement is per-project and multi-framework — set it through
  // PUT /api/audit/config?projectId=…, which is ADMIN-gated per FR-003.
});

const projectIdSchema = z.object({
  id: z.string().uuid('Project ID must be a valid UUID'),
});

const phaseIdSchema = z.object({
  id: z.string().uuid(),
  phaseid: z.string().uuid(),
});

const taskIdSchema = z.object({
  id: z.string().uuid(),
  phaseid: z.string().uuid(),
  taskid: z.string().uuid(),
});

const specIdSchema = z.object({
  id: z.string().uuid(),
  phaseid: z.string().uuid(),
  specid: z.string().uuid(),
});

const docIdSchema = z.object({
  id: z.string().uuid(),
  docid: z.string().uuid(),
});

const projectQuerySchema = z.object({
  phase: z.string().optional(),
  search: z.string().optional(),
  // When 'true', return every non-archived project in the company instead of
  // only the ones assigned to the current user (no effect for ADMIN, who always
  // sees all company projects).
  all: z.enum(['true', 'false']).optional(),
});

const assignUserSchema = z.object({
  assigneduserid: z.preprocess(
    (val) => {
      // Convert empty string or undefined to null before validation
      if (val === "" || val === undefined) return null;
      return val;
    },
    z.union([z.string().uuid(), z.null()]).optional()
  ),
});

const advanceSchema = z.object({
  reason: z.string().optional(),
});

const reopenSchema = z.object({
  reason: z.string().min(1, 'Reason is required'),
});

const createTaskSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  issuetype: z.enum(['task', 'bug', 'feature']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  assignedtoid: z.string().uuid().optional(),
  effort: z.enum(['small', 'medium', 'large', 'unknown']).optional(),
  sourceoforigin: z.enum(['external', 'internal', 'ai_proposed']).optional(),
});

const updateTaskSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.enum(['open', 'in_progress', 'completed', 'orphaned']).optional(),
  results: z.enum(['pass', 'fail']).nullable().optional(),
  priority: z.string().optional(),
  assignedtoid: z.string().uuid().nullable().optional(),
  issuetype: z.string().optional(),
});


const createSpecSchema = z.object({
  title: z.string().min(1),
  content: z.string().min(1),
});

const updateSpecSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
  status: z.enum(['draft', 'review', 'approved']).optional(),
});

const updateDocSchema = z.object({
  title: z.string().optional(),
  content: z.string().optional(),
});

// ─── Helper ───────────────────────────────────────────────────────────────────

function requireAdmin(req: AuthRequest, res: Response): boolean {
  if (req.usertype !== 'ADMIN') {
    res.status(403).json({ error: 'Admin role required' });
    return false;
  }
  return true;
}

// [SOC 2 CC6.1/CC6.3 — H-2] Tenant-isolation gate for project sub-resources.
// Every `/:id/...` route below trusts the `:id` (project) in the URL; without
// this, any authenticated user could read/modify another company's tasks,
// specs, scopes, documents, etc. by UUID (IDOR). Applied after auth so
// req.companyid is populated. 404 (not 403) so we don't confirm existence to
// outsiders. Coarse company/engagement check only — finer per-phase access is
// still enforced by ProjectService.getProject on the project page.
const requireProjectAccess = asyncHandler(
  async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    const { companyid } = req;
    if (!companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const ok = await ProjectService.canAccessProjectTenant(req.params.id, companyid);
    if (!ok) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    next();
  },
);

// [H-2] Apply the tenant gate to every project sub-resource prefix. Registered
// before the route handlers so it runs first; auth is included in the chain
// because router.use middleware executes ahead of route-level middleware (so
// req.companyid would otherwise be unset here). Bare `/:id`, `/`, `/derive-tokens`,
// and `/admin/*` are intentionally NOT matched and keep their own checks.
for (const prefix of [
  '/:id/phases',
  '/:id/tasks',
  '/:id/documents',
  '/:id/stack',
  '/:id/panel',
  '/:id/scaffold',
  '/:id/learnings',
  '/:id/scopes',
  '/:id/generate-audit',
]) {
  router.use(prefix, authenticateToken, requireAuth, requireProjectAccess);
}

// [SCOPE 055 / FR-004] Derive design tokens from a look-and-feel reference on
// demand (web AI-assist in the new-project Stack & Style step). Best-effort:
// returns the default tokens whenever no reference is given or the LLM
// fails/returns unparseable output, so the create flow never blocks on the LLM.
router.post(
  '/derive-tokens',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { appType, galleryKey, cited } = req.body as {
      appType?: string;
      galleryKey?: string | null;
      cited?: string | null;
    };

    if (!galleryKey && !cited) {
      res.json({ tokens: DEFAULT_DESIGN_TOKENS, source: 'default' });
      return;
    }

    try {
      const systemPrompt =
        'You are a design-systems expert. Given a look-and-feel reference, output ONLY a compact JSON object of design tokens — no prose, no markdown code fences.';
      const userPrompt =
        `Application type: ${appType ?? 'web'}\n` +
        `Inspiration gallery: ${galleryKey ?? 'n/a'}\n` +
        `Cited reference: ${cited ?? 'n/a'}\n\n` +
        'Return JSON with exactly this shape (hex colors):\n' +
        '{"colors":{"primary":"#hex","secondary":"#hex","neutral":"#hex","background":"#hex","foreground":"#hex"},' +
        '"typography":{"fontFamily":"...","scale":"..."},"spacing":{"base":"...","radius":"..."}}';
      const raw = await generateOnce(userPrompt, { systemPrompt, temperature: 0.4, maxTokens: 500 });
      const json = raw
        .trim()
        .replace(/^```(?:json)?/i, '')
        .replace(/```$/, '')
        .trim();
      const parsed = JSON.parse(json) as DesignTokens;
      if (!parsed?.colors?.primary || !parsed?.typography?.fontFamily || !parsed?.spacing?.base) {
        throw new Error('incomplete tokens');
      }
      res.json({ tokens: parsed, source: 'ai' });
    } catch (err) {
      logger.warn({ err }, 'Token derivation failed; returning default tokens');
      res.json({ tokens: DEFAULT_DESIGN_TOKENS, source: 'default-fallback' });
    }
  }),
);

// ─── Project List ─────────────────────────────────────────────────────────────

router.get(
  '/',
  authenticateToken,
  requireAuth,
  validateQuery(projectQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const { phase, search, all } = req.query as { phase?: string; search?: string; all?: string };
    let projectCards = await ProjectService.getUserProjects(userid, companyid, usertype, all === 'true');

    if (phase) projectCards = projectCards.filter((p) => p.currentphase === phase);
    if (search) projectCards = projectCards.filter((p) =>
      p.name.toLowerCase().includes(search.toLowerCase())
    );

    res.status(200).json({ success: true, projects: projectCards, count: projectCards.length });
  })
);

// ─── Create Project ───────────────────────────────────────────────────────────

router.post(
  '/',
  authenticateToken,
  requireAuth,
  validateBody(createProjectSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    // Project creation is open to any authenticated user (TEAM_MEMBER, TEAM_MANAGER,
    // ADMIN, SYSADMIN); previously gated to ADMIN only.

    const {
      name,
      description,
      status,
      hourlyrate,
      allocatedhours,
      pmsystems,
      securityclassification,
      phaseassignments,
      generatekit,
      primaryai,
      proposalid,
      allowduplicate,
      stack,
    } = req.body;

    logger.info({ userid, companyid, name, proposalid }, 'Creating project');

    // Flag duplicate project names within the organization unless explicitly overridden.
    if (!allowduplicate && await ProjectService.nameExistsForCompany(companyid, name)) {
      res.status(409).json({
        error: `A project named "${name.trim()}" already exists in your organization. Set allowduplicate to create it anyway.`,
        code: 'DUPLICATE_NAME',
      });
      return;
    }

    // Validate proposal before creating anything, so a bad proposalid doesn't orphan a project.
    if (proposalid) {
      const proposal = await getProposalById(companyid, proposalid);
      if (!proposal) {
        res.status(404).json({ error: 'Proposal not found' });
        return;
      }
      if (proposal.projectid) {
        res.status(409).json({ error: 'Proposal is already linked to a project' });
        return;
      }
      if (proposal.status !== 'accepted') {
        res.status(422).json({ error: 'Proposal must be in Accepted status to create a project' });
        return;
      }
    }

    const proj = await ProjectService.createProject(
      userid, companyid, name, description, hourlyrate, allocatedhours,
      pmsystems, securityclassification, status, phaseassignments ?? {},
      generatekit,
      primaryai
    );

    // [SCOPE 055 / FR-005] Persist the captured stack & style as the project's
    // ProjectStack document (DB is the source of truth; the kit materializes
    // stack.md on next project open). Best-effort: a stack-persist failure must
    // not fail project creation.
    if (stack) {
      try {
        await ProjectDocumentService.upsertDocument(
          proj.id,
          'ProjectStack',
          'Project Stack & Style',
          renderStackMarkdown(stack),
          userid
        );
        logger.info({ projectid: proj.id, appTypes: stack.appTypes }, 'ProjectStack document persisted');
      } catch (err) {
        logger.error({ err, projectid: proj.id }, 'Failed to persist ProjectStack document (project still created)');
      }
    }

    if (proposalid) {
      const proposal = await getProposalById(companyid, proposalid);
      if (!proposal) throw new Error('Proposal vanished mid-request');

      const [acceptedBy] = await db
        .select({ fullname: userprofiles.fullname, emailaddr: userprofiles.emailaddr })
        .from(userprofiles)
        .where(eq(userprofiles.id, userid))
        .limit(1);
      const acceptedByName = acceptedBy?.fullname ?? acceptedBy?.emailaddr ?? userid;

      const proposedDate = new Date(proposal.proposeddate).toISOString().slice(0, 10);
      const acceptedDate = new Date().toISOString().slice(0, 10);

      const overviewContent =
`# Project Overview: ${proposal.title}

## Description
${proposal.description ?? ''}

## Origin
- **Proposed by**: ${proposal.source}
- **Proposed date**: ${proposedDate}
- **Priority**: ${proposal.priority ?? 'medium'}
- **Estimated effort**: ${proposal.estimatedeffort ?? 'TBD'}
- **Accepted by**: ${acceptedByName}
- **Accepted date**: ${acceptedDate}

## Target Users
<!-- To be completed during Design phase -->

## Core Modules / Features
<!-- To be completed during Design phase -->

## Key Constraints
<!-- To be completed during Design phase -->
`;

      await ProjectDocumentService.upsertDocument(
        proj.id,
        'ProjectOverview',
        `Project Overview: ${proposal.title}`,
        overviewContent,
        userid
      );

      await linkProposalToProject(companyid, proposalid, proj.id);

      logger.info({ projectid: proj.id, proposalid }, 'Proposal linked to project with generated overview');
    }

    res.status(201).json({
      success: true,
      project: {
        id: proj.id,
        name: proj.name,
        description: proj.description,
        currentphase: proj.currentphase,
        createdat: proj.createdat.toISOString(),
      },
      scaffolding: 'pending',
    });
  })
);

// ─── Get Project ──────────────────────────────────────────────────────────────

router.get(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await ProjectService.getProject(req.params.id, userid, companyid, usertype);
    if (!result) {
      res.status(usertype !== 'ADMIN' ? 403 : 404).json({
        error: usertype !== 'ADMIN' ? 'Not assigned to active phase of this project' : 'Project not found',
      });
      return;
    }

    res.status(200).json({ success: true, project: result.project, phases: result.phases });
  })
);

// ─── Update Project ───────────────────────────────────────────────────────────

router.patch(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  validateBody(updateProjectSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    // Project editing is open to any authenticated user in the company; previously ADMIN-only.

    const body = req.body as z.infer<typeof updateProjectSchema>;
    const updated = await ProjectService.updateProject(req.params.id, companyid, body);
    if (!updated) { res.status(404).json({ error: 'Project not found' }); return; }

    res.status(200).json({ success: true, project: { id: updated.id, name: updated.name, updatedat: updated.updatedat.toISOString() } });
  })
);

// ─── Archive Project ──────────────────────────────────────────────────────────

router.post(
  '/:id/archive',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (!requireAdmin(req, res)) return;

    const archived = await ProjectService.archiveProject(req.params.id, companyid);
    if (!archived) { res.status(404).json({ error: 'Project not found' }); return; }

    res.status(200).json({ success: true, message: 'Project archived' });
  })
);

// ─── Delete Project (permanent, ADMIN only) ───────────────────────────────────

router.delete(
  '/:id',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid } = req;
    if (!companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (!requireAdmin(req, res)) return;

    const deleted = await ProjectService.deleteProject(req.params.id, companyid);
    if (!deleted) { res.status(404).json({ error: 'Project not found' }); return; }

    res.status(200).json({ success: true, message: 'Project permanently deleted' });
  })
);

// ─── Phase List ───────────────────────────────────────────────────────────────

router.get(
  '/:id/phases',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const phases = await PhaseService.getPhases(req.params.id);
    res.status(200).json({ success: true, phases });
  })
);

// ─── Assign User to Phase ─────────────────────────────────────────────────────

router.patch(
  '/:id/phases/:phaseid/assign',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(assignUserSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!requireAdmin(req, res)) return;
    await PhaseService.assignUser(req.params.phaseid, req.body.assigneduserid);
    res.status(200).json({ success: true, message: 'Phase assignment updated' });
  })
);

// ─── Phase Completion Check ───────────────────────────────────────────────────

router.get(
  '/:id/phases/:phaseid/completion',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const phase = await PhaseService.getPhase(req.params.phaseid);
    if (!phase || phase.projectid !== req.params.id) {
      res.status(404).json({ error: 'Phase not found' });
      return;
    }
    const completion = await PhaseService.checkCompletion(phase.id, phase.phasename, req.params.id);
    res.status(200).json({ success: true, completion });
  })
);

// ─── Phase Validate (alias for completion check — API contract name) ──────────

router.get(
  '/:id/phases/:phaseid/validate',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const phase = await PhaseService.getPhase(req.params.phaseid);
    if (!phase || phase.projectid !== req.params.id) {
      res.status(404).json({ error: 'Phase not found' });
      return;
    }
    const result = await PhaseService.checkCompletion(phase.id, phase.phasename, req.params.id);
    res.status(200).json({
      canadvance: result.canAdvance,
      criteria: result.criteria,
      blockingtasks: result.blockingtasks ?? [],
    });
  })
);

// ─── Phase Complete (alias for advance — API contract name) ───────────────────

router.post(
  '/:id/phases/:phaseid/complete',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(advanceSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }

    // [SCOPE 037 / T037] BEGIN — block consultants from manual phase advance (FR-013 AC2 / FR-014)
    try {
      await assertConsultantCannotAdvancePhase(userid);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'CONSULTANT_PHASE_ADVANCE_DENIED') {
        res.status(403).json({ code: e.code, error: e.message });
        return;
      }
      throw err;
    }
    // [SCOPE 037 / T037] END

    const canControl = await PhaseService.canUserControlPhase(req.params.phaseid, userid, usertype);
    if (!canControl) { res.status(403).json({ error: 'Not authorized to advance this phase' }); return; }

    try {
      const result = await PhaseService.advancePhase(
        req.params.phaseid, req.params.id, companyid, userid, req.body.reason
      );
      res.status(200).json({ phase: result.completedphase, nextphase: result.activatedphase });
    } catch (err) {
      const errWithCompletion = err as Error & { completion?: PhaseCompletion };
      if (errWithCompletion.completion) {
        res.status(422).json({
          error: 'Phase cannot advance',
          criteria: errWithCompletion.completion.criteria,
        });
        return;
      }
      throw err;
    }
  })
);

// ─── Advance Phase ────────────────────────────────────────────────────────────

router.post(
  '/:id/phases/:phaseid/advance',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(advanceSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }

    // [SCOPE 037 / T037] BEGIN — block consultants from manual phase advance (FR-013 AC2 / FR-014)
    try {
      await assertConsultantCannotAdvancePhase(userid);
    } catch (err) {
      const e = err as Error & { code?: string };
      if (e.code === 'CONSULTANT_PHASE_ADVANCE_DENIED') {
        res.status(403).json({ code: e.code, error: e.message });
        return;
      }
      throw err;
    }
    // [SCOPE 037 / T037] END

    const canControl = await PhaseService.canUserControlPhase(req.params.phaseid, userid, usertype);
    if (!canControl) { res.status(403).json({ error: 'Not authorized to advance this phase' }); return; }

    try {
      const result = await PhaseService.advancePhase(
        req.params.phaseid, req.params.id, companyid, userid, req.body.reason
      );
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      const errWithCompletion = err as Error & { completion?: PhaseCompletion };
      if (errWithCompletion.completion) {
        res.status(409).json({ error: errWithCompletion.message, completion: errWithCompletion.completion });
        return;
      }
      throw err;
    }
  })
);

// ─── Reopen Phase ─────────────────────────────────────────────────────────────

router.post(
  '/:id/phases/:phaseid/reopen',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(reopenSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }

    const canControl = await PhaseService.canUserControlPhase(req.params.phaseid, userid, usertype);
    if (!canControl) { res.status(403).json({ error: 'Not authorized to reopen this phase' }); return; }

    try {
      const phase = await PhaseService.reopenPhase(
        req.params.phaseid, req.params.id, companyid, userid, req.body.reason
      );
      res.status(200).json({ success: true, phase });
    } catch (err) {
      // Surface expected conditions as 4xx with a clear message instead of a
      // generic 500 (e.g. reopening a phase that is already in progress).
      const msg = err instanceof Error ? err.message : 'Failed to reopen phase';
      if (msg === 'Phase not found') { res.status(404).json({ error: msg }); return; }
      if (msg === 'Phase is already in progress') { res.status(409).json({ error: msg }); return; }
      throw err;
    }
  })
);

// ─── Phase Tasks ──────────────────────────────────────────────────────────────

router.get(
  '/:id/phases/:phaseid/tasks',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const taskRows = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.projectid, req.params.id), eq(tasks.phaseid, req.params.phaseid)))
      .orderBy(tasks.createdat);

    res.status(200).json({ success: true, tasks: taskRows, count: taskRows.length });
  })
);

router.post(
  '/:id/phases/:phaseid/tasks',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(createTaskSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }

    const phase = await PhaseService.getPhase(req.params.phaseid);
    if (!phase || phase.projectid !== req.params.id) {
      res.status(404).json({ error: 'Phase not found' });
      return;
    }

    if (phase.phasename === 'Beta' && usertype !== 'ADMIN') {
      res.status(403).json({ error: 'Beta phase task creation requires Admin approval' });
      return;
    }

    const now = new Date();
    const [task] = await db
      .insert(tasks)
      .values({
        projectid: req.params.id,
        phaseid: req.params.phaseid,
        createdbyid: userid,
        name: req.body.name,
        description: req.body.description ?? null,
        issuetype: req.body.issuetype ?? 'task',
        priority: req.body.priority ?? 'medium',
        assignedtoid: req.body.assignedtoid ?? null,
        effort: req.body.effort ?? null,
        sourceoforigin: req.body.sourceoforigin ?? 'internal',
        status: 'open',
        createdat: now,
        updatedat: now,
      })
      .returning();

    if (phase.phasename === 'Beta') {
      await db.insert(companyauditlogs).values({
        companyid,
        action: 'beta_task_approved',
        changedby: userid,
        newvalue: { projectid: req.params.id, taskid: task.id, taskname: task.name, approvedby: userid },
        description: `Beta task approved: "${task.name}" on project ${req.params.id}`,
      });
    }

    logger.info({ projectid: req.params.id, phaseid: req.params.phaseid, taskid: task.id }, 'Task created');
    res.status(201).json({ success: true, task });
  })
);

router.patch(
  '/:id/phases/:phaseid/tasks/:taskid',
  authenticateToken,
  requireAuth,
  validateParams(taskIdSchema),
  validateBody(updateTaskSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const updates: Record<string, unknown> = { updatedat: now };
    const body = req.body as z.infer<typeof updateTaskSchema>;

    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.status !== undefined) updates.status = body.status;
    if (body.results !== undefined) updates.results = body.results;
    if (body.priority !== undefined) updates.priority = body.priority;
    if (body.assignedtoid !== undefined) updates.assignedtoid = body.assignedtoid;
    if (body.issuetype !== undefined) updates.issuetype = body.issuetype;
    const [updated] = await db
      .update(tasks)
      .set(updates)
      .where(and(eq(tasks.id, req.params.taskid), eq(tasks.phaseid, req.params.phaseid)))
      .returning();

    if (!updated) { res.status(404).json({ error: 'Task not found' }); return; }

    // [SCOPE 123 / T019] A status change can close the scope's last open task: advance it.
    if (body.status !== undefined && updated.specid) {
      await ScopeStageService.advance([updated.specid], { actor: req.userid ?? 'app', trigger: 'task_status' });
    }

    res.status(200).json({ success: true, task: updated });
  })
);

// ─── Phase Specs ──────────────────────────────────────────────────────────────

router.get(
  '/:id/phases/:phaseid/specs',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    // [SCOPE 123 / T010] "The specs in this phase" are the scopes whose OWN stage is this phase.
    // This used to filter on projectspecifications.phaseid, which pointed each scope at the
    // project's phase row: the category error SCOPE-123 removes. Response shape unchanged.
    const phase = await PhaseService.getPhase(req.params.phaseid);
    if (!phase || phase.projectid !== req.params.id) {
      res.status(404).json({ error: 'Phase not found' });
      return;
    }
    const stages = await ScopeStageService.projectScopeStages(req.params.id);
    const ids = Array.from(stages).filter(([, stage]) => stage === phase.phasename).map(([id]) => id);
    const specs = ids.length
      ? await db
          .select()
          .from(specifications)
          .where(and(eq(specifications.projectid, req.params.id), inArray(specifications.id, ids)))
          .orderBy(specifications.specnumber)
      : [];

    res.status(200).json({ success: true, specs, count: specs.length });
  })
);

router.post(
  '/:id/phases/:phaseid/specs',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateBody(createSpecSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const existing = await db
      .select({ specnumber: specifications.specnumber })
      .from(specifications)
      .where(eq(specifications.projectid, req.params.id))
      .orderBy(specifications.specnumber);

    const maxNum = existing.reduce((max, s) => {
      const n = parseInt(s.specnumber, 10);
      return isNaN(n) ? max : Math.max(max, n);
    }, 0);

    const nextNumber = String(maxNum + 1).padStart(3, '0');
    const now = new Date();

    const [spec] = await db
      .insert(specifications)
      .values({
        projectid: req.params.id,
        phaseid: req.params.phaseid,
        specnumber: nextNumber,
        title: req.body.title,
        content: req.body.content,
        status: 'draft',
        createdat: now,
        updatedat: now,
      })
      .returning();

    res.status(201).json({ success: true, spec });
  })
);

router.patch(
  '/:id/phases/:phaseid/specs/:specid',
  authenticateToken,
  requireAuth,
  validateParams(specIdSchema),
  validateBody(updateSpecSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const now = new Date();
    const updates: Record<string, unknown> = { updatedat: now };
    const body = req.body as z.infer<typeof updateSpecSchema>;

    if (body.title !== undefined) updates.title = body.title;
    if (body.content !== undefined) updates.content = body.content;
    if (body.status !== undefined) {
      updates.status = body.status;
      if (body.status === 'approved') updates.approvedat = now;
    }

    const [updated] = await db
      .update(specifications)
      .set(updates)
      .where(and(eq(specifications.id, req.params.specid), eq(specifications.projectid, req.params.id)))
      .returning();

    if (!updated) { res.status(404).json({ error: 'Spec not found' }); return; }
    res.status(200).json({ success: true, spec: updated });
  })
);

// ─── Project Documents ────────────────────────────────────────────────────────

router.get(
  '/:id/documents',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const docs = await ProjectDocumentService.getDocuments(req.params.id);
    res.status(200).json({ success: true, documents: docs });
  })
);

router.patch(
  '/:id/documents/:docid',
  authenticateToken,
  requireAuth,
  validateParams(docIdSchema),
  validateBody(updateDocSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const updated = await ProjectDocumentService.updateDocument(req.params.docid, req.params.id, req.body);
    if (!updated) { res.status(404).json({ error: 'Document not found' }); return; }
    res.status(200).json({ success: true, document: updated });
  })
);

// [SCOPE 055 / T008] BEGIN — PUT /:id/stack (define-or-update the project's ProjectStack doc)
// Upserts the project-level ProjectStack document from the web Stack tab. Works
// whether or not a stack exists yet (upsertDocument is keyed on projectid+doctype),
// so the tab can both DEFINE a first stack and EDIT an existing one. ADMIN-gated and
// access-checked to the caller's project; markdown is the source of truth (the kit
// re-materializes stack.md on next project open).
router.put(
  '/:id/stack',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  validateBody(updateDocSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!requireAdmin(req, res)) return;
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    const access = await ProjectService.getProject(req.params.id, userid, companyid, usertype);
    if (!access) {
      res.status(usertype !== 'ADMIN' ? 403 : 404).json({ error: 'Project not found' });
      return;
    }
    const content = (req.body?.content ?? '').toString();
    if (!content.trim()) {
      res.status(400).json({ error: 'content is required' });
      return;
    }
    const doc = await ProjectDocumentService.upsertDocument(
      req.params.id,
      'ProjectStack',
      'Project Stack & Style',
      content,
      userid,
    );
    res.status(200).json({ success: true, document: doc });
  })
);
// [SCOPE 055 / T008] END

// ─── Project Panel (phase-aware detail panel data) ────────────────────────────

router.get(
  '/:id/panel',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }

    const result = await ProjectService.getProject(req.params.id, userid, companyid, usertype);
    if (!result) {
      res.status(usertype !== 'ADMIN' ? 403 : 404).json({ error: 'Project not found' });
      return;
    }

    const projectId = req.params.id;
    const currentPhase = result.project.currentphase;

    // Overview document (project-level, no specid) — include content for excerpt
    const [overviewDoc] = await db
      .select({ id: projectdocuments.id, doctype: projectdocuments.doctype, title: projectdocuments.title, filepath: projectdocuments.filepath, content: projectdocuments.content })
      .from(projectdocuments)
      .where(and(eq(projectdocuments.projectid, projectId), isNull(projectdocuments.specid), eq(projectdocuments.doctype, 'overview')))
      .limit(1);

    const overviewexcerpt = overviewDoc?.content
      ? overviewDoc.content.replace(/^#+\s.*$/gm, '').replace(/\n{2,}/g, ' ').trim().slice(0, 200) || null
      : null;

    // All specifications for this project
    const specs = await db
      .select({ id: specifications.id, specnumber: specifications.specnumber, title: specifications.title, status: specifications.status })
      .from(specifications)
      // [SCOPE 103 / T004] archived scopes are hidden from the project panel
      .where(and(eq(specifications.projectid, projectId), sql`${specifications.status} <> 'archived'`))
      .orderBy(specifications.specnumber);

    if (specs.length === 0) {
      res.json({ phase: currentPhase, overview: overviewDoc ? { id: overviewDoc.id, doctype: overviewDoc.doctype, title: overviewDoc.title, filepath: overviewDoc.filepath, content: overviewDoc.content ?? '' } : null, overviewexcerpt, scopes: [] });
      return;
    }

    const specIds = specs.map((s) => s.id);

    // Documents for each scope (include content for inline expansion)
    const scopeDocs = await db
      .select({ id: projectdocuments.id, specid: projectdocuments.specid, doctype: projectdocuments.doctype, title: projectdocuments.title, filepath: projectdocuments.filepath, content: projectdocuments.content })
      .from(projectdocuments)
      .where(and(eq(projectdocuments.projectid, projectId), inArray(projectdocuments.specid, specIds)));

    // Task counts per scope — all status breakdowns in one pass
    const taskCounts = await db
      .select({
        specid: tasks.specid,
        total: count(),
        completed:    sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'completed')`,
        open:         sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'open')`,
        inprogress:   sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'in_progress')`,
      })
      .from(tasks)
      .where(and(eq(tasks.projectid, projectId), inArray(tasks.specid, specIds)))
      .groupBy(tasks.specid);

    const taskCountMap = new Map(
      taskCounts.map((t) => [t.specid, {
        total:      Number(t.total),
        completed:  Number(t.completed),
        open:       Number(t.open),
        inprogress: Number(t.inprogress),
      }])
    );

    const docsBySpec = new Map<string, Array<{ id: string; doctype: string; title: string; filepath: string | null; content: string }>>();
    for (const doc of scopeDocs) {
      if (!doc.specid) continue;
      if (!docsBySpec.has(doc.specid)) docsBySpec.set(doc.specid, []);
      docsBySpec.get(doc.specid)!.push({ id: doc.id, doctype: doc.doctype, title: doc.title, filepath: doc.filepath, content: doc.content ?? '' });
    }

    const scopes = specs.map((s) => {
      const tc = taskCountMap.get(s.id);
      return {
        id: s.id,
        specnumber: s.specnumber,
        title: s.title,
        status: s.status,
        taskcount:          tc?.total      ?? 0,
        completedtaskcount: tc?.completed  ?? 0,
        opencount:          tc?.open       ?? 0,
        inprogresscount:    tc?.inprogress ?? 0,
        documents: docsBySpec.get(s.id) ?? [],
      };
    });

    const overviewRef = overviewDoc ? { id: overviewDoc.id, doctype: overviewDoc.doctype, title: overviewDoc.title, filepath: overviewDoc.filepath, content: overviewDoc.content ?? '' } : null;
    res.json({ phase: currentPhase, overview: overviewRef, overviewexcerpt, scopes });
  })
);

// ─── Scaffold ─────────────────────────────────────────────────────────────────

router.get(
  '/:id/scaffold',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }

    const result = await ProjectService.getProject(req.params.id, userid, companyid, usertype);
    if (!result) {
      res.status(usertype !== 'ADMIN' ? 403 : 404).json({ error: 'Project not found or access denied' });
      return;
    }

    const overview = await ProjectDocumentService.getOverview(req.params.id);

    // [SCOPE 123 / T010] The scaffold's specs are the scopes whose own stage is Design, not the
    // ones whose phaseid points at the project's Design phase row.
    let specs: Array<{ number: string; title: string; content: string }> = [];
    const stages = await ScopeStageService.projectScopeStages(req.params.id);
    const designIds = Array.from(stages).filter(([, stage]) => stage === 'Design').map(([id]) => id);
    if (designIds.length) {
      const specRows = await db
        .select()
        .from(specifications)
        .where(and(eq(specifications.projectid, req.params.id), inArray(specifications.id, designIds)))
        .orderBy(specifications.specnumber);
      specs = specRows.map((s) => ({ number: s.specnumber, title: s.title, content: s.content }));
    }

    res.status(200).json({
      success: true,
      project: {
        id: result.project.id,
        name: result.project.name,
        description: result.project.description,
        currentphase: result.project.currentphase,
      },
      overview: { content: overview?.content ?? '' },
      specs,
      phases: result.phases.map((p) => ({
        phasename: p.phasename,
        status: p.status,
        assigneduser: p.assigneduser
          ? { fullname: p.assigneduser.fullname, emailaddr: p.assigneduser.emailaddr }
          : null,
      })),
    });
  })
);

// ─── Task Detail + Dependency Routes (T017, T018) ────────────────────────────

const taskDetailParamsSchema = z.object({ id: z.string().uuid(), taskid: z.string().uuid() });
const depParamsSchema = z.object({ id: z.string().uuid(), taskid: z.string().uuid(), dependencyid: z.string().uuid() });
const scopeQuerySchema = z.object({ scopeid: z.string().uuid().optional() });

const updateTaskDetailSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  results: z.enum(['pass', 'fail']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  issuetype: z.enum(['task', 'bug', 'feature']).optional(),
  effort: z.enum(['small', 'medium', 'large', 'unknown']).optional(),
  assignedtoid: z.string().uuid().nullable().optional(),
  duedate: z.string().nullable().optional(),
  specid: z.string().uuid().nullable().optional(),
});


const addDependencySchema = z.object({ blockedbyid: z.string().uuid() });

// GET /projects/:id/phases/:phaseid/tasks (enhanced — scope-grouped)
router.get(
  '/:id/phases/:phaseid/tasks/grouped',
  authenticateToken,
  requireAuth,
  validateParams(phaseIdSchema),
  validateQuery(scopeQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const query = req.query as z.infer<typeof scopeQuerySchema>;
    const result = await TaskService.getTasksByPhase(req.params.id, req.params.phaseid, query.scopeid);
    res.status(200).json(result);
  })
);

// GET /projects/:id/tasks/:taskid
router.get(
  '/:id/tasks/:taskid',
  authenticateToken,
  requireAuth,
  validateParams(taskDetailParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const task = await TaskService.getTask(req.params.id, req.params.taskid);
    if (!task) { res.status(404).json({ error: 'Task not found' }); return; }
    res.status(200).json(task);
  })
);

// PATCH /projects/:id/tasks/:taskid
router.patch(
  '/:id/tasks/:taskid',
  authenticateToken,
  requireAuth,
  validateParams(taskDetailParamsSchema),
  validateBody(updateTaskDetailSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof updateTaskDetailSchema>;
    const task = await TaskService.updateTask(req.params.id, req.params.taskid, body, userid, companyid);
    res.status(200).json(task);
  })
);

// GET /projects/:id/tasks/:taskid/activity
router.get(
  '/:id/tasks/:taskid/activity',
  authenticateToken,
  requireAuth,
  validateParams(taskDetailParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const entries = await TaskService.getActivity(req.params.taskid);
    res.status(200).json({ entries });
  })
);

// POST /projects/:id/tasks/:taskid/dependencies
router.post(
  '/:id/tasks/:taskid/dependencies',
  authenticateToken,
  requireAuth,
  validateParams(taskDetailParamsSchema),
  validateBody(addDependencySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof addDependencySchema>;
    try {
      const dep = await TaskService.addDependency(req.params.taskid, body.blockedbyid);
      res.status(201).json(dep);
    } catch (err) {
      const msg = (err as Error).message;
      if (msg.includes('circular') || msg.includes('itself')) {
        res.status(422).json({ error: msg });
        return;
      }
      throw err;
    }
  })
);

// DELETE /projects/:id/tasks/:taskid/dependencies/:dependencyid
router.delete(
  '/:id/tasks/:taskid/dependencies/:dependencyid',
  authenticateToken,
  requireAuth,
  validateParams(depParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    await TaskService.removeDependency(req.params.dependencyid);
    res.status(204).send();
  })
);

// ─── Scope Lifecycle Routes ───────────────────────────────────────────────────

const scopeParamsSchema = z.object({ id: z.string().uuid(), scopeid: z.string().uuid() });

const createScopeSchema = z.object({
  title: z.string().min(1),
  content: z.string().optional(),
});

const updateScopeSchema = z.object({
  title: z.string().min(1).optional(),
  content: z.string().optional(),
  specorder: z.number().int().min(0).optional(),
  isoptional: z.boolean().optional(),
});

const submitScopeSchema = z.object({
  override: z.boolean().optional(),
});

const approveScopeSchema = z.object({
  action: z.enum(['approve', 'request_changes', 'request_clarification']),
  note: z.string().optional(),
  clarificationtype: z.enum(['chat_note', 'meeting']).optional(),
});

const overrideStatusSchema = z.object({
  status: z.enum([
    'draft', 'in_review', 'pending_clarification', 'clarified', 'planned',
    'tasks_generated', 'implementing', 'implemented', 'qa_passed', 'human_tested',
    'beta_cleared', 'released', 'deferred',
  ]),
  // reason is optional for forward drags; required for backward drags (enforced in frontend)
  reason: z.string().optional(),
});

// GET /projects/:id/learnings — compound learning documents for this project
router.get(
  '/:id/learnings',
  authenticateToken,
  requireAuth,
  validateParams(z.object({ id: z.string().uuid() })),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { id: projectId } = req.params as { id: string };
    const { companyid } = req;

    const [project] = await db
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyid, companyid!)))
      .limit(1);

    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const learnings = await db
      .select({
        id: projectdocuments.id,
        title: projectdocuments.title,
        content: projectdocuments.content,
        filepath: projectdocuments.filepath,
        createdat: projectdocuments.createdat,
        updatedat: projectdocuments.updatedat,
      })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectId),
          eq(projectdocuments.doctype, 'CompoundLearning')
        )
      )
      .orderBy(desc(projectdocuments.updatedat));

    res.status(200).json({ learnings });
  })
);

// GET /projects/:id/scopes
router.get('/:id/scopes',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    // [SCOPE 103 / T005] ?includeArchived=true surfaces archived scopes (restore view); default hides them.
    const includeArchived = req.query.includeArchived === 'true';
    const scopes = await ScopeService.getScopes(req.params.id, { includeArchived });
    res.status(200).json({ scopes });
  })
);

// GET /projects/:id/scopes/matrix
router.get('/:id/scopes/matrix',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const matrix = await ScopeService.getScopeMatrix(req.params.id);
    res.status(200).json(matrix);
  })
);

// POST /projects/:id/scopes
router.post('/:id/scopes',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  validateBody(createScopeSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof createScopeSchema>;
    const scope = await ScopeService.createScope(req.params.id, userid, body);
    res.status(201).json(scope);
  })
);

// PATCH /projects/:id/scopes/:scopeid
router.patch('/:id/scopes/:scopeid',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(updateScopeSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof updateScopeSchema>;
    const scope = await ScopeService.updateScope(req.params.scopeid, body, companyid, userid);
    res.status(200).json(scope);
  })
);

// POST /projects/:id/scopes/:scopeid/submit
router.post('/:id/scopes/:scopeid/submit',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(submitScopeSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof submitScopeSchema>;
    const result = await ScopeService.submitScope(req.params.scopeid, companyid, userid, body.override ?? false);
    res.status(200).json(result);
  })
);

// POST /projects/:id/scopes/:scopeid/approve
router.post('/:id/scopes/:scopeid/approve',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(approveScopeSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (usertype !== 'ADMIN') {
      // TODO: also allow Phase 1 assignee once PhaseService lookup is added
      res.status(403).json({ error: 'Only ADMIN or Phase 1 assignee can approve scopes' });
      return;
    }
    const body = req.body as z.infer<typeof approveScopeSchema>;
    const scope = await ScopeService.approveScope(
      req.params.scopeid, body.action,
      { note: body.note, clarificationtype: body.clarificationtype },
      companyid, userid
    );
    res.status(200).json(scope);
  })
);

// PATCH /projects/:id/scopes/:scopeid/status
// ADMIN: any status. Authenticated users: deferred, pending_clarification, in_review only.
const USER_WORKFLOW_STATUSES = new Set(['deferred', 'pending_clarification', 'in_review', 'clarified']);
router.patch('/:id/scopes/:scopeid/status',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(overrideStatusSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid, usertype } = req;
    if (!userid || !companyid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof overrideStatusSchema>;
    if (usertype !== 'ADMIN' && usertype !== 'TEAM_MANAGER' && !USER_WORKFLOW_STATUSES.has(body.status)) {
      res.status(403).json({ error: 'ADMIN or TEAM_MANAGER required for this status change' });
      return;
    }
    const scope = await ScopeService.overrideStatus(req.params.scopeid, body.status, body.reason ?? '', userid, companyid);
    res.status(200).json(scope);
  })
);

// DELETE /projects/:id/scopes/:scopeid
// [SCOPE 098 / T001] Permanently delete a scope and its children (tasks +
// cascaded documents/spec-phases/scope-chat/test-plans). Any authenticated
// project member (not admin-gated). 404 when the scope isn't found under :id.
router.delete('/:id/scopes/:scopeid',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await ScopeService.deleteScope(req.params.id, req.params.scopeid, companyid, userid);
    if (!result.deleted) { res.status(404).json({ error: 'Scope not found' }); return; }
    res.status(200).json({
      success: true,
      message: `Scope deleted${result.taskCount ? ` (${result.taskCount} task(s) removed)` : ''}`,
    });
  })
);

// POST /projects/:id/scopes/:scopeid/archive
// [SCOPE 103 / T003] Non-destructive archive (reversible sibling of delete). Any
// authenticated project member. 404 when the scope isn't found under :id. Captures the
// prior status in an audit row so unarchive can restore it.
router.post('/:id/scopes/:scopeid/archive',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await ScopeService.archiveScope(req.params.id, req.params.scopeid, companyid, userid);
    if (!result.archived) { res.status(404).json({ error: 'Scope not found' }); return; }
    res.status(200).json({ success: true, message: 'Scope archived', fromStatus: result.fromStatus });
  })
);

// POST /projects/:id/scopes/:scopeid/unarchive
// [SCOPE 103 / T003] Restore an archived scope to its prior status (draft fallback).
router.post('/:id/scopes/:scopeid/unarchive',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await ScopeService.unarchiveScope(req.params.id, req.params.scopeid, companyid, userid);
    if (!result.unarchived) { res.status(404).json({ error: 'Scope not found or not archived' }); return; }
    res.status(200).json({ success: true, message: 'Scope unarchived', status: result.status });
  })
);

// ─── Scope Chat Routes (T033) ─────────────────────────────────────────────────

const chatSplitSchema = z.object({
  action: z.enum(['accept', 'decline']),
  topic: z.string().min(1),
  suggestedname: z.string().min(1),
});

const chatMessageSchema = z.object({ message: z.string().min(1) });

// GET /projects/:id/scopes/:scopeid/chat
router.get('/:id/scopes/:scopeid/chat',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await ScopeChatService.getChatHistory(req.params.scopeid);
    res.status(200).json(result);
  })
);

// POST /projects/:id/scopes/:scopeid/chat (SSE stream)
router.post('/:id/scopes/:scopeid/chat',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(chatMessageSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, usertype } = req;
    if (!userid || !usertype) { res.status(401).json({ error: 'Authentication required' }); return; }

    const body = req.body as z.infer<typeof chatMessageSchema>;

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await ScopeChatService.streamChat(req.params.scopeid, body.message, res);
  })
);

// POST /projects/:id/scopes/:scopeid/chat/split
router.post('/:id/scopes/:scopeid/chat/split',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(chatSplitSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof chatSplitSchema>;
    const result = await ScopeChatService.handleSplitDecision(
      req.params.scopeid, body.action, body.topic, body.suggestedname, userid
    );
    res.status(200).json(result);
  })
);

// GET /projects/:id/scopes/:scopeid/chat/export
router.get('/:id/scopes/:scopeid/chat/export',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const fmt = (req.query.format as string) === 'text' ? 'text' : 'markdown';
    const { filename, content } = await ScopeChatService.exportConversation(req.params.scopeid, fmt);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Type', fmt === 'markdown' ? 'text/markdown' : 'text/plain');
    res.send(content);
  })
);

// ─── AI Task Generation Routes (T031) ────────────────────────────────────────

const approveTasksSchema = z.object({
  approvedtasks: z.array(z.object({
    name: z.string().min(1),
    description: z.string(),
    issuetype: z.string(),
    priority: z.string(),
    phase: z.string(),
  })).min(1),
});

// GET /projects/:id/scopes/:scopeid/tasks (lightweight — for panel task sublist)
router.get('/:id/scopes/:scopeid/tasks',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }

    const rows = await db
      .select({ id: tasks.id, name: tasks.name, status: tasks.status, priority: tasks.priority, issuetype: tasks.issuetype })
      .from(tasks)
      .where(and(eq(tasks.projectid, req.params.id), eq(tasks.specid, req.params.scopeid)))
      .orderBy(tasks.createdat);

    logger.info({ projectid: req.params.id, scopeid: req.params.scopeid, count: rows.length }, '[scope-tasks] result');

    res.status(200).json(rows);
  })
);

// POST /projects/:id/scopes/:scopeid/generate-tasks
router.post('/:id/scopes/:scopeid/generate-tasks',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const result = await ScopeChatService.generateTaskProposals(req.params.scopeid, req.params.id);
    res.status(200).json(result);
  })
);

// POST /projects/:id/generate-audit
router.post('/:id/generate-audit',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid, companyid } = req;
    if (!userid || !companyid) { res.status(401).json({ error: 'Authentication required' }); return; }
    if (!requireAdmin(req, res)) return;

    // [SCOPE 112 / T006] MODIFIED-BY — one report per enabled framework, not one per
    // project. `documents` is the array; `document` is retained for existing clients.
    const { AuditReportService } = await import('~/server/services/AuditReportService.js');
    const docs = await AuditReportService.generateReports(req.params.id, userid);

    if (docs.length === 0) {
      res.status(200).json({ success: false, message: 'No compliance framework enabled on this project — report not generated' });
      return;
    }

    const shaped = docs.map((d) => ({ id: d.id, doctype: d.doctype, updatedat: d.updatedat }));
    res.status(200).json({ success: true, documents: shaped, document: shaped[0] });
  })
);

// POST /projects/:id/scopes/:scopeid/approve-tasks
router.post('/:id/scopes/:scopeid/approve-tasks',
  authenticateToken,
  requireAuth,
  validateParams(scopeParamsSchema),
  validateBody(approveTasksSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { userid } = req;
    if (!userid) { res.status(401).json({ error: 'Authentication required' }); return; }
    const body = req.body as z.infer<typeof approveTasksSchema>;
    const result = await ScopeChatService.approveTaskProposals(
      req.params.scopeid, req.params.id, body.approvedtasks, userid
    );
    res.status(201).json(result);
  })
);

// ─── Admin Project Routes (T046, T047) ──────────────────────────────────────

const adminQuerySchema = z.object({
  status: z.string().optional(),
  sortBy: z.enum(['name', 'createdat', 'currentphase']).optional().default('createdat'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
  page: z.string().transform(Number).optional().default('1'),
  limit: z.string().transform(Number).optional().default('20'),
});

/**
 * GET /api/admin/projects
 * Admin project summary with stats - T046
 * Returns all company projects with assignedcount, taskcount, status, percentcomplete
 */
router.get(
  '/admin/projects',
  authenticateToken,
  requireAuth,
  validateQuery(adminQuerySchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid, usertype } = req;
    if (!companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (usertype !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const { sortBy, sortOrder, page, limit } = req.query as unknown as z.infer<typeof adminQuerySchema>;

    const offset = (Number(page) - 1) * Number(limit);

    // Get projects with counts
    const projectsQuery = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        currentphase: projects.currentphase,
        status: projects.status,
        createdat: projects.createdat,
        hourlyrate: projects.hourlyrate,
      })
      .from(projects)
      .where(eq(projects.companyid, companyid))
      .orderBy(sortOrder === 'asc' ? sql`${projects[sortBy]} asc` : sql`${projects[sortBy]} desc`)
      .limit(Number(limit))
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: sql<number>`count(*)`.mapWith(Number) })
      .from(projects)
      .where(eq(projects.companyid, companyid));

    const total = countResult[0]?.count || 0;

    // Enrich with task counts and assigned users
    const enrichedProjects = await Promise.all(
      projectsQuery.map(async (project) => {
        // Get task counts
        const taskCounts = await db
          .select({
            total: count(),
            completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'completed')`,
            inprogress: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'in_progress')`,
            open: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'open')`,
          })
          .from(tasks)
          .where(eq(tasks.projectid, project.id));

        const tc = taskCounts[0];
        const totalTasks = Number(tc?.total || 0);
        const completedTasks = Number(tc?.completed || 0);
        const percentcomplete = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

        // Get assigned users count
        const assignedCount = await db
          .select({ count: sql<number>`count(DISTINCT ${tasks.assignedtoid})`.mapWith(Number) })
          .from(tasks)
          .where(and(eq(tasks.projectid, project.id), sql`${tasks.assignedtoid} IS NOT NULL`));

        return {
          id: project.id,
          name: project.name,
          description: project.description,
          currentphase: project.currentphase,
          status: project.status,
          createdat: project.createdat,
          hourlyrate: project.hourlyrate,
          taskcount: totalTasks,
          completedtaskcount: completedTasks,
          inprogresstaskcount: Number(tc?.inprogress || 0),
          opentaskcount: Number(tc?.open || 0),
          percentcomplete,
          assignedcount: assignedCount[0]?.count || 0,
        };
      })
    );

    res.status(200).json({
      success: true,
      projects: enrichedProjects,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

/**
 * GET /api/admin/projects/:id
 * Project drill-down with task details - T047
 * Returns full project details with tasks, time entries, and progress
 */
router.get(
  '/admin/projects/:id',
  authenticateToken,
  requireAuth,
  validateParams(projectIdSchema),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { companyid, usertype } = req;
    if (!companyid || !usertype) {
      res.status(401).json({ error: 'Authentication required' });
      return;
    }
    if (usertype !== 'ADMIN') {
      res.status(403).json({ error: 'Admin access required' });
      return;
    }

    const projectId = req.params.id;

    // Get project details
    const project = await db
      .select({
        id: projects.id,
        name: projects.name,
        description: projects.description,
        currentphase: projects.currentphase,
        status: projects.status,
        createdat: projects.createdat,
        updatedat: projects.updatedat,
        hourlyrate: projects.hourlyrate,
        allocatedhours: projects.allocatedhours,
        pmsystems: projects.pmsystems,
      })
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.companyid, companyid)))
      .limit(1);

    if (project.length === 0) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const p = project[0];

    // Get all tasks with assignee details
    const projectTasks = await db
      .select({
        id: tasks.id,
        name: tasks.name,
        description: tasks.description,
        status: tasks.status,
        priority: tasks.priority,
        issuetype: tasks.issuetype,
        createdat: tasks.createdat,
        updatedat: tasks.updatedat,
        assignedtoid: tasks.assignedtoid,
        assignedtoname: sql<string>`(SELECT fullname FROM userprofiles WHERE id = ${tasks.assignedtoid})`,
        assignedtoemail: sql<string>`(SELECT emailaddr FROM userprofiles WHERE id = ${tasks.assignedtoid})`,
      })
      .from(tasks)
      .where(eq(tasks.projectid, projectId))
      .orderBy(tasks.createdat);

    // Get time entries summary
    const timeSummary = await db
      .select({
        totalhours: sql<number>`COALESCE(SUM(${timeentries.duration}) / 60.0, 0)`,
        billablehours: sql<number>`COALESCE(SUM(CASE WHEN ${timeentries.billable} THEN ${timeentries.duration} ELSE 0 END) / 60.0, 0)`,
        entrycount: count(),
      })
      .from(timeentries)
      .where(eq(timeentries.projectid, projectId));

    // Get phases
    const projectPhases = await db
      .select({
        id: projectphases.id,
        phasename: projectphases.phasename,
        status: projectphases.status,
        enteredat: projectphases.enteredat,
        completedat: projectphases.completedat,
      })
      .from(projectphases)
      .where(eq(projectphases.projectid, projectId))
      .orderBy(projectphases.createdat);

    // Calculate progress by date (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const progressByDate = await db
      .select({
        date: sql<string>`DATE(${tasks.updatedat})`,
        completed: sql<number>`COUNT(*) FILTER (WHERE ${tasks.status} = 'completed')`,
      })
      .from(tasks)
      .where(and(
        eq(tasks.projectid, projectId),
        sql`${tasks.updatedat} >= ${thirtyDaysAgo}`
      ))
      .groupBy(sql`DATE(${tasks.updatedat})`)
      .orderBy(sql`DATE(${tasks.updatedat})`);

    res.status(200).json({
      success: true,
      project: {
        id: p.id,
        name: p.name,
        description: p.description,
        currentphase: p.currentphase,
        status: p.status,
        createdat: p.createdat,
        updatedat: p.updatedat,
        hourlyrate: p.hourlyrate,
        allocatedhours: p.allocatedhours,
        pmsystems: p.pmsystems,
      },
      tasks: projectTasks.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        status: t.status,
        priority: t.priority,
        issuetype: t.issuetype,
        createdat: t.createdat,
        updatedat: t.updatedat,
        assignedto: t.assignedtoid ? {
          id: t.assignedtoid,
          name: t.assignedtoname,
          email: t.assignedtoemail,
        } : null,
      })),
      phases: projectPhases,
      timesummary: {
        totalhours: Number(timeSummary[0]?.totalhours || 0).toFixed(2),
        billablehours: Number(timeSummary[0]?.billablehours || 0).toFixed(2),
        entrycount: Number(timeSummary[0]?.entrycount || 0),
      },
      progressbydate: progressByDate.map(d => ({
        date: d.date,
        completed: Number(d.completed),
      })),
    });
  })
);

export default router;
