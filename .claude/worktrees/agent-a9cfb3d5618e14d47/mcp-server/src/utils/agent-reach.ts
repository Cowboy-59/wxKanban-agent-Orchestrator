// [SCOPE 152 / T007] BEGIN — agent reach, MCP side (SCOPE-132 Amendment F, FR-066, FR-067, FR-070)
// MODIFIED-BY: [SCOPE 152 / T015] — isDeviceLive refuses a device whose company is deactivated
//
// The MCP's copy of the app's one reach rule (src/server/lib/agentReach.ts). The auth middleware
// asks it on EVERY call made with a connect-minted K.A.I.N. token, and project.list_agent_connections
// lists from it, so a change on the company side stops K.A.I.N. at its next call.
//
// `computeAgentReach` is kept identical to the app's; tests/unit/agentReach.drift.test.ts runs both
// on the same facts and fails when they disagree. The loader reads with explicit SQL, because this
// server's schema mirror is partial (an undeclared column would read `undefined` silently).
import { sql, type SQL } from 'drizzle-orm';

export type ReachVia = 'own' | 'engagement';

export interface ReachedProject {
  projectId: string;
  projectName: string;
  companyId: string;
  companyName: string;
  via: ReachVia;
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
  ownProjects: ReachProjectRow[];
  memberProjectIds: ReadonlySet<string>;
  engagementRows: ReachEngagementRow[];
  liveSubassignmentIds: ReadonlySet<string>;
}

/** Consulting-company roles that cover all of their company's assigned projects (SCOPE-144 D2). */
export const CONSULTING_MANAGER_TYPES = ['ADMIN', 'TEAM_MANAGER'];

function remoteUsable(p: ReachProjectRow): boolean {
  return p.allowremote && p.currentphase !== 'ARCHIVED';
}

/** The rule — identical to the app's computeAgentReach (drift-tested). */
export function computeAgentReach(facts: ReachFacts): ReachedProject[] {
  const { person } = facts;
  if (!person || !person.active) return [];

  const reached = new Map<string, ReachedProject>();

  for (const p of facts.ownProjects) {
    if (p.companyid !== person.companyid || !remoteUsable(p)) continue;
    if (person.usertype !== 'ADMIN' && !facts.memberProjectIds.has(p.id)) continue;
    reached.set(p.id, {
      projectId: p.id,
      projectName: p.name,
      companyId: p.companyid,
      companyName: p.companyName,
      via: 'own',
      engagementId: null,
    });
  }

  const isConsultingManager = CONSULTING_MANAGER_TYPES.includes(person.usertype);
  for (const row of facts.engagementRows) {
    const p = row.project;
    if (reached.has(p.id)) continue;
    if (row.consultingCompanyId !== person.companyid) continue;
    if (row.clientCompanyId !== p.companyid) continue;
    if (row.engagementState !== 'active' || row.assignmentRemoved) continue;
    if (row.scopeid !== null || row.taskid !== null) continue;
    if (!isConsultingManager && !facts.liveSubassignmentIds.has(row.assignmentId)) continue;
    if (!remoteUsable(p)) continue;
    reached.set(p.id, {
      projectId: p.id,
      projectName: p.name,
      companyId: p.companyid,
      companyName: p.companyName,
      via: 'engagement',
      engagementId: row.engagementId,
    });
  }

  return [...reached.values()].sort((a, b) => {
    if (a.via !== b.via) return a.via === 'own' ? -1 : 1;
    return a.companyName.localeCompare(b.companyName) || a.projectName.localeCompare(b.projectName);
  });
}

/** Anything with drizzle's `execute(sql)` — the MCP `db` or a ScopedDb's `raw`. */
export interface SqlExecutor {
  execute(query: SQL): Promise<unknown>;
}

function rowsOf<T>(r: unknown): T[] {
  if (Array.isArray(r)) return r as T[];
  return ((r as { rows?: T[] }).rows ?? []) as T[];
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(v: string): boolean {
  return UUID_RE.test(v);
}

interface ProjectSqlRow {
  id: string;
  name: string;
  companyid: string;
  companyname: string;
  allowremote: boolean;
  currentphase: string | null;
}

function toProject(r: ProjectSqlRow): ReachProjectRow {
  return {
    id: r.id,
    name: r.name,
    companyid: r.companyid,
    companyName: r.companyname,
    allowremote: r.allowremote === true,
    currentphase: r.currentphase,
  };
}

/**
 * Reads the broad rows for one person — or, given `projectId`, only the rows for that one Project,
 * which is all the per-call auth check needs. All narrowing happens in computeAgentReach. Every
 * comparison is uuid to uuid, so the companyid and engagement indexes are used.
 */
export async function loadReachFacts(db: SqlExecutor, userId: string, projectId?: string): Promise<ReachFacts> {
  const empty: ReachFacts = {
    person: null,
    ownProjects: [],
    memberProjectIds: new Set(),
    engagementRows: [],
    liveSubassignmentIds: new Set(),
  };
  if (!isUuid(userId) || (projectId !== undefined && !isUuid(projectId))) return empty;
  const onlyProject = (col: SQL): SQL => (projectId === undefined ? sql`` : sql` AND ${col} = ${projectId}::uuid`);

  const [person] = rowsOf<{ id: string; companyid: string | null; usertype: string | null; active: boolean | null }>(
    await db.execute(sql`
      SELECT u.id::text AS id, u.companyid::text AS companyid, u.usertype, u.active
        FROM userprofiles u
       WHERE u.id = ${userId}::uuid
       LIMIT 1`),
  );
  if (!person?.companyid) return empty;
  const reachPerson: ReachPerson = {
    id: person.id,
    companyid: person.companyid,
    usertype: person.usertype ?? '',
    active: person.active === true,
  };
  if (!reachPerson.active) return { ...empty, person: reachPerson };

  const [own, members, engagementRows, subs] = await Promise.all([
    db.execute(sql`
      SELECT p.id::text AS id, p.name, p.companyid::text AS companyid, c.name AS companyname,
             p.allowremote, p.currentphase
        FROM companyprojects p
        JOIN companies c ON c.id = p.companyid
       WHERE p.companyid = ${reachPerson.companyid}::uuid${onlyProject(sql`p.id`)}`),
    db.execute(sql`
      SELECT pu.projectid::text AS projectid FROM projectusers pu
       WHERE pu.userid = ${userId}::uuid AND pu.removedat IS NULL${onlyProject(sql`pu.projectid`)}
      UNION
      SELECT ph.projectid::text AS projectid FROM projectphases ph
       WHERE ph.assigneduserid = ${userId} AND ph.status = 'in_progress'${onlyProject(sql`ph.projectid`)}`),
    db.execute(sql`
      SELECT e.id::text AS engagementid, e.state, e.consultingcompanyid::text AS consultingcompanyid,
             e.clientcompanyid::text AS clientcompanyid, a.id::text AS assignmentid,
             (a.removedat IS NOT NULL) AS removed, a.scopeid, a.taskid::text AS taskid,
             p.id::text AS id, p.name, p.companyid::text AS companyid, c.name AS companyname,
             p.allowremote, p.currentphase
        FROM engagementassignments a
        JOIN engagements e ON e.id = a.engagementid
        JOIN companyprojects p ON p.id = a.projectid
        JOIN companies c ON c.id = p.companyid
       WHERE e.consultingcompanyid = ${reachPerson.companyid}::uuid${onlyProject(sql`a.projectid`)}`),
    db.execute(sql`
      SELECT s.engagementassignmentid::text AS assignmentid
        FROM subassignments s
       WHERE s.consultingmemberid = ${userId}::uuid AND s.removedat IS NULL`),
  ]);

  return {
    person: reachPerson,
    ownProjects: rowsOf<ProjectSqlRow>(own).map(toProject),
    memberProjectIds: new Set(rowsOf<{ projectid: string }>(members).map((r) => r.projectid)),
    engagementRows: rowsOf<
      ProjectSqlRow & {
        engagementid: string;
        state: string;
        consultingcompanyid: string;
        clientcompanyid: string;
        assignmentid: string;
        removed: boolean;
        scopeid: string | null;
        taskid: string | null;
      }
    >(engagementRows).map((r) => ({
      engagementId: r.engagementid,
      engagementState: r.state,
      consultingCompanyId: r.consultingcompanyid,
      clientCompanyId: r.clientcompanyid,
      assignmentId: r.assignmentid,
      assignmentRemoved: r.removed === true,
      scopeid: r.scopeid,
      taskid: r.taskid,
      project: toProject(r),
    })),
    liveSubassignmentIds: new Set(rowsOf<{ assignmentid: string }>(subs).map((r) => r.assignmentid)),
  };
}

export async function agentReach(db: SqlExecutor, userId: string): Promise<ReachedProject[]> {
  return computeAgentReach(await loadReachFacts(db, userId));
}

/** The per-call check: the same rule, over only this Project's rows. */
export async function findInAgentReach(db: SqlExecutor, userId: string, projectId: string): Promise<ReachedProject | null> {
  return computeAgentReach(await loadReachFacts(db, userId, projectId)).find((p) => p.projectId === projectId) ?? null;
}

/**
 * The device id carried by a connect-minted token name, `agent-grant:<AGENT>:<deviceId>`.
 * Null for the retired `agent-grant:<AGENT>` form (a Company Access Token's mint), which is refused.
 */
export function parseAgentTokenName(name: string, prefix: string): { agentName: string; deviceId: string } | null {
  if (!name.startsWith(prefix)) return null;
  const [agentName, deviceId, ...rest] = name.slice(prefix.length).split(':');
  if (!agentName || !deviceId || rest.length > 0 || !isUuid(deviceId)) return null;
  return { agentName, deviceId };
}

/**
 * Live device of this person, the person active and still in the company the device was issued
 * in, and that company not deactivated (SPEC-152 T015, review #6).
 */
export async function isDeviceLive(db: SqlExecutor, deviceId: string, userId: string): Promise<boolean> {
  if (!isUuid(deviceId) || !isUuid(userId)) return false;
  const rows = rowsOf<{ id: string }>(
    await db.execute(sql`
      SELECT d.id::text AS id
        FROM agentdevicetokens d
        JOIN userprofiles u ON u.id = d.userid
        JOIN companies c ON c.id = d.companyid
       WHERE d.id = ${deviceId}::uuid
         AND d.userid = ${userId}::uuid
         AND d.revokedat IS NULL
         AND u.active = true
         AND u.companyid::text = d.companyid::text
         AND c.activeflag = true
       LIMIT 1`),
  );
  return rows.length > 0;
}
// [SCOPE 152 / T007] END
