/**
 * Marketing AI Assist — SysAdmin generation API (spec 065)
 *
 * On-demand, fail-open marketing-copy generation. All routes require SYSADMIN and
 * are soft-throttled per user+action. Every response is a DRAFT for human review —
 * nothing here sends, posts, deploys, or publishes (FR-013). A model failure
 * returns a handled { ok:false } 200, never a 5xx (FR-002).
 */

import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { getMarketingOverview } from "../services/SysAdminMarketingOverviewService.js";
import {
  checkThrottle,
  newsletterDraft,
  newsletterImprove,
  newsletterVariants,
  socialCopy,
  seoGenerate,
  seoAudit,
  translateAll,
  repurpose,
  overviewAnalyze,
  campaignGoal,
  postContent,
  layoutAssist,
  bioRevise,
  resolveTranslationRouting,
  type SocialChannel,
} from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("marketing-ai-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

// [SCOPE 065 / T003] BEGIN — SysAdmin marketing AI assist routes

const FAIL_OPEN = { ok: false as const, error: "Couldn't generate — please try again." };

/** Throttle gate: returns true if the request was already answered with 429. */
function throttledOut(req: AuthRequest, res: Response, action: string): boolean {
  const t = checkThrottle(`${req.userid ?? "anon"}:${action}`);
  if (!t.ok) {
    res.status(429).json({ ok: false, error: "Too many requests — slow down.", retryAfterMs: t.retryAfterMs });
    return true;
  }
  return false;
}

const CHANNELS = ["linkedin", "x", "facebook", "reddit", "youtube"] as const;

router.post("/newsletter/draft", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "newsletter-draft")) return;
  const p = z.object({ brief: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "brief is required." }); return; }
  const out = await newsletterDraft(p.data.brief);
  res.json(out ? { ok: true, draft: out } : FAIL_OPEN);
});

router.post("/newsletter/improve", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "newsletter-improve")) return;
  const p = z
    .object({ subject: z.string().min(1), body: z.string().min(1), instruction: z.string().max(500).optional() })
    .safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "subject and body are required." }); return; }
  const out = await newsletterImprove(p.data.subject, p.data.body, p.data.instruction);
  res.json(out ? { ok: true, draft: out } : FAIL_OPEN);
});

router.post("/newsletter/variants", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "newsletter-variants")) return;
  const p = z.object({ subject: z.string().min(1), body: z.string().min(1) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "subject and body are required." }); return; }
  const out = await newsletterVariants(p.data.subject, p.data.body);
  res.json(out ? { ok: true, variants: out } : FAIL_OPEN);
});

router.post("/social", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "social")) return;
  const p = z
    .object({ message: z.string().min(1).max(4000), channels: z.array(z.enum(CHANNELS)).min(1) })
    .safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "message and at least one channel are required." }); return; }
  const out = await socialCopy(p.data.message, p.data.channels as SocialChannel[]);
  res.json(out ? { ok: true, items: out } : FAIL_OPEN);
});

router.post("/seo/generate", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "seo-generate")) return;
  const p = z.object({ topic: z.string().min(1).max(2000), keywords: z.string().max(500).optional() }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "topic is required." }); return; }
  const out = await seoGenerate(p.data);
  res.json(out ? { ok: true, seo: out } : FAIL_OPEN);
});

const SEO_AUDIT_HOST = "windev.wxperts.com";

router.post("/seo/audit", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "seo-audit")) return;
  const p = z.object({ html: z.string().optional(), url: z.string().url().optional() }).safeParse(req.body);
  if (!p.success || (!p.data.html && !p.data.url)) {
    res.status(400).json({ ok: false, error: "html or a windev.wxperts.com url is required." });
    return;
  }
  let html = p.data.html ?? "";
  if (!html && p.data.url) {
    // SSRF guard: only the known marketing domain may be fetched (FR-009).
    let host = "";
    try { host = new URL(p.data.url).hostname; } catch { /* handled below */ }
    if (host !== SEO_AUDIT_HOST) {
      res.status(400).json({ ok: false, error: `Only ${SEO_AUDIT_HOST} URLs may be audited.` });
      return;
    }
    try {
      const r = await fetch(p.data.url);
      html = await r.text();
    } catch (err) {
      logger.error({ err }, "seo audit url fetch failed");
      res.json({ ok: false, error: "Couldn't fetch that page." });
      return;
    }
  }
  const out = await seoAudit(html);
  res.json(out ? { ok: true, audit: out } : FAIL_OPEN);
});

router.post("/translate", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "translate")) return;
  const p = z.object({ text: z.string().min(1).max(8000) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "text is required." }); return; }
  const translations = await translateAll(p.data.text);
  res.json({ ok: true, translations });
});

router.post("/repurpose", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "repurpose")) return;
  const p = z.object({ message: z.string().min(1).max(4000) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "message is required." }); return; }
  const out = await repurpose(p.data.message);
  res.json(out ? { ok: true, bundle: out } : FAIL_OPEN);
});

router.post("/overview/analyze", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "overview-analyze")) return;
  try {
    const overview = await getMarketingOverview(); // server-side, fail-open itself
    const out = await overviewAnalyze(overview);
    res.json(out ? { ok: true, analysis: out } : FAIL_OPEN);
  } catch (err) {
    logger.error({ err }, "overview analyze failed");
    res.json(FAIL_OPEN);
  }
});
// [SCOPE 065 / T003] END

// [SCOPE 065 / T010] BEGIN — campaign goal / post content / layout endpoints
router.post("/campaign/goal", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "campaign-goal")) return;
  const p = z
    .object({
      name: z.string().max(255).optional(),
      segment: z.string().min(1).max(40),
      current: z.string().max(4000).optional(),
      instruction: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "segment is required." }); return; }
  const out = await campaignGoal(p.data);
  res.json(out ? { ok: true, ...out } : FAIL_OPEN);
});

router.post("/post/content", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "post-content")) return;
  const p = z
    .object({
      channel: z.string().min(1).max(20),
      context: z.string().min(1).max(4000),
      locale: z.string().max(35).optional(),
      instruction: z.string().max(500).optional(),
    })
    .safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "channel and context are required." }); return; }
  const out = await postContent(p.data);
  res.json(out ? { ok: true, ...out } : FAIL_OPEN);
});

router.post("/layout", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "layout")) return;
  const p = z.object({ channel: z.string().min(1).max(20), content: z.string().min(1).max(20000) }).safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "channel and content are required." }); return; }
  const out = await layoutAssist(p.data);
  res.json(out ? { ok: true, ...out } : FAIL_OPEN);
});
// [SCOPE 065 / T010] END

// [SCOPE 100 / T011] BEGIN — bio revision chat (FR-009)
// MODIFIED-BY: T017 — revision honors the founder-chosen provider (FR-011), resolved
// from the same persisted setting /bio/translate reads, so one picker governs both.
// Returns a DRAFT only — this route never writes to marketingassets. The founder
// bio editor (Bio.tsx) applies it to its own local state solely on an explicit
// Accept click, so a model error or a discard always leaves saved content intact.
router.post("/bio", async (req: AuthRequest, res: Response): Promise<void> => {
  if (throttledOut(req, res, "bio")) return;
  const p = z
    .object({ current: z.string().max(20_000), instruction: z.string().min(1).max(2000) })
    .safeParse(req.body);
  if (!p.success) { res.status(400).json({ ok: false, error: "current and instruction are required." }); return; }
  const routing = await resolveTranslationRouting();
  const draft = await bioRevise(p.data.current, p.data.instruction, routing);
  res.json(draft ? { ok: true, draft } : FAIL_OPEN);
});
// [SCOPE 100 / T011] END

export default router;
