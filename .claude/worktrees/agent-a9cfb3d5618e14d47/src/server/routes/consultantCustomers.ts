import { Router, Response } from "express";
import { and, asc, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../db/client.js";
import {
  companyauditlogs,
  companyprojects,
  customers,
  engagements,
} from "../../db/schema/index.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { serializeDbError } from "../lib/dbError.js";
import {
  decideAccess,
  isCompanyAdminRole,
  validateCustomerBody,
} from "../lib/customerAccess.js"; // [SCOPE 119 / T009] pure policy — see that file for why

const router = Router();
const logger = createLogger("consultant-customers-routes");

router.use(authenticateToken);
router.use(requireAuth);

// SPEC-119 — the Customer is a RECORD, not a RELATIONSHIP. Nothing in this file
// grants, restricts or scopes access to anything. `clientcompanyid` points at a
// tenant; it confers no permission over that tenant's data. The moment that stops
// being true, this has become a second, worse copy of SCOPE-037's Engagement.

// [SCOPE 119 / T009] BEGIN — Company Admin predicate (FR-007)
/**
 * Company Admins get READ across their company, for billing and audit. They never
 * get write on customer detail — that stays with the owner (FR-007). Transfer
 * (FR-011) is the single exception and checks this separately.
 */
function isCompanyAdmin(req: AuthRequest): boolean {
  return isCompanyAdminRole(req.usertype);
}
// [SCOPE 119 / T009] END

// [SCOPE 119 / T009] BEGIN — resolve a customer and authorize against the record
/**
 * Loads the customer, then applies `decideAccess`. Authorization is checked
 * against the ROW, never inferred from the request — a `consultantid` in a request
 * body is user input and is ignored everywhere in this file.
 *
 * Returns null when the caller may not see it. Deliberately does NOT distinguish
 * "not found" from "not yours": telling a consultant that someone else's customer
 * exists is itself a leak (FR-007, test S10).
 */
async function loadAuthorized(
  req: AuthRequest,
  customerid: string,
  mode: "read" | "write",
): Promise<typeof customers.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(customers)
    .where(eq(customers.id, customerid))
    .limit(1);

  return decideAccess(row, req, mode) ? (row ?? null) : null;
}
// [SCOPE 119 / T009] END

// [SCOPE 119 / T006] BEGIN — validate the optional tenant link (FR-004)
/**
 * A consultant may only link to a company their company already has an Engagement
 * with. Without that rule the field becomes a probe for which companies exist:
 * "link accepted" would confirm a tenant, "rejected" would deny one.
 *
 * So an unreachable company and a non-existent company return the SAME refusal.
 */
async function canLinkToCompany(
  consultingcompanyid: string,
  clientcompanyid: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: engagements.id })
    .from(engagements)
    .where(
      and(
        eq(engagements.consultingcompanyid, consultingcompanyid),
        eq(engagements.clientcompanyid, clientcompanyid),
      ),
    )
    .limit(1);
  return Boolean(row);
}
// [SCOPE 119 / T006] END

// [SCOPE 119 / T004] BEGIN — GET /customers — the caller's own customers (FR-002)
router.get("/customers", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const includearchived = req.query.includearchived === "true";
    const search =
      typeof req.query.search === "string" ? req.query.search.trim() : "";

    const conditions = [
      eq(customers.consultantid, userid),
      eq(customers.companyid, companyid),
    ];
    if (!includearchived) conditions.push(isNull(customers.archivedat));
    if (search) {
      conditions.push(
        sql`(${customers.name} ILIKE ${"%" + search + "%"} OR ${customers.company} ILIKE ${"%" + search + "%"})`,
      );
    }

    const rows = await db
      .select({
        id: customers.id,
        name: customers.name,
        company: customers.company,
        email: customers.email,
        clientcompanyid: customers.clientcompanyid,
        archivedat: customers.archivedat,
        projectcount: sql<number>`(SELECT COUNT(*) FROM ${companyprojects} WHERE ${companyprojects.customerid} = ${customers.id})::int`,
      })
      .from(customers)
      .where(and(...conditions))
      .orderBy(asc(customers.name));

    res.json({ customers: rows });
  } catch (error) {
    logger.error({ err: serializeDbError(error) }, "Failed to list customers");
    res.status(500).json({ error: "Failed to list customers" });
  }
});
// [SCOPE 119 / T004] END

// [SCOPE 119 / T010] BEGIN — POST /customers/transfer-all — bulk offboarding (FR-011)
/**
 * Declared BEFORE the `:id` routes so the literal path can never be captured as an id.
 *
 * This exists because `consultantid` is ON DELETE RESTRICT. That protects billing
 * history from a departing consultant's deletion, but it also makes offboarding
 * impossible until their customers move. This is the way out.
 */
router.post(
  "/customers/transfer-all",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyid = req.companyid;
      if (!req.userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!isCompanyAdmin(req)) {
        res.status(403).json({ error: "Only a Company Admin can transfer customers" });
        return;
      }

      const fromid = req.body?.fromconsultantid;
      const toid = req.body?.toconsultantid;
      if (typeof fromid !== "string" || typeof toid !== "string") {
        res
          .status(400)
          .json({ error: "fromconsultantid and toconsultantid are required" });
        return;
      }
      if (fromid === toid) {
        res.status(400).json({ error: "Cannot transfer a consultant's customers to themselves" });
        return;
      }

      const moved = await db
        .update(customers)
        .set({ consultantid: toid, updatedat: new Date() })
        .where(
          and(eq(customers.consultantid, fromid), eq(customers.companyid, companyid)),
        )
        .returning({ id: customers.id });

      await db.insert(companyauditlogs).values({
        companyid,
        action: "customer.transfer_all",
        changedby: req.userid,
        previousvalue: { consultantid: fromid },
        newvalue: { consultantid: toid },
        description: `Transferred ${moved.length} customer(s) from ${fromid} to ${toid} (SPEC-119 FR-011)`,
      });

      res.json({ transferred: moved.length, from: fromid, to: toid });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to transfer customers");
      res.status(500).json({ error: "Failed to transfer customers" });
    }
  },
);
// [SCOPE 119 / T010] END

// [SCOPE 119 / T004] BEGIN — POST /customers — create (FR-001)
router.post("/customers", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userid = req.userid;
    const companyid = req.companyid;
    if (!userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const parsed = validateCustomerBody(req.body ?? {}, true);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message });
      return;
    }

    // FR-004 — validate the optional link before insert.
    let clientcompanyid: string | null = null;
    if (typeof req.body?.clientcompanyid === "string" && req.body.clientcompanyid) {
      const allowed = await canLinkToCompany(companyid, req.body.clientcompanyid);
      if (!allowed) {
        res.status(400).json({
          error: "Cannot link to that company — no engagement exists with it",
        });
        return;
      }
      clientcompanyid = req.body.clientcompanyid;
    }

    // consultantid and companyid come from the AUTH CONTEXT, never the body.
    const [row] = await db
      .insert(customers)
      .values({
        ...parsed.value,
        name: parsed.value.name as string,
        consultantid: userid,
        companyid,
        clientcompanyid,
      })
      .returning();

    res.status(201).json({ customer: row });
  } catch (error) {
    // 23505 = the partial unique index on (consultantid, lower(name)) WHERE
    // archivedat IS NULL. Uniqueness is per consultant and applies to live rows
    // only, so archiving a customer frees its name for reuse.
    if ((error as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "You already have a customer with that name" });
      return;
    }
    logger.error({ err: serializeDbError(error) }, "Failed to create customer");
    res.status(500).json({ error: "Failed to create customer" });
  }
});
// [SCOPE 119 / T004] END

// [SCOPE 119 / T007] BEGIN — GET /customers/:id — detail, projects, engagements (FR-005)
router.get("/customers/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.userid || !req.companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const customerid = typeof req.params.id === "string" ? req.params.id : "";
    if (!customerid) {
      res.status(400).json({ error: "Customer ID is required" });
      return;
    }

    const customer = await loadAuthorized(req, customerid, "read");
    if (!customer) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const projects = await db
      .select({
        id: companyprojects.id,
        name: companyprojects.name,
        status: companyprojects.status,
      })
      .from(companyprojects)
      .where(eq(companyprojects.customerid, customer.id))
      .orderBy(asc(companyprojects.name));

    // FR-005 — read-only. Every engagement action stays in SCOPE-037. Ended
    // engagements are included: the history is the point of linking to a company
    // rather than to a single engagement.
    const engagementRows = customer.clientcompanyid
      ? await db
          .select({
            id: engagements.id,
            state: engagements.state,
            createdat: engagements.createdat,
            acceptedat: engagements.acceptedat,
            endedat: engagements.endedat,
          })
          .from(engagements)
          .where(
            and(
              eq(engagements.consultingcompanyid, customer.companyid),
              eq(engagements.clientcompanyid, customer.clientcompanyid),
            ),
          )
          .orderBy(desc(engagements.createdat))
      : [];

    // The SERVER decides what the caller may do — the client never re-derives
    // authorization from a role string. The three permissions are genuinely
    // different shapes: a Company Admin may manage the link and transfer ownership
    // on a record they do not own, but may not edit its detail.
    const isOwner = customer.consultantid === req.userid;
    const isAdmin = isCompanyAdmin(req);
    res.json({
      customer,
      projects,
      engagements: engagementRows,
      canedit: isOwner,
      canmanagelink: isOwner || isAdmin,
      cantransfer: isAdmin,
    });
  } catch (error) {
    logger.error({ err: serializeDbError(error) }, "Failed to load customer");
    res.status(500).json({ error: "Failed to load customer" });
  }
});
// [SCOPE 119 / T007] END

// [SCOPE 119 / T004] BEGIN — PATCH /customers/:id — update (FR-001)
router.patch("/customers/:id", async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const companyid = req.companyid;
    if (!req.userid || !companyid) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }
    const customerid = typeof req.params.id === "string" ? req.params.id : "";
    if (!customerid) {
      res.status(400).json({ error: "Customer ID is required" });
      return;
    }

    const existing = await loadAuthorized(req, customerid, "write");
    if (!existing) {
      res.status(404).json({ error: "Customer not found" });
      return;
    }

    const parsed = validateCustomerBody(req.body ?? {}, false);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.message });
      return;
    }

    const patch: Record<string, string | null | Date> = { ...parsed.value };

    // FR-004 — `clientcompanyid` is deliberately NOT patchable here. It has exactly
    // one write path in each direction: POST /link and POST /unlink. Those are open
    // to the owner AND a Company Admin, carry the engagement check, and audit-log
    // when the actor is not the owner. Allowing the field here as well would give
    // it two authorities with different permission rules — which is how the two
    // drift apart and one of them quietly stops enforcing the check.
    if (req.body?.clientcompanyid !== undefined) {
      res.status(400).json({
        error:
          "clientcompanyid is not editable here — use POST /customers/:id/link or /unlink",
      });
      return;
    }

    // createdat, consultantid and companyid are never patchable. Ownership moves
    // only through the FR-011 transfer flow.
    patch.updatedat = new Date();

    const [row] = await db
      .update(customers)
      .set(patch)
      .where(eq(customers.id, customerid))
      .returning();

    res.json({ customer: row });
  } catch (error) {
    if ((error as { code?: string })?.code === "23505") {
      res.status(409).json({ error: "You already have a customer with that name" });
      return;
    }
    logger.error({ err: serializeDbError(error) }, "Failed to update customer");
    res.status(500).json({ error: "Failed to update customer" });
  }
});
// [SCOPE 119 / T004] END

// [SCOPE 119 / T005] BEGIN — POST /customers/:id/archive — soft archive (FR-003)
/**
 * There is deliberately no DELETE route anywhere in this file. Time entries and
 * invoices reference these rows, so destruction would orphan billing history.
 * Offering the verb at all invites someone to implement it later.
 */
router.post(
  "/customers/:id/archive",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";
      if (!customerid) {
        res.status(400).json({ error: "Customer ID is required" });
        return;
      }

      const existing = await loadAuthorized(req, customerid, "write");
      if (!existing) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      const [row] = await db
        .update(customers)
        .set({ archivedat: new Date(), updatedat: new Date() })
        .where(eq(customers.id, customerid))
        .returning();

      res.json({ customer: row });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to archive customer");
      res.status(500).json({ error: "Failed to archive customer" });
    }
  },
);
// [SCOPE 119 / T005] END

// [SCOPE 119 / T005] BEGIN — POST /customers/:id/restore — reverse an archive (FR-003)
router.post(
  "/customers/:id/restore",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      if (!req.userid || !req.companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";
      if (!customerid) {
        res.status(400).json({ error: "Customer ID is required" });
        return;
      }

      const existing = await loadAuthorized(req, customerid, "write");
      if (!existing) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      const [row] = await db
        .update(customers)
        .set({ archivedat: null, updatedat: new Date() })
        .where(eq(customers.id, customerid))
        .returning();

      res.json({ customer: row });
    } catch (error) {
      // Restoring can collide with a live customer that took the name while this
      // one was archived — the partial unique index is doing its job.
      if ((error as { code?: string })?.code === "23505") {
        res.status(409).json({
          error:
            "A live customer already uses that name — rename it before restoring this one",
        });
        return;
      }
      logger.error({ err: serializeDbError(error) }, "Failed to restore customer");
      res.status(500).json({ error: "Failed to restore customer" });
    }
  },
);
// [SCOPE 119 / T005] END

// [SCOPE 119 / T006] BEGIN — POST /customers/:id/link — set the tenant link (FR-004)
/**
 * Owner OR Company Admin. Linking records that this client is also a wxKanban
 * account. It grants nothing in either direction — the link is a label, not a
 * permission.
 *
 * The engagement check is COMPANY-scoped, not consultant-scoped: the constraint is
 * that *your company* already has an Engagement with the target. That is what stops
 * the field being used to enumerate which companies exist, and it applies equally
 * to an Admin — an Admin cannot link to a company the company has no relationship
 * with either.
 *
 * Together with /unlink this is the ONLY write path for `clientcompanyid`. PATCH
 * deliberately refuses the field.
 */
router.post(
  "/customers/:id/link",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyid = req.companyid;
      if (!req.userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";
      const target = req.body?.clientcompanyid;
      if (!customerid || typeof target !== "string" || !target) {
        res.status(400).json({ error: "clientcompanyid is required" });
        return;
      }

      // "read" mode admits owner OR Company Admin — both may manage the link.
      const existing = await loadAuthorized(req, customerid, "read");
      if (!existing) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }

      const allowed = await canLinkToCompany(companyid, target);
      if (!allowed) {
        // An unreachable company and a non-existent one return the SAME refusal,
        // so the endpoint cannot be used to probe which companies exist.
        res.status(400).json({
          error: "Cannot link to that company — no engagement exists with it",
        });
        return;
      }

      const [row] = await db
        .update(customers)
        .set({ clientcompanyid: target, updatedat: new Date() })
        .where(eq(customers.id, customerid))
        .returning();

      if (existing.consultantid !== req.userid) {
        await db.insert(companyauditlogs).values({
          companyid,
          action: "customer.link",
          changedby: req.userid,
          previousvalue: { customerid, clientcompanyid: existing.clientcompanyid },
          newvalue: { customerid, clientcompanyid: target },
          description: `Company Admin linked customer "${existing.name}" to a wxKanban account (SPEC-119 FR-004)`,
        });
      }

      res.json({ customer: row });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to link customer");
      res.status(500).json({ error: "Failed to link customer" });
    }
  },
);
// [SCOPE 119 / T006] END

// [SCOPE 119 / T006] BEGIN — POST /customers/:id/unlink — clear the tenant link (FR-004)
/**
 * Owner OR Company Admin, symmetric with /link. A wrong `clientcompanyid` is a
 * factual error in the company's records, and the person who can see across the
 * company is positioned to correct it.
 *
 * Unlinking grants and revokes nothing — the link never conferred access. It is a
 * correction to a label.
 */
router.post(
  "/customers/:id/unlink",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyid = req.companyid;
      if (!req.userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      const customerid = typeof req.params.id === "string" ? req.params.id : "";
      if (!customerid) {
        res.status(400).json({ error: "Customer ID is required" });
        return;
      }

      // "read" authorization is the right gate here: owner OR Company Admin. The
      // narrower "write" mode would exclude the Admin this endpoint exists for.
      const existing = await loadAuthorized(req, customerid, "read");
      if (!existing) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      if (existing.clientcompanyid === null) {
        res.status(400).json({ error: "Customer is not linked to an account" });
        return;
      }

      const [row] = await db
        .update(customers)
        .set({ clientcompanyid: null, updatedat: new Date() })
        .where(eq(customers.id, customerid))
        .returning();

      // Logged only when an Admin acts on someone else's record — that is the case
      // with accountability value. A consultant correcting their own link is
      // routine and does not need an audit row.
      if (existing.consultantid !== req.userid) {
        await db.insert(companyauditlogs).values({
          companyid,
          action: "customer.unlink",
          changedby: req.userid,
          previousvalue: { customerid, clientcompanyid: existing.clientcompanyid },
          newvalue: { customerid, clientcompanyid: null },
          description: `Company Admin unlinked customer "${existing.name}" from its wxKanban account (SPEC-119 FR-004)`,
        });
      }

      res.json({ customer: row });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to unlink customer");
      res.status(500).json({ error: "Failed to unlink customer" });
    }
  },
);
// [SCOPE 119 / T006] END

// [SCOPE 119 / T010] BEGIN — POST /customers/:id/transfer — single transfer (FR-011)
router.post(
  "/customers/:id/transfer",
  async (req: AuthRequest, res: Response): Promise<void> => {
    try {
      const companyid = req.companyid;
      if (!req.userid || !companyid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }
      if (!isCompanyAdmin(req)) {
        res.status(403).json({ error: "Only a Company Admin can transfer customers" });
        return;
      }

      const customerid = typeof req.params.id === "string" ? req.params.id : "";
      const toid = req.body?.toconsultantid;
      if (!customerid || typeof toid !== "string") {
        res.status(400).json({ error: "toconsultantid is required" });
        return;
      }

      const [existing] = await db
        .select()
        .from(customers)
        .where(and(eq(customers.id, customerid), eq(customers.companyid, companyid)))
        .limit(1);

      if (!existing) {
        res.status(404).json({ error: "Customer not found" });
        return;
      }
      if (existing.consultantid === toid) {
        res.status(400).json({ error: "Customer already belongs to that consultant" });
        return;
      }

      // Moves consultantid ALONE. Projects keep their association — the customer
      // moved, the work did not. Historical time entries reference the project and
      // are never rewritten.
      const [row] = await db
        .update(customers)
        .set({ consultantid: toid, updatedat: new Date() })
        .where(eq(customers.id, customerid))
        .returning();

      await db.insert(companyauditlogs).values({
        companyid,
        action: "customer.transfer",
        changedby: req.userid,
        previousvalue: { customerid, consultantid: existing.consultantid },
        newvalue: { customerid, consultantid: toid },
        description: `Transferred customer "${existing.name}" from ${existing.consultantid} to ${toid} (SPEC-119 FR-011)`,
      });

      res.json({ customer: row });
    } catch (error) {
      logger.error({ err: serializeDbError(error) }, "Failed to transfer customer");
      res.status(500).json({ error: "Failed to transfer customer" });
    }
  },
);
// [SCOPE 119 / T010] END

export default router;
