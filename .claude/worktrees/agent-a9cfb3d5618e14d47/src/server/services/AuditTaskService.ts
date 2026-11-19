import { db } from "~/db/client.js";
import {
  complianceaudittasks,
  ComplianceAuditTask,
  NewComplianceAuditTask,
} from "~/db/schema/complianceaudittasks.js";
import { wxkanbandocuments } from "~/db/schema/wxkanbandocuments.js";
import { eq, and, inArray, or, ilike, sql } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("audit-task-service");

export type TaskFilters = {
  framework?: string;
  category?: string;
  priority?: string;
  tasktype?: string;
  isautomated?: boolean;
  enabledFrameworks?: string[]; // Filter to only these frameworks
  searchQuery?: string;
  limit?: number;
  offset?: number;
};

// [SCOPE 146 / T004] BEGIN — what a re-extract changed, and the refusal of an empty parse (FR-006)
export type ExtractionResult = { tasksRemoved: number; tasksExtracted: number };

/**
 * Thrown when a document parses to zero checklist items. The document's existing tasks are left
 * untouched: a bad parse must never empty a framework for every customer.
 */
export class NoTasksExtractedError extends Error {
  constructor(public readonly documentId: string) {
    super("The document produced no compliance tasks; its existing tasks were left unchanged.");
    this.name = "NoTasksExtractedError";
  }
}
// [SCOPE 146 / T004] END

// [SCOPE 146 / T005] BEGIN — the number of tasks a document holds, counted from the rows (FR-005)
/**
 * Counts a document's complianceaudittasks rows. Used before a delete, whose cascade removes them,
 * so the audit record states the real number rather than the document's extractedtasks counter.
 */
export async function countTasksForDocument(documentId: string): Promise<number> {
  const rows = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(complianceaudittasks)
    .where(eq(complianceaudittasks.documentid, documentId));
  return rows[0]?.n ?? 0;
}
// [SCOPE 146 / T005] END

/**
 * Extract compliance tasks from a document's content.
 * Parses markdown checklist items and creates task records.
 */
export async function extractTasksFromDocument(documentId: string): Promise<ExtractionResult> {
  // [SCOPE 146 / T004] MODIFIED-BY — replaces the document's task set in one transaction instead of
  // appending (a second extract duplicated every control), and refuses a parse that finds none
  try {
    // Get the document
    const docResult = await db
      .select()
      .from(wxkanbandocuments)
      .where(eq(wxkanbandocuments.id, documentId))
      .limit(1);

    if (docResult.length === 0) {
      throw new Error("Document not found");
    }

    const doc = docResult[0];
    if (!doc.filecontent) {
      throw new Error("Document has no content");
    }

    // Parse checklist items from markdown
    // Pattern: - [ ] or - [x] followed by text
    const checklistPattern = /^- \[( |x|X)\] (.+)$/gm;
    const matches = [...doc.filecontent.matchAll(checklistPattern)];

    const tasksToInsert: NewComplianceAuditTask[] = [];
    let taskCount = 0;

    for (const match of matches) {
      const taskText = match[2].trim();

      // Infer priority from keywords
      let priority = "medium";
      if (/critical|severity 4|tier 4/i.test(taskText)) priority = "critical";
      else if (/high|severity 3|tier 3/i.test(taskText)) priority = "high";
      else if (/low|severity 1|tier 1/i.test(taskText)) priority = "low";

      // Infer task type
      let tasktype = "code_pattern";
      if (/config|setting|environment/i.test(taskText)) tasktype = "configuration";
      else if (/process|procedure|workflow/i.test(taskText)) tasktype = "process";
      else if (/document|documentation|record/i.test(taskText)) tasktype = "documentation";

      // Infer check method
      let checkmethod = "regex_pattern";
      if (/manual|human|review/i.test(taskText)) checkmethod = "manual_review";
      else if (/static.analysis|sast/i.test(taskText)) checkmethod = "static_analysis";

      // Infer category from keywords
      let category = "General";
      if (/access|authentication|authorization|mfa|login/i.test(taskText)) {
        category = "Access Control";
      } else if (/encrypt|cipher|tls|ssl|aes|hash/i.test(taskText)) {
        category = "Encryption";
      } else if (/audit|log|monitor|track/i.test(taskText)) {
        category = "Audit Logging";
      } else if (/backup|recovery|disaster|continuity/i.test(taskText)) {
        category = "Business Continuity";
      } else if (/incident|breach|response/i.test(taskText)) {
        category = "Incident Management";
      } else if (/privacy|consent|gdpr|data.subject/i.test(taskText)) {
        category = "Privacy";
      }

      tasksToInsert.push({
        documentid: documentId,
        framework: doc.framework ?? "GENERAL",
        category,
        controlreference: extractControlReference(taskText),
        priority,
        tasktype,
        title: taskText.substring(0, 255),
        description: taskText,
        requirementtext: taskText,
        checkmethod,
        isautomated: checkmethod !== "manual_review",
        applicablephases: inferPhases(taskText),
        applicablefiletypes: inferFileTypes(tasktype),
      });

      taskCount++;
    }

    if (tasksToInsert.length === 0) {
      throw new NoTasksExtractedError(documentId);
    }

    // Replace the document's tasks as one unit: their self-audit results cascade with them.
    const tasksRemoved = await db.transaction(async (tx) => {
      const removed = await tx
        .delete(complianceaudittasks)
        .where(eq(complianceaudittasks.documentid, documentId))
        .returning({ id: complianceaudittasks.id });
      await tx.insert(complianceaudittasks).values(tasksToInsert);
      await tx
        .update(wxkanbandocuments)
        .set({ extractedtasks: taskCount })
        .where(eq(wxkanbandocuments.id, documentId));
      return removed.length;
    });

    logger.info(
      { documentId, framework: doc.framework, tasksRemoved, tasksExtracted: taskCount },
      "Replaced compliance tasks from document",
    );

    return { tasksRemoved, tasksExtracted: taskCount };
  } catch (error) {
    logger.error({ error, documentId }, "Failed to extract tasks from document");
    throw error;
  }
}

/**
 * Extract control reference from task text (e.g., "CC6.1", "§164.312(a)").
 */
function extractControlReference(text: string): string | undefined {
  const patterns = [
    /CC\d+\.\d+/, // SOC2: CC6.1
    /§\d+\.\d+\([a-z]\)/, // HIPAA: §164.312(a)
    /\d{2}\.[a-z]\.\d+/, // HITRUST: 02.a.1
    /Article \d+/, // GDPR: Article 32
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) return match[0];
  }

  return undefined;
}

/**
 * Infer applicable SDLC phases from task text.
 */
function inferPhases(text: string): string[] {
  const phases: string[] = [];

  if (/design|architecture|plan/i.test(text)) phases.push("design");
  if (/code|implement|develop|program/i.test(text)) phases.push("development");
  if (/test|verify|validate|qa/i.test(text)) phases.push("testing");
  if (/deploy|release|production|live/i.test(text)) phases.push("deployment");

  // Default to all phases if none detected
  if (phases.length === 0) {
    return ["design", "development", "testing", "deployment"];
  }

  return phases;
}

/**
 * Infer applicable file types from task type.
 */
function inferFileTypes(tasktype: string): string[] {
  switch (tasktype) {
    case "code_pattern":
      return [".ts", ".tsx", ".js", ".jsx"];
    case "configuration":
      return [".json", ".yaml", ".yml", ".env", ".config"];
    case "documentation":
      return [".md", ".txt"];
    default:
      return [".ts", ".tsx", ".js", ".jsx", ".json"];
  }
}

/**
 * List compliance tasks with optional filters.
 */
export async function listTasks(filters: TaskFilters = {}): Promise<ComplianceAuditTask[]> {
  try {
    // Build where conditions
    const conditions = [];

    if (filters.framework) {
      conditions.push(eq(complianceaudittasks.framework, filters.framework));
    }
    if (filters.category) {
      conditions.push(eq(complianceaudittasks.category, filters.category));
    }
    if (filters.priority) {
      conditions.push(eq(complianceaudittasks.priority, filters.priority));
    }
    if (filters.tasktype) {
      conditions.push(eq(complianceaudittasks.tasktype, filters.tasktype));
    }
    if (filters.isautomated !== undefined) {
      conditions.push(eq(complianceaudittasks.isautomated, filters.isautomated));
    }
    if (filters.enabledFrameworks && filters.enabledFrameworks.length > 0) {
      conditions.push(inArray(complianceaudittasks.framework, filters.enabledFrameworks));
    }

    // Execute query with conditions
    const result = await db
      .select()
      .from(complianceaudittasks)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(complianceaudittasks.priority, complianceaudittasks.framework)
      .limit(filters.limit ?? 100)
      .offset(filters.offset ?? 0);

    return result;
  } catch (error) {
    logger.error({ error, filters }, "Failed to list tasks");
    throw error;
  }
}


/**
 * Get a single task by ID.
 */
export async function getTask(id: string): Promise<ComplianceAuditTask | null> {
  try {
    const result = await db
      .select()
      .from(complianceaudittasks)
      .where(eq(complianceaudittasks.id, id))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, taskId: id }, "Failed to get task");
    throw error;
  }
}

/**
 * Get tasks relevant to a feature based on keywords.
 * Filters by enabled frameworks.
 */
export async function getRelevantTasks(
  featureKeywords: string[],
  enabledFrameworks: string[],
): Promise<ComplianceAuditTask[]> {
  try {
    if (enabledFrameworks.length === 0 || featureKeywords.length === 0) {
      return [];
    }

    // Build OR conditions for keyword matching
    const keywordConditions = featureKeywords.map((keyword) =>
      or(
        ilike(complianceaudittasks.title, `%${keyword}%`),
        ilike(complianceaudittasks.description, `%${keyword}%`),
      ),
    );

    const result = await db
      .select()
      .from(complianceaudittasks)
      .where(
        and(
          inArray(complianceaudittasks.framework, enabledFrameworks),
          or(...keywordConditions),
        ),
      )
      .orderBy(complianceaudittasks.priority)
      .limit(50);

    return result;
  } catch (error) {
    logger.error({ error, featureKeywords, enabledFrameworks }, "Failed to get relevant tasks");
    throw error;
  }
}
