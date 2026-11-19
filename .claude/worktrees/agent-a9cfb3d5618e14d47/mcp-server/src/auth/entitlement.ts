/**
 * Customer entitlement gate (fail-closed).
 *
 * Every MCP CallTool request from a real token is checked here: the token's
 * customer must have an active wxKanban subscription. This is the only DURABLE
 * IP-protection control — the kit's valuable logic runs server-side behind these
 * tools, so a copied kit with no entitlement gets nothing.
 *
 * Policy (owner decision): allow ACTIVE + TRIAL; block SUSPENDED/CANCELLED/PENDING.
 * billingexempt customers (internal / kit-author) always pass.
 *
 * Skipped under dev-bypass (no token). A short in-process TTL cache avoids a DB
 * hit on every call. On an unexpected DB error we fail OPEN (degraded) and log
 * loudly: the token was already validated upstream, so a DB blip must not lock
 * out every paying customer.
 */
import { eq } from 'drizzle-orm';
import { db } from '../db/connection.js';
import { companies } from '../db/schema.js';
import logger from '../utils/logger.js';

export interface EntitlementResult {
  allowed: boolean;
  status: string | null;
  reason?: string;
  code?: 'subscription-inactive' | 'entitlement-unknown' | 'entitlement-degraded';
}

export interface CompanyEntitlementRow {
  status: string | null;
  active: boolean | null;
  exempt: boolean | null;
}

/** Subscription states permitted to run the kit. */
export const ALLOWED_STATUSES: ReadonlySet<string> = new Set(['ACTIVE', 'TRIAL']);

/** Tools a lapsed customer may still call, so they can diagnose and recover. */
export const ENTITLEMENT_EXEMPT_TOOLS: ReadonlySet<string> = new Set([
  'project.help',
  'project.mcp_health',
  'project.kit_status',
  'project.check_for_updates',
  'project.list_api_tokens',
  'project.get_entitlement', // Phase 1B — must be reachable to report the lapsed state
  // [SCOPE 090 / T010] SPEC-090 Amendment A FR-011. Both are read-only, and both
  // are how a lapsed customer finds out they are lapsed. Gating them meant the
  // editor session failed at its first call with nothing left working to explain
  // why — the user saw a broken tool, not an unpaid invoice.
  'project.session_start',
  'project.cockpit_summary',
]);

// [SCOPE 090 / T010] SPEC-090 Amendment A FR-012. Configurable because the old
// hard-coded value (https://wxperts.com/account/billing) pointed at a route the
// application does not define, so every lapsed customer was sent to a dead link.
const REMEDIATION_URL =
  process.env.WXKANBAN_BILLING_URL || 'https://wxkanban.com/admin/billing';

export function isEntitlementExempt(toolName: string): boolean {
  return ENTITLEMENT_EXEMPT_TOOLS.has(toolName);
}

/**
 * Pure decision over a loaded row. Exposed for unit testing the truth table
 * without a database.
 */
export function evaluateEntitlementRow(row: CompanyEntitlementRow | null): EntitlementResult {
  if (!row) {
    return {
      allowed: false,
      status: null,
      reason: `No wxKanban customer is associated with this token. Log in to wxKanban to check your subscription: ${REMEDIATION_URL}`,
      code: 'entitlement-unknown',
    };
  }
  if (row.exempt === true) {
    return { allowed: true, status: row.status ?? null };
  }
  const status = (row.status ?? '').toUpperCase();
  const allowed = row.active !== false && ALLOWED_STATUSES.has(status);
  if (allowed) {
    return { allowed: true, status };
  }
  // [SCOPE 090 / T010] SPEC-090 Amendment A FR-012 — say what is wrong and what
  // to do about it. "Subscription is 'PENDING'" told a customer who abandoned
  // signup nothing actionable; the fix is always the same, and it is not here.
  return {
    allowed: false,
    status,
    reason:
      `Your wxKanban subscription is not complete (status: ${status || 'unknown'}). ` +
      `Kit commands are unavailable until it is. Log in to wxKanban to complete it: ${REMEDIATION_URL}`,
    code: 'subscription-inactive',
  };
}

export type EntitlementLoader = (customerId: string) => Promise<CompanyEntitlementRow | null>;

const defaultLoader: EntitlementLoader = async (customerId) => {
  const rows = await db
    .select({
      status: companies.subscriptionstatus,
      active: companies.activeflag,
      exempt: companies.billingexempt,
    })
    .from(companies)
    .where(eq(companies.id, customerId))
    .limit(1);
  return rows[0] ?? null;
};

// In-process TTL cache. Allow decisions cached longer than deny decisions so a
// fresh payment is honored quickly.
const ALLOW_TTL_MS = 60_000;
const DENY_TTL_MS = 15_000;
interface CacheEntry {
  result: EntitlementResult;
  expiresAt: number;
}
const cache = new Map<string, CacheEntry>();

/** Drop cached decisions (call from a billing webhook to apply changes instantly). */
export function clearEntitlementCache(customerId?: string): void {
  if (customerId) cache.delete(customerId);
  else cache.clear();
}

export async function checkEntitlement(
  customerId: string | null,
  loader: EntitlementLoader = defaultLoader,
): Promise<EntitlementResult> {
  if (!customerId) {
    return evaluateEntitlementRow(null);
  }

  const now = Date.now();
  const cached = cache.get(customerId);
  if (cached && cached.expiresAt > now) {
    return cached.result;
  }

  let result: EntitlementResult;
  try {
    const row = await loader(customerId);
    result = evaluateEntitlementRow(row);
  } catch (err) {
    // Fail OPEN on infra error — the token is already validated, and a DB blip
    // must not cut off every paying customer. Not cached, logged loudly.
    logger.error('entitlement.check.error', err as Error, { customerId });
    return { allowed: true, status: null, code: 'entitlement-degraded' };
  }

  cache.set(customerId, {
    result,
    expiresAt: now + (result.allowed ? ALLOW_TTL_MS : DENY_TTL_MS),
  });
  return result;
}
