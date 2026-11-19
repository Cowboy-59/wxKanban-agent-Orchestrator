import JsReport from "jsreport";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("jsreport-service");

/**
 * jsreport service for generating PDF reports
 */
class JsReportService {
  private jsreport: any = null;
  private initialized = false;

  /**
   * Initialize jsreport instance
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.info("jsreport already initialized");
      return;
    }

    try {
      // Create jsreport instance with configuration
      this.jsreport = JsReport({
        httpPort: 5488,
        store: {
          provider: "fs",
        },
        blobStorage: {
          provider: "fs",
        },
        logger: {
          console: {
            transport: "console",
            level: "info",
          },
        },
        allowLocalFilesAccess: true,
        reportTimeout: 60000,
        workers: {
          numberOfWorkers: 2,
        },
        extensions: {
          scripts: {
            enabled: true,
          },
        },
      });

      // Initialize jsreport
      await this.jsreport.init();
      this.initialized = true;
      logger.info("jsreport initialized successfully");
    } catch (error) {
      logger.error({ error }, "Failed to initialize jsreport");
      throw error;
    }
  }

  /**
   * Check if jsreport is initialized
   */
  isInitialized(): boolean {
    return this.initialized && this.jsreport !== null;
  }

  /**
   * Generate a PDF report from HTML content
   */
  async generatePdfFromHtml(
    htmlContent: string,
    options: {
      headerTemplate?: string;
      footerTemplate?: string;
      displayHeaderFooter?: boolean;
      margin?: {
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
      };
    } = {}
  ): Promise<Buffer> {
    if (!this.jsreport || !this.initialized) {
      throw new Error("jsreport not initialized. Call initialize() first.");
    }

    try {
      const result = await this.jsreport.render({
        template: {
          content: htmlContent,
          engine: "none",
          recipe: "chrome-pdf",
          chrome: {
            displayHeaderFooter: options.displayHeaderFooter ?? true,
            headerTemplate: options.headerTemplate || "",
            footerTemplate:
              options.footerTemplate ||
              '<div style="font-size: 9px; margin: 0 auto; text-align: center; width: 100%;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            margin: options.margin || {
              top: "60px",
              bottom: "60px",
              left: "40px",
              right: "40px",
            },
          },
        },
      });

      logger.info({ contentLength: htmlContent.length }, "PDF generated successfully");
      return result.content;
    } catch (error) {
      logger.error({ error }, "Failed to generate PDF");
      throw error;
    }
  }

  /**
   * Generate a PDF report from a Handlebars template
   */
  async generatePdfFromTemplate(
    templateName: string,
    data: Record<string, unknown>,
    options: {
      headerTemplate?: string;
      footerTemplate?: string;
      displayHeaderFooter?: boolean;
      margin?: {
        top?: string;
        bottom?: string;
        left?: string;
        right?: string;
      };
    } = {}
  ): Promise<Buffer> {
    if (!this.jsreport || !this.initialized) {
      throw new Error("jsreport not initialized. Call initialize() first.");
    }

    try {
      const result = await this.jsreport.render({
        template: {
          name: templateName,
          engine: "handlebars",
          recipe: "chrome-pdf",
          chrome: {
            displayHeaderFooter: options.displayHeaderFooter ?? true,
            headerTemplate: options.headerTemplate || "",
            footerTemplate:
              options.footerTemplate ||
              '<div style="font-size: 9px; margin: 0 auto; text-align: center; width: 100%;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
            margin: options.margin || {
              top: "60px",
              bottom: "60px",
              left: "40px",
              right: "40px",
            },
          },
        },
        data,
      });

      logger.info({ templateName, dataKeys: Object.keys(data) }, "PDF generated from template successfully");
      return result.content;
    } catch (error) {
      logger.error({ error, templateName }, "Failed to generate PDF from template");
      throw error;
    }
  }

  /**
   * Render HTML from a Handlebars template (without PDF conversion)
   */
  async renderTemplate(
    templateName: string,
    data: Record<string, unknown>
  ): Promise<string> {
    if (!this.jsreport || !this.initialized) {
      throw new Error("jsreport not initialized. Call initialize() first.");
    }

    try {
      const result = await this.jsreport.render({
        template: {
          name: templateName,
          engine: "handlebars",
          recipe: "html",
        },
        data,
      });

      return result.content.toString();
    } catch (error) {
      logger.error({ error, templateName }, "Failed to render template");
      throw error;
    }
  }

  /**
   * Create or update a template
   */
  async createTemplate(
    name: string,
    content: string,
    helpers?: string
  ): Promise<void> {
    if (!this.jsreport || !this.initialized) {
      throw new Error("jsreport not initialized. Call initialize() first.");
    }

    try {
      const template = await this.jsreport.documentStore.collection("templates").findOne({ name });

      if (template) {
        // Update existing template
        await this.jsreport.documentStore
          .collection("templates")
          .update({ name }, { $set: { content, helpers } });
        logger.info({ name }, "Template updated");
      } else {
        // Create new template
        await this.jsreport.documentStore.collection("templates").insert({
          name,
          content,
          engine: "handlebars",
          recipe: "chrome-pdf",
          helpers,
        });
        logger.info({ name }, "Template created");
      }
    } catch (error) {
      logger.error({ error, name }, "Failed to create/update template");
      throw error;
    }
  }

  /**
   * List all available templates
   */
  async listTemplates(): Promise<Array<{ name: string; content?: string }>> {
    if (!this.jsreport || !this.initialized) {
      throw new Error("jsreport not initialized. Call initialize() first.");
    }

    try {
      const templates = await this.jsreport.documentStore.collection("templates").find({});
      return templates.map((t: { name: string; content?: string }) => ({ name: t.name, content: t.content }));
    } catch (error) {
      logger.error({ error }, "Failed to list templates");
      throw error;
    }
  }

  /**
   * Close jsreport instance
   */
  async close(): Promise<void> {
    if (this.jsreport) {
      await this.jsreport.close();
      this.initialized = false;
      this.jsreport = null;
      logger.info("jsreport closed");
    }
  }
}

// Export singleton instance
export const jsReportService = new JsReportService();
export default jsReportService;
