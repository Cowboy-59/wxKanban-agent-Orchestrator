import { Router, Response } from 'express';
import { readFile } from 'fs/promises';
import { resolve } from 'path';
import { authenticateToken, requireAuth, type AuthRequest } from '~/server/middleware/auth.js';
import { asyncHandler } from '~/server/middleware/errorHandler.js';
import { createLogger } from '~/server/lib/logger.js';
import { db } from '~/db/client.js';
import { companyprojects as projects } from '~/db/schema/companyproject.js';
import { overviewdrafts } from '~/db/schema/overviewdrafts.js';
import { overviewtranscripts } from '~/db/schema/overviewtranscripts.js';
import { projectproposals } from '~/db/schema/projectproposal.js';
import { projectdocuments } from '~/db/schema/projectdocuments.js';
import { userprofiles } from '~/db/schema/userprofiles.js';
import { stampMarkdown } from '@wxkanban/watermark';
import { APP_VERSION } from '~/client/version.js';

import { eq, asc, and, isNull } from 'drizzle-orm';
import { streamChat, type ChatMessage } from '~/server/ai/llm-stream.js';
import { ProjectDocumentService } from '~/server/services/ProjectDocumentService.js';
import {
  BUSINESS_ANALYST_SYSTEM_PROMPT,
  buildInterviewKickoff,
  OVERVIEW_TEMPLATE_SECTIONS,
  detectSectionProposals,
  sectionsWithContent,
  buildInterviewStatePreamble,
} from '~/server/ai/prompts/business-analyst.js';
import { createHash } from 'crypto';
import { importcache } from '~/db/schema/importcache.js';
import { runSectionMapping } from '~/server/ai/section-mapping-runner.js';
import { fetchAllowedUrl, UrlImportError } from '~/server/services/UrlImportService.js';
import {
  parseImportFile,
  UnsupportedFormatError,
} from '~/server/parsers/document-parsers.js';
import { writePasteBugReport } from '~/server/services/PasteBugReportService.js';
import { PASTE_MAX_CHARS, IMPORT_MAX_CHARS } from '~/shared/url-allowlist.js';

/**
 * Shared authz lookup for the overview draft routes: returns the draft row, or
 * sends the appropriate 401/404/403 and returns null. Caller must check for
 * null and return immediately.
 */
async function loadAuthorizedDraft(
  req: AuthRequest,
  res: Response,
): Promise<typeof overviewdrafts.$inferSelect | null> {
  if (!req.userid || !req.companyid) {
    res.status(401).json({ error: 'Unauthenticated' });
    return null;
  }
  const draftid = String(req.params.id);
  const [draft] = await db
    .select()
    .from(overviewdrafts)
    .where(eq(overviewdrafts.id, draftid))
    .limit(1);
  if (!draft) {
    res.status(404).json({ error: 'Draft not found' });
    return null;
  }
  if (draft.authoruserid !== req.userid && draft.companyid !== req.companyid) {
    res.status(403).json({ error: 'Forbidden' });
    return null;
  }
  return draft;
}

/** Detect a base64 data-URI image paste — best-effort, OCR not supported (N8). */
function isImagePaste(content: string): boolean {
  return /^data:image\//i.test(content.trim());
}

/**
 * Spec 025 FR-003 — empty seed template for a fresh Project Overview draft.
 * Fixed sections (Problem-first), blank under each heading. The BA AI pane
 * fills these in via the interview / paste / import flows.
 */
function buildEmptyOverviewTemplate(): string {
  return OVERVIEW_TEMPLATE_SECTIONS.map((s) => `## ${s}\n\n`).join('').trimEnd() + '\n';
}

const router = Router();
const logger = createLogger('overview-route');

const OVERVIEW_PATH = resolve(process.cwd(), 'specs', 'overvirew.md');
const OVERVIEW_DOCTYPE = 'ProjectOverview';
const OVERVIEW_TITLE = 'Project Overview';

/**
 * GET /api/overview
 * Returns the content of specs/overvirew.md.
 * Also upserts the document into projectdocuments (doctype = 'ProjectOverview')
 * for the first project belonging to the authenticated user's company.
 */
router.get(
  '/',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    try {
      // [SCOPE 082 / T006] stamp the project-overview markdown (frontmatter + footer + zero-width)
      const content = stampMarkdown(await readFile(OVERVIEW_PATH, 'utf-8'), {
        kind: 'generated',
        version: APP_VERSION,
        generator: 'overview',
      });
      logger.info({ path: OVERVIEW_PATH }, 'Overview document served');

      // Upsert to projectdocuments — best-effort, never blocks the response
      if (req.companyid) {
        try {
          const [firstProject] = await db
            .select({ id: projects.id })
            .from(projects)
            .where(eq(projects.companyid, req.companyid))
            .limit(1);

          if (firstProject) {
            await ProjectDocumentService.upsertDocument(
              firstProject.id,
              OVERVIEW_DOCTYPE,
              OVERVIEW_TITLE,
              content,
              req.userid ?? null
            );
            logger.info(
              { projectid: firstProject.id, doctype: OVERVIEW_DOCTYPE },
              'Overview document synced to projectdocuments'
            );
          }
        } catch (dbErr) {
          logger.warn({ err: dbErr }, 'Failed to sync overview document to DB');
        }
      }

      res.json({ success: true, content });
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === 'ENOENT') {
        res.status(404).json({ error: 'Overview document not found', path: OVERVIEW_PATH });
        return;
      }
      throw err;
    }
  })
);

/**
 * POST /api/overview/draft
 * Spec 025 T009 — lazy-create an overviewdrafts row.
 *
 * Body: { mode: 'proposal' | 'project', content?: string, proposalid?: string }
 *
 * Per FR-015 D4 lazy creation: this is called from the embedded dialog on
 * first edit / paste / import / expand, NOT on dialog open. Returns the
 * draft id so the client can navigate to /overview/:draftId.
 */
router.post(
  '/draft',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const { mode, content, proposalid, title, priority, estimatedeffort } = req.body as {
      mode?: 'proposal' | 'project';
      content?: string;
      proposalid?: string;
      title?: string;
      priority?: string;
      estimatedeffort?: string;
    };

    if (mode !== 'proposal' && mode !== 'project') {
      res.status(400).json({ error: "mode must be 'proposal' or 'project'" });
      return;
    }

    const [row] = await db
      .insert(overviewdrafts)
      .values({
        authoruserid: req.userid,
        companyid: req.companyid,
        content: typeof content === 'string' ? content : '',
        proposalid: proposalid ?? null,
        status: 'draft',
        title: typeof title === 'string' && title.trim() ? title.trim() : null,
        priority: typeof priority === 'string' && priority.trim() ? priority.trim() : null,
        estimatedeffort:
          typeof estimatedeffort === 'string' && estimatedeffort.trim()
            ? estimatedeffort.trim()
            : null,
      })
      .returning();

    if (!row) {
      res.status(500).json({ error: 'Failed to create overview draft' });
      return;
    }

    logger.info(
      { draftid: row.id, mode, authoruserid: req.userid, companyid: req.companyid },
      'Overview draft created'
    );

    res.status(201).json({
      draftid: row.id,
      mode,
      content: row.content,
      status: row.status,
      title: row.title,
      priority: row.priority,
      estimatedeffort: row.estimatedeffort,
    });
  })
);

/**
 * GET /api/overview/draft/:id
 * Returns draft content + metadata + status.
 *
 * Authz: author OR admin OR consultant on same company.
 * For T022 minimal slice — admin/consultant gating deferred to G3 T010 full impl.
 */
router.get(
  '/draft/:id',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const [row] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);

    if (!row) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    // Minimal authz: author OR same-company. Full role matrix in G3 T010.
    if (row.authoruserid !== req.userid && row.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    res.json({
      draftid: row.id,
      content: row.content,
      status: row.status,
      proposalid: row.proposalid,
      projectid: row.projectid,
      title: row.title,
      priority: row.priority,
      estimatedeffort: row.estimatedeffort,
      updatedat: row.updatedat,
    });
  })
);

/**
 * PUT /api/overview/draft/:id
 * Save content updates and (optionally) metadata. Optimistic CAS on updatedat.
 *
 * For T022 minimal slice — full atomic file+DB persistence (FR-007) lands in G3 T011.
 */
router.put(
  '/draft/:id',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const { content, title, priority, estimatedeffort } = req.body as {
      content?: string;
      title?: string;
      priority?: string;
      estimatedeffort?: string;
    };

    if (typeof content !== 'string' && title === undefined && priority === undefined && estimatedeffort === undefined) {
      res.status(400).json({ error: 'At least one of content/title/priority/estimatedeffort required' });
      return;
    }

    const [existing] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);

    if (!existing) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }

    if (existing.authoruserid !== req.userid && existing.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    if (existing.status === 'accepted') {
      res.status(409).json({ error: 'Draft is accepted; further edits blocked (FR-011 AC3)' });
      return;
    }

    // If the draft is bound to a proposal, mirror metadata changes to it.
    // First check the proposal's status — block updates once admin has accepted.
    if (existing.proposalid) {
      const [proposal] = await db
        .select({ status: projectproposals.status })
        .from(projectproposals)
        .where(eq(projectproposals.id, existing.proposalid))
        .limit(1);
      if (proposal && proposal.status === 'accepted') {
        res.status(409).json({
          error: 'Linked proposal has been accepted; further edits blocked',
        });
        return;
      }
    }

    const updateSet: Record<string, unknown> = { updatedat: new Date() };
    if (typeof content === 'string') updateSet['content'] = content;
    if (typeof title === 'string') updateSet['title'] = title.trim() || null;
    if (typeof priority === 'string') updateSet['priority'] = priority.trim() || null;
    if (typeof estimatedeffort === 'string')
      updateSet['estimatedeffort'] = estimatedeffort.trim() || null;

    // Mirror to projectproposals when linked, in a transaction so they stay
    // in sync (FR-015 D1 — overviewdrafts.content is the source of truth and
    // projectproposals.description is the legacy/derived view).
    const updated = await db.transaction(async (tx) => {
      const [draft] = await tx
        .update(overviewdrafts)
        .set(updateSet)
        .where(eq(overviewdrafts.id, draftid))
        .returning();
      if (existing.proposalid) {
        const proposalSet: Record<string, unknown> = { updatedat: new Date() };
        if (typeof content === 'string') proposalSet['description'] = content;
        if (typeof title === 'string' && title.trim()) proposalSet['title'] = title.trim();
        if (typeof priority === 'string' && priority.trim())
          proposalSet['priority'] = priority.trim();
        if (typeof estimatedeffort === 'string')
          proposalSet['estimatedeffort'] = estimatedeffort.trim() || null;
        if (Object.keys(proposalSet).length > 1) {
          await tx
            .update(projectproposals)
            .set(proposalSet)
            .where(eq(projectproposals.id, existing.proposalid));
        }
      }
      return draft!;
    });

    res.json({
      draftid: updated.id,
      content: updated.content,
      title: updated.title,
      priority: updated.priority,
      estimatedeffort: updated.estimatedeffort,
      updatedat: updated.updatedat,
    });
  })
);

/**
 * GET /api/overview/draft-by-proposal/:proposalid
 * Look up the overview draft that's bound to a given proposal. If none exists
 * (legacy proposal created before spec 025), backfill one from the proposal's
 * own description/metadata — Edit-from-list always opens an editable draft.
 *
 * Authorization: caller must be in the proposal's company. The backfilled
 * draft preserves the original proposal's author (proposal.createdbyid).
 */
router.get(
  '/draft-by-proposal/:proposalid',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    const proposalid = String(req.params.proposalid);

    // Existing bound draft?
    const [existing] = await db
      .select({ id: overviewdrafts.id, companyid: overviewdrafts.companyid })
      .from(overviewdrafts)
      .where(eq(overviewdrafts.proposalid, proposalid))
      .limit(1);
    if (existing) {
      if (existing.companyid !== req.companyid) {
        res.status(403).json({ error: 'Forbidden' });
        return;
      }
      res.json({ draftid: existing.id, backfilled: false });
      return;
    }

    // No draft — backfill from the proposal row.
    const [proposal] = await db
      .select()
      .from(projectproposals)
      .where(eq(projectproposals.id, proposalid))
      .limit(1);
    if (!proposal) {
      res.status(404).json({ error: 'Proposal not found' });
      return;
    }
    if (proposal.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // Map proposal status → draft status (pending/good_idea ⇒ submitted; rest unchanged).
    const draftStatus =
      proposal.status === 'pending' || proposal.status === 'good_idea'
        ? 'submitted'
        : proposal.status;

    const [created] = await db
      .insert(overviewdrafts)
      .values({
        // Preserve original authorship; current user is just editing.
        authoruserid: proposal.createdbyid,
        companyid: proposal.companyid,
        proposalid: proposal.id,
        status: draftStatus,
        content: proposal.description ?? '',
        title: proposal.title,
        priority: proposal.priority,
        estimatedeffort: proposal.estimatedeffort,
      })
      .returning();

    logger.info(
      { proposalid, backfilledDraftId: created!.id, by: req.userid },
      'Backfilled overviewdrafts row from legacy proposal',
    );

    res.json({ draftid: created!.id, backfilled: true });
  })
);

/**
 * GET /api/overview/draft-by-project/:projectid
 * Spec 025 FR-016 / A12 — return-or-create the overviewdrafts row scoped to a
 * project. Mirror of draft-by-proposal/:proposalid, but for the dashboard
 * "Project Overview" ReportLinkCard entry path (US3.5).
 *
 * Seed precedence (per FR-016 AC):
 *   1. Existing draft for (projectid, proposalid IS NULL) — return as-is
 *   2. Existing projectdocuments row for (projectid, doctype='ProjectOverview',
 *      specid IS NULL) — backfill new draft with that content
 *   3. Empty section template (FR-003)
 *
 * Authorization: caller must be in the project's company.
 */
router.get(
  '/draft-by-project/:projectid',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }
    const projectid = String(req.params.projectid);

    // Verify the project exists and belongs to the caller's company.
    const [project] = await db
      .select({ id: projects.id, companyid: projects.companyid })
      .from(projects)
      .where(eq(projects.id, projectid))
      .limit(1);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    if (project.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // 1. Existing project-mode draft? (projectid set, proposalid null)
    const [existing] = await db
      .select({ id: overviewdrafts.id })
      .from(overviewdrafts)
      .where(
        and(
          eq(overviewdrafts.projectid, projectid),
          isNull(overviewdrafts.proposalid),
        ),
      )
      .limit(1);
    if (existing) {
      res.json({ draftid: existing.id, backfilled: false });
      return;
    }

    // 2. Existing projectdocuments ProjectOverview row?
    const [existingDoc] = await db
      .select({ content: projectdocuments.content })
      .from(projectdocuments)
      .where(
        and(
          eq(projectdocuments.projectid, projectid),
          eq(projectdocuments.doctype, OVERVIEW_DOCTYPE),
          isNull(projectdocuments.specid),
        ),
      )
      .limit(1);

    // 3. Otherwise empty template
    const seedContent = existingDoc?.content ?? buildEmptyOverviewTemplate();

    const [created] = await db
      .insert(overviewdrafts)
      .values({
        authoruserid: req.userid,
        companyid: req.companyid,
        projectid,
        proposalid: null,
        status: 'draft',
        content: seedContent,
      })
      .returning();

    logger.info(
      {
        projectid,
        draftid: created!.id,
        seededFrom: existingDoc ? 'projectdocuments' : 'empty-template',
        by: req.userid,
      },
      'Created project-mode overview draft',
    );

    res.json({ draftid: created!.id, backfilled: true });
  }),
);

/**
 * POST /api/overview/draft/:id/finalize
 * Spec 025 FR-017 / A13 — project-mode terminal action ("Done editing").
 * Persists optional final content, then atomically upserts projectdocuments
 * (doctype='ProjectOverview', specid=null). Distinct from submit-proposal:
 * project-mode drafts stay in 'draft' status (no proposal lifecycle).
 *
 * NO disk write — DB is the source of truth across hosts. The kit pulls on
 * workspace open (FR-018, kit-side scope).
 */
router.post(
  '/draft/:id/finalize',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const { content: finalContent } = req.body as { content?: string };

    const [draft] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }
    if (draft.authoruserid !== req.userid && draft.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (!draft.projectid) {
      res.status(400).json({
        error: 'finalize is only valid for project-mode drafts (projectid required)',
      });
      return;
    }

    // Persist any final unsaved content first.
    let contentToCommit = draft.content;
    if (typeof finalContent === 'string' && finalContent !== draft.content) {
      const [updated] = await db
        .update(overviewdrafts)
        .set({ content: finalContent, updatedat: new Date() })
        .where(eq(overviewdrafts.id, draftid))
        .returning();
      contentToCommit = updated!.content;
    }

    const docrow = await ProjectDocumentService.upsertDocument(
      draft.projectid,
      OVERVIEW_DOCTYPE,
      OVERVIEW_TITLE,
      contentToCommit,
      req.userid,
    );

    logger.info(
      {
        draftid,
        projectid: draft.projectid,
        projectdocumentid: docrow.id,
        by: req.userid,
        contentlen: contentToCommit.length,
      },
      'Project-mode overview draft finalized',
    );

    res.json({
      projectdocumentid: docrow.id,
      updatedat: docrow.updatedat,
    });
  }),
);

/**
 * POST /api/overview/draft/:id/ai-message
 * Spec 025 T012 — SSE streaming BA interview turn.
 *
 * Body: { content: string, kickoff?: boolean }
 *   - kickoff=true and content==="" produces the canonical interview opener
 *     without a Gemini call (used when client first opens the chat).
 *   - Otherwise, content is the user's turn; the route appends it to
 *     overviewtranscripts, calls Gemini streaming, and SSEs the assistant
 *     chunks back. The full assistant message is persisted on stream close.
 *
 * Response: text/event-stream
 *   event: chunk        data: { delta: string }
 *   event: done         data: { messageId: string }
 *   event: heartbeat    data: { ts: ISO }     (every 15s, per N4)
 *   event: error        data: { error: string }
 */
router.post(
  '/draft/:id/ai-message',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const { content, kickoff } = req.body as { content?: string; kickoff?: boolean };

    if (typeof content !== 'string') {
      res.status(400).json({ error: 'content (string) required' });
      return;
    }

    // Authz — author or same-company
    const [draft] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }
    if (draft.authoruserid !== req.userid && draft.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    // SSE setup
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();

    const send = (event: string, data: Record<string, unknown>): void => {
      res.write(`event: ${event}\n`);
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // N4 heartbeat — every 15s
    const heartbeat = setInterval(() => {
      send('heartbeat', { ts: new Date().toISOString() });
    }, 15_000);

    // Cleanup on client disconnect
    let aborted = false;
    req.on('close', () => {
      aborted = true;
      clearInterval(heartbeat);
    });

    try {
      // Persist user turn (skip if kickoff with empty content)
      if (!(kickoff && content.trim() === '')) {
        await db.insert(overviewtranscripts).values({
          overviewdraftid: draftid,
          role: 'user',
          content: content,
        });
      }

      // Kickoff path: synthesize opener locally, no LLM call
      if (kickoff && content.trim() === '') {
        const opener = buildInterviewKickoff({
          existingContent: draft.content || '',
        });
        // Stream the opener char-by-char in chunks for consistent UX
        const chunkSize = 24;
        for (let i = 0; i < opener.length; i += chunkSize) {
          if (aborted) break;
          send('chunk', { delta: opener.slice(i, i + chunkSize) });
          await new Promise((r) => setTimeout(r, 15));
        }
        const [persisted] = await db
          .insert(overviewtranscripts)
          .values({
            overviewdraftid: draftid,
            role: 'assistant',
            content: opener,
          })
          .returning();
        clearInterval(heartbeat);
        send('done', { messageId: persisted!.id });
        res.end();
        return;
      }

      // [SCOPE 099 / T003] BEGIN — Interview turn via the shared streaming helper
      // This replaced ~150 lines of inline provider dispatch + SSE parsing — a third
      // copy of what llm-provider/llm-stream already did. streamChat owns the wire
      // now, including the Anthropic leading-assistant trim that this file used to be
      // the only holder of (ported in T002, which is why T002 gated this task).
      const history = await db
        .select()
        .from(overviewtranscripts)
        .where(eq(overviewtranscripts.overviewdraftid, draftid))
        .orderBy(asc(overviewtranscripts.createdat));

      // SPEC-025 FR-020 — bounded transcript window.
      // Every turn used to re-send the ENTIRE transcript at max_tokens 2048, so token
      // cost grew quadratically with interview length. Measured: a two-message call
      // reserves ~1,135 of an 8,000 tok/min budget, because providers count RESERVED
      // max_tokens against the rate limit — so a long interview walked into a hard 429
      // mid-conversation and the user lost their session. Gemini only made that waste
      // cheap; every free tier makes it fatal.
      // Windowing happens HERE, above the wire mapping, so it applies to every provider
      // at once. Order is window-THEN-trim: streamChat drops a leading assistant turn
      // for anthropic afterwards, and that only stays correct in this order.
      // FR-021 (2): default raised 10 -> 28. A seven-section interview runs ~4
      // turns/section (~28 turns); the old default of 10 dropped the early
      // sections out of context by section ~3, so the model lost its place,
      // stopped emitting section fences, and restarted at Problem. The env var
      // remains the override; max_tokens is still bounded per FR-020.
      const windowRaw = Number(process.env['OVERVIEW_HISTORY_TURNS'] ?? 28);
      const windowSize =
        Number.isFinite(windowRaw) && windowRaw > 0 ? Math.floor(windowRaw) : 28;
      const windowed = history.slice(-windowSize);

      const messages: ChatMessage[] = windowed.map((m) => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: m.content,
      }));

      // FR-021 (1): window-INDEPENDENT interview-state preamble. Covered set =
      // sections with real APPROVED content in the draft body. Derived from
      // durable state (the draft markdown), NOT from the bounded window, so the
      // model always knows which sections are done and which is current even
      // after early turns scroll out — this is what stops the restart-at-Problem
      // loop.
      //
      // IMPORTANT: "covered" means APPROVED (written to the doc), never merely
      // PROPOSED. A live test showed that counting a proposed-but-unapproved
      // section as covered makes the preamble advance the model past a section
      // the author is still revising via [C]hange — so the model skips ahead and
      // sections land out of order. Approval is the only completion signal, and
      // it lands in draft.content. The sectionkey stamp below is a recoverability
      // record, NOT a completion signal.
      const coveredKeys = sectionsWithContent(draft.content || '');
      const statePreamble = buildInterviewStatePreamble(coveredKeys);
      const system = `${BUSINESS_ANALYST_SYSTEM_PROMPT}\n\n${statePreamble}`;

      // Throws on config/API failure; the outer catch turns that into an SSE `error`
      // frame and closes the stream — the same contract the inline branches had, with
      // a better message (the provider's response body now travels with the error).
      const assistantText = await streamChat({
        system,
        messages,
        // Explicit: streamChat defaults to 0.4, but the interview has always run 0.7.
        temperature: 0.7,
        // FR-020: 2048 -> 1024. Halves the per-request reservation against TPM.
        maxTokens: 1024,
        onDelta: (delta) => {
          // The inline loop was `while (!aborted)`; streamChat has no abort concept,
          // so drop deltas once the client is gone rather than write to a closed socket.
          if (!aborted) send('chunk', { delta });
        },
      });
      // [SCOPE 099 / T003] END

      // FR-021 (3): server-side section-write fallback. If this turn proposed a
      // section via a `section:` fence, stamp its key on the transcript row so
      // the covered-set derivation above stays accurate even if the author never
      // clicks Approve — the proposal is durably recorded (recoverable) instead
      // of silently lost, and the model won't re-propose or restart. A turn
      // normally proposes one section; if several, the last one is the active
      // proposal.
      const detected = detectSectionProposals(assistantText);
      const proposedSectionKey =
        detected.length > 0 ? detected[detected.length - 1]!.sectionKey : null;

      // Persist final assistant message
      const [persisted] = await db
        .insert(overviewtranscripts)
        .values({
          overviewdraftid: draftid,
          role: 'assistant',
          content: assistantText,
          sectionkey: proposedSectionKey,
        })
        .returning();

      clearInterval(heartbeat);
      send('done', { messageId: persisted!.id });
      res.end();
    } catch (err) {
      clearInterval(heartbeat);
      logger.error({ err }, 'ai-message stream error');
      try {
        send('error', {
          error: err instanceof Error ? err.message : 'Stream error',
        });
        res.end();
      } catch {
        // already closed
      }
    }
  })
);

/**
 * GET /api/overview/draft/:id/transcript
 * Returns the persisted transcript for an interview/paste/import session.
 * Used to rehydrate the chat UI on reload.
 */
router.get(
  '/draft/:id/transcript',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const [draft] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);
    if (!draft) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }
    if (draft.authoruserid !== req.userid && draft.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }

    const messages = await db
      .select()
      .from(overviewtranscripts)
      .where(eq(overviewtranscripts.overviewdraftid, draftid))
      .orderBy(asc(overviewtranscripts.createdat));

    res.json({
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        sectionkey: m.sectionkey,
        sourceuri: m.sourceuri,
        createdat: m.createdat,
      })),
    });
  })
);

/**
 * POST /api/overview/draft/:id/submit-proposal
 * Spec 025 T016 — atomically create the projectproposals row and finalize the
 * overviewdrafts row (status='submitted', proposalid set).
 *
 * Body (optional — overrides whatever's on the draft):
 *   { title?, priority?, estimatedeffort? }
 *
 * Validation: draft.status must be 'draft'. Title is required (from body or
 * the draft's stored title). content from the draft becomes the proposal's
 * description for backwards-compat with existing /api/proposals consumers.
 */
router.post(
  '/draft/:id/submit-proposal',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: 'Unauthenticated' });
      return;
    }

    const draftid = String(req.params.id);
    const overrides = req.body as {
      title?: string;
      priority?: string;
      estimatedeffort?: string;
    };

    const [draft] = await db
      .select()
      .from(overviewdrafts)
      .where(eq(overviewdrafts.id, draftid))
      .limit(1);

    if (!draft) {
      res.status(404).json({ error: 'Draft not found' });
      return;
    }
    if (draft.authoruserid !== req.userid && draft.companyid !== req.companyid) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    if (draft.status !== 'draft') {
      res.status(409).json({
        error: `Draft is already ${draft.status}; cannot submit again`,
      });
      return;
    }

    const finalTitle = (overrides.title ?? draft.title ?? '').trim();
    if (!finalTitle) {
      res.status(400).json({ error: 'Title is required to submit a proposal' });
      return;
    }
    const finalPriority = (overrides.priority ?? draft.priority ?? 'medium').trim() || 'medium';
    const finalEffort = (overrides.estimatedeffort ?? draft.estimatedeffort ?? '').trim();

    // Look up author for proposal.source (preserves existing semantics —
    // projectproposals.source is the user's display name OR "AI Agent")
    const [author] = await db
      .select({
        fullname: userprofiles.fullname,
        emailaddr: userprofiles.emailaddr,
      })
      .from(userprofiles)
      .where(eq(userprofiles.id, req.userid))
      .limit(1);

    const sourceName =
      (author?.fullname && author.fullname.trim()) ||
      author?.emailaddr ||
      'unknown';

    // Atomic: create proposal + flip draft status. If either fails, both roll back.
    const result = await db.transaction(async (tx) => {
      const [proposal] = await tx
        .insert(projectproposals)
        .values({
          companyid: req.companyid!,
          title: finalTitle,
          description: draft.content,
          priority: finalPriority,
          estimatedeffort: finalEffort || null,
          status: 'pending',
          source: sourceName,
          createdbyid: req.userid!,
        })
        .returning();
      const [updatedDraft] = await tx
        .update(overviewdrafts)
        .set({
          proposalid: proposal!.id,
          status: 'submitted',
          title: finalTitle,
          priority: finalPriority,
          estimatedeffort: finalEffort || null,
          updatedat: new Date(),
        })
        .where(eq(overviewdrafts.id, draftid))
        .returning();
      return { proposal: proposal!, draft: updatedDraft! };
    });

    logger.info(
      {
        draftid,
        proposalid: result.proposal.id,
        title: finalTitle,
        priority: finalPriority,
        contentlen: draft.content.length,
      },
      'Overview draft submitted as proposal',
    );

    res.status(201).json({
      proposalid: result.proposal.id,
      draftid: result.draft.id,
      status: result.draft.status,
      title: result.proposal.title,
      priority: result.proposal.priority,
      estimatedeffort: result.proposal.estimatedeffort,
    });
  })
);

/**
 * POST /api/overview/draft/:id/paste-analyze
 * Spec 025 T013 / A9 / FR-013 — map pasted content onto the fixed sections.
 *
 * Body: { content: string }  (plain text, markdown, or a data:image/* URI)
 *   - Over the 10k soft cap → 413 { error, handoff: 'import' } (no truncation).
 *   - Image data URI → C15 bug-report fallback (vision OCR not supported, N8).
 *   - Otherwise SSE-streams the section mapping; ONLY the AI analysis is
 *     persisted to the transcript (raw paste dropped, C16).
 */
router.post(
  '/draft/:id/paste-analyze',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const draft = await loadAuthorizedDraft(req, res);
    if (!draft) return;

    const { content } = req.body as { content?: string };
    if (typeof content !== 'string' || content.trim() === '') {
      res.status(400).json({ error: 'content (non-empty string) required' });
      return;
    }

    if (content.length > PASTE_MAX_CHARS) {
      res.status(413).json({
        error: `That's too large to paste safely (${content.length.toLocaleString()} > ${PASTE_MAX_CHARS.toLocaleString()} chars). Switch to file import?`,
        handoff: 'import',
      });
      return;
    }

    // Image paste — no server-side OCR (N8). File a C15 bug report and tell the
    // user it was logged rather than silently dropping it.
    if (isImagePaste(content)) {
      const reportPath = await writePasteBugReport({
        reason: 'image paste — no OCR available',
        sample: content.slice(0, 200),
        draftid: draft.id,
        companyid: draft.companyid,
      });
      res.status(422).json({
        error: "I couldn't read this image — logged for the team.",
        bugReport: reportPath,
      });
      return;
    }

    await runSectionMapping(req, res, {
      draftid: draft.id,
      sourceText: content,
      persistRaw: false,
    });
  }),
);

/**
 * POST /api/overview/draft/:id/import
 * Spec 025 T014 / A10 / FR-014 — import a file or allowlisted URL and map it.
 *
 * Body:
 *   { source: 'file', filename, mimetype, payload }   (payload = base64)
 *   { source: 'url',  url }
 *
 * File payloads dispatch to the G5 parsers by type; URL imports go through the
 * SSRF-guarded fetcher (allowlist + DNS-rebind defense) and are cached in
 * importcache per (sourceuri, companyid). Content is chunked at 8k chars; the
 * 500k ceiling is enforced. Raw source + AI analysis + sourceuri are persisted
 * (C16 asymmetry vs. paste).
 */
router.post(
  '/draft/:id/import',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const draft = await loadAuthorizedDraft(req, res);
    if (!draft) return;

    const body = req.body as {
      source?: 'file' | 'url';
      filename?: string;
      mimetype?: string;
      payload?: string;
      url?: string;
      refresh?: boolean;
    };

    let sourceText: string;
    let sourceuri: string;

    try {
      if (body.source === 'file') {
        if (typeof body.payload !== 'string' || typeof body.filename !== 'string') {
          res.status(400).json({ error: 'file import requires filename + payload (base64)' });
          return;
        }
        const buffer = Buffer.from(body.payload, 'base64');
        const parsed = await parseImportFile(body.filename, body.mimetype, buffer);
        sourceText = parsed.text;
        sourceuri = body.filename;
      } else if (body.source === 'url') {
        if (typeof body.url !== 'string') {
          res.status(400).json({ error: 'url import requires a url' });
          return;
        }
        sourceuri = body.url.trim();

        // importcache lookup unless an explicit refresh was requested.
        const [cached] = body.refresh
          ? []
          : await db
              .select({ content: importcache.content })
              .from(importcache)
              .where(
                and(
                  eq(importcache.sourceuri, sourceuri),
                  eq(importcache.companyid, draft.companyid),
                ),
              )
              .limit(1);

        if (cached) {
          sourceText = cached.content;
        } else {
          sourceText = await fetchAllowedUrl(sourceuri);
          const contenthash = createHash('sha256').update(sourceText).digest('hex');
          // Upsert the cache row for this (sourceuri, companyid).
          await db
            .insert(importcache)
            .values({
              sourceuri,
              companyid: draft.companyid,
              content: sourceText,
              contenthash,
            })
            .onConflictDoUpdate({
              target: [importcache.sourceuri, importcache.companyid],
              set: { content: sourceText, contenthash, fetchedat: new Date() },
            });
        }
      } else {
        res.status(400).json({ error: "source must be 'file' or 'url'" });
        return;
      }
    } catch (err) {
      if (err instanceof UrlImportError) {
        res.status(err.statusHint).json({ error: err.message });
        return;
      }
      if (err instanceof UnsupportedFormatError) {
        res.status(422).json({ error: err.message });
        return;
      }
      res
        .status(400)
        .json({ error: err instanceof Error ? err.message : 'Import failed' });
      return;
    }

    if (sourceText.length > IMPORT_MAX_CHARS) {
      res.status(413).json({
        error: `Content exceeds the ${IMPORT_MAX_CHARS.toLocaleString()}-character ceiling — an overview isn't the right container for that volume.`,
      });
      return;
    }

    await runSectionMapping(req, res, {
      draftid: draft.id,
      sourceText,
      sourceuri,
      persistRaw: true,
    });
  }),
);

/**
 * POST /api/overview/draft/:id/import/refresh
 * Spec 025 T015 / A11 / FR-014 — re-import a URL, bypassing importcache.
 *
 * Body: { url }. URL-sourced imports only. Deletes the cached row and re-runs
 * the URL import path so the freshest upstream content is fetched + re-mapped.
 */
router.post(
  '/draft/:id/import/refresh',
  authenticateToken,
  requireAuth,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const draft = await loadAuthorizedDraft(req, res);
    if (!draft) return;

    const { url } = req.body as { url?: string };
    if (typeof url !== 'string' || url.trim() === '') {
      res.status(400).json({ error: 'refresh is only valid for URL imports (url required)' });
      return;
    }
    const sourceuri = url.trim();

    let sourceText: string;
    try {
      sourceText = await fetchAllowedUrl(sourceuri);
    } catch (err) {
      if (err instanceof UrlImportError) {
        res.status(err.statusHint).json({ error: err.message });
        return;
      }
      res.status(400).json({ error: err instanceof Error ? err.message : 'Refresh failed' });
      return;
    }

    const contenthash = createHash('sha256').update(sourceText).digest('hex');
    await db
      .insert(importcache)
      .values({ sourceuri, companyid: draft.companyid, content: sourceText, contenthash })
      .onConflictDoUpdate({
        target: [importcache.sourceuri, importcache.companyid],
        set: { content: sourceText, contenthash, fetchedat: new Date() },
      });

    await runSectionMapping(req, res, {
      draftid: draft.id,
      sourceText,
      sourceuri,
      persistRaw: true,
    });
  }),
);

export default router;
