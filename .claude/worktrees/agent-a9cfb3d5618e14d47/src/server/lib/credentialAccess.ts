// [SCOPE 017 / T100] BEGIN — credential scope policy (pure)
/**
 * SPEC-017 FR-007 — who may see a connection, and who may decrypt its credentials.
 *
 * Pure, and free of any database or Express import, for the same reason
 * `customerAccess.ts` is: a rule that cannot be unit-tested without a live
 * production database is a rule that does not get tested. This one guards
 * decrypted secrets, so it gets tested.
 *
 * THREE DISTINCT QUESTIONS, deliberately not collapsed into one:
 *
 *   1. metadata  — may the caller see that this connection exists, its name,
 *                  type, status and health?
 *   2. secrets   — may the caller decrypt and use its credentials?
 *   3. delete    — may the caller remove it?
 *
 * Conflating 1 and 2 is the mistake this file exists to prevent. A consultant
 * needs to SEE that a colleague's Jira connection is failing without being able
 * to READ that colleague's Jira token.
 */

export type CredentialScope = "PERSONAL" | "TEAM";

export interface ConnectionRow {
  consultantid: string;
  companyid: string;
  credentialscope: string;
}

export interface ConnectionCaller {
  userid?: string;
  companyid?: string;
  usertype?: string;
}

/** Team Manager / Admin / SysAdmin — the roles TEAM scope opens credentials to. */
function isManagerRole(usertype: string | undefined): boolean {
  return (
    usertype === "TEAM_MANAGER" || usertype === "ADMIN" || usertype === "SYSADMIN"
  );
}

/**
 * Question 1 — metadata. Any authenticated member of the owning company.
 *
 * FR-010: "Connection metadata (name, type, status) visible to all consultants
 * with customer access." Deliberately wider than secret access.
 */
export function canViewConnectionMetadata(
  row: ConnectionRow | null | undefined,
  caller: ConnectionCaller,
): boolean {
  if (!row) return false;
  if (!caller.companyid || row.companyid !== caller.companyid) return false;
  return Boolean(caller.userid);
}

/**
 * Question 2 — the secrets. This is the one that matters.
 *
 *   PERSONAL  → the owning consultant, and nobody else. Not a Team Manager, not
 *               an Admin, not a SysAdmin. FR-007: "Consultants can only view
 *               their own PERSONAL credentials, not other consultants' personal
 *               credentials" — with no exemption for elevated roles, so none is
 *               granted here.
 *   TEAM      → the owner, plus Team Manager / Admin / SysAdmin.
 *
 * An unrecognised scope value denies. A row whose scope is corrupt or
 * unexpected must not fall through to "allow".
 */
export function canDecryptCredentials(
  row: ConnectionRow | null | undefined,
  caller: ConnectionCaller,
): boolean {
  if (!canViewConnectionMetadata(row, caller)) return false;
  const r = row as ConnectionRow;

  const isOwner = r.consultantid === caller.userid;
  if (isOwner) return true;

  if (r.credentialscope === "TEAM") return isManagerRole(caller.usertype);

  // PERSONAL, or anything unrecognised.
  return false;
}

/**
 * Question 3 — deletion. FR-010: "owner or Team Manager only".
 *
 * Note this is NOT the same as `canDecryptCredentials`: a Team Manager may
 * delete a PERSONAL connection they cannot read. That is intentional — removing
 * a stale connection is an administrative act, and requiring someone to be able
 * to read a secret before they may destroy it would be a worse rule.
 */
export function canDeleteConnection(
  row: ConnectionRow | null | undefined,
  caller: ConnectionCaller,
): boolean {
  if (!canViewConnectionMetadata(row, caller)) return false;
  const r = row as ConnectionRow;
  return r.consultantid === caller.userid || isManagerRole(caller.usertype);
}

/**
 * Editing credentials requires the ability to read them — you cannot rotate a
 * secret you may not see, and allowing a blind overwrite would let a manager
 * silently replace a consultant's PERSONAL token.
 */
export function canEditConnection(
  row: ConnectionRow | null | undefined,
  caller: ConnectionCaller,
): boolean {
  return canDecryptCredentials(row, caller);
}

/**
 * Strips every secret from a connection row before it crosses the API boundary.
 *
 * `credentialsencrypted` is never returned by any endpoint — not even to the
 * owner, and not even encrypted. There is no client-side use for it, so shipping
 * it would be pure downside: it would sit in browser memory, in devtools, and in
 * any error report that captured a response body.
 */
export function toPublicConnection<T extends Record<string, unknown>>(
  row: T,
): Omit<T, "credentialsencrypted"> {
  const { credentialsencrypted: _omitted, ...rest } = row as T & {
    credentialsencrypted?: unknown;
  };
  return rest as Omit<T, "credentialsencrypted">;
}
// [SCOPE 017 / T100] END
