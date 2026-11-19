// SCOPE-114 / SPEC-116 T001 — read routes for the curated design-system catalog.
//
// THE CATALOG IS GLOBAL. Every other theme route in this codebase filters by `req.companyid`,
// because every other theme table is tenant-scoped. These three do not, and that is correct:
// `designsystems` holds wxKanban's own curated content, identical for every customer, 50 rows
// in total rather than 50 per company. Tenant ownership begins only when a user PICKS an entry,
// which copies it into their own `themetemplates`.
//
// That absence of a tenant predicate is exactly why the column selection below has to be
// explicit and test-guarded rather than left to habit. Two columns must never reach a client:
//
//   `sourcebrand`  — the originating product name. Roughly 45 of the 50 are live trademarks.
//                    Fine as internal traceability, not fine rendered in a paid product.
//   `showcasehtml` — about 25 KB per row. A `SELECT *` on the list route would ship ~1.9 MB
//                    on every browse AND leak the brand in the same breath.
//
// Both risks share one root cause and one guard: name the columns. The showcase is served only
// by its own dedicated route, as `text/html` to a sandboxed iframe, never as JSON.

import { Router, Response } from "express";
import { db } from "../../db/client.js";
import { designsystems } from "../../db/schema/designsystem.js";
import { asc, eq } from "drizzle-orm";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("design-system-routes");

/**
 * The exact columns the list route returns.
 *
 * Written as a Drizzle projection rather than `db.select()` so adding a column to the table
 * cannot silently widen this response. `theme` IS included — the browse cards draw their
 * swatches from the mapped token set, so it is the payload's whole point.
 */
const LIST_COLUMNS = {
  id: designsystems.id,
  slug: designsystems.slug,
  name: designsystems.name,
  description: designsystems.description,
  nativemode: designsystems.nativemode,
  tags: designsystems.tags,
  theme: designsystems.theme,
  synthesizedmode: designsystems.synthesizedmode,
  fontstack: designsystems.fontstack,
  fontimporturl: designsystems.fontimporturl,
  sortorder: designsystems.sortorder,
} as const;

// GET /api/design-systems — list the catalog. Any authenticated member; no tenant filter
// (the catalog is global). Filtering is applied in memory rather than in SQL: 50 rows is
// small, the result is identical, and it keeps one code path for `mode`, `tag` and `q`
// instead of three conditional SQL branches over a table that will never need an index scan.
router.get(
  "/api/design-systems",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      const rows = await db
        .select(LIST_COLUMNS)
        .from(designsystems)
        .orderBy(asc(designsystems.sortorder));

      const mode = typeof req.query.mode === "string" ? req.query.mode.toLowerCase() : "";
      const tag = typeof req.query.tag === "string" ? req.query.tag.toLowerCase() : "";
      const q = typeof req.query.q === "string" ? req.query.q.trim().toLowerCase() : "";

      const filtered = rows.filter((row) => {
        if (mode === "light" || mode === "dark") {
          if (row.nativemode !== mode) return false;
        }
        if (tag) {
          const tags = Array.isArray(row.tags) ? row.tags : [];
          if (!tags.some((t) => String(t).toLowerCase() === tag)) return false;
        }
        if (q) {
          const haystack = `${row.name} ${row.description}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }
        return true;
      });

      // Facet counts come from the UNFILTERED set so the chips do not disappear as the user
      // narrows — a filter UI whose own options vanish when used is disorienting.
      const tagCounts: Record<string, number> = {};
      for (const row of rows) {
        for (const t of Array.isArray(row.tags) ? row.tags : []) {
          const key = String(t);
          tagCounts[key] = (tagCounts[key] ?? 0) + 1;
        }
      }

      return res.json({
        systems: filtered,
        total: rows.length,
        tagCounts,
      });
    } catch (err) {
      logger.error({ err }, "Failed to list design systems");
      return res.status(500).json({ error: "Failed to list design systems" });
    }
  },
);

// GET /api/design-systems/:slug — one entry, including the long-form analysis prose that the
// browse list omits. Still excludes `sourcebrand` and `showcasehtml`.
router.get(
  "/api/design-systems/:slug",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const slug = String(req.params.slug);
    try {
      const [row] = await db
        .select({ ...LIST_COLUMNS, analysis: designsystems.analysis, tokens: designsystems.tokens })
        .from(designsystems)
        .where(eq(designsystems.slug, slug))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Design system not found" });
      return res.json({ system: row });
    } catch (err) {
      logger.error({ err, slug }, "Failed to load design system");
      return res.status(500).json({ error: "Failed to load design system" });
    }
  },
);

// GET /api/design-systems/:slug/showcase — the stored showcase page as text/html, for the
// sandboxed preview iframe.
//
// Served as a document rather than embedded in JSON so the browser can render it directly in
// an iframe with `sandbox=""`. The markup is third-party-authored, which is why the sandbox
// (set by the client) is load-bearing and why the headers below refuse framing from anywhere
// but this origin. `X-Content-Type-Options: nosniff` matters here specifically: without it a
// browser could re-interpret the body as something other than the HTML we declare.
router.get(
  "/api/design-systems/:slug/showcase",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    const slug = String(req.params.slug);
    try {
      const [row] = await db
        .select({ showcasehtml: designsystems.showcasehtml })
        .from(designsystems)
        .where(eq(designsystems.slug, slug))
        .limit(1);
      if (!row) return res.status(404).json({ error: "Design system not found" });
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("X-Frame-Options", "SAMEORIGIN");
      res.setHeader("Cache-Control", "private, max-age=3600");
      // CSP sandbox — the header form, which applies even when this document is opened as a
      // TOP-LEVEL page rather than inside a frame.
      //
      // The iframe in the preview dialog carries its own `sandbox="allow-scripts"`, but the
      // "Open full page" link navigates here directly, and an iframe attribute obviously cannot
      // govern that. Without this header those pages would execute their scripts as a
      // first-party document on our origin, with our cookies and localStorage in reach. All 50
      // of them do run scripts — that is how they render their palette and type specimens — so
      // this is the difference between an isolated preview and self-inflicted XSS.
      //
      // `allow-scripts` without `allow-same-origin`, matching the iframe: scripts execute, the
      // document gets an opaque origin, and it can touch nothing of ours. Granting both tokens
      // together would let the page lift its own sandbox.
      res.setHeader("Content-Security-Policy", "sandbox allow-scripts");
      return res.send(row.showcasehtml);
    } catch (err) {
      logger.error({ err, slug }, "Failed to load design system showcase");
      return res.status(500).json({ error: "Failed to load showcase" });
    }
  },
);

export default router;
