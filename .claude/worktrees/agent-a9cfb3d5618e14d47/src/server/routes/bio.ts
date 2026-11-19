// [SCOPE 100 / T006] BEGIN — Public founder bio endpoint (FR-003)
// MODIFIED-BY: T015 — gate resolution on a published en-US row (whole-branch review fix)
// MODIFIED-BY: T016 — stop filtering candidates by per-row status (regression fix). The
// locale rows have no independent publish meaning (FR-001/Data Model): nothing but the
// translate fan-out ever writes them, and T015's own fix made that fan-out inherit the
// en-US row's status instead of hardcoding "published". Chained together, a fresh en-US
// row defaults to "draft", so save() -> translate() -> publish leaves all 5 locale rows
// stuck at status:"draft" forever (publish only PATCHes the en-US row) — the ordering in
// the scope's own US1 happy path. The old status==='published' filter here then dropped
// those 5 rows from every candidate list, so a French visitor was served English even
// though hasPublishedEnglish() had already gated the whole request on the one status
// decision that actually governs liveness. Removing the filter makes per-locale status
// irrelevant to serving, closing the gap without adding a status cascade that would have
// to fire on every publish/unpublish.
import { Router, type Request, type Response } from "express";
import { and, eq, isNull, isNotNull, ne, desc } from "drizzle-orm";
import { db } from "../db/client.js";
import { marketingassets } from "../../db/schema/marketingassets.js";
import { BIO_ASSETKEY, BIO_CATEGORY } from "../../shared/bio/constants.js";
import { pickBestByLocale, hasPublishedEnglish } from "../../shared/bio/locale.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const bioLogger = createLogger("bio-routes");

/**
 * GET /api/bio?locale=fr-FR
 * The published founder bio, resolved to ONE row. Public, read-only.
 * Returns data:null when no published bio exists — the caller redirects (FR-004).
 */
router.get("/", async (req: Request, res: Response) => {
  try {
    const requested = typeof req.query.locale === "string" ? req.query.locale : "";
    // Fetch the whole group regardless of status — hasPublishedEnglish needs to see
    // the en-US row's real status, not just the rows that already passed a
    // status='published' filter, or a draft-English/published-translations mix
    // would be invisible to the gate below.
    const rows = await db
      .select({
        id: marketingassets.id,
        title: marketingassets.title,
        content: marketingassets.content,
        fileurl: marketingassets.fileurl,
        locale: marketingassets.locale,
        status: marketingassets.status,
      })
      .from(marketingassets)
      .where(
        and(
          eq(marketingassets.assetkey, BIO_ASSETKEY),
          eq(marketingassets.category, BIO_CATEGORY),
          isNull(marketingassets.companyid),
          isNotNull(marketingassets.content),
          ne(marketingassets.content, ""),
        ),
      )
      .orderBy(desc(marketingassets.updatedat));

    // FR-003/US6: the en-US row's status governs whether the bio is live at all.
    // Without this gate, a published translation can outlive (or precede) an
    // unpublished English source and get served to an English visitor, and flipping
    // en-US Published -> Draft would not take the translations offline with it.
    if (!hasPublishedEnglish(rows)) {
      res.json({ success: true, data: null });
      return;
    }

    // No per-row status filter here: the en-US gate above is the ONLY publish decision
    // (FR-001/Data Model). Locale rows carry whatever status the translate fan-out last
    // inherited from the English source and that value has no bearing on whether a
    // locale row is servable — filtering on it is what reintroduced the regression this
    // fix removes. `rows` is already scoped to this assetkey/category and non-empty
    // content by the query above.
    const best = pickBestByLocale(rows, requested);
    res.json({
      success: true,
      data: best
        ? { title: best.title, content: best.content, fileurl: best.fileurl, locale: best.locale }
        : null,
    });
  } catch (error) {
    bioLogger.error({ err: error }, "fetch public bio failed");
    res.status(500).json({ success: false, error: "Failed to fetch bio" });
  }
});

export default router;
// [SCOPE 100 / T006] END
