// [SCOPE 119 / T009] BEGIN — customer access policy and payload validation (pure)
/**
 * SPEC-119 access policy and payload validation, deliberately free of any database
 * or Express import.
 *
 * These live here rather than in `routes/consultantCustomers.ts` for one concrete
 * reason: importing that route pulls in `db/client` → `config`, which calls
 * `process.exit(1)` when DATABASE_URL is absent. A security rule that cannot be
 * unit-tested without a live production database is a security rule that does not
 * get tested. Two of this spec's success metrics are authorization properties, so
 * the policy is separated from the transport that applies it.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CustomerBody {
  name?: unknown;
  company?: unknown;
  email?: unknown;
  phone?: unknown;
  billingaddress?: unknown;
  taxid?: unknown;
  clientcompanyid?: unknown;
}

export interface AccessRow {
  consultantid: string;
  companyid: string;
}

export interface AccessCaller {
  userid?: string;
  companyid?: string;
  usertype?: string;
}

/**
 * The whole of FR-007 as one decidable expression.
 *
 * `read` admits the owner and a Company Admin. `write` admits the owner alone — an
 * Admin may never edit customer detail. The two Admin writes that DO exist
 * (ownership transfer, and managing the tenant link) are separate endpoints that
 * check `isCompanyAdmin` explicitly rather than widening this.
 *
 * Note what this function never reads: `clientcompanyid`. The tenant link confers
 * no access, and the cleanest way to guarantee that is for the access decision to
 * have no branch that can see it.
 */
export function decideAccess(
  row: AccessRow | null | undefined,
  caller: AccessCaller,
  mode: "read" | "write",
): boolean {
  if (!row) return false;
  // Tenant boundary first — nothing crosses a company by this path, not even a
  // SYSADMIN. Checked before ownership so a userid that happens to match across
  // tenants is still refused.
  if (!caller.companyid || row.companyid !== caller.companyid) return false;

  const isOwner = Boolean(caller.userid) && row.consultantid === caller.userid;
  if (mode === "write") return isOwner;

  const isAdmin = caller.usertype === "ADMIN" || caller.usertype === "SYSADMIN";
  return isOwner || isAdmin;
}

/** Company Admins get read across their company, for billing and audit (FR-007). */
export function isCompanyAdminRole(usertype: string | undefined): boolean {
  return usertype === "ADMIN" || usertype === "SYSADMIN";
}

/**
 * Validates and normalises a customer payload (FR-001).
 *
 * Emits ONLY the fields a caller is allowed to set. `consultantid`, `companyid`
 * and `id` are never carried through however they are supplied — ownership comes
 * from the authenticated request alone. `clientcompanyid` is likewise absent: the
 * link has its own endpoints, which carry the engagement check.
 */
export function validateCustomerBody(
  body: CustomerBody,
  requireName: boolean,
): { ok: true; value: Record<string, string | null> } | { ok: false; message: string } {
  const out: Record<string, string | null> = {};

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || body.name.trim().length === 0) {
      return { ok: false, message: "name is required" };
    }
    out.name = body.name.trim();
  } else if (requireName) {
    return { ok: false, message: "name is required" };
  }

  if (body.email !== undefined && body.email !== null && body.email !== "") {
    if (typeof body.email !== "string" || !EMAIL_RE.test(body.email)) {
      return { ok: false, message: "email is not a valid address" };
    }
    out.email = body.email;
  } else if (body.email === null || body.email === "") {
    out.email = null;
  }

  for (const field of ["company", "phone", "billingaddress", "taxid"] as const) {
    const v = body[field];
    if (v === undefined) continue;
    if (v === null || v === "") {
      out[field] = null;
    } else if (typeof v === "string") {
      out[field] = v;
    } else {
      return { ok: false, message: `${field} must be a string` };
    }
  }

  return { ok: true, value: out };
}
// [SCOPE 119 / T009] END
