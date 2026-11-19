/**
 * Engagement Notification Service
 * Spec 037 — Consultants Management, FR-022 / FR-023 / FR-024
 *
 * Centralized notification sends for engagement events. Each function is
 * fire-and-forget: failures are logged but never block the caller.
 *
 * Recipient discovery:
 *   - Engagement state changes notify ADMIN(s) of both tenants
 *   - Assignment modifications notify ADMIN(s) of Consulting Company only
 *   - Phase auto-advance notifies ADMIN(s) of Client Company only
 */

import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { sqlEqU } from "../lib/sqlHelpers.js";
import {
  userprofiles,
  companies,
  engagements,
  companyprojects,
} from "../../db/schema/index.js";
import { sendEmail } from "../lib/email.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("engagement-notifications");

// [SCOPE 037 / T045] BEGIN — getCompanyAdminEmails
/**
 * Returns the email addresses of all active ADMINs of a Company.
 */
async function getCompanyAdminEmails(companyId: string): Promise<string[]> {
  const rows = await db
    .select({ emailaddr: userprofiles.emailaddr })
    .from(userprofiles)
    .where(
      and(
        sqlEqU(userprofiles.companyid, companyId),
        eq(userprofiles.usertype, "ADMIN"),
        eq(userprofiles.active, true),
      ),
    );
  return rows.map((r) => r.emailaddr).filter(Boolean);
}
// [SCOPE 037 / T045] END

// [SCOPE 037 / T045] BEGIN — notifyEngagementStateChange (FR-022)
/**
 * Notifies both sides on state transitions other than resume.
 * Allowed transitions for notification: pause, disable, enable, end.
 * Resume is intentionally silent per FR-022 AC2.
 */
export async function notifyEngagementStateChange(params: {
  engagementId: string;
  clientCompanyId: string;
  consultingCompanyId: string;
  transition: "pause" | "disable" | "enable" | "end";
  fromState: string;
  toState: string;
  actorUserId: string;
}): Promise<void> {
  try {
    const [clientCo, consultingCo] = await Promise.all([
      db
        .select({ name: companies.name })
        .from(companies)
        .where(sqlEqU(companies.id, params.clientCompanyId))
        .limit(1),
      db
        .select({ name: companies.name })
        .from(companies)
        .where(sqlEqU(companies.id, params.consultingCompanyId))
        .limit(1),
    ]);

    const clientName = clientCo[0]?.name ?? "Client";
    const consultingName = consultingCo[0]?.name ?? "Consulting partner";

    const verb = {
      pause: "paused",
      disable: "disabled",
      enable: "re-enabled",
      end: "ended",
    }[params.transition];

    const subject = `Engagement ${verb}: ${clientName} ↔ ${consultingName}`;
    const html = `
      <p>An engagement between <strong>${clientName}</strong> and
      <strong>${consultingName}</strong> has been <strong>${verb}</strong>.</p>
      <p>Engagement ID: ${params.engagementId}<br>
      Previous state: <code>${params.fromState}</code><br>
      New state: <code>${params.toState}</code></p>
    `;
    const text = `An engagement between ${clientName} and ${consultingName} has been ${verb}. Engagement ID: ${params.engagementId}`;

    const [clientAdmins, consultingAdmins] = await Promise.all([
      getCompanyAdminEmails(params.clientCompanyId),
      getCompanyAdminEmails(params.consultingCompanyId),
    ]);

    const recipients = [...clientAdmins, ...consultingAdmins];
    if (recipients.length === 0) {
      logger.warn(
        { engagementId: params.engagementId },
        "No ADMINs found to notify for state change",
      );
      return;
    }

    for (const to of recipients) {
      try {
        await sendEmail(to, subject, html, text);
      } catch (err) {
        logger.warn(
          { to, engagementId: params.engagementId, error: err },
          "Failed to send state-change notification to recipient",
        );
      }
    }
  } catch (error) {
    logger.error(
      {
        error,
        engagementId: params.engagementId,
        transition: params.transition,
      },
      "notifyEngagementStateChange failed",
    );
  }
}
// [SCOPE 037 / T045] END

// [SCOPE 037 / T046] BEGIN — notifyAssignmentsModified (FR-023)
// MODIFIED-BY: [SCOPE 037 / T083] — whole-project grants named by project, not "task null" (FR-023/FR-031)
/**
 * Batched notification — call once after a batch of assignment add/remove
 * operations completes (e.g. saving the AssignmentEditor form). Notifies
 * the Consulting Company's ADMIN(s) only.
 */
export async function notifyAssignmentsModified(params: {
  engagementId: string;
  consultingCompanyId: string;
  added: Array<{ scopeid: string | null; taskid: string | null; projectid: string }>;
  removed: Array<{ scopeid: string | null; taskid: string | null; projectid: string }>;
  actorUserId: string;
}): Promise<void> {
  if (params.added.length === 0 && params.removed.length === 0) return;

  try {
    const engagementRows = await db
      .select({ clientcompanyid: engagements.clientcompanyid })
      .from(engagements)
      .where(sqlEqU(engagements.id, params.engagementId))
      .limit(1);
    const clientCompanyId = engagementRows[0]?.clientcompanyid;
    if (!clientCompanyId) return;

    const clientCo = await db
      .select({ name: companies.name })
      .from(companies)
      .where(sqlEqU(companies.id, clientCompanyId))
      .limit(1);
    const clientName = clientCo[0]?.name ?? "Client";

    // A project-level grant (FR-031 / FR-006) carries null scopeid AND null taskid,
    // so the scope/task branches alone rendered it as "task null". Name the project.
    const projectIds = [
      ...new Set(
        [...params.added, ...params.removed].map((a) => a.projectid).filter(Boolean),
      ),
    ];
    const projectNames = new Map<string, string>();
    if (projectIds.length > 0) {
      const projectRows = await db
        .select({ id: companyprojects.id, name: companyprojects.name })
        .from(companyprojects)
        .where(inArray(companyprojects.id, projectIds));
      for (const p of projectRows) projectNames.set(p.id, p.name);
    }
    const label = (a: {
      scopeid: string | null;
      taskid: string | null;
      projectid: string;
    }): string => {
      if (a.scopeid) return `scope ${a.scopeid}`;
      if (a.taskid) return `task ${a.taskid}`;
      return `project ${projectNames.get(a.projectid) ?? a.projectid}`;
    };

    const addedSummary = params.added.map((a) => `+ ${label(a)}`).join("\n");
    const removedSummary = params.removed.map((a) => `− ${label(a)}`).join("\n");

    const subject = `${clientName} modified your engagement assignments`;
    const html = `
      <p><strong>${clientName}</strong> has modified the assignments on engagement
      ${params.engagementId}:</p>
      <pre style="background:#f1f5f9;padding:10px;border-radius:4px;">${addedSummary}\n${removedSummary}</pre>
      <p>Total added: ${params.added.length}. Total removed: ${params.removed.length}.</p>
    `;
    const text = `${clientName} has modified assignments on engagement ${params.engagementId}.\n${addedSummary}\n${removedSummary}\nAdded: ${params.added.length}, Removed: ${params.removed.length}`;

    const consultingAdmins = await getCompanyAdminEmails(
      params.consultingCompanyId,
    );
    for (const to of consultingAdmins) {
      try {
        await sendEmail(to, subject, html, text);
      } catch (err) {
        logger.warn(
          { to, engagementId: params.engagementId, error: err },
          "Failed to send assignments-modified notification",
        );
      }
    }
  } catch (error) {
    logger.error(
      { error, engagementId: params.engagementId },
      "notifyAssignmentsModified failed",
    );
  }
}
// [SCOPE 037 / T046] END

// [SCOPE 037 / T047] BEGIN — notifyScopePhaseAdvanced (FR-024)
/**
 * Notifies Client ADMIN(s) when an assigned scope's lifecycle phase advances.
 * The Consulting Company is NOT notified (phase is a Client governance signal).
 *
 * Call this from the phase-transition flow after a phase advances.
 * Looks up all engagements that have an active
 * scope-level assignment for the affected scope and notifies their Client
 * Company ADMINs.
 */
export async function notifyScopePhaseAdvanced(params: {
  scopeId: string;
  fromPhase: string;
  toPhase: string;
}): Promise<void> {
  try {
    // Find engagements that include this scope at scope-level.
    const affected = await db
      .selectDistinct({
        engagementId: engagements.id,
        clientcompanyid: engagements.clientcompanyid,
      })
      .from(engagements)
      .innerJoin(
        // engagementassignments referenced inline; bypass-import for the join shape
        // by using sql template if needed. For simplicity here, the route handler
        // doing the phase advance is responsible for calling this once we know
        // the scope is assignmented to which engagements (rare write-path event).
        engagements,
        eq(engagements.id, engagements.id),
      )
      .where(eq(engagements.state, "active"));
    // (Lightweight implementation: caller passes scopeId; we lookup via
    // engagementassignments by raw SQL since the join here is awkward.)

    void affected; // placeholder — full lookup uses raw SQL below

    const eaRows = await db.execute(
      // distinct client companyids whose engagements have an active scope-level assignment for this scopeId
      // and are themselves active
      // SQL is more direct than the query builder for this distinct-join.
      // Note: importing engagementassignments table to avoid circular import.
      // Drizzle SQL templating handles parameterization safely.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      // @ts-ignore - sql template
      // prettier-ignore
      // (raw query) — kept here so the notification is reachable even before
      // a richer projectspecifications-aware integration lands.
      // @ts-ignore - sql allow
      (
        await import("drizzle-orm")
      ).sql`
        SELECT DISTINCT e.clientcompanyid
        FROM engagements e
        INNER JOIN engagementassignments ea ON ea.engagementid = e.id
        WHERE ea.scopeid = ${params.scopeId}
          AND ea.removedat IS NULL
          AND e.state = 'active'
      `,
    );
    const rowsAny = eaRows as unknown as { rows?: Array<{ clientcompanyid: string }> };
    const clientIds = (rowsAny.rows ??
      (eaRows as unknown as Array<{ clientcompanyid: string }>)
    ).map((r) => r.clientcompanyid);

    if (clientIds.length === 0) return;

    const subject = `Assigned scope advanced: ${params.scopeId} → ${params.toPhase}`;
    const html = `
      <p>An assigned scope on one of your active engagements has advanced its
      lifecycle phase.</p>
      <p>Scope: <code>${params.scopeId}</code><br>
      Previous phase: <code>${params.fromPhase}</code><br>
      New phase: <code>${params.toPhase}</code></p>
      <p>This was an automated transition.</p>
    `;
    const text = `Scope ${params.scopeId} advanced from ${params.fromPhase} to ${params.toPhase} (automated).`;

    for (const clientCompanyId of clientIds) {
      const admins = await getCompanyAdminEmails(clientCompanyId);
      for (const to of admins) {
        try {
          await sendEmail(to, subject, html, text);
        } catch (err) {
          logger.warn(
            { to, scopeId: params.scopeId, error: err },
            "Failed to send phase-advance notification",
          );
        }
      }
    }
  } catch (error) {
    logger.error(
      { error, scopeId: params.scopeId },
      "notifyScopePhaseAdvanced failed",
    );
  }
}
// [SCOPE 037 / T047] END
