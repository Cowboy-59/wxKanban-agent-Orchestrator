/**
 * Agent reach — SPEC-152 (SCOPE-132 Amendment F) T004, FR-066 / FR-070.
 *
 * The ONE answer to "which Projects may this person's K.A.I.N. work on". Grants, connect,
 * the MCP auth re-check and project.list_agent_connections all ask this, on every call,
 * so a change on the company side (Allow remote off, an engagement paused, an assignment
 * removed, the person deactivated) takes effect on the very next call everywhere.
 *
 * Split in two so the rule is tested without a database (the repo `.env` points at
 * production): `loadReachFacts` reads broad rows for one person, and `computeAgentReach`
 * applies every narrowing rule to them.
 */
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "~/db/client.js";
import { userprofiles } from "~/db/schema/userprofiles.js";
import { companyprojects } from "~/db/schema/companyproject.js";
import { companies } from "~/db/schema/company.js";
import { projectusers } from "~/db/schema/projectuser.js";
import { projectphases } from "~/db/schema/projectphase.js";
import { engagements } from "~/db/schema/engagement.js";
import { engagementassignments } from "~/db/schema/engagementassignment.js";
import { subassignments } from "~/db/schema/subassignment.js";
import { sqlEqU } from "~/server/lib/sqlHelpers.js";
import { CONSULTING_MANAGER_TYPES } from "~/server/lib/communityMembership.js";

// [SCOPE 152 / T004] BEGIN — the shared agent reach rule (FR-066, FR-070)
export type ReachVia = "own" | "engagement";

export interface ReachedProject {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  via: ReachVia;
  /** Set when `via` is `engagement`. */
  engagementId: string | null;
}

export interface ReachPerson {
  id: string;
  companyid: string;
  usertype: string;
  active: boolean;
}

export interface ReachProjectRow {
  id: string;
  name: string;
  companyid: string;
  companyName: string;
  allowremote: boolean;
  currentphase: string | null;
}

export interface ReachEngagementRow {
  engagementId: string;
  engagementState: string;
  consultingCompanyId: string;
  clientCompanyId: string;
  assignmentId: string;
  assignmentRemoved: boolean;
  scopeid: string | null;
  taskid: string | null;
  project: ReachProjectRow;
}

export interface ReachFacts {
  person: ReachPerson | null;
  /** Every Project of the person's own company, before any narrowing. */
  ownProjects: ReachProjectRow[];
  /** Own-company Projects the person is assigned to (`projectusers`) or leads an in-progress phase of. */
  memberProjectIds: ReadonlySet<string>;
  /** Every assignment under an engagement where the person's company is the consulting side. */
  engagementRows: ReachEngagementRow[];
  /** Assignments the person holds a live subassignment on. */
  liveSubassignmentIds: ReadonlySet<string>;
}

/** Allow remote on, and not archived — required of every reached Project. */
function remoteUsable(p: ReachProjectRow): boolean {
  return p.allowremote && p.currentphase !== "ARCHIVED";
}

/**
 * The rule. Own company: an ADMIN reaches every Project, anyone else the Projects the web app
 * shows them (assigned, or leading an in-progress phase); the web app's `showAll` view
 * preference is not a permission and is never consulted. Consulting company (SCOPE-144 D2):
 * ADMINs and TEAM_MANAGERs reach every whole-Project assignment under an `active` engagement,
 * other members only those they are sub-assigned to. Scope- and task-level assignments grant
 * nothing, matching the web app. Own company wins when a Project qualifies both ways.
 */
export function computeAgentReach(facts: ReachFacts): ReachedProject[] {
  const { person } = facts;
  if (!person || !person.active) return [];

  const reached = new Map<string, ReachedProject>();

  for (const p of facts.ownProjects) {
    if (p.companyid !== person.companyid || !remoteUsable(p)) continue;
    if (person.usertype !== "ADMIN" && !facts.memberProjectIds.has(p.id)) continue;
    reached.set(p.id, {
      projectId: p.id,
      projectName: p.name,
      companyId: p.companyid,
      companyName: p.companyName,
      via: "own",
      engagementId: null,
    });
  }

  const isConsultingManager = CONSULTING_MANAGER_TYPES.includes(person.usertype);
  for (const row of facts.engagementRows) {
    const p = row.project;
    if (reached.has(p.id)) continue;
    if (row.consultingCompanyId !== person.companyid) continue;
    if (row.clientCompanyId !== p.companyid) continue;
    if (row.engagementState !== "active" || row.assignmentRemoved) continue;
    if (row.scopeid !== null || row.taskid !== null) continue;
    if (!isConsultingManager && !facts.liveSubassignmentIds.has(row.assignmentId)) continue;
    if (!remoteUsable(p)) continue;
    reached.set(p.id, {
      projectId: p.id,
      projectName: p.name,
      companyId: p.companyid,
      companyName: p.companyName,
      via: "engagement",
      engagementId: row.engagementId,
    });
  }

  // Own company first, then each client company by name; Projects by name within each.
  return [...reached.values()].sort((a, b) => {
    if (a.via !== b.via) return a.via === "own" ? -1 : 1;
    return a.companyName.localeCompare(b.companyName) || a.projectName.localeCompare(b.projectName);
  });
}

/** Reads the broad rows for one person. All narrowing happens in `computeAgentReach`. */
export async function loadReachFacts(userId: string): Promise<ReachFacts> {
  const empty: ReachFacts = {
    person: null,
    ownProjects: [],
    memberProjectIds: new Set(),
    engagementRows: [],
    liveSubassignmentIds: new Set(),
  };

  const [person] = await db
    .select({
      id: userprofiles.id,
      companyid: userprofiles.companyid,
      usertype: userprofiles.usertype,
      active: userprofiles.active,
    })
    .from(userprofiles)
    .where(eq(userprofiles.id, userId))
    .limit(1);
  if (!person?.companyid) return empty;

  const reachPerson: ReachPerson = {
    id: person.id,
    companyid: String(person.companyid),
    usertype: person.usertype ?? "",
    active: person.active === true,
  };
  if (!reachPerson.active) return { ...empty, person: reachPerson };

  const projectColumns = {
    id: companyprojects.id,
    name: companyprojects.name,
    companyid: companyprojects.companyid,
    companyName: companies.name,
    allowremote: companyprojects.allowremote,
    currentphase: companyprojects.currentphase,
  };

  const [ownRows, assignedRows, phaseLeadRows, engagementRows, subRows] = await Promise.all([
    db
      .select(projectColumns)
      .from(companyprojects)
      .innerJoin(companies, eq(companies.id, companyprojects.companyid))
      .where(sqlEqU(companyprojects.companyid, reachPerson.companyid)),
    db
      .select({ projectid: projectusers.projectid })
      .from(projectusers)
      .where(and(eq(projectusers.userid, userId), isNull(projectusers.removedat))),
    db
      .select({ projectid: projectphases.projectid })
      .from(projectphases)
      .where(and(eq(projectphases.assigneduserid, userId), eq(projectphases.status, "in_progress"))),
    db
      .select({
        engagementId: engagements.id,
        engagementState: engagements.state,
        consultingCompanyId: engagements.consultingcompanyid,
        clientCompanyId: engagements.clientcompanyid,
        assignmentId: engagementassignments.id,
        assignmentRemovedAt: engagementassignments.removedat,
        scopeid: engagementassignments.scopeid,
        taskid: engagementassignments.taskid,
        project: projectColumns,
      })
      .from(engagementassignments)
      .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
      .innerJoin(companyprojects, eq(companyprojects.id, engagementassignments.projectid))
      .innerJoin(companies, eq(companies.id, companyprojects.companyid))
      .where(sqlEqU(engagements.consultingcompanyid, reachPerson.companyid)),
    db
      .select({ assignmentId: subassignments.engagementassignmentid })
      .from(subassignments)
      .where(and(eq(subassignments.consultingmemberid, userId), isNull(subassignments.removedat))),
  ]);

  const toProject = (r: {
    id: string;
    name: string;
    companyid: string | null;
    companyName: string;
    allowremote: boolean;
    currentphase: string | null;
  }): ReachProjectRow => ({
    id: r.id,
    name: r.name,
    companyid: String(r.companyid),
    companyName: r.companyName,
    allowremote: r.allowremote,
    currentphase: r.currentphase,
  });

  return {
    person: reachPerson,
    ownProjects: ownRows.map(toProject),
    memberProjectIds: new Set([...assignedRows, ...phaseLeadRows].map((r) => r.projectid)),
    engagementRows: engagementRows.map((r) => ({
      engagementId: r.engagementId,
      engagementState: r.engagementState,
      consultingCompanyId: String(r.consultingCompanyId),
      clientCompanyId: String(r.clientCompanyId),
      assignmentId: r.assignmentId,
      assignmentRemoved: r.assignmentRemovedAt !== null,
      scopeid: r.scopeid,
      taskid: r.taskid,
      project: toProject(r.project),
    })),
    liveSubassignmentIds: new Set(subRows.map((r) => r.assignmentId)),
  };
}

/** Every Project in this person's reach, decided now. */
export async function agentReach(userId: string): Promise<ReachedProject[]> {
  return computeAgentReach(await loadReachFacts(userId));
}

/** The reached entry for one Project, or null when it is out of reach. */
export async function findInAgentReach(userId: string, projectId: string): Promise<ReachedProject | null> {
  return (await agentReach(userId)).find((p) => p.projectId === projectId) ?? null;
}

/** Consulting companies with a live whole-Project assignment on this Project under an active engagement (FR-072). */
export async function consultingCompaniesReaching(projectId: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ name: companies.name })
    .from(engagementassignments)
    .innerJoin(engagements, eq(engagements.id, engagementassignments.engagementid))
    .innerJoin(companies, eq(companies.id, engagements.consultingcompanyid))
    .where(
      and(
        eq(engagementassignments.projectid, projectId),
        isNull(engagementassignments.removedat),
        isNull(engagementassignments.scopeid),
        isNull(engagementassignments.taskid),
        inArray(engagements.state, ["active"]),
      ),
    );
  return rows.map((r) => r.name).sort((a, b) => a.localeCompare(b));
}
// [SCOPE 152 / T004] END
