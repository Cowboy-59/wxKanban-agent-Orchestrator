// [SCOPE 155 / T006] BEGIN — project.get_session_status (SCOPE-132 Amendment G piece A, FR-004)
//
// The MCP twin of GET /api/agent/projects/:projectId/status (src/server/routes/agentConnect.ts).
// Same shape, same rule: reach-checked via agentReach (a K.A.I.N. token only — this is a per-person
// device grant, not a project token's own project), and one `agent.status.read` companyauditlogs
// row per call. The status itself is already masked/capped at the column (T001) and reused here
// (T005's `sharing` gate is re-applied, since this server cannot import that service).
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ScopedDb } from '../db/scoped-query.js';
import { companyauditlogs } from '../db/schema.js';
import { AGENT_GRANT_TOKEN_PREFIX } from '../middleware/auth.js';
import { findInAgentReach, parseAgentTokenName } from '../utils/agent-reach.js';

export const GET_SESSION_STATUS_TOOL = 'project.get_session_status';

/** FR-004: an open record not seen for this long is stale. Matches the app's LIVE_WINDOW_MS. */
export const LIVE_WINDOW_SECONDS = 180;

export const GetSessionStatusInputSchema = z
  .object({
    projectId: z.string().uuid().optional(),
    projectid: z.string().uuid().optional(),
  })
  .strict();

export const GET_SESSION_STATUS_TOOL_DEF = {
  name: GET_SESSION_STATUS_TOOL,
  description:
    "This project's K.A.I.N. session status: summary, last entry, blockers, state (idle | working | waiting), last-seen time, liveness (live | stale | gone), director (always null here — reserved for a future mailbox feature, piece B, not yet built) and whether the project is sharing status. Only available to a K.A.I.N. device token, and only for a project in that person's reach (own company or an active engagement, allow-remote on) — any other project answers not_granted. summary/lastEntry/blockers read null/empty when the project's sharing setting is off, even in reach. Writes one agent.status.read audit row per call.",
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid', description: 'The project to read status for.' },
    },
    required: ['projectId'],
  },
} as const;

interface StatusRow {
  sessionsummary: string | null;
  lastentry: string | null;
  blockers: unknown;
  sharing: boolean;
  state: string;
  lastseenat: unknown;
  disconnectedat: unknown;
}

function rowsOf<T>(r: unknown): T[] {
  return ((r as { rows?: T[] }).rows ?? []) as T[];
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function livenessOf(row: StatusRow): 'live' | 'stale' | 'gone' {
  if (row.disconnectedat !== null) return 'gone';
  const seen = row.lastseenat instanceof Date ? row.lastseenat : new Date(String(row.lastseenat));
  const ageSeconds = (Date.now() - seen.getTime()) / 1000;
  return ageSeconds <= LIVE_WINDOW_SECONDS ? 'live' : 'stale';
}

function blockersOf(v: unknown): string[] {
  return Array.isArray(v) && v.every((b) => typeof b === 'string') ? (v as string[]) : [];
}

export async function handleGetSessionStatus(args: Record<string, unknown>, scoped: ScopedDb) {
  const input = GetSessionStatusInputSchema.parse(args);
  const projectId = input.projectId ?? input.projectid;
  if (!projectId) {
    throw new McpError(ErrorCode.InvalidParams, 'get_session_status needs { projectId }.');
  }

  const tokenName = scoped.scope.tokenName ?? '';
  const agentToken = parseAgentTokenName(tokenName, AGENT_GRANT_TOKEN_PREFIX);
  const userId = scoped.scope.userId;
  if (!agentToken || !userId) {
    throw new McpError(ErrorCode.InvalidParams, 'get_session_status needs a K.A.I.N. device token.');
  }

  const reached = await findInAgentReach(scoped.raw, userId, projectId);
  if (!reached) {
    throw new McpError(ErrorCode.InvalidRequest, 'not_granted: this K.A.I.N. device has not been granted this project.');
  }

  const [row] = rowsOf<StatusRow>(
    await scoped.raw.execute(sql`
      SELECT c.sessionsummary, c.lastentry, c.blockers, c.sharing, c.state, c.lastseenat, c.disconnectedat
        FROM projectagentconnections c
       WHERE c.projectid = ${projectId}::uuid
       ORDER BY (c.disconnectedat IS NULL) DESC, c.connectedat DESC
       LIMIT 1`),
  );

  await scoped.raw.insert(companyauditlogs).values({
    companyid: reached.companyId,
    action: 'agent.status.read',
    changedby: userId,
    newvalue: { projectId, agentName: agentToken.agentName, deviceId: agentToken.deviceId },
    description: `K.A.I.N. read session status for "${reached.projectName}" from device "${agentToken.deviceId}".`,
  });

  if (!row) {
    return {
      success: true,
      summary: null,
      lastEntry: null,
      blockers: [],
      state: null,
      lastSeenAt: null,
      liveness: 'gone',
      director: null, // reserved for piece B (mailbox), FR-084 — out of scope here (D-0100)
      sharing: false,
    };
  }

  const sharing = row.sharing === true;
  return {
    success: true,
    summary: sharing ? row.sessionsummary : null,
    lastEntry: sharing ? row.lastentry : null,
    blockers: sharing ? blockersOf(row.blockers) : [],
    state: row.state,
    lastSeenAt: iso(row.lastseenat),
    liveness: livenessOf(row),
    director: null, // reserved for piece B (mailbox), FR-084 — out of scope here (D-0100)
    sharing,
  };
}
// [SCOPE 155 / T006] END
