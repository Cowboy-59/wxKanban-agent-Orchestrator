import type { NextFunction, Request, Response } from "express";
import { eq } from "drizzle-orm";
import type { AnyPgColumn, PgTable } from "drizzle-orm/pg-core";
import { db } from "~/db/client.js";
import { companyauditlogs } from "~/db/schema/companyauditlog.js";
import type { AuthRequest } from "./auth.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("sysadmin-audit");

// [SCOPE 147 / T002] BEGIN — the shape of one SysAdmin write registry entry (FR-002)
/**
 * How the audit loads the row a route changes, so it can record before and after state.
 * `column` is matched against the route parameter named by `param` (default "id").
 */
export type AuditLookup = {
  table: PgTable;
  column: AnyPgColumn;
  param?: string;
  /** Column holding a human-readable name for the target, when the row has one. */
  nameColumn?: string;
};

/**
 * update  changed fields before → after (lookup loaded on both sides)
 * create  after only (the created row from the response body)
 * delete  before only (lookup loaded before the handler runs)
 * bulk    the ids named by `idsField` in the request body, and their count
 * action  a state-changing operation with no single row to diff (send, resync, reset): the
 *         target and the request parameters are recorded; before/after only when `lookup` is set
 */
export type AuditKind = "update" | "create" | "delete" | "bulk" | "action";

export type SysAdminWriteEntry =
  | {
      action: string; // sysadmin_<entity>_<verb>
      kind: AuditKind;
      targetType: string; // company | user | setting | feedback | doc | invitation | newsletter | ...
      lookup?: AuditLookup;
      idsField?: string; // bulk only
    }
  | { readOnly: string }; // a POST that stores nothing — the reason is required

/** Registry keyed "METHOD /full/path" exactly as mounted, e.g. "PATCH /api/sysadmin/companies/:id/status". */
export type SysAdminWriteRegistry = Readonly<Record<string, SysAdminWriteEntry>>;
// [SCOPE 147 / T002] END

// [SCOPE 147 / T003] BEGIN — secrets never reach the audit log (FR-004)
/**
 * A field is redacted when its name (lower-cased, separators removed) CONTAINS any of these, so
 * variants such as rawToken, inviteToken, newPassword or stripeApiKey are caught without listing
 * each one. registerlink carries a one-time invite token inside its URL.
 */
export const REDACTED_KEYS = Object.freeze([
  "password", "token", "secret", "apikey", "privatekey", "credential", "encryptedvalue", "registerlink",
]);
/** Setting names whose value is a credential; their value is redacted whatever the field is called. */
const SECRET_SETTING_NAME = /(secret|token|password|apikey|api_key|private|credential|key$)/i;

export function isSecretSettingName(name: unknown): boolean {
  return typeof name === "string" && SECRET_SETTING_NAME.test(name);
}

/**
 * `secretValue` is set by the caller when the recorded row belongs to a secret setting (the setting
 * name usually arrives as a route parameter, not inside the object), so every value field is
 * redacted too.
 */
export function redactForAudit(value: unknown, opts: { secretValue?: boolean } = {}, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => redactForAudit(v, opts, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    const obj = value as Record<string, unknown>;
    const secretValue = opts.secretValue === true || isSecretSettingName(obj.key);
    for (const [k, v] of Object.entries(obj)) {
      const lower = k.toLowerCase().replace(/[_-]/g, "");
      if (REDACTED_KEYS.some((r) => lower.includes(r))) out[k] = "[REDACTED]";
      else if (secretValue && (lower === "value" || lower === "settingvalue")) out[k] = "[REDACTED]";
      else out[k] = redactForAudit(v, { secretValue }, depth + 1);
    }
    return out;
  }
  if (typeof value === "string" && value.length > 2000) return `${value.slice(0, 2000)}…[truncated]`;
  return value;
}
// [SCOPE 147 / T003] END

// [SCOPE 147 / T002] BEGIN — match a request to its registry entry
type Compiled = { key: string; method: string; parts: string[]; params: number; entry: SysAdminWriteEntry };

function compile(registry: SysAdminWriteRegistry): Compiled[] {
  return Object.entries(registry)
    .map(([key, entry]) => {
      const [method, path] = key.split(" ");
      const parts = path.split("/").filter(Boolean);
      return { key, method, parts, params: parts.filter((p) => p.startsWith(":")).length, entry };
    })
    // literal routes win over parameterised ones that could also match
    .sort((a, b) => a.params - b.params || b.parts.length - a.parts.length);
}

export function matchRegistry(
  compiled: Compiled[],
  method: string,
  path: string,
): { key: string; entry: SysAdminWriteEntry; params: Record<string, string> } | null {
  const segs = path.split("?")[0].split("/").filter(Boolean);
  for (const c of compiled) {
    if (c.method !== method || c.parts.length !== segs.length) continue;
    const params: Record<string, string> = {};
    let ok = true;
    for (let i = 0; i < segs.length; i++) {
      const p = c.parts[i];
      if (p.startsWith(":")) params[p.slice(1)] = decodeURIComponent(segs[i]);
      else if (p !== segs[i]) { ok = false; break; }
    }
    if (ok) return { key: c.key, entry: c.entry, params };
  }
  return null;
}
// [SCOPE 147 / T002] END

// [SCOPE 147 / T002] BEGIN — before/after state of the row a route changes (FR-003)
async function loadRow(lookup: AuditLookup, params: Record<string, string>): Promise<Record<string, unknown> | null> {
  const value = params[lookup.param ?? "id"];
  if (value === undefined) return null;
  try {
    const rows = (await db.select().from(lookup.table).where(eq(lookup.column, value)).limit(1)) as Record<string, unknown>[];
    return rows[0] ?? null;
  } catch (error) {
    logger.warn({ error, param: lookup.param ?? "id" }, "SysAdmin audit could not load the target row");
    return null;
  }
}

/** Only the fields that changed, each side redacted. */
export function changedFields(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
  opts: { secretValue?: boolean } = {},
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const k of keys) {
    if (k === "updatedat") continue;
    const bv = before?.[k];
    const av = after?.[k];
    if (JSON.stringify(bv) !== JSON.stringify(av)) {
      b[k] = bv ?? null;
      a[k] = av ?? null;
    }
  }
  return { before: redactForAudit(b, opts) as Record<string, unknown>, after: redactForAudit(a, opts) as Record<string, unknown> };
}

/**
 * The created row inside a create response. Routes answer { data }, a named wrapper such as
 * { issue }, { doc }, { banner, link }, or the row itself — take the first object that has an id.
 */
export function createdRow(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.data && typeof b.data === "object") return b.data as Record<string, unknown>;
  if (typeof b.id === "string") return b;
  for (const v of Object.values(b)) {
    if (v && typeof v === "object" && !Array.isArray(v) && typeof (v as Record<string, unknown>).id === "string") {
      return v as Record<string, unknown>;
    }
  }
  return b;
}
// [SCOPE 147 / T002] END

// [SCOPE 147 / T002] BEGIN — one durable row per successful SysAdmin change (FR-001, FR-005)
type RowInput = {
  companyid: string;
  changedby: string | null;
  action: string;
  previousvalue: Record<string, unknown> | null;
  newvalue: Record<string, unknown>;
  description: string;
};

/** The single write. Never throws: the change already happened; a failed record is an error-level log line. */
export async function writeSysAdminRecord(row: RowInput): Promise<void> {
  try {
    await db.insert(companyauditlogs).values(row);
  } catch (error) {
    logger.error({ error, action: row.action, target: row.newvalue.target }, "SysAdmin action NOT recorded in companyauditlogs");
  }
}

/**
 * Mounted once at app.use("/api/sysadmin", ...) ahead of every SysAdmin router. For a registered
 * write it loads the before-state, lets the route run, and on a 2xx finish writes one row filed
 * under the acting SysAdmin's company. Unregistered paths and readOnly entries pass straight through.
 */
export function sysAdminAudit(registry: SysAdminWriteRegistry) {
  const compiled = compile(registry);
  return async function sysAdminAuditMiddleware(req: Request, res: Response, next: NextFunction): Promise<void> {
    const found = matchRegistry(compiled, req.method, `${req.baseUrl}${req.path}`);
    if (!found || "readOnly" in found.entry) {
      next();
      return;
    }
    const { entry, params, key } = found;
    const before = entry.lookup && entry.kind !== "create" ? await loadRow(entry.lookup, params) : null;

    let responseBody: unknown = null;
    const json = res.json.bind(res);
    res.json = (body: unknown) => {
      responseBody = body;
      return json(body);
    };

    res.on("finish", () => {
      const a = req as AuthRequest;
      if (res.statusCode < 200 || res.statusCode >= 300 || a.usertype !== "SYSADMIN") return;
      void (async () => {
        if (!a.companyid) {
          logger.error({ action: entry.action, userid: a.userid }, "SysAdmin action NOT recorded: caller has no company");
          return;
        }
        const body = (req.body ?? {}) as Record<string, unknown>;
        const secret = { secretValue: isSecretSettingName(params.key) || isSecretSettingName(body.key) };
        let previousvalue: Record<string, unknown> | null = null;
        let state: Record<string, unknown> = {};
        let targetId: string | null = params[entry.lookup?.param ?? "id"] ?? params.key ?? null;
        let targetName: unknown = null;

        if (entry.kind === "update" || (entry.kind === "action" && entry.lookup)) {
          const after = entry.lookup ? await loadRow(entry.lookup, params) : null;
          const diff = changedFields(before, after, secret);
          previousvalue = diff.before;
          state = { after: diff.after };
          targetName = entry.lookup?.nameColumn ? (after ?? before)?.[entry.lookup.nameColumn] ?? null : null;
        } else if (entry.kind === "delete") {
          previousvalue = redactForAudit(before, secret) as Record<string, unknown> | null;
          targetName = entry.lookup?.nameColumn ? before?.[entry.lookup.nameColumn] ?? null : null;
        } else if (entry.kind === "create") {
          const created = createdRow(responseBody);
          state = { after: redactForAudit(created, secret) };
          targetId = (created?.id as string | undefined) ?? targetId;
          targetName = entry.lookup?.nameColumn ? created?.[entry.lookup.nameColumn] ?? null : null;
        } else if (entry.kind === "bulk") {
          const ids = entry.idsField ? body[entry.idsField] : null;
          state = { ids: Array.isArray(ids) ? ids : [], count: Array.isArray(ids) ? ids.length : 0 };
        }
        if (entry.kind === "action") state = { ...state, request: redactForAudit({ params, body }, secret) };

        await writeSysAdminRecord({
          companyid: a.companyid,
          changedby: a.userid ?? null,
          action: entry.action,
          previousvalue,
          newvalue: {
            target: { type: entry.targetType, id: targetId, name: targetName ?? null },
            route: { method: req.method, path: key.split(" ")[1] },
            ...state,
          },
          description: `${entry.action} ${entry.targetType}${targetId ? ` ${targetId}` : ""}`,
        });
      })();
    });
    next();
  };
}
// [SCOPE 147 / T002] END
