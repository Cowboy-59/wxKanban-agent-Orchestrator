/**
 * Kit upgrade preservation gate — spec 121 / T011.
 *
 * The fix for the upgrade that destroys consumer-owned files ships INSIDE the
 * kit, and it reaches a consumer through their existing, still-broken upgrader.
 * So the run that delivers the protection is itself unprotected. Nothing in the
 * kit can close that window, because the code doing the damage is already on
 * their disk. Only the server can, which is why this gate lives here.
 *
 * It works by exploiting three behaviors the pre-fix client already has:
 *   - it sends `fromVersion=<kit version>` on every request, so we can identify
 *     a vulnerable client exactly;
 *   - a non-OK response becomes `HTTP <status> from wxKanban: <body.slice(0,300)>`
 *     printed verbatim, giving us 300 characters of instruction;
 *   - a 4xx makes it `die()` with no GitHub fallback, so it stops having written
 *     nothing at all.
 *
 * The gate therefore fires once, tells the operator to take a backup, and lets
 * them through on the next request.
 */

import { and, desc, eq, sql } from 'drizzle-orm';
import { db } from '../../db/client';
import { companyauditlogs } from '../../db/schema/companyauditlog';
import { logger } from '../lib/logger.js';

// [SCOPE 121 / T011] BEGIN — preservation gate policy
/**
 * The first kit release carrying the T001–T010 preservation work. A client at or
 * above this is already safe and must never be gated.
 */
export const KIT_PRESERVATION_RELEASE = '1.7.56';

/**
 * The gate exists to cover one migration, not to become permanent furniture. It
 * stops firing on this date whatever else is true — a gate with no expiry
 * eventually fires at someone it was never meant for.
 */
export const KIT_GATE_SUNSET = new Date('2027-02-13T00:00:00Z');

export const KIT_GATE_ACK_ACTION = 'kit.upgrade.preservation.acknowledged';

/**
 * Must survive `body.slice(0, 300)` in the shipped client with the instruction
 * intact. Sent as text/plain, not JSON, so no characters are spent on braces.
 * The length is asserted in the unit test — this is a hard budget, not a target.
 */
// Deliberately does NOT name a version to re-run with. The gate fires once per
// project, so running the SAME command again is what proceeds — and naming the
// fix release would send people at a tag that may not be published yet, turning
// a safety pause into a failed command.
export const KIT_GATE_MESSAGE =
  'Upgrade paused once for safety. Your current kit can overwrite files you have edited ' +
  '(package.json, .claude/*/scripts, _wxAI/rules). BACK UP YOUR PROJECT NOW, then run the same ' +
  'command again to continue - this pause happens only once. The upgrade you are installing is ' +
  'the one that fixes this.';
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — semver comparison for gate eligibility
/**
 * Numeric-segment comparison. Returns <0, 0, >0. Non-numeric or short versions
 * compare as smaller, which keeps the gate fail-safe: anything we cannot parse
 * is treated as old rather than waved through.
 */
export function compareKitVersions(a: string, b: string): number {
  const parse = (v: string): number[] =>
    v
      .replace(/^v/i, '')
      .split(/[.+-]/)
      .map((part) => {
        const n = Number.parseInt(part, 10);
        return Number.isNaN(n) ? -1 : n;
      });

  const left = parse(a);
  const right = parse(b);
  const len = Math.max(left.length, right.length);
  for (let i = 0; i < len; i++) {
    const l = left[i] ?? 0;
    const r = right[i] ?? 0;
    if (l !== r) return l - r;
  }
  return 0;
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — acknowledgement extraction
/**
 * A pre-fix client sends only `platform` and `fromVersion` of its own accord;
 * the single value the operator controls is the positional version argument,
 * which it forwards verbatim as `version`. So `+ack` on the version is the only
 * acknowledgement a consumer can send without editing code they were told not to
 * touch. `ack=1` is accepted too, for the Cockpit and any newer client.
 *
 * Returns the version with the marker stripped, so resolution downstream is
 * unaffected.
 */
export function extractAcknowledgement(
  version: string | undefined,
  ackParam: unknown
): { acknowledged: boolean; version: string | undefined } {
  const viaParam = ackParam === '1' || ackParam === 'true';
  if (version && /\+ack$/i.test(version)) {
    const cleaned = version.replace(/\+ack$/i, '');
    return { acknowledged: true, version: cleaned.length > 0 ? cleaned : undefined };
  }
  return { acknowledged: viaParam, version };
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — gate decision
export interface GateDecision {
  gated: boolean;
  reason: 'below-fix' | 'unknown-version' | 'sunset' | 'already-safe' | 'acknowledged' | 'already-warned';
}

/**
 * Pure decision, so it can be tested without a database. `alreadyWarned` is the
 * durable "this project has seen the warning" flag.
 */
export function decideGate(opts: {
  fromVersion: string | undefined;
  acknowledged: boolean;
  alreadyWarned: boolean;
  now?: Date;
}): GateDecision {
  const now = opts.now ?? new Date();
  if (now >= KIT_GATE_SUNSET) return { gated: false, reason: 'sunset' };
  if (opts.acknowledged) return { gated: false, reason: 'acknowledged' };
  if (opts.alreadyWarned) return { gated: false, reason: 'already-warned' };

  // Fail safe: a client that does not tell us its version is assumed vulnerable.
  if (!opts.fromVersion || opts.fromVersion === 'unknown') {
    return { gated: true, reason: 'unknown-version' };
  }
  if (compareKitVersions(opts.fromVersion, KIT_PRESERVATION_RELEASE) >= 0) {
    return { gated: false, reason: 'already-safe' };
  }
  return { gated: true, reason: 'below-fix' };
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — durable per-project acknowledgement
/**
 * Stored as an audit row rather than a new column: this needs to be durable and
 * reviewable, and adding a column to `companyprojects` would mean a manual
 * production DDL step (SCOPE-117) that must land before the declaration or every
 * project query 500s. An audit row needs neither, and a security-relevant
 * override is something worth having in the audit trail anyway.
 */
export async function hasSeenPreservationGate(
  companyId: string,
  projectId: string
): Promise<boolean> {
  try {
    const rows = await db
      .select({ id: companyauditlogs.id })
      .from(companyauditlogs)
      .where(
        and(
          eq(companyauditlogs.companyid, companyId),
          eq(companyauditlogs.action, KIT_GATE_ACK_ACTION),
          sql`${companyauditlogs.newvalue}->>'projectId' = ${projectId}`
        )
      )
      .orderBy(desc(companyauditlogs.timestamp))
      .limit(1);
    return rows.length > 0;
  } catch (error) {
    // A lookup failure must not block an upgrade, but it must be visible.
    logger.warn({ error, projectId }, 'kit preservation gate: acknowledgement lookup failed');
    return false;
  }
}

export async function recordPreservationGate(opts: {
  companyId: string;
  projectId: string;
  userId?: string;
  fromVersion?: string;
  outcome: 'warned' | 'acknowledged';
}): Promise<void> {
  try {
    await db.insert(companyauditlogs).values({
      companyid: opts.companyId,
      action: KIT_GATE_ACK_ACTION,
      changedby: opts.userId ?? null,
      newvalue: {
        projectId: opts.projectId,
        fromVersion: opts.fromVersion ?? 'unknown',
        outcome: opts.outcome,
        fixRelease: KIT_PRESERVATION_RELEASE,
      },
      description: `Kit upgrade preservation gate ${opts.outcome} for project ${opts.projectId}`,
    });
  } catch (error) {
    logger.warn({ error, projectId: opts.projectId }, 'kit preservation gate: could not record');
  }
}
// [SCOPE 121 / T011] END
