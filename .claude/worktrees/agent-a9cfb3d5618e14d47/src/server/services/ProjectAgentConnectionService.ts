/**
 * Project agent connections — SPEC-151 (SCOPE-132 Amendment D), FR-058 – FR-061.
 *
 * Which project agents are connected now, from which machine and repo, and what each is doing.
 * The project agent opens a record when it starts, refreshes it with a heartbeat and closes it on a
 * clean stop. KAIN reads the records through the hosted MCP (FR-062). The project is always the kit
 * token's; nothing in a request names it (FR-013).
 */
import { and, desc, eq, isNull } from 'drizzle-orm';
import { db } from '~/db/client.js';
import { projectagentconnections } from '~/db/schema/projectagentconnection.js';
import { projectrooms } from '~/db/schema/projectroom.js';

// [SCOPE 151 / T003] BEGIN — connection rules (FR-058, FR-059)
/** What the bridge reports: a gated action pending, a turn or triage running, or neither. */
export const AGENT_CONNECTION_STATES = ['idle', 'working', 'waiting'] as const;
export type AgentConnectionState = (typeof AGENT_CONNECTION_STATES)[number];
export type AgentConnectionEndReason = 'stopped' | 'stale' | 'replaced';

/** FR-060: the agent refreshes its record this often. */
export const HEARTBEAT_SECONDS = 60;
/** FR-058: an open record not seen for this long is no longer live. Three missed heartbeats. */
export const LIVE_WINDOW_MS = 3 * 60_000;

export interface OpenConnectionInput {
  machine: string;
  repo: string;
  agentTag: string;
  kitVersion: string | null;
  conversationId: string | null;
}

export interface OpenConnectionRow {
  id: string;
  machine: string;
  connectedat: Date;
  lastseenat: Date;
}

export function isLive(lastseenat: Date, now: Date): boolean {
  return now.getTime() - lastseenat.getTime() < LIVE_WINDOW_MS;
}

export interface OpenDecision {
  /** Rows to close before the new one is written, each with why. */
  close: { id: string; reason: AgentConnectionEndReason }[];
  /** A live connection from another machine: the open is refused and nothing is written. */
  conflict: OpenConnectionRow | null;
}

/**
 * FR-059: a stale row is closed `stale`; a row from this same machine is a restart after a crash and
 * is closed `replaced`; a live row from another machine refuses the open. Machine names compare
 * case-insensitively, because Windows reports host names in either case.
 */
export function decideOpen(open: OpenConnectionRow[], machine: string, now: Date): OpenDecision {
  const me = machine.trim().toLowerCase();
  const close: OpenDecision['close'] = [];
  for (const row of open) {
    if (!isLive(row.lastseenat, now)) {
      close.push({ id: row.id, reason: 'stale' });
    } else if (row.machine.trim().toLowerCase() === me) {
      close.push({ id: row.id, reason: 'replaced' });
    } else {
      return { close: [], conflict: row };
    }
  }
  return { close, conflict: null };
}
// [SCOPE 151 / T003] END

// [SCOPE 151 / T003] BEGIN — ProjectAgentConnectionService (FR-059 – FR-061)
// MODIFIED-BY [SCOPE 155 / T004] — heartbeat/close now carry+clear the rolling-summary columns (FR-003)
export type OpenResult =
  | { kind: 'opened'; connectionId: string; heartbeatSeconds: number }
  | { kind: 'conflict'; machine: string; connectedAt: Date; lastSeenAt: Date };

/** `closed` = the row exists for this project but has already ended (FR-060's 410). */
export type UpdateResult = 'ok' | 'not_found' | 'closed';

/** FR-003: the rolling session summary carried on a heartbeat. Overwrite-only; no history kept. */
export interface HeartbeatSummaryInput {
  summary?: string;
  lastEntry?: string;
  blockers?: string[];
  sharing?: boolean;
}

export interface ConnectionStore {
  /** The project's live room for this supervisor, or null when none is bound. */
  liveRoom(projectId: string, supervisor: string): Promise<string | null>;
  /**
   * In one transaction: lock the project's open rows, let `decide` choose, close what it says, and
   * insert the new row unless it reports a conflict.
   */
  open(
    projectId: string,
    input: OpenConnectionInput,
    now: Date,
    decide: (open: OpenConnectionRow[]) => OpenDecision,
  ): Promise<{ connectionId: string } | { conflict: OpenConnectionRow }>;
  heartbeat(
    connectionId: string,
    projectId: string,
    state: AgentConnectionState,
    summaryInput: HeartbeatSummaryInput | undefined,
    now: Date,
  ): Promise<UpdateResult>;
  close(connectionId: string, projectId: string, now: Date): Promise<UpdateResult>;
}

export class ProjectAgentConnectionService {
  constructor(private readonly store: ConnectionStore) {}

  async open(
    projectId: string,
    supervisor: string,
    input: Omit<OpenConnectionInput, 'conversationId'>,
    now: Date = new Date(),
  ): Promise<OpenResult> {
    const conversationId = await this.store.liveRoom(projectId, supervisor);
    const result = await this.store.open(projectId, { ...input, conversationId }, now, (open) =>
      decideOpen(open, input.machine, now),
    );
    if ('conflict' in result) {
      const c = result.conflict;
      return { kind: 'conflict', machine: c.machine, connectedAt: c.connectedat, lastSeenAt: c.lastseenat };
    }
    return { kind: 'opened', connectionId: result.connectionId, heartbeatSeconds: HEARTBEAT_SECONDS };
  }

  heartbeat(
    connectionId: string,
    projectId: string,
    state: AgentConnectionState,
    summaryInput?: HeartbeatSummaryInput,
    now: Date = new Date(),
  ): Promise<UpdateResult> {
    return this.store.heartbeat(connectionId, projectId, state, summaryInput, now);
  }

  close(connectionId: string, projectId: string, now: Date = new Date()): Promise<UpdateResult> {
    return this.store.close(connectionId, projectId, now);
  }
}
// [SCOPE 151 / T003] END

// [SCOPE 151 / T003] BEGIN — drizzle connection store
// MODIFIED-BY [SCOPE 155 / T004] — heartbeat/close now carry+clear the rolling-summary columns (FR-003)
/** Postgres unique_violation: a concurrent open won the one-open-row-per-project index. */
const UNIQUE_VIOLATION = '23505';

function isUniqueViolation(err: unknown): boolean {
  const e = err as { code?: unknown; cause?: { code?: unknown } } | null;
  return e?.code === UNIQUE_VIOLATION || e?.cause?.code === UNIQUE_VIOLATION;
}

const openColumns = {
  id: projectagentconnections.id,
  machine: projectagentconnections.machine,
  connectedat: projectagentconnections.connectedat,
  lastseenat: projectagentconnections.lastseenat,
};

async function rowState(connectionId: string, projectId: string): Promise<UpdateResult> {
  const [row] = await db
    .select({ disconnectedat: projectagentconnections.disconnectedat })
    .from(projectagentconnections)
    .where(and(eq(projectagentconnections.id, connectionId), eq(projectagentconnections.projectid, projectId)))
    .limit(1);
  if (!row) return 'not_found';
  return row.disconnectedat ? 'closed' : 'ok';
}

export const drizzleConnectionStore: ConnectionStore = {
  async liveRoom(projectId, supervisor) {
    const [row] = await db
      .select({ conversationid: projectrooms.conversationid })
      .from(projectrooms)
      .where(and(eq(projectrooms.projectid, projectId), eq(projectrooms.agentname, supervisor), isNull(projectrooms.retiredat)))
      .limit(1);
    return row?.conversationid ?? null;
  },

  async open(projectId, input, now, decide) {
    try {
      return await db.transaction(async (tx) => {
        const open = await tx
          .select(openColumns)
          .from(projectagentconnections)
          .where(and(eq(projectagentconnections.projectid, projectId), isNull(projectagentconnections.disconnectedat)))
          .for('update');
        const decision = decide(open);
        if (decision.conflict) return { conflict: decision.conflict };
        for (const c of decision.close) {
          await tx
            .update(projectagentconnections)
            .set({
              disconnectedat: now,
              endreason: c.reason,
              sessionsummary: null,
              lastentry: null,
              blockers: null,
              summaryat: null,
            })
            .where(eq(projectagentconnections.id, c.id));
        }
        const [row] = await tx
          .insert(projectagentconnections)
          .values({
            projectid: projectId,
            conversationid: input.conversationId,
            agenttag: input.agentTag,
            machine: input.machine,
            repo: input.repo,
            kitversion: input.kitVersion,
            state: 'idle',
            connectedat: now,
            lastseenat: now,
          })
          .returning({ id: projectagentconnections.id });
        return { connectionId: row.id };
      });
    } catch (err) {
      // Two agents opened at the same instant and the other one's insert landed first: answer as
      // the conflict it is, naming the machine that won.
      if (!isUniqueViolation(err)) throw err;
      const [winner] = await db
        .select(openColumns)
        .from(projectagentconnections)
        .where(and(eq(projectagentconnections.projectid, projectId), isNull(projectagentconnections.disconnectedat)))
        .orderBy(desc(projectagentconnections.connectedat))
        .limit(1);
      if (!winner) throw err;
      return { conflict: winner };
    }
  },

  async heartbeat(connectionId, projectId, state, summaryInput, now) {
    const set: Partial<typeof projectagentconnections.$inferInsert> = { lastseenat: now, state };
    if (summaryInput) {
      const { summary, lastEntry, blockers, sharing } = summaryInput;
      if (sharing === false) {
        // FR-003 sharing:false clear case — overwrite-only, drop whatever was carried.
        set.sharing = false;
        set.sessionsummary = null;
        set.lastentry = null;
        set.blockers = null;
        set.summaryat = null;
      } else {
        if (summary !== undefined) set.sessionsummary = summary;
        if (lastEntry !== undefined) set.lastentry = lastEntry;
        if (blockers !== undefined) set.blockers = blockers;
        if (summary !== undefined || lastEntry !== undefined || blockers !== undefined) set.summaryat = now;
        if (sharing !== undefined) set.sharing = sharing;
      }
    }
    const updated = await db
      .update(projectagentconnections)
      .set(set)
      .where(
        and(
          eq(projectagentconnections.id, connectionId),
          eq(projectagentconnections.projectid, projectId),
          isNull(projectagentconnections.disconnectedat),
        ),
      )
      .returning({ id: projectagentconnections.id });
    return updated.length > 0 ? 'ok' : rowState(connectionId, projectId);
  },

  async close(connectionId, projectId, now) {
    const updated = await db
      .update(projectagentconnections)
      .set({
        disconnectedat: now,
        endreason: 'stopped',
        sessionsummary: null,
        lastentry: null,
        blockers: null,
        summaryat: null,
      })
      .where(
        and(
          eq(projectagentconnections.id, connectionId),
          eq(projectagentconnections.projectid, projectId),
          isNull(projectagentconnections.disconnectedat),
        ),
      )
      .returning({ id: projectagentconnections.id });
    return updated.length > 0 ? 'ok' : rowState(connectionId, projectId);
  },
};

export const projectAgentConnectionService = new ProjectAgentConnectionService(drizzleConnectionStore);
// [SCOPE 151 / T003] END

// [SCOPE 154 / T009] BEGIN — missed-heartbeat alert from the connection record (FR-008, SCOPE-132 FR-099)
//
// Derived server-side from this same record, with one addition — `autopilotrunactive`
// (projectagentconnection.ts, T001) — so an active unattended run can be told apart from an idle
// agent connection without a second table. `lastStatusPostAt` (when the room last heard a status
// line, from whatever posts them — T008's heartbeat) is the caller's to supply; this module never
// reads the room itself.

/** How long a run may go without a status post before it counts as missed (FR-008). */
export const STATUS_POST_WINDOW_MS = 20 * 60_000;

export interface MissedHeartbeatCheck {
  live: boolean;
  autopilotRunActive: boolean;
  paused: boolean;
  lastStatusPostAt: Date | null;
}

/** FR-008: a paused or non-autopilot connection never raises. Otherwise: not live, or no status post for 20 minutes. */
export function isHeartbeatMissed(check: MissedHeartbeatCheck, now: Date): boolean {
  if (!check.autopilotRunActive || check.paused) return false;
  if (!check.live) return true;
  if (!check.lastStatusPostAt) return false;
  return now.getTime() - check.lastStatusPostAt.getTime() >= STATUS_POST_WINDOW_MS;
}

export interface OutageState {
  alerting: boolean;
}

export type OutageVerdict = 'none' | 'missed' | 'back';

/** One alert per outage, one "back" line on return (SC-40) — never a line on every poll. */
export function stepOutage(state: OutageState, missedNow: boolean): { state: OutageState; verdict: OutageVerdict } {
  if (missedNow && !state.alerting) return { state: { alerting: true }, verdict: 'missed' };
  if (!missedNow && state.alerting) return { state: { alerting: false }, verdict: 'back' };
  return { state, verdict: 'none' };
}

export function formatHeartbeatMissed(machine: string): string {
  return `Autopilot: no heartbeat from ${machine} — the run may have stopped.`;
}

export function formatHeartbeatBack(machine: string): string {
  return `Autopilot: ${machine} is posting again.`;
}
// [SCOPE 154 / T009] END

// [SCOPE 155 / T005] BEGIN — session status read (FR-004)
/** The REST route's and MCP tool's shared answer shape — no `director` (that is piece B, excluded). */
export type SessionLiveness = 'live' | 'stale' | 'gone';

export interface SessionStatus {
  summary: string | null;
  lastEntry: string | null;
  blockers: string[];
  state: AgentConnectionState | null;
  lastSeenAt: Date | null;
  liveness: SessionLiveness;
  sharing: boolean;
}

/** Derives liveness from the latest row alone — no second table, mirrors `isLive` above. */
function livenessOf(row: { disconnectedat: Date | null; lastseenat: Date }, now: Date): SessionLiveness {
  if (row.disconnectedat) return 'gone';
  return isLive(row.lastseenat, now) ? 'live' : 'stale';
}

const NO_CONNECTION_STATUS: SessionStatus = {
  summary: null,
  lastEntry: null,
  blockers: [],
  state: null,
  lastSeenAt: null,
  liveness: 'gone',
  sharing: false,
};

/**
 * FR-004: the open row when there is one, otherwise the latest closed one — same "open rows sort
 * first" rule `project.list_agent_connections` (SPEC-151 T005) already uses. `blockers` is stored
 * as `jsonb`; anything that is not an array of strings reads back as no blockers rather than throw,
 * since a malformed value here must never 500 a status read.
 */
export async function sessionStatus(projectId: string, now: Date = new Date()): Promise<SessionStatus> {
  const [row] = await db
    .select({
      sessionsummary: projectagentconnections.sessionsummary,
      lastentry: projectagentconnections.lastentry,
      blockers: projectagentconnections.blockers,
      sharing: projectagentconnections.sharing,
      state: projectagentconnections.state,
      lastseenat: projectagentconnections.lastseenat,
      disconnectedat: projectagentconnections.disconnectedat,
    })
    .from(projectagentconnections)
    .where(eq(projectagentconnections.projectid, projectId))
    .orderBy(desc(isNull(projectagentconnections.disconnectedat)), desc(projectagentconnections.connectedat))
    .limit(1);
  if (!row) return NO_CONNECTION_STATUS;

  const blockers = Array.isArray(row.blockers) && row.blockers.every((b) => typeof b === 'string') ? (row.blockers as string[]) : [];
  return {
    summary: row.sessionsummary,
    lastEntry: row.lastentry,
    blockers,
    state: row.state as AgentConnectionState,
    lastSeenAt: row.lastseenat,
    liveness: livenessOf(row, now),
    sharing: row.sharing,
  };
}
// [SCOPE 155 / T005] END
