/**
 * K.A.I.N. device tokens — SPEC-152 (SCOPE-132 Amendment F) T005, FR-064 / FR-065 / FR-073.
 *
 * K.A.I.N. signs in with the person's own wxKanban email and password, once per device, and
 * gets a device token. Only the token's SHA-256 is stored; the raw token is returned once and
 * the password never reaches this service. A device token has no fixed expiry: it ends when the
 * person or a company ADMIN revokes it, when the person's password changes, or — checked on
 * every call — when the person is deactivated or leaves the company, or the company is
 * deactivated. Ending a device also ends the MCP tokens connect minted for it (T014).
 */
import { and, desc, eq, isNull, like, or } from "drizzle-orm";
import { db } from "~/db/client.js";
import { agentdevicetokens, type AgentDeviceToken } from "~/db/schema/agentdevicetoken.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { companies } from "~/db/schema/company.js"; // [SCOPE 152 / T015]
import { mcpapitokens } from "~/db/schema/mcpapitokens.js"; // [SCOPE 152 / T014]
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import { kitEncryptionService } from "./KitEncryptionService.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("agent-device-tokens");

// [SCOPE 152 / T014] BEGIN — ending a device ends its connect-minted MCP tokens (FR-065, review #5)
/**
 * Prefix of the MCP token connect mints for a device: `agent-grant:<agent>:<deviceId>`
 * (AgentConnectService.AGENT_GRANT_TOKEN_PREFIX; not imported, AgentConnectService imports
 * this module — a test keeps the two equal).
 */
export const DEVICE_MCP_TOKEN_PREFIX = "agent-grant:";

/**
 * Revoke the live MCP tokens minted for these devices. Run it inside the transaction that ends
 * the devices, so both commit or neither does. The per-call MCP check stays as the second line.
 */
export async function revokeDeviceMcpTokens(
  deviceIds: string[],
  byUserId: string,
  exec: Pick<typeof db, "update"> = db,
): Promise<number> {
  if (deviceIds.length === 0) return 0;
  const rows = await exec
    .update(mcpapitokens)
    .set({ revokedat: new Date(), revokedbyid: byUserId })
    .where(
      and(
        isNull(mcpapitokens.revokedat),
        or(...deviceIds.map((id) => like(mcpapitokens.name, `${DEVICE_MCP_TOKEN_PREFIX}%:${id}`))),
      ),
    )
    .returning({ id: mcpapitokens.id });
  return rows.length;
}
// [SCOPE 152 / T014] END

// [SCOPE 152 / T005] BEGIN — device token service and the K.A.I.N. audit rows (FR-064, FR-065, FR-073)
// MODIFIED-BY: [SCOPE 152 / T014] — issue, revoke and revokeAllForUser also revoke the device's MCP tokens
// MODIFIED-BY: [SCOPE 152 / T015] — verify refuses a device whose company is deactivated
/** Recognisable in logs and leak scanners; the whole string is what gets hashed. */
export const AGENT_DEVICE_TOKEN_PREFIX = "kdt_";

export type DeviceRevokeReason = "revoked" | "replaced" | "password_changed";

export type AgentAuditAction =
  | "agent.signin"
  | "agent.signin.refused"
  | "agent.connect"
  | "agent.device.revoked"
  | "agent.status.read"; // [SCOPE 155 / T005] — K.A.I.N. session status read (FR-004)

export interface AgentAuditEntry {
  companyid: string;
  action: AgentAuditAction;
  changedby: string | null;
  newvalue: Record<string, unknown>;
  description: string;
}

/** The person and device behind an accepted device token. */
export interface VerifiedDevice {
  deviceId: string;
  deviceName: string;
  userId: string;
  companyId: string;
}

/** What a device list shows — never the hash. */
export interface DeviceListing {
  deviceId: string;
  deviceName: string;
  userId: string;
  userName: string | null;
  createdAt: Date;
  lastUsedAt: Date | null;
}

/** 1–100 characters after trimming, or null. */
export function normalizeDeviceName(raw: string): string | null {
  const name = raw.trim().replace(/\s+/g, " ");
  return name.length >= 1 && name.length <= 100 ? name : null;
}

export function hashDeviceToken(token: string): string {
  return kitEncryptionService.hashToken(token);
}

/** One `companyauditlogs` row. Never carries a password or a token. */
export async function recordAgentAudit(entry: AgentAuditEntry): Promise<void> {
  try {
    await db.insert(companyauditlogs).values({
      companyid: entry.companyid,
      action: entry.action,
      changedby: entry.changedby,
      previousvalue: null,
      newvalue: entry.newvalue,
      description: entry.description,
    });
  } catch (err) {
    // An audit failure is logged loudly but never turns a refusal into a success or the reverse.
    logger.error({ err, action: entry.action }, "agent audit row not written");
  }
}

export const agentDeviceTokenService = {
  /**
   * Issue a device token for this person and device name. Signing in again with the same
   * name replaces the earlier token (`replaced`) and ends its MCP tokens; other devices are untouched.
   */
  async issue(userId: string, companyId: string, deviceName: string): Promise<{ token: string; deviceId: string }> {
    const token = `${AGENT_DEVICE_TOKEN_PREFIX}${kitEncryptionService.generateApiToken()}`;
    const tokenhash = hashDeviceToken(token);

    const deviceId = await db.transaction(async (tx) => {
      const replaced = await tx
        .update(agentdevicetokens)
        .set({ revokedat: new Date(), revokedbyid: userId, revokereason: "replaced" })
        .where(
          and(
            eq(agentdevicetokens.userid, userId),
            eq(agentdevicetokens.devicename, deviceName),
            isNull(agentdevicetokens.revokedat),
          ),
        )
        .returning({ id: agentdevicetokens.id });
      await revokeDeviceMcpTokens(replaced.map((r) => r.id), userId, tx);
      const [row] = await tx
        .insert(agentdevicetokens)
        .values({ userid: userId, companyid: companyId, devicename: deviceName, tokenhash })
        .returning({ id: agentdevicetokens.id });
      return row.id;
    });

    return { token, deviceId };
  },

  /**
   * The live device and person behind a raw token, or null. Null covers unknown, revoked, an
   * inactive person, a person who left the company the device was issued in, and a deactivated
   * company — one answer, so a caller cannot probe which.
   */
  async verify(rawToken: string): Promise<VerifiedDevice | null> {
    if (!rawToken.startsWith(AGENT_DEVICE_TOKEN_PREFIX)) return null;
    const [row] = await db
      .select({
        deviceId: agentdevicetokens.id,
        deviceName: agentdevicetokens.devicename,
        userId: agentdevicetokens.userid,
        companyId: agentdevicetokens.companyid,
        personActive: userprofiles.active,
        personCompanyId: userprofiles.companyid,
        companyActive: companies.activeflag,
      })
      .from(agentdevicetokens)
      .innerJoin(userprofiles, eq(userprofiles.id, agentdevicetokens.userid))
      .innerJoin(companies, eq(companies.id, agentdevicetokens.companyid))
      .where(and(eq(agentdevicetokens.tokenhash, hashDeviceToken(rawToken)), isNull(agentdevicetokens.revokedat)))
      .limit(1);

    if (
      !row ||
      row.personActive !== true ||
      row.companyActive !== true ||
      String(row.personCompanyId) !== row.companyId
    ) {
      return null;
    }

    // Best-effort; never blocks the call.
    void db
      .update(agentdevicetokens)
      .set({ lastusedat: new Date() })
      .where(eq(agentdevicetokens.id, row.deviceId))
      .catch((err: unknown) => logger.warn({ err }, "lastusedat not updated"));

    return { deviceId: row.deviceId, deviceName: row.deviceName, userId: row.userId, companyId: row.companyId };
  },

  async getLive(deviceId: string): Promise<AgentDeviceToken | null> {
    const [row] = await db
      .select()
      .from(agentdevicetokens)
      .where(and(eq(agentdevicetokens.id, deviceId), isNull(agentdevicetokens.revokedat)))
      .limit(1);
    return row ?? null;
  },

  /** Revoke one device and its MCP tokens together. Returns the revoked row, or null when it was not live. */
  async revoke(deviceId: string, byUserId: string, reason: DeviceRevokeReason): Promise<AgentDeviceToken | null> {
    return db.transaction(async (tx) => {
      const [row] = await tx
        .update(agentdevicetokens)
        .set({ revokedat: new Date(), revokedbyid: byUserId, revokereason: reason })
        .where(and(eq(agentdevicetokens.id, deviceId), isNull(agentdevicetokens.revokedat)))
        .returning();
      if (!row) return null;
      await revokeDeviceMcpTokens([row.id], byUserId, tx);
      return row;
    });
  },

  /**
   * Every live device of a person, and their MCP tokens — on a password change or reset (FR-065).
   * Pass the transaction that sets the password, so they commit or fail together; audit with
   * `auditRevokeAll` after it.
   */
  async revokeAllForUser(
    userId: string,
    byUserId: string,
    reason: DeviceRevokeReason,
    exec: Pick<typeof db, "update"> = db,
  ): Promise<{ id: string; companyid: string }[]> {
    const revoked = await exec
      .update(agentdevicetokens)
      .set({ revokedat: new Date(), revokedbyid: byUserId, revokereason: reason })
      .where(and(eq(agentdevicetokens.userid, userId), isNull(agentdevicetokens.revokedat)))
      .returning({ id: agentdevicetokens.id, companyid: agentdevicetokens.companyid });
    await revokeDeviceMcpTokens(revoked.map((d) => d.id), byUserId, exec);
    return revoked;
  },

  /** One audit row per company the signed-out devices were issued in — written after the commit. */
  async auditRevokeAll(
    userId: string,
    byUserId: string,
    reason: DeviceRevokeReason,
    revoked: { id: string; companyid: string }[],
  ): Promise<void> {
    const byCompany = new Map<string, string[]>();
    for (const d of revoked) byCompany.set(d.companyid, [...(byCompany.get(d.companyid) ?? []), d.id]);
    for (const [companyid, devices] of byCompany) {
      await recordAgentAudit({
        companyid,
        action: "agent.device.revoked",
        changedby: byUserId,
        newvalue: { userId, devices, reason },
        description: `${devices.length} K.A.I.N. device(s) signed out: ${reason}.`,
      });
    }
  },

  async listForUser(userId: string): Promise<DeviceListing[]> {
    return this.list(eq(agentdevicetokens.userid, userId));
  },

  async listForCompany(companyId: string): Promise<DeviceListing[]> {
    return this.list(eq(agentdevicetokens.companyid, companyId));
  },

  async list(filter: ReturnType<typeof eq>): Promise<DeviceListing[]> {
    return db
      .select({
        deviceId: agentdevicetokens.id,
        deviceName: agentdevicetokens.devicename,
        userId: agentdevicetokens.userid,
        userName: userprofiles.fullname,
        createdAt: agentdevicetokens.createdat,
        lastUsedAt: agentdevicetokens.lastusedat,
      })
      .from(agentdevicetokens)
      .innerJoin(userprofiles, eq(userprofiles.id, agentdevicetokens.userid))
      .where(and(filter, isNull(agentdevicetokens.revokedat)))
      .orderBy(desc(agentdevicetokens.createdat));
  },
};
// [SCOPE 152 / T005] END
