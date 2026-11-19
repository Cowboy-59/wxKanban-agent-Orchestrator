import { db } from '~/db/client.js';
import { companies } from '~/db/schema/company.js';
import { companyprojects } from '~/db/schema/companyproject.js';
import { and, eq } from 'drizzle-orm';
import { config } from '~/server/config.js';
import { decryptToken, encryptToken } from '~/server/lib/crypto.js';
import { NotFoundError, ValidationError } from '~/server/lib/errors.js';
import { createLogger } from '~/server/lib/logger.js';
import { DEFAULT_DEVELOPER_RATE, DEFAULT_RESOURCE_RATE, normalizeRate, rateToCents } from '~/server/lib/timeBilling.js';

const logger = createLogger('time-billing-settings');

// [SCOPE 005 / T008] BEGIN — rate and ACH validation, masking and encryption helpers (FR-008, FR-012)
/** Highest rate the page accepts, per hour. */
export const MAX_RATE_CENTS = 1_000_000;

export type AchField = 'bankname' | 'routingnumber' | 'accountnumber' | 'accountname';

/** What the Settings screen shows. Routing and account numbers are masked to the last 4. */
export interface AchView {
  bankname: string | null;
  routingnumberlast4: string | null;
  accountnumberlast4: string | null;
  accountname: string | null;
  /** True when every ACH field is set, so a statement can carry payment details. */
  complete: boolean;
}

export interface RateSettingsView {
  developerRate: string;
  resourceRate: string;
  ach: AchView;
}

/** Full ACH details, decrypted. For the statement only (FR-012); never log or return elsewhere. */
export interface StatementAch {
  bankname: string;
  routingnumber: string;
  accountnumber: string;
  accountname: string;
}

export interface RateSettingsUpdate {
  developerRate?: string;
  resourceRate?: string;
  /** null clears a field; an omitted field is left as is. */
  ach?: Partial<Record<AchField, string | null>>;
}

export interface ProjectRatesUpdate {
  /** null clears the override so the company default applies. */
  developerRate?: string | null;
  resourceRate?: string | null;
}

export interface ProjectRatesView {
  projectid: string;
  developerRate: string | null;
  resourceRate: string | null;
}

/** Validate a rate from the page: two decimals at most, 0 to 10,000.00. */
export function checkRate(raw: string, label: string): string {
  let cents: number;
  try {
    cents = rateToCents(raw);
  } catch {
    throw new ValidationError(`${label} must be an amount with at most 2 decimals`);
  }
  if (cents > MAX_RATE_CENTS) throw new ValidationError(`${label} cannot exceed 10,000.00`);
  return normalizeRate(raw);
}

/** ABA routing number: 9 digits whose weighted sum (3, 7, 1) is a multiple of 10. */
export function isValidRoutingNumber(value: string): boolean {
  if (!/^\d{9}$/.test(value)) return false;
  const d = [...value].map(Number);
  const sum =
    3 * (d[0]! + d[3]! + d[6]!) + 7 * (d[1]! + d[4]! + d[7]!) + (d[2]! + d[5]! + d[8]!);
  return sum % 10 === 0;
}

/**
 * Validate one ACH field and return its trimmed value. The error messages never repeat the
 * value, so a rejected number cannot reach a log through the error handler.
 */
export function checkAchField(field: AchField, raw: string): string {
  const value = raw.trim();
  switch (field) {
    case 'routingnumber':
      if (!isValidRoutingNumber(value)) throw new ValidationError('Routing number must be a valid 9-digit ABA number');
      return value;
    case 'accountnumber':
      if (!/^\d{4,17}$/.test(value)) throw new ValidationError('Account number must be 4 to 17 digits');
      return value;
    case 'bankname':
    case 'accountname':
      if (!value) throw new ValidationError(`${field === 'bankname' ? 'Bank name' : 'Account name'} cannot be blank`);
      if (value.length > 100) throw new ValidationError('ACH names are limited to 100 characters');
      return value;
  }
}

export function lastFour(value: string | null): string | null {
  return value === null ? null : value.slice(-4);
}

function encryptAch(value: string): string {
  return encryptToken(value, config.ENCRYPTION_KEY);
}

/** Decrypt one stored ACH field. An unreadable value is logged by field name only and read as unset. */
function decryptAch(ciphertext: string | null, field: AchField): string | null {
  if (!ciphertext) return null;
  try {
    return decryptToken(ciphertext, config.ENCRYPTION_KEY);
  } catch {
    logger.error({ field }, 'ACH field could not be decrypted');
    return null;
  }
}

interface AchColumns {
  achbankname: string | null;
  achroutingnumber: string | null;
  achaccountnumber: string | null;
  achaccountname: string | null;
}

function toAchView(row: AchColumns): AchView {
  const bankname = decryptAch(row.achbankname, 'bankname');
  const routing = decryptAch(row.achroutingnumber, 'routingnumber');
  const account = decryptAch(row.achaccountnumber, 'accountnumber');
  const accountname = decryptAch(row.achaccountname, 'accountname');
  return {
    bankname,
    routingnumberlast4: lastFour(routing),
    accountnumberlast4: lastFour(account),
    accountname,
    complete: Boolean(bankname && routing && account && accountname),
  };
}

const ACH_COLUMN: Record<AchField, keyof AchColumns> = {
  bankname: 'achbankname',
  routingnumber: 'achroutingnumber',
  accountnumber: 'achaccountnumber',
  accountname: 'achaccountname',
};
// [SCOPE 005 / T008] END

// [SCOPE 005 / T008] BEGIN — TimeBillingSettingsService: company rates, project overrides, ACH details
export class TimeBillingSettingsService {
  /** Company rates and masked ACH details. ADMIN-only at the route (T012). */
  static async get(companyid: string): Promise<RateSettingsView> {
    const row = await loadCompany(companyid);
    return toView(row);
  }

  /**
   * Update rates and/or ACH details. ACH values are encrypted before they leave this process;
   * the database holds ciphertext only. Existing entries keep their snapshotted rate (FR-008).
   * Returns masked before/after views for the audit record (FR-013).
   */
  static async update(
    companyid: string,
    patch: RateSettingsUpdate,
  ): Promise<{ before: RateSettingsView; after: RateSettingsView; changed: string[] }> {
    const set: Partial<typeof companies.$inferInsert> = {};
    const changed: string[] = [];
    if (patch.developerRate !== undefined) {
      set.hourlyrate = checkRate(patch.developerRate, 'Developer rate');
      changed.push('developerRate');
    }
    if (patch.resourceRate !== undefined) {
      set.resourcerate = checkRate(patch.resourceRate, 'Resource rate');
      changed.push('resourceRate');
    }
    for (const field of Object.keys(patch.ach ?? {}) as AchField[]) {
      if (!(field in ACH_COLUMN)) throw new ValidationError('Unknown ACH field');
      const raw = patch.ach?.[field];
      if (raw === undefined) continue;
      set[ACH_COLUMN[field]] = raw === null ? null : encryptAch(checkAchField(field, raw));
      changed.push(`ach.${field}`);
    }
    if (changed.length === 0) throw new ValidationError('Nothing to update');

    const before = toView(await loadCompany(companyid));
    const [updated] = await db
      .update(companies)
      .set({ ...set, updatedat: new Date() })
      .where(eq(companies.id, companyid))
      .returning({
        hourlyrate: companies.hourlyrate,
        resourcerate: companies.resourcerate,
        achbankname: companies.achbankname,
        achroutingnumber: companies.achroutingnumber,
        achaccountnumber: companies.achaccountnumber,
        achaccountname: companies.achaccountname,
      });
    if (!updated) throw new NotFoundError('Company');

    // Field names only: never the rate values' neighbors, never ACH values.
    logger.info({ companyid, changed }, 'Time and Billing settings updated');
    return { before, after: toView(updated), changed };
  }

  /** Set or clear a project's Developer and/or Resource rate override (FR-008). */
  static async updateProjectRates(
    companyid: string,
    projectid: string,
    patch: ProjectRatesUpdate,
  ): Promise<{ before: ProjectRatesView; after: ProjectRatesView }> {
    const set: Partial<typeof companyprojects.$inferInsert> = {};
    if (patch.developerRate !== undefined) {
      set.hourlyrate = patch.developerRate === null ? null : checkRate(patch.developerRate, 'Developer rate');
    }
    if (patch.resourceRate !== undefined) {
      set.resourcerate = patch.resourceRate === null ? null : checkRate(patch.resourceRate, 'Resource rate');
    }
    if (Object.keys(set).length === 0) throw new ValidationError('Nothing to update');

    const scoped = and(eq(companyprojects.id, projectid), eq(companyprojects.companyid, companyid));
    const [current] = await db
      .select({ id: companyprojects.id, hourlyrate: companyprojects.hourlyrate, resourcerate: companyprojects.resourcerate })
      .from(companyprojects)
      .where(scoped)
      .limit(1);
    if (!current) throw new NotFoundError('Project');

    const [updated] = await db
      .update(companyprojects)
      .set({ ...set, updatedat: new Date() })
      .where(scoped)
      .returning({ id: companyprojects.id, hourlyrate: companyprojects.hourlyrate, resourcerate: companyprojects.resourcerate });
    if (!updated) throw new NotFoundError('Project');

    logger.info({ companyid, projectid, changed: Object.keys(set) }, 'Project rate override updated');
    return { before: toProjectView(current), after: toProjectView(updated) };
  }

  /**
   * Full ACH details for a statement (FR-009, FR-012). Returns null until every field is set,
   * so the statement can say ACH details are missing instead of printing a partial account.
   */
  static async getStatementAch(companyid: string): Promise<StatementAch | null> {
    const row = await loadCompany(companyid);
    const bankname = decryptAch(row.achbankname, 'bankname');
    const routingnumber = decryptAch(row.achroutingnumber, 'routingnumber');
    const accountnumber = decryptAch(row.achaccountnumber, 'accountnumber');
    const accountname = decryptAch(row.achaccountname, 'accountname');
    if (!bankname || !routingnumber || !accountnumber || !accountname) return null;
    return { bankname, routingnumber, accountnumber, accountname };
  }
}

interface CompanyRow extends AchColumns {
  hourlyrate: string | null;
  resourcerate: string | null;
}

async function loadCompany(companyid: string): Promise<CompanyRow> {
  const [row] = await db
    .select({
      hourlyrate: companies.hourlyrate,
      resourcerate: companies.resourcerate,
      achbankname: companies.achbankname,
      achroutingnumber: companies.achroutingnumber,
      achaccountnumber: companies.achaccountnumber,
      achaccountname: companies.achaccountname,
    })
    .from(companies)
    .where(eq(companies.id, companyid))
    .limit(1);
  if (!row) throw new NotFoundError('Company');
  return row;
}

function toView(row: CompanyRow): RateSettingsView {
  return {
    developerRate: row.hourlyrate ? normalizeRate(row.hourlyrate) : DEFAULT_DEVELOPER_RATE,
    resourceRate: row.resourcerate ? normalizeRate(row.resourcerate) : DEFAULT_RESOURCE_RATE,
    ach: toAchView(row),
  };
}

function toProjectView(row: { id: string; hourlyrate: string | null; resourcerate: string | null }): ProjectRatesView {
  return {
    projectid: row.id,
    developerRate: row.hourlyrate ? normalizeRate(row.hourlyrate) : null,
    resourceRate: row.resourcerate ? normalizeRate(row.resourcerate) : null,
  };
}
// [SCOPE 005 / T008] END
