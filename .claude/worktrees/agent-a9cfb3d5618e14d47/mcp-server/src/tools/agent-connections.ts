// [SCOPE 151 / T005] BEGIN — project.list_agent_connections (SCOPE-132 Amendment D, FR-062)
//
// KAIN asks this to learn which project agents are connected now, from which machine and repo, and
// what each is doing, with no project folder on hand. Who sees what is decided by the TOKEN, never
// by the request:
//
//   KAIN token (minted by /api/agent/connect, name `agent-grant:<agent>`)
//       every project of the token's company that allows remote
//   any other token
//       its own project only
//
// Never another company's projects. The table is read with explicit SQL, because this server's
// schema mirror is partial (an undeclared column would read `undefined` silently).
import { z } from 'zod';
import { sql } from 'drizzle-orm';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import type { ScopedDb } from '../db/scoped-query.js';
import { AGENT_GRANT_TOKEN_PREFIX } from '../middleware/auth.js';
import { agentReach, parseAgentTokenName } from '../utils/agent-reach.js'; // [SCOPE 152 / T007]

export const LIST_AGENT_CONNECTIONS_TOOL = 'project.list_agent_connections';

/** FR-058: an open record not seen for this long is not live. Matches the app's LIVE_WINDOW_MS. */
export const LIVE_WINDOW_SECONDS = 180;

export const ListAgentConnectionsInputSchema = z
  .object({
    // The server's project resolver fills in BOTH spellings for every project-scoped tool.
    projectId: z.string().uuid().optional(),
    projectid: z.string().uuid().optional(),
    includeHistory: z.boolean().optional(),
    historyHours: z.number().int().min(1).max(168).optional(),
  })
  .strict();

export const LIST_AGENT_CONNECTIONS_TOOL_DEF = {
  name: LIST_AGENT_CONNECTIONS_TOOL,
  description:
    "Which project agents are connected right now: for each project, its room (conversationId), whether its agent is live, and the open or latest connection's machine, repo, tag, kit version, state (idle | working | waiting) and times. A KAIN token sees every project of its company that allows remote; any other token sees its own project only. Live = open and seen within the last 3 minutes. includeHistory adds the closed connections of the last historyHours (default 24).",
  inputSchema: {
    type: 'object',
    properties: {
      projectId: { type: 'string', format: 'uuid', description: "Optional; must be the token's project. The token decides what is listed." },
      includeHistory: { type: 'boolean', description: 'Also list closed connections (default false)' },
      historyHours: { type: 'number', minimum: 1, maximum: 168, description: 'How far back includeHistory looks (default 24)' },
    },
  },
} as const;

interface ConnectionRow {
  projectid: string;
  id: string;
  agenttag: string;
  machine: string;
  repo: string;
  kitversion: string | null;
  state: string;
  connectedat: unknown;
  lastseenat: unknown;
  disconnectedat: unknown;
  endreason: string | null;
  live: boolean;
}

function rowsOf<T>(r: unknown): T[] {
  return ((r as { rows?: T[] }).rows ?? []) as T[];
}

function iso(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const d = v instanceof Date ? v : new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

function shape(c: ConnectionRow) {
  return {
    connectionId: c.id,
    machine: c.machine,
    repo: c.repo,
    agentTag: c.agenttag,
    kitVersion: c.kitversion,
    state: c.state,
    connectedAt: iso(c.connectedat),
    lastSeenAt: iso(c.lastseenat),
    disconnectedAt: iso(c.disconnectedat),
    endReason: c.endreason,
    live: c.live === true,
  };
}

export async function handleListAgentConnections(args: Record<string, unknown>, scoped: ScopedDb) {
  const input = ListAgentConnectionsInputSchema.parse(args);
  const projectId = scoped.scope.projectId;
  if (!projectId) {
    throw new McpError(ErrorCode.InvalidParams, 'list_agent_connections needs a project-scoped token. Not available under dev-bypass.');
  }
  const asked = [input.projectId, input.projectid].filter((v): v is string => Boolean(v));
  if (asked.some((v) => v.toLowerCase() !== projectId.toLowerCase())) {
    throw new McpError(ErrorCode.InvalidParams, "projectId must be the token's own project. The token decides what is listed.");
  }

  // MODIFIED-BY: [SCOPE 152 / T007] — a K.A.I.N. token lists the signed-in person's reach, across companies
  const tokenName = scoped.scope.tokenName ?? '';
  const agentToken = parseAgentTokenName(tokenName, AGENT_GRANT_TOKEN_PREFIX);
  const agentName = agentToken?.agentName ?? null;

  // The visible projects. A K.A.I.N. token sees every Project in its person's reach (agentReach:
  // own company plus engagement-assigned, Allow remote on) — decided from the database, never from
  // the request. Any other token sees its own project only.
  const reach = agentToken && scoped.scope.userId ? await agentReach(scoped.raw, scoped.scope.userId) : [];
  const projects: Array<{ id: string; name: string; companyId: string | null; companyName: string | null; via: string | null }> =
    agentToken
      ? reach.map((p) => ({ id: p.projectId, name: p.projectName, companyId: p.companyId, companyName: p.companyName, via: p.via }))
      : rowsOf<{ id: string; name: string }>(
          await scoped.raw.execute(sql`SELECT p.id, p.name FROM companyprojects p WHERE p.id = ${projectId}`),
        ).map((p) => ({ ...p, companyId: null, companyName: null, via: null }));
  const ids = projects.map((p) => p.id);
  if (ids.length === 0) {
    return { scope: agentToken ? 'reach' : 'project', liveWindowSeconds: LIVE_WINDOW_SECONDS, counts: { projects: 0, live: 0 }, projects: [] };
  }
  const idList = sql.join(ids.map((id) => sql`${id}::uuid`), sql`, `);

  const rooms = rowsOf<{ projectid: string; conversationid: string }>(
    await scoped.raw.execute(sql`
      SELECT DISTINCT ON (r.projectid) r.projectid, r.conversationid
        FROM projectrooms r
       WHERE r.projectid IN (${idList})
         AND r.retiredat IS NULL
         ${agentName ? sql`AND r.agentname = ${agentName}` : sql``}
       ORDER BY r.projectid, r.createdat DESC`),
  );

  // The open row when there is one, otherwise the latest closed one: open rows sort first.
  const latest = rowsOf<ConnectionRow>(
    await scoped.raw.execute(sql`
      SELECT DISTINCT ON (c.projectid)
             c.projectid, c.id, c.agenttag, c.machine, c.repo, c.kitversion, c.state,
             c.connectedat, c.lastseenat, c.disconnectedat, c.endreason,
             (c.disconnectedat IS NULL AND c.lastseenat > now() - make_interval(secs => ${LIVE_WINDOW_SECONDS})) AS live
        FROM projectagentconnections c
       WHERE c.projectid IN (${idList})
       ORDER BY c.projectid, (c.disconnectedat IS NULL) DESC, c.connectedat DESC`),
  );

  const history = input.includeHistory
    ? rowsOf<ConnectionRow>(
        await scoped.raw.execute(sql`
          SELECT c.projectid, c.id, c.agenttag, c.machine, c.repo, c.kitversion, c.state,
                 c.connectedat, c.lastseenat, c.disconnectedat, c.endreason, false AS live
            FROM projectagentconnections c
           WHERE c.projectid IN (${idList})
             AND c.disconnectedat IS NOT NULL
             AND c.connectedat > now() - make_interval(hours => ${input.historyHours ?? 24})
           ORDER BY c.connectedat DESC
           LIMIT 500`),
      )
    : [];

  const roomOf = new Map(rooms.map((r) => [r.projectid, r.conversationid]));
  const latestOf = new Map(latest.map((c) => [c.projectid, c]));
  const out = projects.map((p) => {
    const c = latestOf.get(p.id);
    return {
      projectId: p.id,
      projectName: p.name,
      ...(agentToken ? { companyId: p.companyId, companyName: p.companyName, via: p.via } : {}),
      conversationId: roomOf.get(p.id) ?? null,
      live: c?.live === true,
      connection: c ? shape(c) : null,
      ...(input.includeHistory ? { history: history.filter((h) => h.projectid === p.id).map(shape) } : {}),
    };
  });

  return {
    scope: agentToken ? 'reach' : 'project',
    liveWindowSeconds: LIVE_WINDOW_SECONDS,
    counts: { projects: out.length, live: out.filter((p) => p.live).length },
    projects: out,
  };
}
// [SCOPE 151 / T005] END
