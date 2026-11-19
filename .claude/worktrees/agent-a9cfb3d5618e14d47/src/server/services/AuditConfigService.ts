import { db } from "~/db/client.js";
import {
  appauditconfiguration,
  AppAuditConfiguration,
} from "~/db/schema/appauditconfiguration.js";
import { eq, and, isNull, inArray } from "drizzle-orm";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("audit-config-service");

export type CreateAuditConfigInput = {
  appid: string;
  projectid?: string;
  soc2enabled?: boolean;
  hipaaenabled?: boolean;
  hitrustenabled?: boolean;
  gdprenabled?: boolean;
  nistssdfenabled?: boolean;
  iso27001enabled?: boolean;
  autoauditondeploy?: boolean;
  autoauditschedule?: string;
  auditseveritythreshold?: string;
  failoncritical?: boolean;
  auditreportretentiondays?: number;
};

export type UpdateAuditConfigInput = Partial<Omit<CreateAuditConfigInput, "appid">>;

/**
 * SPEC-112 / FR-001 — project-keyed reads.
 *
 * `projectid` is the authoritative key. The `appId`-suffixed functions below are
 * retained only until every reader has cut over (T006/T007); they resolve legacy
 * company rows, which the backfill deliberately left in place.
 *
 * Note new per-project rows carry `appid = projectid`, so a lookup by either
 * column resolves the same row for anything created after the 0010 migration.
 */
export async function getAuditConfigByProject(
  projectId: string,
): Promise<AppAuditConfiguration | null> {
  try {
    const result = await db
      .select()
      .from(appauditconfiguration)
      .where(eq(appauditconfiguration.projectid, projectId))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, projectId }, "Failed to get audit config by project");
    throw error;
  }
}

/**
 * Enabled frameworks for a project. Returns [] when the project has no
 * configuration row — distinct from "configured, all disabled", which also
 * returns [] but with a row present (see getAuditConfigByProject).
 */
export async function getEnabledFrameworksByProject(projectId: string): Promise<string[]> {
  const config = await getAuditConfigByProject(projectId);
  if (!config) return [];

  const enabled: string[] = [];
  if (config.soc2enabled) enabled.push("SOC2");
  if (config.hipaaenabled) enabled.push("HIPAA");
  if (config.hitrustenabled) enabled.push("HITRUST");
  if (config.gdprenabled) enabled.push("GDPR");
  if (config.nistssdfenabled) enabled.push("NISTSSDF");
  if (config.iso27001enabled) enabled.push("ISO27001");

  return enabled;
}

// [SCOPE 112 / T006] BEGIN — batched framework lookup for list surfaces.
/**
 * Enabled frameworks for many projects in one query. The dashboard and admin grids
 * render every project a company owns; resolving each one separately would issue a
 * query per row. Projects with no configuration row are absent from the map, which
 * callers treat as [].
 */
export async function getEnabledFrameworksByProjects(
  projectIds: string[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (projectIds.length === 0) return map;

  try {
    const rows = await db
      .select()
      .from(appauditconfiguration)
      .where(inArray(appauditconfiguration.projectid, projectIds));

    for (const config of rows) {
      if (!config.projectid) continue;
      const enabled: string[] = [];
      if (config.soc2enabled) enabled.push("SOC2");
      if (config.hipaaenabled) enabled.push("HIPAA");
      if (config.hitrustenabled) enabled.push("HITRUST");
      if (config.gdprenabled) enabled.push("GDPR");
      if (config.nistssdfenabled) enabled.push("NISTSSDF");
      if (config.iso27001enabled) enabled.push("ISO27001");
      map.set(config.projectid, enabled);
    }
    return map;
  } catch (error) {
    logger.error({ error, count: projectIds.length }, "Failed to get audit configs by projects");
    throw error;
  }
}
// [SCOPE 112 / T006] END

/**
 * Update audit configuration for a project.
 */
export async function updateAuditConfigByProject(
  projectId: string,
  data: UpdateAuditConfigInput,
): Promise<AppAuditConfiguration> {
  try {
    const result = await db
      .update(appauditconfiguration)
      .set({ ...data, updatedat: new Date() })
      .where(eq(appauditconfiguration.projectid, projectId))
      .returning();

    if (result.length === 0) {
      throw new Error("Audit configuration not found for project");
    }

    logger.info({ projectId, updatedFields: Object.keys(data) }, "Updated audit configuration");
    return result[0] as AppAuditConfiguration;
  } catch (error) {
    logger.error({ error, projectId }, "Failed to update audit config by project");
    throw error;
  }
}

/**
 * Get or create the configuration row for a project.
 * New rows set `appid = projectid` to satisfy the legacy NOT NULL + UNIQUE
 * constraint on `appid` without colliding with company-keyed rows.
 */
export async function getOrCreateAuditConfigByProject(
  projectId: string,
): Promise<AppAuditConfiguration> {
  const existing = await getAuditConfigByProject(projectId);
  if (existing) return existing;

  const result = await db
    .insert(appauditconfiguration)
    .values({ appid: projectId, projectid: projectId })
    .returning();

  logger.info({ projectId }, "Created per-project audit configuration");
  return result[0];
}

/**
 * SPEC-112 / FR-001 — seed a new project's compliance configuration from its
 * company's defaults.
 *
 * The company-level row is a TEMPLATE for new projects, not a parallel setting:
 * if a company has deemed SOC 2 applicable, every project it creates starts with
 * SOC 2 on and can then be adjusted individually. This makes the one-off fan-out
 * performed by the 0010 backfill the ongoing behaviour rather than a migration
 * artifact.
 *
 * Idempotent, and fail-open by contract — a seeding failure must never block
 * project creation. Callers should not await this on the critical path.
 */
export async function seedProjectAuditConfigFromCompany(
  projectId: string,
  companyId: string,
): Promise<AppAuditConfiguration | null> {
  try {
    const existing = await getAuditConfigByProject(projectId);
    if (existing) return existing;

    // The company template is the legacy row: keyed on appid with no projectid.
    const [template] = await db
      .select()
      .from(appauditconfiguration)
      .where(
        and(
          eq(appauditconfiguration.appid, companyId),
          isNull(appauditconfiguration.projectid),
        ),
      )
      .limit(1);

    const [created] = await db
      .insert(appauditconfiguration)
      .values({
        appid: projectId,
        projectid: projectId,
        soc2enabled: template?.soc2enabled ?? false,
        hipaaenabled: template?.hipaaenabled ?? false,
        hitrustenabled: template?.hitrustenabled ?? false,
        gdprenabled: template?.gdprenabled ?? false,
        nistssdfenabled: template?.nistssdfenabled ?? false,
        iso27001enabled: template?.iso27001enabled ?? false,
        autoauditondeploy: template?.autoauditondeploy ?? true,
        autoauditschedule: template?.autoauditschedule ?? "weekly",
        auditseveritythreshold: template?.auditseveritythreshold ?? "medium",
        failoncritical: template?.failoncritical ?? true,
        auditreportretentiondays: template?.auditreportretentiondays ?? 365,
      })
      .returning();

    logger.info(
      { projectId, companyId, seededFromTemplate: Boolean(template) },
      "Seeded project audit configuration from company defaults",
    );
    return created;
  } catch (error) {
    // Fail-open: compliance defaults are not worth failing a project creation over.
    logger.error({ error, projectId, companyId }, "Failed to seed project audit config");
    return null;
  }
}

/**
 * Get audit configuration for an app.
 * Returns null if no configuration exists.
 *
 * @deprecated SPEC-112 — company-keyed. Use getAuditConfigByProject.
 */
export async function getAuditConfig(appId: string): Promise<AppAuditConfiguration | null> {
  try {
    const result = await db
      .select()
      .from(appauditconfiguration)
      .where(eq(appauditconfiguration.appid, appId))
      .limit(1);

    return result[0] ?? null;
  } catch (error) {
    logger.error({ error, appId }, "Failed to get audit config");
    throw error;
  }
}

/**
 * Create audit configuration for an app.
 * Each app can only have one configuration row.
 */
export async function createAuditConfig(
  data: CreateAuditConfigInput,
): Promise<AppAuditConfiguration> {
  try {
    const result = await db
      .insert(appauditconfiguration)
      .values({
        appid: data.appid,
        soc2enabled: data.soc2enabled ?? false,
        hipaaenabled: data.hipaaenabled ?? false,
        hitrustenabled: data.hitrustenabled ?? false,
        gdprenabled: data.gdprenabled ?? false,
        autoauditondeploy: data.autoauditondeploy ?? true,
        autoauditschedule: data.autoauditschedule ?? "weekly",
        auditseveritythreshold: data.auditseveritythreshold ?? "medium",
        failoncritical: data.failoncritical ?? true,
        auditreportretentiondays: data.auditreportretentiondays ?? 365,
      })
      .returning();

    logger.info({ appId: data.appid }, "Created audit configuration");
    return result[0];
  } catch (error) {
    const err = error as Error & { code?: string };
    if (err.code === "23505") {
      // Unique violation
      throw new Error("Audit configuration already exists for this app");
    }
    logger.error({ error, appId: data.appid }, "Failed to create audit config");
    throw error;
  }
}

/**
 * Update audit configuration for an app.
 */
export async function updateAuditConfig(
  appId: string,
  data: UpdateAuditConfigInput,
): Promise<AppAuditConfiguration> {
  try {
    const result = await db
      .update(appauditconfiguration)
      .set({
        ...data,
        updatedat: new Date(),
      })
      .where(eq(appauditconfiguration.appid, appId))
      .returning();

    if (result.length === 0) {
      throw new Error("Audit configuration not found");
    }

    logger.info({ appId, updatedFields: Object.keys(data) }, "Updated audit configuration");
    return result[0] as AppAuditConfiguration;

  } catch (error) {
    logger.error({ error, appId }, "Failed to update audit config");
    throw error;
  }
}

/**
 * Get list of enabled frameworks for an app.
 * Returns array of framework names (e.g., ['SOC2', 'HIPAA']).
 */
export async function getEnabledFrameworks(appId: string): Promise<string[]> {
  try {
    const config = await getAuditConfig(appId);

    if (!config) {
      return []; // No config = no frameworks enabled
    }

    const enabled: string[] = [];
    if (config.soc2enabled) enabled.push("SOC2");
    if (config.hipaaenabled) enabled.push("HIPAA");
    if (config.hitrustenabled) enabled.push("HITRUST");
    if (config.gdprenabled) enabled.push("GDPR");

    return enabled;
  } catch (error) {
    logger.error({ error, appId }, "Failed to get enabled frameworks");
    throw error;
  }
}

/**
 * Get or create audit configuration.
 * If no config exists, creates one with defaults (all frameworks disabled).
 */
export async function getOrCreateAuditConfig(appId: string): Promise<AppAuditConfiguration> {
  const existing = await getAuditConfig(appId);
  if (existing) {
    return existing;
  }

  return await createAuditConfig({ appid: appId });
}
