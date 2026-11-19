// [SCOPE 100 / T008] BEGIN — SysAdmin bio routes (photo presign; translate added in T010)
// MODIFIED-BY: T010 — added POST /translate (FR-007)
// MODIFIED-BY: T015 — PATCH /photo propagates fileurl to all 6 rows (FR-001 whole-branch
// review fix); /translate now passes the source row's status through instead of the
// service hardcoding "published" (FR-003/US6 whole-branch review fix)
// MODIFIED-BY: T017 — added GET /providers + PUT /provider (FR-011); /translate now
// resolves the founder-chosen provider from the persisted setting.
import { Router, Response } from "express";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { requireSysAdmin } from "../middleware/requireSysAdmin.js";
import { presignBioPhotoUpload } from "../lib/marketing-assets-s3.js";
import { db } from "../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { systemSettings, systemSettingsHistory } from "../../db/schema/systemSettings.js";
import { availableProviders, type LlmProvider } from "../ai/llm-provider.js";
import { BIO_ASSETKEY, BIO_SOURCE_LOCALE } from "../../shared/bio/constants.js";
import { translateBioToAllLocales } from "../services/BioTranslationService.js";
import {
  checkThrottle,
  resolveTranslationRouting,
  getSelectedTranslationProvider,
  MARKETING_TRANSLATION_PROVIDER_KEY,
} from "../services/MarketingAIService.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("bio-admin-routes");
const router = Router();

router.use(authenticateToken);
router.use(requireSysAdmin);

const presignSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.string().min(1).max(100),
  contentLength: z.number().int().positive(),
});

router.post("/photo/upload-url", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = presignSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid upload payload." });
    return;
  }
  try {
    const result = await presignBioPhotoUpload(parsed.data);
    res.json(result);
  } catch (err) {
    logger.error({ err }, "bio photo presign failed");
    res.status(400).json({ error: err instanceof Error ? err.message : "Presign failed." });
  }
});

const photoApplySchema = z.object({
  fileurl: z.string().min(1).max(1000),
});

// T015 (FR-001 whole-branch review fix): propagate the founder portrait to every
// row in the assetkey group in one write. Before this, the client PATCHed `fileurl`
// on the en-US row only (see Bio.tsx uploadPhoto), so the 5 translation rows got the
// portrait solely as a side effect of a later Translate press — uploading a new
// portrait after translating left 5 rows pointing at a stale or null fileurl until
// the founder spent ~10 more paid LLM calls re-translating just to refresh a URL.
// A single UPDATE across the group is simpler and cheaper than 6 client PATCHes (the
// client doesn't know which locale rows exist yet) and, critically, spends no LLM
// call — this is a plain column propagation, not a translation.
router.patch("/photo", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = photoApplySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid photo payload." });
    return;
  }
  try {
    const rows = await db
      .update(marketingassets)
      .set({ fileurl: parsed.data.fileurl, updatedat: new Date() })
      .where(eq(marketingassets.assetkey, BIO_ASSETKEY))
      .returning({ id: marketingassets.id, locale: marketingassets.locale });
    res.json({ ok: true, updated: rows.length });
  } catch (err) {
    logger.error({ err }, "bio photo propagate failed");
    res.status(500).json({ ok: false, error: "Failed to update portrait." });
  }
});

// Fan out the English bio to the 5 non-English locales (FR-007). Fail-open per
// locale inside translateBioToAllLocales; a route-level model/DB error is still a
// handled 200 {ok:false}, never a 5xx (FAIL_OPEN convention — marketingAi.ts:41).
// The English row is read-only here and is never rewritten by this route.
// Each press fans out up to 10 concurrent paid LLM calls (5 locales x title+content),
// so this gets the same per-user checkThrottle gate as every other LLM-triggering
// SysAdmin route (faq.ts, marketingBanners.ts, marketingAi.ts, marketingAdmin.ts) —
// key format and 429 shape match marketingAi.ts:44-49 exactly.
router.post("/translate", async (req: AuthRequest, res: Response): Promise<void> => {
  const t = checkThrottle(`${req.userid ?? "anon"}:bio-translate`);
  if (!t.ok) {
    res.status(429).json({ ok: false, error: "Too many requests — slow down.", retryAfterMs: t.retryAfterMs });
    return;
  }
  try {
    const [source] = await db
      .select()
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.assetkey, BIO_ASSETKEY),
          eq(marketingassets.locale, BIO_SOURCE_LOCALE),
        ),
      );
    if (!source?.content) {
      res.json({ ok: false, error: "No English bio to translate.", results: [] });
      return;
    }
    // T017 (FR-011): route the fan-out to the founder-chosen provider. Resolved from
    // the persisted setting; absent/stale → the env default (fail-open, never throws).
    const routing = await resolveTranslationRouting();
    const results = await translateBioToAllLocales(
      {
        title: source.title,
        content: source.content,
        fileurl: source.fileurl,
        status: source.status,
      },
      routing,
    );
    res.json({ ok: results.some((r) => r.ok), results });
  } catch (err) {
    logger.error({ err }, "bio translate failed");
    res.json({ ok: false, results: [] });
  }
});

// T017 (FR-011): the founder-selectable translation/AI provider. This setting is the
// single source of truth both /translate and /ai/bio read — no provider is ever accepted
// in a translate request body. GET lists only providers usable right now (a configured
// key) plus the current selection; PUT validates against that same list and persists the
// choice as a systemsettings row with an audit-history row, mirroring PUT /sysadmin/settings.
router.get("/providers", async (_req: AuthRequest, res: Response): Promise<void> => {
  try {
    const selected = await getSelectedTranslationProvider();
    res.json({ available: availableProviders(), selected });
  } catch (err) {
    logger.error({ err }, "bio providers list failed");
    res.status(500).json({ error: "Failed to load providers." });
  }
});

const providerSchema = z.object({ provider: z.string().min(1).max(50) });

router.put("/provider", async (req: AuthRequest, res: Response): Promise<void> => {
  const parsed = providerSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid provider payload." });
    return;
  }
  const provider = parsed.data.provider as LlmProvider;
  // Reject anything not currently configured — the client picker only offers `available`,
  // so this guards a stale tab or a direct API poke, never the normal path.
  if (!availableProviders().includes(provider)) {
    res.status(400).json({ error: `Provider "${provider}" is not configured.` });
    return;
  }
  try {
    const now = new Date();
    const value = { provider };
    const [existing] = await db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, MARKETING_TRANSLATION_PROVIDER_KEY))
      .limit(1);
    if (existing) {
      await db
        .update(systemSettings)
        .set({ value, updatedat: now, updatedby: req.userid })
        .where(eq(systemSettings.key, MARKETING_TRANSLATION_PROVIDER_KEY));
      await db.insert(systemSettingsHistory).values({
        settingid: existing.id,
        previousvalue: existing.value,
        newvalue: value,
        changedat: now,
        changedby: req.userid,
        changereason: "Bio translation/AI provider changed by SysAdmin",
      });
    } else {
      await db.insert(systemSettings).values({
        key: MARKETING_TRANSLATION_PROVIDER_KEY,
        value,
        category: "integrations",
        description:
          "Provider used to translate the founder bio and drive its AI revision assistant (SCOPE-100 FR-011).",
        updatedat: now,
        updatedby: req.userid,
      });
    }
    res.json({ ok: true, provider });
  } catch (err) {
    logger.error({ err, provider }, "bio provider persist failed");
    res.status(500).json({ ok: false, error: "Failed to save provider." });
  }
});

export default router;
// [SCOPE 100 / T008] END
