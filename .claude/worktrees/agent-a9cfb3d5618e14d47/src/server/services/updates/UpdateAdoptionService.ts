import { and, eq, lte } from "drizzle-orm";
import { db } from "~/db/client.js";
import { companyprojects, mcpupdateadoptions } from "~/db/schema/index.js";
import { createLogger } from "~/server/lib/logger.js";
import { NotificationService } from "~/server/services/NotificationService.js";
import type {
  AvailableUpdateResponse,
  ChangelogDetail,
  UpdateDecisionInput,
  UpdateDecisionResult,
} from "~/shared/types/gateway.js";
import { GitHubReleasePoller } from "./GitHubReleasePoller.js";

const logger = createLogger("update-adoption-service");

function compareVersions(left: string, right: string): number {
  const a = left.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const b = right.replace(/^v/, "").split(".").map((part) => Number.parseInt(part, 10) || 0);
  const length = Math.max(a.length, b.length);
  for (let index = 0; index < length; index += 1) {
    const diff = (a[index] ?? 0) - (b[index] ?? 0);
    if (diff !== 0) {
      return diff;
    }
  }
  return 0;
}

export class UpdateAdoptionService {
  constructor(private readonly releasePoller = new GitHubReleasePoller()) {}

  async checkAvailable(projectid: string): Promise<AvailableUpdateResponse> {
    const currentVersion = process.env.MCP_CURRENT_VERSION || process.env.npm_package_version || "0.0.0";
    const latest = await this.releasePoller.getLatestRelease();

    if (!latest || compareVersions(latest.version, currentVersion) <= 0) {
      return {
        version: null,
        currentVersion,
        upToDate: true,
      };
    }

    return {
      version: latest.version,
      currentVersion,
      commandChanges: latest.added,
      behaviorImpacts: [...latest.changed, ...latest.breaking],
      recommendation: `Upgrade project ${projectid} to ${latest.version} to align the MCP surface and parity checks.`,
      publishedAt: latest.publishedAt,
    };
  }

  async presentToUser(_projectid: string, version: string): Promise<ChangelogDetail | null> {
    return this.releasePoller.getReleaseByVersion(version);
  }

  async recordDecision(input: UpdateDecisionInput): Promise<UpdateDecisionResult> {
    if (input.decision === "deferred" && !input.maintenanceWindow) {
      throw new Error("maintenanceWindow is required when deferring an update");
    }

    const [existing] = await db
      .select({ deferralcount: mcpupdateadoptions.deferralcount })
      .from(mcpupdateadoptions)
      .where(and(eq(mcpupdateadoptions.projectid, input.projectId), eq(mcpupdateadoptions.mcpversion, input.version)))
      .limit(1);

    const now = new Date();
    const nextReminderAt = input.decision === "deferred"
      ? new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
      : null;
    const deferralCount = input.decision === "deferred" ? (existing?.deferralcount ?? 0) + 1 : 0;

    const [record] = await db
      .insert(mcpupdateadoptions)
      .values({
        projectid: input.projectId,
        mcpversion: input.version,
        decisionstate: input.decision,
        decidedat: now,
        maintenancewindow: input.maintenanceWindow ?? null,
        nextreminderat: nextReminderAt,
        deferralcount: deferralCount,
        updatedat: now,
      })
      .onConflictDoUpdate({
        target: [mcpupdateadoptions.projectid, mcpupdateadoptions.mcpversion],
        set: {
          decisionstate: input.decision,
          decidedat: now,
          maintenancewindow: input.maintenanceWindow ?? null,
          nextreminderat: nextReminderAt,
          deferralcount: deferralCount,
          updatedat: now,
        },
      })
      .returning();

    return {
      id: record.id,
      projectId: record.projectid,
      version: record.mcpversion,
      decisionState: record.decisionstate as UpdateDecisionResult["decisionState"],
      decidedAt: record.decidedat?.toISOString() ?? now.toISOString(),
      nextReminderAt: record.nextreminderat ? record.nextreminderat.toISOString() : null,
    };
  }

  async applyUpdate(projectid: string, version: string): Promise<{ projectId: string; version: string; status: string; appliedAt: string }> {
    const now = new Date();
    await db
      .update(mcpupdateadoptions)
      .set({
        decisionstate: "accepted",
        decidedat: now,
        nextreminderat: null,
        updatedat: now,
      })
      .where(and(eq(mcpupdateadoptions.projectid, projectid), eq(mcpupdateadoptions.mcpversion, version)));

    logger.info({ projectid, version }, "MCP update marked as applied");
    return {
      projectId: projectid,
      version,
      status: "applied",
      appliedAt: now.toISOString(),
    };
  }

  async runReminderSweep(): Promise<number> {
    const now = new Date();
    const rows = await db
      .select({
        id: mcpupdateadoptions.id,
        projectid: mcpupdateadoptions.projectid,
        mcpversion: mcpupdateadoptions.mcpversion,
        userid: companyprojects.userid,
      })
      .from(mcpupdateadoptions)
      .innerJoin(companyprojects, eq(mcpupdateadoptions.projectid, companyprojects.id))
      .where(and(eq(mcpupdateadoptions.decisionstate, "deferred"), lte(mcpupdateadoptions.nextreminderat, now)));

    for (const row of rows) {
      await NotificationService.create({
        userid: row.userid,
        type: "mcp_update_reminder",
        entityid: row.projectid,
        entitytype: "project",
        message: `MCP update ${row.mcpversion} is still deferred for project ${row.projectid}.`,
      });
    }

    return rows.length;
  }

  async ensureProjectAccess(projectid: string, companyid?: string): Promise<boolean> {
    if (!companyid) {
      return false;
    }

    const [project] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid)))
      .limit(1);

    return Boolean(project);
  }
}
