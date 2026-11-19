/**
 * AiInteractionLogService
 * 
 * Logs all AI interactions that result in code changes, scope creation,
 * database modifications, block triggers, or emergency overrides.
 * 
 * Uses existing companyauditlogs table (no new tables required).
 * actiontype values: 'ai_interaction', 'rules_sync'
 * 
 * Spec 015 — AI Interaction Rules & Governance Framework
 */

import { db } from "~/db/client.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { projectdocuments } from "~/db/schema/projectdocuments.js";
import { eq, desc, and, count } from "drizzle-orm";
import { createLogger } from "~/server/lib/logger.js";
import { v7 as uuidv7 } from "uuid";

const logger = createLogger("ai-interaction-log-service");

// ── Types ─────────────────────────────────────────────────────────────────────

export type AiActionType =
  | "scope_check_pass"
  | "scope_check_block"
  | "scope_check_override"
  | "scope_created"
  | "todo_import"
  | "implementation_start"
  | "implementation_complete"
  | "rules_sync"
  | "protected_file_block"
  | "training_session";

export interface AiInteractionLogEntry {
  companyid: string;
  userid?: string;
  actiontype: AiActionType;
  scopenumber?: string;
  taskid?: string;
  provider?: string;
  sessionid?: string;
  filesaffected?: string[];
  forceoverride?: boolean;
  overridereason?: string;
  description: string;
  metadata?: Record<string, unknown>;
}

export interface AiInteractionSummary {
  totalInteractions: number;
  scopeCheckPasses: number;
  scopeCheckBlocks: number;
  emergencyOverrides: number;
  scopesCreated: number;
  todoImports: number;
  rulesSyncs: number;
  byProvider: Record<string, number>;
  recentActivity: AiInteractionRecord[];
}

export interface AiInteractionRecord {
  id: string;
  companyid: string;
  action: string;
  changedby: string | null;
  description: string | null;
  timestamp: Date;
  newvalue: Record<string, unknown> | null;
}

export interface OverrideRecord {
  id: string;
  companyid: string;
  action: string;
  description: string | null;
  timestamp: Date;
  newvalue: Record<string, unknown> | null;
}

// ── Service ───────────────────────────────────────────────────────────────────

export class AiInteractionLogService {
  /**
   * Log an AI interaction to companyauditlogs
   * 
   * Uses action = 'ai_interaction' for all AI-driven events.
   * The actiontype is stored in newvalue.actiontype for filtering.
   */
  static async logInteraction(entry: AiInteractionLogEntry): Promise<void> {
    try {
      await db.insert(companyauditlogs).values({
        companyid: entry.companyid,
        action: "ai_interaction",
        changedby: entry.userid || null,
        description: entry.description,
        newvalue: {
          actiontype: entry.actiontype,
          scopenumber: entry.scopenumber,
          taskid: entry.taskid,
          provider: entry.provider || "unknown",
          sessionid: entry.sessionid,
          filesaffected: entry.filesaffected || [],
          forceoverride: entry.forceoverride || false,
          overridereason: entry.overridereason,
          ...entry.metadata,
        },
      });

      logger.info(
        {
          companyid: entry.companyid,
          actiontype: entry.actiontype,
          scopenumber: entry.scopenumber,
          provider: entry.provider,
        },
        "AI interaction logged"
      );
    } catch (error) {
      // Non-fatal: log failure but don't block the operation
      logger.error({ error, entry }, "Failed to log AI interaction — non-fatal");
    }
  }

  /**
   * Log a governance rules sync event
   */
  static async logRulesSync(
    companyid: string,
    userid: string | undefined,
    fromVersion: string,
    toVersion: string,
    filesUpdated: string[]
  ): Promise<void> {
    try {
      await db.insert(companyauditlogs).values({
        companyid,
        action: "ai_interaction",
        changedby: userid || null,
        description: `Governance rules synced: v${fromVersion} → v${toVersion}. ${filesUpdated.length} file(s) updated.`,
        newvalue: {
          actiontype: "rules_sync",
          fromversion: fromVersion,
          toversion: toVersion,
          filesupdated: filesUpdated,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info({ companyid, fromVersion, toVersion, filesUpdated }, "Rules sync logged");
    } catch (error) {
      logger.error({ error, companyid }, "Failed to log rules sync — non-fatal");
    }
  }

  /**
   * Log an emergency override and insert override document into projectdocuments
   */
  static async logEmergencyOverride(
    companyid: string,
    projectid: string,
    userid: string | undefined,
    reason: string,
    provider: string,
    sessionid: string,
    scopenumber?: string
  ): Promise<void> {
    const timestamp = new Date().toISOString();

    // 1. Log to companyauditlogs
    try {
      await db.insert(companyauditlogs).values({
        companyid,
        action: "ai_interaction",
        changedby: userid || null,
        description: `EMERGENCY OVERRIDE: Scope-first rule bypassed. Reason: ${reason}`,
        newvalue: {
          actiontype: "scope_check_override",
          reason,
          scopenumber,
          provider,
          sessionid,
          timestamp,
        },
      });
    } catch (error) {
      logger.error({ error, companyid }, "Failed to log override to companyauditlogs");
    }

    // 2. Insert override document into projectdocuments
    try {
      await db.insert(projectdocuments).values({
        id: uuidv7(),
        projectid,
        specid: null,
        doctype: "override_log",
        title: `Emergency Override — ${new Date().toLocaleDateString()}`,
        content: [
          `# Emergency Override Log`,
          ``,
          `**Date**: ${timestamp}`,
          `**Provider**: ${provider}`,
          `**Session**: ${sessionid}`,
          `**Scope**: ${scopenumber || "N/A"}`,
          `**User**: ${userid || "unknown"}`,
          ``,
          `## Override Reason`,
          ``,
          reason,
          ``,
          `---`,
          `*This override is visible to management in the AI Audit dashboard.*`,
        ].join("\n"),
        filepath: null,
        isgenerated: true,
        createdbyid: userid || null,
      });

      logger.info({ companyid, projectid, reason }, "Override document inserted into projectdocuments");
    } catch (error) {
      logger.error({ error, companyid, projectid }, "Failed to insert override document");
    }
  }

  /**
   * Get paginated AI interaction logs for a company
   */
  static async getLogs(
    companyid: string,
    options: {
      actiontype?: AiActionType;
      userid?: string;
      scopenumber?: string;
      provider?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<{ logs: AiInteractionRecord[]; total: number }> {
    const { limit = 50, offset = 0 } = options;

    try {
      // Build base query for ai_interaction actions
      const baseConditions = [
        eq(companyauditlogs.companyid, companyid),
        eq(companyauditlogs.action, "ai_interaction"),
      ];

      // Filter by userid if provided
      if (options.userid) {
        baseConditions.push(eq(companyauditlogs.changedby, options.userid));
      }

      // Get total count
      const totalResult = await db
        .select({ count: count() })
        .from(companyauditlogs)
        .where(and(...baseConditions));

      const total = Number(totalResult[0]?.count || 0);

      // Get paginated logs
      const logs = await db
        .select()
        .from(companyauditlogs)
        .where(and(...baseConditions))
        .orderBy(desc(companyauditlogs.timestamp))
        .limit(limit)
        .offset(offset);

      // Filter by actiontype/scopenumber/provider in memory (stored in jsonb newvalue)
      let filtered = logs as AiInteractionRecord[];

      if (options.actiontype) {
        filtered = filtered.filter(
          (log) => (log.newvalue as Record<string, unknown>)?.actiontype === options.actiontype
        );
      }

      if (options.scopenumber) {
        filtered = filtered.filter(
          (log) => (log.newvalue as Record<string, unknown>)?.scopenumber === options.scopenumber
        );
      }

      if (options.provider) {
        filtered = filtered.filter(
          (log) => (log.newvalue as Record<string, unknown>)?.provider === options.provider
        );
      }

      return { logs: filtered, total };
    } catch (error) {
      logger.error({ error, companyid }, "Failed to retrieve AI interaction logs");
      return { logs: [], total: 0 };
    }
  }

  /**
   * Get AI interaction summary counts for a company
   */
  static async getSummary(companyid: string): Promise<AiInteractionSummary> {
    try {
      const allLogs = await db
        .select()
        .from(companyauditlogs)
        .where(
          and(
            eq(companyauditlogs.companyid, companyid),
            eq(companyauditlogs.action, "ai_interaction")
          )
        )
        .orderBy(desc(companyauditlogs.timestamp))
        .limit(1000); // Cap at 1000 for summary

      const byProvider: Record<string, number> = {};
      let scopeCheckPasses = 0;
      let scopeCheckBlocks = 0;
      let emergencyOverrides = 0;
      let scopesCreated = 0;
      let todoImports = 0;
      let rulesSyncs = 0;

      for (const log of allLogs) {
        const nv = log.newvalue as Record<string, unknown> | null;
        if (!nv) continue;

        const actiontype = nv.actiontype as string;
        const provider = (nv.provider as string) || "unknown";

        byProvider[provider] = (byProvider[provider] || 0) + 1;

        switch (actiontype) {
          case "scope_check_pass": scopeCheckPasses++; break;
          case "scope_check_block": scopeCheckBlocks++; break;
          case "scope_check_override": emergencyOverrides++; break;
          case "scope_created": scopesCreated++; break;
          case "todo_import": todoImports++; break;
          case "rules_sync": rulesSyncs++; break;
        }
      }

      return {
        totalInteractions: allLogs.length,
        scopeCheckPasses,
        scopeCheckBlocks,
        emergencyOverrides,
        scopesCreated,
        todoImports,
        rulesSyncs,
        byProvider,
        recentActivity: (allLogs as AiInteractionRecord[]).slice(0, 10),
      };
    } catch (error) {
      logger.error({ error, companyid }, "Failed to get AI interaction summary");
      return {
        totalInteractions: 0,
        scopeCheckPasses: 0,
        scopeCheckBlocks: 0,
        emergencyOverrides: 0,
        scopesCreated: 0,
        todoImports: 0,
        rulesSyncs: 0,
        byProvider: {},
        recentActivity: [],
      };
    }
  }

  /**
   * Get all emergency overrides for a company
   */
  static async getOverrides(
    companyid: string,
    limit = 50,
    offset = 0
  ): Promise<{ overrides: OverrideRecord[]; total: number }> {
    try {
      const allLogs = await db
        .select()
        .from(companyauditlogs)
        .where(
          and(
            eq(companyauditlogs.companyid, companyid),
            eq(companyauditlogs.action, "ai_interaction")
          )
        )
        .orderBy(desc(companyauditlogs.timestamp));

      // Filter to overrides only (stored in jsonb)
      const overrides = (allLogs as OverrideRecord[]).filter(
        (log) => (log.newvalue as Record<string, unknown>)?.actiontype === "scope_check_override"
      );

      const total = overrides.length;
      const paginated = overrides.slice(offset, offset + limit);

      return { overrides: paginated, total };
    } catch (error) {
      logger.error({ error, companyid }, "Failed to get override records");
      return { overrides: [], total: 0 };
    }
  }

  /**
   * Get a single AI interaction log entry by ID
   */
  static async getLogById(
    id: string,
    companyid: string
  ): Promise<AiInteractionRecord | null> {
    try {
      const result = await db
        .select()
        .from(companyauditlogs)
        .where(
          and(
            eq(companyauditlogs.id, id),
            eq(companyauditlogs.companyid, companyid)
          )
        )
        .limit(1);

      return result.length > 0 ? (result[0] as AiInteractionRecord) : null;
    } catch (error) {
      logger.error({ error, id, companyid }, "Failed to get log entry by ID");
      return null;
    }
  }
}
