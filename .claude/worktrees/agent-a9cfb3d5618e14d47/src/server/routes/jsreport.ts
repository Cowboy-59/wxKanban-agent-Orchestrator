import { Router, Request, Response } from "express";
import { authenticateToken, requireAuth } from "../middleware/auth.js";
import { jsReportService } from "../services/JsReportService.js";
import { createLogger } from "../lib/logger.js";
import { db } from "~/db/client.js";
import { auditexecutions } from "~/db/schema/auditexecutions.js";
import { eq } from "drizzle-orm";
import { readFileSync } from "fs";
import path from "path";

const router = Router();
const logger = createLogger("jsreport-routes");

/**
 * POST /api/reports/jsreport/audit/:executionId
 * Generate a PDF audit report for a specific execution
 */
router.post(
  "/audit/:executionId",
  authenticateToken,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { executionId } = req.params;
      const userId = req.user?.id;

      if (!userId) {
        res.status(401).json({ error: "Unauthorized" });
        return;
      }

      // Check if jsreport is initialized
      if (!jsReportService.isInitialized()) {
        await jsReportService.initialize();
      }

      // Fetch execution data
      const [execution] = await db
        .select()
        .from(auditexecutions)
        .where(eq(auditexecutions.id, executionId))
        .limit(1);

      if (!execution) {
        res.status(404).json({ error: "Execution not found" });
        return;
      }

      // Read template file
      const templatePath = path.join(process.cwd(), "jsreport-data", "templates", "audit-report.html");
      const templateContent = readFileSync(templatePath, "utf-8");

      // Template rendering uses payload assembled below in render options.

      // Generate PDF
      const pdfBuffer = await jsReportService.generatePdfFromHtml(templateContent, {
        headerTemplate: `<div style="font-size: 9px; margin: 0 20px; width: 100%; text-align: center;">
          <span>wxKanban Audit Report</span>
        </div>`,
        footerTemplate: `<div style="font-size: 9px; margin: 0 20px; width: 100%; text-align: center;">
          <span class="pageNumber"></span> / <span class="totalPages"></span>
        </div>`,
        displayHeaderFooter: true,
        margin: {
          top: "60px",
          bottom: "60px",
          left: "40px",
          right: "40px",
        },
      });

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="audit-report-${executionId}.pdf"`
      );

      // Send PDF
      res.send(pdfBuffer);

      logger.info(
        { executionId, userId, pdfSize: pdfBuffer.length },
        "Audit PDF report generated and downloaded"
      );
    } catch (error) {
      logger.error({ error, executionId: req.params.executionId }, "Failed to generate audit PDF");
      res.status(500).json({ error: "Failed to generate PDF report" });
    }
  }
);

/**
 * GET /api/reports/jsreport/status
 * Check jsreport service status
 */
router.get("/status", authenticateToken, requireAuth, async (_req: Request, res: Response): Promise<void> => {
  try {
    const isInitialized = jsReportService.isInitialized();
    res.json({
      status: isInitialized ? "initialized" : "not_initialized",
      service: "jsreport",
    });
  } catch (error) {
    logger.error({ error }, "Failed to check jsreport status");
    res.status(500).json({ error: "Failed to check status" });
  }
});

/**
 * POST /api/reports/jsreport/initialize
 * Initialize jsreport service
 */
router.post(
  "/initialize",
  authenticateToken,
  requireAuth,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      if (jsReportService.isInitialized()) {
        res.json({ status: "already_initialized" });
        return;
      }

      await jsReportService.initialize();
      res.json({ status: "initialized" });
    } catch (error) {
      logger.error({ error }, "Failed to initialize jsreport");
      res.status(500).json({ error: "Failed to initialize jsreport" });
    }
  }
);

/**
 * POST /api/reports/jsreport/generate
 * Generate a PDF from HTML content (generic endpoint)
 */
router.post(
  "/generate",
  authenticateToken,
  requireAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { html, options = {} } = req.body;

      if (!html) {
        res.status(400).json({ error: "HTML content is required" });
        return;
      }

      // Check if jsreport is initialized
      if (!jsReportService.isInitialized()) {
        await jsReportService.initialize();
      }

      // Generate PDF
      const pdfBuffer = await jsReportService.generatePdfFromHtml(html, options);

      // Set response headers
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", `attachment; filename="report.pdf"`);

      // Send PDF
      res.send(pdfBuffer);

      logger.info({ pdfSize: pdfBuffer.length }, "Generic PDF report generated");
    } catch (error) {
      logger.error({ error }, "Failed to generate PDF");
      res.status(500).json({ error: "Failed to generate PDF" });
    }
  }
);

export default router;
