import { db } from "~/db/client.js";
import {
  auditexecutions,
  AuditExecution,
} from "~/db/schema/auditexecutions.js";
import {
  auditresults,
} from "~/db/schema/auditresults.js";
import {
  complianceaudittasks,
  ComplianceAuditTask,
} from "~/db/schema/complianceaudittasks.js";
import { eq, and, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join, extname, relative } from "path";

const logger = createLogger("audit-engine-service");

export type AuditExecutionResult = {
  executionId: string;
  totalTasks: number;
  passedTasks: number;
  failedTasks: number;
  reviewTasks: number;
  overallScore: number;
  status: "completed" | "failed" | "cancelled";
};

/**
 * Execute an automated audit against enabled frameworks.
 * Runs static analysis, pattern matching, and configuration checks.
 */
export async function executeAudit(
  executionId: string,
  enabledFrameworks: string[],
  featureScope: string,
): Promise<AuditExecutionResult> {
  const startTime = Date.now();
  logger.info({ executionId, enabledFrameworks, featureScope }, "Starting audit execution");

  try {
    // Load all automated tasks for enabled frameworks
    const tasks = await db
      .select()
      .from(complianceaudittasks)
      .where(
        and(
          inArray(complianceaudittasks.framework, enabledFrameworks),
          eq(complianceaudittasks.isautomated, true),
        ),
      );

    logger.info({ executionId, taskCount: tasks.length }, "Loaded compliance tasks");

    let passedCount = 0;
    let failedCount = 0;
    let reviewCount = 0;

    // Run checks for each task
    for (const task of tasks) {
      // Check if execution was cancelled
      const execution = await db
        .select({ status: auditexecutions.status })
        .from(auditexecutions)
        .where(eq(auditexecutions.id, executionId))
        .limit(1);

      if (execution.length === 0 || execution[0].status === "cancelled") {
        logger.info({ executionId }, "Audit execution cancelled");
        return {
          executionId,
          totalTasks: tasks.length,
          passedTasks: passedCount,
          failedTasks: failedCount,
          reviewTasks: reviewCount,
          overallScore: 0,
          status: "cancelled",
        };
      }

      // Execute the check based on method
      const result = await executeTaskCheck(task, featureScope);

      // Store result
      await db.insert(auditresults).values({
        executionid: executionId,
        taskid: task.id,
        filepath: result.filepath,
        linenumber: result.lineNumber,
        codesnippet: result.codeSnippet,
        resultstatus: result.status,
        resultdetails: result.details,
        suggestedfix: result.suggestedFix,
        severity: result.severity,
      });

      // Update counters
      if (result.status === "pass") passedCount++;
      else if (result.status === "fail") failedCount++;
      else if (result.status === "needs_review") reviewCount++;

      logger.debug(
        { executionId, taskId: task.id, status: result.status },
        "Task check completed",
      );
    }

    // Calculate overall score
    const totalChecked = passedCount + failedCount + reviewCount;
    const overallScore = totalChecked > 0 ? (passedCount / totalChecked) * 100 : 0;

    // Update execution record
    await db
      .update(auditexecutions)
      .set({
        status: "completed",
        endtime: new Date(),
        totaltasks: tasks.length,
        passedtasks: passedCount,
        failedtasks: failedCount,
        reviewtasks: reviewCount,
        overallscore: overallScore.toFixed(2),
      })
      .where(eq(auditexecutions.id, executionId));

    const duration = Date.now() - startTime;
    logger.info(
      {
        executionId,
        duration,
        totalTasks: tasks.length,
        passed: passedCount,
        failed: failedCount,
        review: reviewCount,
        score: overallScore.toFixed(2),
      },
      "Audit execution completed",
    );

    return {
      executionId,
      totalTasks: tasks.length,
      passedTasks: passedCount,
      failedTasks: failedCount,
      reviewTasks: reviewCount,
      overallScore,
      status: "completed",
    };
  } catch (error) {
    logger.error({ error, executionId }, "Audit execution failed");

    // Update execution as failed
    await db
      .update(auditexecutions)
      .set({
        status: "failed",
        endtime: new Date(),
      })
      .where(eq(auditexecutions.id, executionId));

    throw error;
  }
}

type TaskCheckResult = {
  status: "pass" | "fail" | "needs_review" | "not_applicable";
  filepath?: string;
  lineNumber?: number;
  codeSnippet?: string;
  details?: string;
  suggestedFix?: string;
  severity?: string;
};

/**
 * Execute a single task check based on its method.
 */
async function executeTaskCheck(
  task: ComplianceAuditTask,
  _featureScope: string,
): Promise<TaskCheckResult> {
  const checkMethod = task.checkmethod ?? "regex_pattern";

  switch (checkMethod) {
    case "regex_pattern":
      return await checkRegexPattern(task);
    case "static_analysis":
      return await checkStaticAnalysis(task);
    case "configuration":
      return await checkConfiguration(task);
    case "manual_review":
      return {
        status: "needs_review",
        details: "This task requires manual review",
        severity: task.priority,
      };
    default:
      return {
        status: "not_applicable",
        details: `Unknown check method: ${checkMethod}`,
      };
  }
}

export type RegexEvidence = {
  filepath: string;
  lineNumber: number;
  codeSnippet: string;
};

export type RegexEvidenceResult =
  | { verdict: "evidence"; evidence: RegexEvidence; matchCount: number; filesScanned: number }
  | { verdict: "comment_only"; commentHit: RegexEvidence; filesScanned: number }
  | { verdict: "absent"; filesScanned: number }
  | { verdict: "unverifiable"; reason: string; filesScanned: number };

/**
 * Files that cannot constitute evidence that a control is implemented:
 * generated type declarations and built output are copies, not source of truth.
 * `node_modules` is already excluded by findFiles.
 */
// [SCOPE 113 / FR-011] MODIFIED-BY — translation bundles are excluded.
// They are product PROSE that happens to live in .ts files, and they describe the
// product's security properties in six languages. Scanning them produced three separate
// false passes while authoring the framework catalogs: `aes-256-gcm` matched a German
// string asserting AES-256-GCM encryption, and `bcrypt` matched "bcrypt-Hashing mit
// JWT-Tokens" — each reported as evidence, with a file and line, that the control was
// implemented. A marketing claim translated into German is the weakest possible evidence
// that a cipher is in use, and it is exactly the unearned pass FR-006 exists to prevent.
// Narrow by design: only the locale bundles are excluded, not client code generally.
function isScannableSource(path: string): boolean {
  const normalized = path.replace(/\\/g, "/");
  if (normalized.endsWith(".d.ts")) return false;
  if (/(^|\/)(dist|build|coverage|node_modules)\//.test(normalized)) return false;
  if (/(^|\/)i18n\/locales\//.test(normalized)) return false;
  return true;
}

/**
 * Classify each line as comment or code, tracking block-comment state so a
 * pattern buried inside a `/* ... *\/` run is not mistaken for an implementation.
 */
function classifyLines(content: string): Array<{ text: string; isComment: boolean }> {
  const classified: Array<{ text: string; isComment: boolean }> = [];
  let inBlockComment = false;

  for (const text of content.split(/\r?\n/)) {
    const trimmed = text.trim();
    let isComment = false;

    if (inBlockComment) {
      isComment = true;
      const closeIndex = trimmed.indexOf("*/");
      if (closeIndex !== -1) {
        inBlockComment = false;
        const after = trimmed.slice(closeIndex + 2).trim();
        if (after.length > 0 && !after.startsWith("//")) isComment = false;
      }
    } else if (trimmed.startsWith("//")) {
      isComment = true;
    } else if (trimmed.startsWith("/*")) {
      isComment = true;
      if (!trimmed.includes("*/")) inBlockComment = true;
    } else if (trimmed.startsWith("*")) {
      isComment = true;
    }

    classified.push({ text, isComment });
  }

  return classified;
}

/**
 * Decide whether a set of files provides positive evidence for a compliance
 * pattern — SPEC-112 / FR-006.
 *
 * The previous implementation returned `pass` on the first regex hit anywhere in
 * the `src` tree, recorded no file or line to support it, and treated a comment,
 * a generated `.d.ts` or an unrelated module as proof a control was implemented.
 * A `pass` now REQUIRES a real code match and carries the file, line and snippet
 * that back it. Anything it cannot conclusively verify returns `unverifiable`
 * rather than guessing, because a false pass in an audit report is worse than a
 * reported gap.
 *
 * Pure and filesystem-free so it can be tested directly.
 */
export function evaluateRegexEvidence(
  pattern: string,
  files: Array<{ path: string; content: string }>,
): RegexEvidenceResult {
  const scannable = files.filter((f) => isScannableSource(f.path));
  const filesScanned = scannable.length;

  if (!pattern || pattern.trim().length === 0) {
    return { verdict: "unverifiable", reason: "No check pattern defined", filesScanned };
  }

  if (filesScanned === 0) {
    return {
      verdict: "unverifiable",
      reason: "No applicable files were available to scan",
      filesScanned: 0,
    };
  }

  let regex: RegExp;
  try {
    regex = new RegExp(pattern, "i");
  } catch (error) {
    return {
      verdict: "unverifiable",
      reason: `Invalid check pattern: ${(error as Error).message}`,
      filesScanned,
    };
  }

  let firstCodeHit: RegexEvidence | undefined;
  let firstCommentHit: RegexEvidence | undefined;
  let matchCount = 0;

  for (const file of scannable) {
    const lines = classifyLines(file.content);
    for (let i = 0; i < lines.length; i++) {
      if (!regex.test(lines[i].text)) continue;

      const hit: RegexEvidence = {
        filepath: file.path.replace(/\\/g, "/"),
        lineNumber: i + 1,
        codeSnippet: lines[i].text.trim(),
      };

      if (lines[i].isComment) {
        firstCommentHit ??= hit;
      } else {
        matchCount += 1;
        firstCodeHit ??= hit;
      }
    }
  }

  if (firstCodeHit) {
    return { verdict: "evidence", evidence: firstCodeHit, matchCount, filesScanned };
  }
  if (firstCommentHit) {
    return { verdict: "comment_only", commentHit: firstCommentHit, filesScanned };
  }
  return { verdict: "absent", filesScanned };
}

/**
 * Check source files against a regex pattern.
 */
async function checkRegexPattern(task: ComplianceAuditTask): Promise<TaskCheckResult> {
  const fileTypes = task.applicablefiletypes ?? [".ts", ".tsx", ".js"];

  if (!task.checkpattern) {
    return {
      status: "not_applicable",
      details: "No check pattern defined for this task",
    };
  }

  const srcDir = join(process.cwd(), "src");
  const files: Array<{ path: string; content: string }> = [];
  let unreadable = 0;

  for (const fileType of fileTypes) {
    for (const fullPath of findFiles(srcDir, fileType)) {
      try {
        files.push({
          path: relative(process.cwd(), fullPath).replace(/\\/g, "/"),
          content: readFileSync(fullPath, "utf-8"),
        });
      } catch {
        unreadable += 1;
      }
    }
  }

  const result = evaluateRegexEvidence(task.checkpattern, files);

  switch (result.verdict) {
    case "evidence":
      return {
        status: "pass",
        filepath: result.evidence.filepath,
        lineNumber: result.evidence.lineNumber,
        codeSnippet: result.evidence.codeSnippet,
        details:
          `Evidence for "${task.title}" found in ${result.matchCount} location(s) ` +
          `across ${result.filesScanned} scanned file(s); first at ` +
          `${result.evidence.filepath}:${result.evidence.lineNumber}`,
      };

    case "comment_only":
      return {
        status: "needs_review",
        filepath: result.commentHit.filepath,
        lineNumber: result.commentHit.lineNumber,
        codeSnippet: result.commentHit.codeSnippet,
        details:
          `Pattern for "${task.title}" appears only in comments ` +
          `(${result.commentHit.filepath}:${result.commentHit.lineNumber}) — ` +
          `not evidence that the control is implemented`,
        severity: task.priority,
      };

    case "unverifiable":
      logger.warn({ taskId: task.id, reason: result.reason }, "Regex check unverifiable");
      return {
        status: "needs_review",
        details:
          `Could not verify "${task.title}": ${result.reason}` +
          (unreadable > 0 ? ` (${unreadable} file(s) unreadable)` : ""),
        severity: task.priority,
      };

    case "absent":
      return {
        status: "fail",
        details:
          `Required pattern not found for "${task.title}" ` +
          `across ${result.filesScanned} scanned file(s)`,
        suggestedFix: task.suggestedfix ?? "Implement the required pattern",
        severity: task.priority,
      };
  }
}

/**
 * Run static analysis checks.
 */
async function checkStaticAnalysis(task: ComplianceAuditTask): Promise<TaskCheckResult> {
  // This would integrate with actual SAST tools
  // For now, return needs_review to flag for manual inspection
  return {
    status: "needs_review",
    details: `Static analysis required: ${task.title}`,
    severity: task.priority,
  };
}

/**
 * Check configuration files.
 */
async function checkConfiguration(task: ComplianceAuditTask): Promise<TaskCheckResult> {
  const configFiles = [".env", "package.json", "tsconfig.json", "drizzle.config.ts"];

  try {
    for (const configFile of configFiles) {
      const filePath = join(process.cwd(), configFile);
      if (!existsSync(filePath)) continue;

      const content = readFileSync(filePath, "utf-8");

      // Check for security-related configurations
      if (task.title.toLowerCase().includes("secret") && /SECRET|API_KEY|PRIVATE_KEY/i.test(content)) {
        // Check if secrets are properly handled (not hardcoded in non-.env files)
        if (configFile !== ".env" && !configFile.includes("example")) {
          return {
            status: "fail",
            filepath: configFile,
            details: `Potential hardcoded secret found in ${configFile}`,
            suggestedFix: "Move secrets to .env file and use environment variables",
            severity: "critical",
          };
        }
      }

      // Check for encryption settings
      if (task.title.toLowerCase().includes("encrypt") && /AES|TLS|SSL|cipher/i.test(content)) {
        return {
          status: "pass",
          details: `Encryption configuration found in ${configFile}`,
        };
      }
    }

    return {
      status: "pass",
      details: "Configuration check passed",
    };
  } catch (error) {
    logger.error({ error, taskId: task.id }, "Configuration check failed");
    return {
      status: "needs_review",
      details: `Configuration check failed: ${(error as Error).message}`,
    };
  }
}

/**
 * Recursively find files with given extension.
 */
function findFiles(dir: string, extension: string): string[] {
  const files: string[] = [];

  if (!existsSync(dir)) return files;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith(".") && entry.name !== "node_modules") {
      files.push(...findFiles(fullPath, extension));
    } else if (entry.isFile() && extname(entry.name) === extension) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Create a new audit execution record.
 */
export async function createAuditExecution(
  data: {
    executiontype: string;
    triggeredby?: string;
    specid?: string;
    featurescope?: string;
    enabledframeworks: string[];
  },
): Promise<AuditExecution> {
  const result = await db
    .insert(auditexecutions)
    .values({
      executiontype: data.executiontype,
      triggeredby: data.triggeredby,
      specid: data.specid,
      featurescope: data.featurescope,
      enabledframeworks: data.enabledframeworks,
      status: "running",
      starttime: new Date(),
    })
    .returning();

  logger.info(
    { executionId: result[0].id, featureScope: data.featurescope },
    "Created audit execution",
  );

  return result[0];
}

/**
 * Cancel a running audit execution.
 */
export async function cancelAuditExecution(executionId: string): Promise<void> {
  await db
    .update(auditexecutions)
    .set({ status: "cancelled", endtime: new Date() })
    .where(eq(auditexecutions.id, executionId));

  logger.info({ executionId }, "Cancelled audit execution");
}
