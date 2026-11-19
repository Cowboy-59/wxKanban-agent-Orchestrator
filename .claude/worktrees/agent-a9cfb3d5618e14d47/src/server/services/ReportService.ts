import { db } from "~/db/client.js";
import {
  auditreportmetadata,
  AuditReportMetadata,
} from "~/db/schema/auditreportmetadata.js";
import { auditexecutions } from "~/db/schema/auditexecutions.js";
import { auditresults } from "~/db/schema/auditresults.js";
import { wxkanbandocuments } from "~/db/schema/wxkanbandocuments.js";
import { eq, and, desc, gte } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";
import { createHash } from "crypto";

const logger = createLogger("report-service");

export type GenerateReportInput = {
  executionId: string;
  title: string;
  description?: string;
};

export type ReportFilters = {
  frameworks?: string[];
  featureScope?: string;
  approved?: boolean;
  remediationStatus?: string;
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
};

/**
 * Generate an audit report from an execution.
 * Creates a document in wxkanbandocuments and metadata in auditreportmetadata.
 */
export async function generateReport(
  data: GenerateReportInput,
  userId: string,
): Promise<{ document: typeof wxkanbandocuments.$inferSelect; metadata: AuditReportMetadata }> {
  try {
    // Get execution details
    const execution = await db
      .select()
      .from(auditexecutions)
      .where(eq(auditexecutions.id, data.executionId))
      .limit(1);

    if (execution.length === 0) {
      throw new Error("Audit execution not found");
    }

    const exec = execution[0];

    if (exec.status !== "completed") {
      throw new Error("Cannot generate report for incomplete audit execution");
    }

    // Get all results for this execution
    const results = await db
      .select()
      .from(auditresults)
      .where(eq(auditresults.executionid, data.executionId));

    // Calculate findings by severity
    const criticalFindings = results.filter((r) => r.severity === "critical" && r.resultstatus === "fail").length;
    const highFindings = results.filter((r) => r.severity === "high" && r.resultstatus === "fail").length;
    const mediumFindings = results.filter((r) => r.severity === "medium" && r.resultstatus === "fail").length;
    const lowFindings = results.filter((r) => r.severity === "low" && r.resultstatus === "fail").length;

    // Build report content
    const reportContent = buildReportContent(exec, results, {
      critical: criticalFindings,
      high: highFindings,
      medium: mediumFindings,
      low: lowFindings,
    });

    // Compute hash for integrity
    const filehash = createHash("sha256").update(reportContent, "utf8").digest("hex");

    // Create document
    const documentResult = await db
      .insert(wxkanbandocuments)
      .values({
        documenttype: "audit_report",
        title: data.title,
        description: data.description ?? `Audit report for execution ${data.executionId}`,
        filename: `audit-report-${data.executionId}.md`,
        filecontent: reportContent,
        filehash,
        framework: exec.enabledframeworks?.join(", ") ?? "MULTI",
        status: "active",
        extractedtasks: 0,
        createdby: userId,
      })
      .returning();

    const document = documentResult[0];

    // Create metadata
    const metadataResult = await db
      .insert(auditreportmetadata)
      .values({
        documentid: document.id,
        executionid: data.executionId,
        frameworks: exec.enabledframeworks ?? [],
        featurescope: exec.featurescope ?? undefined,
        executiondate: exec.endtime ?? new Date(),
        overallcompliance: exec.overallscore ?? "0",
        criticalfindings: criticalFindings,
        highfindings: highFindings,
        mediumfindings: mediumFindings,
        lowfindings: lowFindings,

        remediationstatus: criticalFindings > 0 || highFindings > 0 ? "open" : "resolved",
        approved: false,
      })
      .returning();

    // Update execution with report reference
    await db
      .update(auditexecutions)
      .set({ reportdocumentid: document.id })
      .where(eq(auditexecutions.id, data.executionId));

    logger.info(
      {
        documentId: document.id,
        executionId: data.executionId,
        criticalFindings,
        highFindings,
        compliance: exec.overallscore,
      },
      "Generated audit report",
    );

    return { document, metadata: metadataResult[0] };
  } catch (error) {
    logger.error({ error, executionId: data.executionId }, "Failed to generate report");
    throw error;
  }
}

/**
 * Build the markdown content of an audit report.
 */
function buildReportContent(
  execution: typeof auditexecutions.$inferSelect,
  results: (typeof auditresults.$inferSelect)[],
  findings: { critical: number; high: number; medium: number; low: number },
): string {
  const frameworks = execution.enabledframeworks?.join(", ") ?? "Unknown";
  const totalFindings = findings.critical + findings.high + findings.medium + findings.low;
  const passedCount = results.filter((r) => r.resultstatus === "pass").length;
  const failedCount = results.filter((r) => r.resultstatus === "fail").length;
  const reviewCount = results.filter((r) => r.resultstatus === "needs_review").length;

  return `# Audit Report

**Execution ID:** ${execution.id}  
**Feature Scope:** ${execution.featurescope ?? "N/A"}  
**Frameworks:** ${frameworks}  
**Execution Date:** ${execution.endtime?.toISOString() ?? new Date().toISOString()}  
**Generated:** ${new Date().toISOString()}

---

## Executive Summary

| Metric | Value |
|--------|-------|
| Overall Compliance Score | ${execution.overallscore ?? 0}% |
| Total Tasks Checked | ${execution.totaltasks ?? 0} |
| Passed | ${passedCount} |
| Failed | ${failedCount} |
| Needs Review | ${reviewCount} |

### Findings Summary

| Severity | Count | Status |
|----------|-------|--------|
| 🔴 Critical | ${findings.critical} | ${findings.critical > 0 ? "REQUIRES IMMEDIATE ACTION" : "None"} |
| 🟠 High | ${findings.high} | ${findings.high > 0 ? "Requires attention" : "None"} |
| 🟡 Medium | ${findings.medium} | ${findings.medium > 0 ? "Review recommended" : "None"} |
| 🟢 Low | ${findings.low} | ${findings.low > 0 ? "Monitor" : "None"} |

**Total Findings:** ${totalFindings}

---

## Detailed Results

${results
  .map(
    (r) => `### ${r.resultstatus === "pass" ? "✅" : r.resultstatus === "fail" ? "❌" : "⚠️"} ${r.resultstatus.toUpperCase()}: Task ${r.taskid}

**Severity:** ${r.severity ?? "N/A"}  
**Status:** ${r.resultstatus}  
**File:** ${r.filepath ?? "N/A"}${r.linenumber ? `:${r.linenumber}` : ""}

${r.resultdetails ? `**Details:** ${r.resultdetails}` : ""}

${r.codesnippet ? `\`\`\`\n${r.codesnippet}\n\`\`\`` : ""}

${r.suggestedfix ? `**Suggested Fix:**\n${r.suggestedfix}` : ""}
`,
  )
  .join("\n---\n")}

---

## Compliance Framework Breakdown

${execution.enabledframeworks
  ?.map((framework) => {
    const frameworkResults = results.filter((r) => r.taskid.includes(framework)); // Approximate
    const fwPassed = frameworkResults.filter((r) => r.resultstatus === "pass").length;
    const fwTotal = frameworkResults.length;
    const fwScore = fwTotal > 0 ? ((fwPassed / fwTotal) * 100).toFixed(1) : "N/A";

    return `### ${framework}
- Tasks Checked: ${fwTotal}
- Passed: ${fwPassed}
- Compliance Score: ${fwScore}%
`;
  })
  .join("\n") ?? "No framework data available"}

---

## Remediation Recommendations

${totalFindings > 0 ? "The following actions are recommended to address findings:" : "No remediation required."}

${findings.critical > 0 ? `- **CRITICAL:** Address all critical findings immediately. These represent severe compliance violations.` : ""}
${findings.high > 0 ? `- **HIGH:** Prioritize high-severity findings for remediation within 7 days.` : ""}
${findings.medium > 0 ? `- **MEDIUM:** Schedule medium-severity findings for next sprint.` : ""}
${findings.low > 0 ? `- **LOW:** Monitor low-severity findings and address as resources permit.` : ""}

---

## Audit Trail

- **Execution Started:** ${execution.starttime?.toISOString() ?? "Unknown"}
- **Execution Completed:** ${execution.endtime?.toISOString() ?? "Unknown"}
- **Report Generated:** ${new Date().toISOString()}
- **Triggered By:** ${execution.triggeredby ?? "System"}

---

*This report was generated automatically by the wxKanban Audit Management system.*
*Report ID: ${execution.id}*
`;
}

/**
 * List audit reports with optional filters.
 */
export async function listReports(filters: ReportFilters = {}): Promise<
  (AuditReportMetadata & { document: typeof wxkanbandocuments.$inferSelect })[]
> {
  try {
    const conditions = [];

    if (filters.approved !== undefined) {
      conditions.push(eq(auditreportmetadata.approved, filters.approved));
    }
    if (filters.remediationStatus) {
      conditions.push(eq(auditreportmetadata.remediationstatus, filters.remediationStatus));
    }
    if (filters.startDate) {
      conditions.push(gte(auditreportmetadata.executiondate, filters.startDate));
    }

    const results = await db
      .select({
        metadata: auditreportmetadata,
        document: wxkanbandocuments,
      })
      .from(auditreportmetadata)
      .innerJoin(wxkanbandocuments, eq(auditreportmetadata.documentid, wxkanbandocuments.id))
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(auditreportmetadata.executiondate))
      .limit(filters.limit ?? 50)
      .offset(filters.offset ?? 0);

    return results.map((r) => ({ ...r.metadata, document: r.document }));
  } catch (error) {
    logger.error({ error, filters }, "Failed to list reports");
    throw error;
  }
}


/**
 * Get a single report by ID.
 */
export async function getReport(
  documentId: string,
): Promise<(AuditReportMetadata & { document: typeof wxkanbandocuments.$inferSelect }) | null> {
  try {
    const result = await db
      .select({
        metadata: auditreportmetadata,
        document: wxkanbandocuments,
      })
      .from(auditreportmetadata)
      .innerJoin(wxkanbandocuments, eq(auditreportmetadata.documentid, wxkanbandocuments.id))
      .where(eq(auditreportmetadata.documentid, documentId))
      .limit(1);

    if (result.length === 0) return null;

    return { ...result[0].metadata, document: result[0].document };
  } catch (error) {
    logger.error({ error, documentId }, "Failed to get report");
    throw error;
  }
}

/**
 * Approve an audit report.
 */
export async function approveReport(
  documentId: string,
  userId: string,
): Promise<AuditReportMetadata> {
  try {
    const result = await db
      .update(auditreportmetadata)
      .set({
        approved: true,
        reviewedby: userId,
        reviewdate: new Date(),
      })
      .where(eq(auditreportmetadata.documentid, documentId))
      .returning();

    if (result.length === 0) {
      throw new Error("Report not found");
    }

    logger.info({ documentId, reviewedBy: userId }, "Approved audit report");
    return result[0];
  } catch (error) {
    logger.error({ error, documentId }, "Failed to approve report");
    throw error;
  }
}

/**
 * Get compliance trend data over time.
 */
export async function getComplianceTrends(days: number = 30): Promise<
  {
    date: Date;
    overallCompliance: number;
    criticalFindings: number;
    highFindings: number;
  }[]
> {
  try {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await db
      .select({
        date: auditreportmetadata.executiondate,
        overallCompliance: auditreportmetadata.overallcompliance,
        criticalFindings: auditreportmetadata.criticalfindings,
        highFindings: auditreportmetadata.highfindings,
      })
      .from(auditreportmetadata)
      .where(gte(auditreportmetadata.executiondate, startDate))
      .orderBy(auditreportmetadata.executiondate);

    return results.map((r) => ({
      date: r.date ?? new Date(),
      overallCompliance: parseFloat(r.overallCompliance?.toString() ?? "0"),
      criticalFindings: r.criticalFindings ?? 0,
      highFindings: r.highFindings ?? 0,
    }));
  } catch (error) {
    logger.error({ error, days }, "Failed to get compliance trends");
    throw error;
  }
}
