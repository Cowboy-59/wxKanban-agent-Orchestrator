import { Router, Response } from "express";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  connectionhealth,
  credentialauditlogs,
  customers,
  externalconnections,
  synchistory,
} from "../../db/schema/index.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { serializeDbError } from "../lib/dbError.js";
import { encryptToken } from "../lib/crypto.js";
import { config } from "../config.js";
import {
  canDecryptCredentials,
  canDeleteConnection,
  canEditConnection,
  canViewConnectionMetadata,
  toPublicConnection,
} from "../lib/credentialAccess.js";

const router = Router();
const logger = createLogger("consultant-connections-routes");

router.use(authenticateToken);
router.use(requireAuth);

const SYSTEM_TYPES = ["jira", "monday", "trello", "asana", "azuredevops", "custom"];
const SCOPES = ["PERSONAL", "TEAM"];

// [SCOPE 017 / T101] BEGIN — append to the credential audit trail (FR-012)
/**
 * Writes one immutable audit row. Snapshots the connection name and the actor's
 * email so the record stays readable after either is deleted — the table's
 * foreign keys are SET NULL precisely so this survives.
 *
 * Never throws into the request path: an audit write that fails must be loud in
 * the logs, but must not turn a successful credential operation into a 500 the
 * caller retries — which would perform the operation twice.
 */
async function audit(
  req: AuthRequest,
  entry: {
    connectionid: string | null;
    connectionname: string;
    action: string;
    actionresult: "success" | "failure";
    details?: Record<string, unknown>;
  },
): Promise<void> {
  try {
    await db.insert(credentialauditlogs).values({
      connectionid: entry.connectionid,
      connectionname: entry.connectionname,
      userid: req.userid ?? null,
      useremail: req.email ?? "unknown",
      companyid: req.companyid as string,
      action: entry.action,
      actionresult: entry.actionresult,
      ipaddress: req.ip ?? null,
      useragent: req.headers["user-agent"] ?? null,
      details: entry.details ?? null,
    });
  } catch (error) {
    logger.error(
      { err: serializeDbError(error), action: entry.action },
      "AUDIT WRITE FAILED — credential operation proceeded without a trail",
    );
  }
}
// [SCOPE 017 / T101] END

// [SCOPE 017 / T102] BEGIN — GET /customers/:id/connections — list for a customer (FR-010)
router.get(
  "/customers/:id/connections",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyid = req.companyid;
      if (!req.userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";

      const [customer] = await db
        .select({ id: customers.id, companyid: customers.companyid })
        .from(customers)
        .where(eq(customers.id, customerid))
        .limit(1);
      if (!customer || customer.companyid !== companyid) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      // Metadata only, and credentialsencrypted is never in the select list at
      // all — not selected, so it cannot be leaked by a later refactor that
      // forgets to strip it.
      const rows = await db
        .select({
          id: externalconnections.id,
          name: externalconnections.name,
          systemtype: externalconnections.systemtype,
          apiendpoint: externalconnections.apiendpoint,
          credentialscope: externalconnections.credentialscope,
          consultantid: externalconnections.consultantid,
          companyid: externalconnections.companyid,
          status: externalconnections.status,
          healthstatus: externalconnections.healthstatus,
          healthcheckedat: externalconnections.healthcheckedat,
          lastsyncat: externalconnections.lastsyncat,
          createdat: externalconnections.createdat,
        })
        .from(externalconnections)
        .where(
          and(
            eq(externalconnections.customerid, customerid),
            isNull(externalconnections.deletedat),
          ),
        )
        .orderBy(externalconnections.name);

      // Tell the client what it may do, so it never re-derives authorization.
      const connections = rows.map((r) => ({
        ...r,
        cansecrets: canDecryptCredentials(r, req),
        candelete: canDeleteConnection(r, req),
        canedit: canEditConnection(r, req),
      }));

      res.json({ connections });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to list connections");
      res.status(500).json({ error: "Failed to list connections" });
    }
  },
);
// [SCOPE 017 / T102] END

// [SCOPE 017 / T103] BEGIN — POST /customers/:id/connections — create (FR-007)
router.post(
  "/customers/:id/connections",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userid = req.userid;
      const companyid = req.companyid;
      if (!userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";

      const [customer] = await db
        .select({ id: customers.id, companyid: customers.companyid, archivedat: customers.archivedat })
        .from(customers)
        .where(eq(customers.id, customerid))
        .limit(1);
      if (!customer || customer.companyid !== companyid) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      if (customer.archivedat) {
        res.status(400).json({ error: "Cannot add a connection to an archived customer" });
        return;
      }

      const { name, systemtype, apiendpoint, credentials, credentialscope } = req.body ?? {};
      if (typeof name !== "string" || !name.trim()) {
        res.status(400).json({ error: "name is required" });
        return;
      }
      if (typeof systemtype !== "string" || !SYSTEM_TYPES.includes(systemtype)) {
        res.status(400).json({ error: `systemtype must be one of ${SYSTEM_TYPES.join(", ")}` });
        return;
      }
      if (typeof apiendpoint !== "string" || !/^https:\/\//i.test(apiendpoint)) {
        // HTTPS only. Credentials travel to this endpoint, so plaintext http is
        // refused outright rather than warned about.
        res.status(400).json({ error: "apiendpoint must be an https:// URL" });
        return;
      }
      if (!credentials || typeof credentials !== "object") {
        res.status(400).json({ error: "credentials are required" });
        return;
      }
      const scope = typeof credentialscope === "string" ? credentialscope : "PERSONAL";
      if (!SCOPES.includes(scope)) {
        res.status(400).json({ error: "credentialscope must be PERSONAL or TEAM" });
        return;
      }

      const encrypted = encryptToken(JSON.stringify(credentials), config.ENCRYPTION_KEY);

      const [row] = await db
        .insert(externalconnections)
        .values({
          customerid,
          consultantid: userid,
          companyid,
          name: name.trim(),
          systemtype,
          apiendpoint,
          credentialsencrypted: encrypted,
          credentialscope: scope,
          status: "disconnected",
        })
        .returning();

      await audit(req, {
        connectionid: row.id,
        connectionname: row.name,
        action: "edit",
        actionresult: "success",
        details: { created: true, systemtype, credentialscope: scope },
      });

      res.status(201).json({ connection: toPublicConnection(row) });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to create connection");
      res.status(500).json({ error: "Failed to create connection" });
    }
  },
);
// [SCOPE 017 / T103] END

// [SCOPE 017 / T104] BEGIN — GET /connections/:id — detail, metadata only (FR-010)
router.get(
  "/connections/:id",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }

      const [recentHealth] = await db
        .select()
        .from(connectionhealth)
        .where(eq(connectionhealth.connectionid, id))
        .orderBy(desc(connectionhealth.checkedat))
        .limit(5);

      res.json({
        connection: toPublicConnection(row),
        health: recentHealth ?? null,
        cansecrets: canDecryptCredentials(row, req),
        canedit: canEditConnection(row, req),
        candelete: canDeleteConnection(row, req),
      });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to load connection");
      res.status(500).json({ error: "Failed to load connection" });
    }
  },
);
// [SCOPE 017 / T104] END

// [SCOPE 017 / T105] BEGIN — PATCH /connections/:id — rotate credentials (FR-007)
router.patch(
  "/connections/:id",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      if (!canEditConnection(row, req)) {
        // Logged as a failure: an attempt to edit a credential you may not read
        // is exactly what the audit trail exists to record.
        await audit(req, {
          connectionid: id,
          connectionname: row.name,
          action: "edit",
          actionresult: "failure",
          details: { reason: "not permitted for this credential scope" },
        });
        res.status(403).json({ error: "You cannot edit this connection's credentials" });
        return;
      }

      const patch: Record<string, unknown> = { updatedat: new Date() };
      if (typeof req.body?.name === "string" && req.body.name.trim()) {
        patch.name = req.body.name.trim();
      }
      if (typeof req.body?.apiendpoint === "string") {
        if (!/^https:\/\//i.test(req.body.apiendpoint)) {
          res.status(400).json({ error: "apiendpoint must be an https:// URL" });
          return;
        }
        patch.apiendpoint = req.body.apiendpoint;
      }
      if (typeof req.body?.credentialscope === "string") {
        if (!SCOPES.includes(req.body.credentialscope)) {
          res.status(400).json({ error: "credentialscope must be PERSONAL or TEAM" });
          return;
        }
        patch.credentialscope = req.body.credentialscope;
      }
      // Credential rotation in place — FR notes recommend rotating every 90 days
      // without deleting and recreating the connection.
      if (req.body?.credentials && typeof req.body.credentials === "object") {
        patch.credentialsencrypted = encryptToken(
          JSON.stringify(req.body.credentials),
          config.ENCRYPTION_KEY,
        );
        patch.status = "disconnected"; // re-test before trusting it again
      }

      const [updated] = await db
        .update(externalconnections)
        .set(patch)
        .where(eq(externalconnections.id, id))
        .returning();

      await audit(req, {
        connectionid: id,
        connectionname: updated.name,
        action: "edit",
        actionresult: "success",
        details: { rotated: Boolean(patch.credentialsencrypted) },
      });

      res.json({ connection: toPublicConnection(updated) });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to update connection");
      res.status(500).json({ error: "Failed to update connection" });
    }
  },
);
// [SCOPE 017 / T105] END

// [SCOPE 017 / T106] BEGIN — DELETE /connections/:id — soft delete (FR-010)
router.delete(
  "/connections/:id",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      if (!canDeleteConnection(row, req)) {
        await audit(req, {
          connectionid: id,
          connectionname: row.name,
          action: "delete",
          actionresult: "failure",
          details: { reason: "owner or Team Manager only" },
        });
        res.status(403).json({ error: "Only the owner or a Team Manager can delete this" });
        return;
      }

      // SOFT delete. A hard DELETE would set credentialauditlogs.connectionid to
      // NULL for every past access — the trail survives by design, but it stops
      // being joinable. Soft-deleting keeps the history intact and reversible.
      await db
        .update(externalconnections)
        .set({ deletedat: new Date(), status: "disconnected", updatedat: new Date() })
        .where(eq(externalconnections.id, id));

      await audit(req, {
        connectionid: id,
        connectionname: row.name,
        action: "delete",
        actionresult: "success",
      });

      res.json({ success: true });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to delete connection");
      res.status(500).json({ error: "Failed to delete connection" });
    }
  },
);
// [SCOPE 017 / T106] END

// [SCOPE 017 / T107] BEGIN — POST /connections/:id/test — verify credentials (FR-013)
/**
 * Reachability check only. This performs an HTTPS HEAD/GET against the stored
 * endpoint with a timeout; it does NOT speak any vendor's API dialect.
 *
 * That boundary is deliberate and worth stating: a real Jira/Monday/Trello
 * integration is a substantial piece of work per vendor, and pretending a
 * generic ping validates a token would be worse than admitting it does not.
 * What this proves is that the endpoint resolves and answers — which is the
 * majority of real-world misconfiguration.
 */
router.post(
  "/connections/:id/test",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      if (!canDecryptCredentials(row, req)) {
        await audit(req, {
          connectionid: id,
          connectionname: row.name,
          action: "test",
          actionresult: "failure",
          details: { reason: "not permitted for this credential scope" },
        });
        res.status(403).json({ error: "You cannot test this connection" });
        return;
      }

      const started = Date.now();
      let status: "healthy" | "error" = "error";
      let errorcode: string | null = null;
      let errormessage: string | null = null;

      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 30_000); // FR: 30s cap
        const resp = await fetch(row.apiendpoint, {
          method: "GET",
          signal: controller.signal,
          redirect: "manual",
        });
        clearTimeout(timer);
        // Any answer at all proves reachability. 401/403 means the endpoint is
        // live and rejecting us, which is a credential problem, not a reachability one.
        status = resp.status < 500 ? "healthy" : "error";
        if (status === "error") errorcode = String(resp.status);
      } catch (err) {
        errorcode = (err as { name?: string })?.name === "AbortError" ? "TIMEOUT" : "UNREACHABLE";
        errormessage = err instanceof Error ? err.message : "Unknown error";
      }

      const responsetimems = Date.now() - started;

      await db.insert(connectionhealth).values({
        connectionid: id,
        status,
        checktype: "manual",
        responsetimems,
        errorcode,
        errormessage,
      });

      const [updated] = await db
        .update(externalconnections)
        .set({
          healthstatus: status,
          healthcheckedat: new Date(),
          status: status === "healthy" ? "connected" : "error",
          updatedat: new Date(),
        })
        .where(eq(externalconnections.id, id))
        .returning();

      await audit(req, {
        connectionid: id,
        connectionname: row.name,
        action: "test",
        actionresult: status === "healthy" ? "success" : "failure",
        details: { responsetimems, errorcode },
      });

      res.json({
        connection: toPublicConnection(updated),
        result: { status, responsetimems, errorcode, errormessage },
      });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to test connection");
      res.status(500).json({ error: "Failed to test connection" });
    }
  },
);
// [SCOPE 017 / T107] END

// [SCOPE 017 / T108] BEGIN — GET /connections/:id/audit-log — the trail (FR-012)
router.get(
  "/connections/:id/audit-log",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }
      // Reading the trail is gated on the same rule as reading the credential:
      // who accessed a PERSONAL secret is itself sensitive.
      if (!canDecryptCredentials(row, req)) {
        res.status(403).json({ error: "You cannot view this connection's audit log" });
        return;
      }

      const entries = await db
        .select()
        .from(credentialauditlogs)
        .where(eq(credentialauditlogs.connectionid, id))
        .orderBy(desc(credentialauditlogs.createdat))
        .limit(100);

      res.json({ entries });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to load audit log");
      res.status(500).json({ error: "Failed to load audit log" });
    }
  },
);
// [SCOPE 017 / T108] END

// [SCOPE 017 / T109] BEGIN — GET /connections/:id/sync-history — last 10 runs (FR-011)
router.get(
  "/connections/:id/sync-history",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const id = typeof req.params.id === "string" ? req.params.id : "";
      const [row] = await db
        .select()
        .from(externalconnections)
        .where(eq(externalconnections.id, id))
        .limit(1);

      if (!canViewConnectionMetadata(row, req)) {
        res.status(404).json({ error: "Connection not found" });
        return;
      }

      const runs = await db
        .select()
        .from(synchistory)
        .where(eq(synchistory.connectionid, id))
        .orderBy(desc(synchistory.startedat))
        .limit(10);

      res.json({ runs });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to load sync history");
      res.status(500).json({ error: "Failed to load sync history" });
    }
  },
);
// [SCOPE 017 / T109] END

// [SCOPE 017 / T110] BEGIN — GET /dashboard/connection-health — the tile (FR-013)
router.get(
  "/dashboard/connection-health",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const userid = req.userid;
      const companyid = req.companyid;
      if (!userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      // One aggregate, answered from the denormalised healthstatus column rather
      // than a correlated subquery per connection — this feeds a dashboard tile
      // inside a 3-second page budget.
      const [counts] = await db
        .select({
          total: sql<number>`COUNT(*)::int`,
          healthy: sql<number>`COUNT(*) FILTER (WHERE ${externalconnections.healthstatus} = 'healthy')::int`,
          warning: sql<number>`COUNT(*) FILTER (WHERE ${externalconnections.healthstatus} = 'warning')::int`,
          error: sql<number>`COUNT(*) FILTER (WHERE ${externalconnections.healthstatus} = 'error')::int`,
          unknown: sql<number>`COUNT(*) FILTER (WHERE ${externalconnections.healthstatus} = 'unknown' OR ${externalconnections.healthstatus} IS NULL)::int`,
        })
        .from(externalconnections)
        .where(
          and(
            eq(externalconnections.consultantid, userid),
            eq(externalconnections.companyid, companyid),
            isNull(externalconnections.deletedat),
          ),
        );

      res.json({
        total: counts?.total ?? 0,
        healthy: counts?.healthy ?? 0,
        warning: counts?.warning ?? 0,
        error: counts?.error ?? 0,
        unknown: counts?.unknown ?? 0,
      });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to load connection health");
      res.status(500).json({ error: "Failed to load connection health" });
    }
  },
);
// [SCOPE 017 / T110] END

export default router;
