/**
 * YappChatt broker calls for agent room binding. SCOPE-134 / T005, T007, T008.
 *
 * Extends the SCOPE-079 community broker's reach rather than adding a new secret
 * (FR-014): the same server-held WXKANBAN_CONSUMER_SECRET provisions a session for the
 * OPERATOR (OQ-5, decided 2026-09-25: the operator's own identity, not a service
 * account), and that session then acts in YappChatt exactly as the operator would in
 * the web app — list their groupings, create the room, mint the agent token.
 *
 * SCOPE-144 / T005 adds the company-chat consumer API (SPEC-144 contract C1, built in
 * YappChatt by SPEC-093): look up, create or link an account, the company group and its
 * members, company-owned project rooms and their members, and retiring a room.
 */
import { createLogger } from "./logger.js";

const logger = createLogger("yappchatt-broker");

// [SCOPE 134 / T005] BEGIN — YappChatt broker (operator session → room → agent token)
// MODIFIED-BY: [SCOPE 144 / T005] — error carries YappChatt's extra fields; call() takes PUT/PATCH/DELETE
export class YappchattBrokerError extends Error {
  constructor(
    /** YappChatt's own error code where one was returned, e.g. `not_a_member`. */
    readonly code: string,
    readonly status: number,
    message: string,
    /** YappChatt's other error fields, e.g. `{ missing }` on `seat_limit_reached`. */
    readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = "YappchattBrokerError";
  }
}

function baseUrl(): string {
  return (process.env.WXKANBAN_YAPPCHAT_BASE_URL || "https://www.yappchatt.com").replace(/\/$/, "");
}

async function call<T>(
  path: string,
  init: {
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
    session?: string;
    bearer?: string;
    body?: unknown;
  },
): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.session) headers.cookie = `yc_session=${init.session}`;
  if (init.bearer) headers.authorization = `Bearer ${init.bearer}`;

  const res = await fetch(`${baseUrl()}${path}`, {
    method: init.method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) {
    const code =
      json && typeof json === "object" && typeof (json as { error?: unknown }).error === "string"
        ? (json as { error: string }).error
        : "upstream_error";
    const details = json && typeof json === "object" ? (json as Record<string, unknown>) : {};
    throw new YappchattBrokerError(
      code,
      res.status,
      `YappChatt ${init.method} ${path} failed: ${res.status} ${code}`,
      details,
    );
  }
  return json as T;
}

/** Provision-or-login the operator by email; returns their raw session token. */
export async function operatorSession(email: string, displayName?: string): Promise<string> {
  const secret = process.env.WXKANBAN_CONSUMER_SECRET;
  if (!secret) {
    throw new YappchattBrokerError("not_configured", 503, "WXKANBAN_CONSUMER_SECRET is not configured");
  }
  const r = await call<{ sessionToken?: string }>("/api/consumer/session", {
    method: "POST",
    bearer: secret,
    body: { email, displayName },
  });
  if (!r?.sessionToken) {
    throw new YappchattBrokerError("no_session", 502, "YappChatt returned no session token");
  }
  return r.sessionToken;
}

/**
 * The operator's `projects` grouping, created if they have none.
 *
 * A room must be filed under a grouping the creator owns (YappChatt's
 * `requireOwnGrouping`), and that id cannot be derived from anything wxKanban holds. It
 * CAN be looked up, which beats making it a per-account setting someone has to paste.
 */
export async function ensureProjectsGrouping(session: string): Promise<string> {
  const listed = await call<{ groupings?: Array<{ id: string; type: string }> }>("/api/chat-groupings", {
    method: "GET",
    session,
  });
  const existing = listed?.groupings?.find((g) => g.type === "projects");
  if (existing) return existing.id;

  try {
    const created = await call<{ grouping?: { id: string } }>("/api/chat-groupings", {
      method: "POST",
      session,
      body: { name: "Projects", type: "projects" },
    });
    if (created?.grouping?.id) return created.grouping.id;
  } catch (err) {
    // A general grouping already named "Projects" blocks the create with 409. Refuse
    // plainly rather than guess at another name.
    if (err instanceof YappchattBrokerError && err.code === "duplicate_name") {
      throw new YappchattBrokerError(
        "grouping_conflict",
        409,
        'The operator has a YappChatt grouping named "Projects" that is not of type projects. Change its type, or create a projects-type grouping.',
      );
    }
    throw err;
  }
  throw new YappchattBrokerError("no_grouping", 502, "YappChatt returned no grouping id");
}

/** Create a solo room under the grouping. A solo room REQUIRES a title (`name_required`). */
export async function createRoom(session: string, groupingid: string, title: string): Promise<string> {
  const r = await call<{ conversationid?: string }>("/api/chats", {
    method: "POST",
    session,
    body: { groupingid, title },
  });
  if (!r?.conversationid) {
    throw new YappchattBrokerError("no_room", 502, "YappChatt returned no conversationid");
  }
  return r.conversationid;
}

/**
 * Mint a `yca_` agent token for the room. YappChatt INSERTS a new live token per call
 * and never revokes, so callers mint only when the agent has no copy (FR-015).
 *
 * `not_a_member` (404) means the operator is not in that room. That is surfaced as-is,
 * never retried (FR-016): no amount of retrying makes someone a member.
 */
export async function mintAgentToken(session: string, conversationid: string): Promise<string> {
  const r = await call<{ token?: string }>(`/api/chats/${encodeURIComponent(conversationid)}/agent`, {
    method: "POST",
    session,
    body: {},
  });
  if (!r?.token) {
    throw new YappchattBrokerError("no_token", 502, "YappChatt returned no agent token");
  }
  logger.info({ conversationid }, "yca agent token minted");
  return r.token;
}
// [SCOPE 134 / T005] END

// [SCOPE 144 / T005] BEGIN — YappChatt consumer API client (contract C1)
/** The one code every caller reports when the companion is missing (contract C1, FR-011). */
export const COMPANION_UNAVAILABLE = "companion_unavailable";

/**
 * The 404 codes the companion itself sends (contract C1). Any other 404 — a Next.js
 * "page not found", typically — means the route is not deployed, which is "companion
 * not available", never a real not-found.
 */
const COMPANION_404_CODES: ReadonlySet<string> = new Set(["user_not_found", "org_not_found", "room_not_found"]);

export function isCompanionUnavailable(err: unknown): boolean {
  return err instanceof YappchattBrokerError && err.code === COMPANION_UNAVAILABLE;
}

function companionUnavailable(reason: string): YappchattBrokerError {
  return new YappchattBrokerError(COMPANION_UNAVAILABLE, 503, `YappChatt companion not available: ${reason}`);
}

/**
 * One consumer-API call behind WXKANBAN_CONSUMER_SECRET. A missing secret, a network
 * failure, or an unknown 404 all become `companion_unavailable`, before anything local
 * changes, so no caller half-completes (FR-011).
 */
async function consumerCall<T>(
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const secret = process.env.WXKANBAN_CONSUMER_SECRET;
  if (!secret) throw companionUnavailable("WXKANBAN_CONSUMER_SECRET is not configured");
  try {
    return await call<T>(path, { method, bearer: secret, body });
  } catch (err) {
    if (err instanceof YappchattBrokerError) {
      if (err.status === 404 && !COMPANION_404_CODES.has(err.code)) {
        throw companionUnavailable(`${method} ${path} is not deployed`);
      }
      throw err;
    }
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ method, path, message }, "YappChatt consumer API unreachable");
    throw companionUnavailable("YappChatt could not be reached");
  }
}

const seg = (id: string): string => encodeURIComponent(id);

export type CompanyGroupRole = "admin" | "member";

/** C1.0 — read-only lookup by email (D5): the account a link would reach. Changes nothing. */
export async function consumerLookupAccount(
  email: string,
): Promise<{ exists: boolean; userid: string | null; displayName: string | null }> {
  return consumerCall("GET", `/api/consumer/accounts?email=${encodeURIComponent(email)}`);
}

/** C1.1 — create or link an account by email. `created: true` means YappChatt sent the welcome email. */
export async function consumerAccount(
  email: string,
  displayName?: string,
): Promise<{ userid: string; created: boolean }> {
  return consumerCall("POST", "/api/consumer/accounts", { email, displayName });
}

/** C1.2 — the company group, owned by the company account. `seatlimit: null` = unlimited. */
export async function consumerCreateGroup(
  ownerUserid: string,
  name: string,
  seatlimit: number | null,
): Promise<{ orgid: string }> {
  return consumerCall("POST", "/api/consumer/groups", { ownerUserid, name, seatlimit });
}

/** C1.3 — change the group's seat limit. */
export async function consumerSetGroupSeatlimit(
  orgid: string,
  seatlimit: number | null,
): Promise<{ orgid: string; seatlimit: number | null }> {
  return consumerCall("PATCH", `/api/consumer/groups/${seg(orgid)}`, { seatlimit });
}

/** C1.4 — add a group member directly, or re-role one. Same role again → `added: false`. */
export async function consumerPutGroupMember(
  orgid: string,
  userid: string,
  role: CompanyGroupRole,
): Promise<{ orgid: string; userid: string; role: CompanyGroupRole; added: boolean }> {
  return consumerCall("PUT", `/api/consumer/groups/${seg(orgid)}/members/${seg(userid)}`, { role });
}

/** C1.5 — remove a group member. A non-member → `removed: false`. */
export async function consumerRemoveGroupMember(orgid: string, userid: string): Promise<{ removed: boolean }> {
  return consumerCall("DELETE", `/api/consumer/groups/${seg(orgid)}/members/${seg(userid)}`);
}

/** C1.6 — a project room owned by `ownerUserid`, with its members added directly. */
export async function consumerCreateRoom(
  ownerUserid: string,
  title: string,
  memberIds: string[],
): Promise<{ conversationid: string }> {
  return consumerCall("POST", "/api/consumer/rooms", { ownerUserid, title, memberIds });
}

/** C1.7 — add a room member. */
export async function consumerAddRoomMember(conversationid: string, userid: string): Promise<{ added: boolean }> {
  return consumerCall("PUT", `/api/consumer/rooms/${seg(conversationid)}/members/${seg(userid)}`);
}

/** C1.8 — remove a room member. A non-member → `removed: false`; the owner → 409 `owner_protected`. */
export async function consumerRemoveRoomMember(
  conversationid: string,
  userid: string,
): Promise<{ removed: boolean }> {
  return consumerCall("DELETE", `/api/consumer/rooms/${seg(conversationid)}/members/${seg(userid)}`);
}

/** C1.9 — retire a room: hidden from members, history kept for the owner. Idempotent. */
export async function consumerRetireRoom(conversationid: string): Promise<{ retired: true; retiredat: string }> {
  return consumerCall("POST", `/api/consumer/rooms/${seg(conversationid)}/retire`);
}
// [SCOPE 144 / T005] END
