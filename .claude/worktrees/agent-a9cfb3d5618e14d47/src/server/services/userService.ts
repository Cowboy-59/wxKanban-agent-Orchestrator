import { db } from "../db/client.js";
import { userprofiles as users } from "~/db/schema/userprofiles.js";

import { companies } from "~/db/schema/company.js";
import { eq, and, count } from "drizzle-orm";
import { verifyPassword } from "../lib/password.js";
import { signToken, CompanyTokenContext } from "../lib/jwt.js";
import { createLogger } from "../lib/logger.js";
import { getCompanySettings } from "./SettingsService.js";
import type { Setting } from "~/shared/types/settings.js";
import { DEFAULT_LOCALE, resolveSupportedLocale } from "~/shared/locales.js"; // [SCOPE 051]
import { evaluateAccess } from "~/shared/subscription-policy.js"; // [SCOPE 090 / T006]

const logger = createLogger("user-service");

// Account lockout (SOC 2 CC6.1 / M-12): lock after this many consecutive failed
// password attempts, for this duration. Auto-unlocks when the window expires.
const MAX_FAILED_LOGINS = 3;
const LOCKOUT_MINUTES = 15;

/** Thrown when an account is currently locked; carries the message for the 423/401 response. */
export class AccountLockedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AccountLockedError";
  }
}

export interface SignInInput {
  email: string;
  password: string;
  /** [SCOPE 051] Browser Accept-Language header, used to seed the locale on first login. */
  acceptLanguage?: string;
}

export interface SessionUser {
  userid: string;
  email: string;
  fullname: string | null;
  usertype: string;
  active: boolean;
  securitylevel: number;
  payrate: string | null;
  payratemethod: string | null;
  profiletype: string | null;
  responsibility: string | null;
  timezone: string;
  language: string; // [SCOPE 051] preferred UI locale
  tracktime: boolean;
  // [profile self-service] photo URL, chat-on-login, and the unverified pending email.
  avatarurl: string | null;
  startchat: boolean;
  pendingemail: string | null;
  // [SCOPE 064 / T010] Amendment A — newsletter opt-in (true = subscribed).
  newsletterupdates: boolean; // Product updates & announcements
  newsletterpromos: boolean; // Marketing / promotions
  joinedat: Date | null;
  lastloginedat: Date | null;
  companyid: string;
  companyname: string;
  companyemail: string;
  billingplan: string;
  subscriptionstatus: string;
  maxusers: number;
  seatsused: number;
  hourlyrate: string | null;
  logourl: string | null;
  companyactiveflag: boolean;
  companyverifiedat: Date | null;
  companycreatedat: Date;
  // [SCOPE 090 / T006] Amendment A FR-010 — inputs the client-side access gate
  // needs. Without billingexempt the wall cannot tell an internal/kit-author
  // account from a delinquent one and would block every exempt company;
  // companyadminemail names the only person who can actually pay, and is
  // resolved lazily (null unless this user is blocked and cannot pay).
  billingexempt: boolean;
  companyadminemail: string | null;
  token: string;
  settings?: Setting[];
}

export type CurrentSessionUser = Omit<SessionUser, "token">;

type CompanyRow = typeof companies.$inferSelect;
type UserRow = typeof users.$inferSelect;

async function loadCompany(companyid: string, userid: string): Promise<CompanyRow> {
  const rows = await db.select().from(companies).where(eq(companies.id, companyid));
  if (!rows.length) {
    logger.error({ userid, companyid }, "User has companyid but company record not found");
    throw new Error("Account configuration error - company not found");
  }
  return rows[0];
}

async function countCompanyUsers(companyid: string): Promise<number> {
  const result = await db
    .select({ total: count() })
    .from(users)
    .where(eq(users.companyid, companyid));
  return result[0]?.total ?? 0;
}

function buildCompanyContext(usertype: string, company: CompanyRow): CompanyTokenContext {
  return {
    companyid: company.id,
    usertype,
    billingplan: company.billingplan,
    subscriptionstatus: company.subscriptionstatus,
    maxusers: company.maxusers,
  };
}

// [SCOPE 090 / T006] BEGIN — resolve the company ADMIN a blocked user must contact
/**
 * SPEC-090 Amendment A FR-010. The first active ADMIN's login address, used to
 * tell a walled non-admin who can pay. Same recipient rule as
 * SubscriptionRecoveryService.sendRestartLink, so the person named in the UI is
 * the person the billing emails go to.
 *
 * Returns null rather than throwing: not knowing the admin's address must
 * degrade the wall's copy, never fail the sign-in that produced it.
 */
async function loadCompanyAdminEmail(companyid: string): Promise<string | null> {
  try {
    const rows = await db
      .select({ email: users.emailaddr })
      .from(users)
      .where(and(eq(users.companyid, companyid), eq(users.usertype, "ADMIN"), eq(users.active, true)))
      .limit(1);
    return rows[0]?.email ?? null;
  } catch (error) {
    logger.warn(
      { companyid, error: error instanceof Error ? error.message : String(error) },
      "Could not resolve company admin email for the subscription wall",
    );
    return null;
  }
}
// [SCOPE 090 / T006] END

async function mapSession(
  foundUser: UserRow,
  company: CompanyRow,
  seatsused: number,
  settings: Setting[],
  token: string,
): Promise<SessionUser> {
  // [SCOPE 090 / T006] Amendment A FR-010 — only a user who is blocked AND cannot
  // pay needs an admin to contact, so the extra query stays off the hot sign-in
  // path for everyone else.
  const access = evaluateAccess({
    subscriptionstatus: company.subscriptionstatus,
    activeflag: company.activeflag,
    billingexempt: company.billingexempt,
    usertype: foundUser.usertype,
  });
  const companyadminemail =
    access.mode === "contact-admin" ? await loadCompanyAdminEmail(company.id) : null;

  return {
    userid: foundUser.id,
    email: foundUser.emailaddr,
    fullname: foundUser.fullname ?? null,
    usertype: foundUser.usertype,
    active: foundUser.active,
    securitylevel: foundUser.securitylevel,
    payrate: foundUser.payrate ?? null,
    payratemethod: foundUser.payratemethod ?? null,
    profiletype: foundUser.profiletype ?? null,
    responsibility: foundUser.responsibility ?? null,
    timezone: foundUser.timezone ?? "UTC",
    language: foundUser.language ?? DEFAULT_LOCALE,
    tracktime: foundUser.tracktime ?? true,
    // [profile self-service]
    avatarurl: foundUser.avatarurl ?? null,
    startchat: foundUser.startchat ?? true,
    pendingemail: foundUser.pendingemail ?? null,
    // [SCOPE 064 / T010] NULL opt-out timestamp = subscribed.
    newsletterupdates: foundUser.updatesunsubscribedat == null,
    newsletterpromos: foundUser.promosunsubscribedat == null,
    joinedat: foundUser.joinedat ?? null,
    lastloginedat: foundUser.lastloginedat ?? null,
    companyid: company.id,
    companyname: company.name,
    companyemail: company.contactemail,
    billingplan: company.billingplan,
    subscriptionstatus: company.subscriptionstatus,
    maxusers: company.maxusers,
    seatsused,
    hourlyrate: company.hourlyrate ?? null,
    logourl: company.logourl ?? null,
    companyactiveflag: company.activeflag,
    companyverifiedat: company.verifiedat ?? null,
    companycreatedat: company.createdat,
    // [SCOPE 090 / T006] Amendment A FR-010
    billingexempt: company.billingexempt,
    companyadminemail,
    token,
    settings,
  };
}

/**
 * [SCOPE 152 / T005] A cost-12 bcrypt hash of a random string nobody knows. An unknown email is
 * checked against it, so it takes as long as a wrong password and the answer time does not
 * reveal which emails have accounts.
 */
const UNKNOWN_EMAIL_HASH = "$2b$12$if07G.NBljcu50EbegMPo.cGT2lbZ6mSGCy1lIW2/PVp8oDX2iNFy";

/**
 * Sign in user. Every userprofile must have a company — throws if missing.
 */
export async function signInUser(input: SignInInput): Promise<SessionUser> {
  const userResults = await db
    .select()
    .from(users)
    .where(eq(users.emailaddr, input.email.toLowerCase()));

  if (!userResults.length) {
    await verifyPassword(input.password, UNKNOWN_EMAIL_HASH); // [SCOPE 152 / T005] equal timing
    throw new Error("Invalid email or password");
  }

  const foundUser = userResults[0];

  // Account lockout (M-12): if currently locked, reject before checking the
  // password so a locked account cannot be probed further.
  const now = new Date();
  if (foundUser.lockeduntil && foundUser.lockeduntil > now) {
    const minsLeft = Math.max(
      1,
      Math.ceil((foundUser.lockeduntil.getTime() - now.getTime()) / 60000),
    );
    logger.warn(
      { id: foundUser.id, lockeduntil: foundUser.lockeduntil },
      "Sign-in blocked - account locked",
    );
    throw new AccountLockedError(
      `Account locked due to too many failed attempts. Try again in ${minsLeft} minute${minsLeft === 1 ? "" : "s"}, or reset your password.`,
    );
  }

  const isPasswordValid = await verifyPassword(input.password, foundUser.password);
  if (!isPasswordValid) {
    // The lock window (if any) has expired by here, so start counting fresh
    // from the previously accumulated failures.
    const priorFailures = foundUser.lockeduntil ? 0 : foundUser.failedlogins ?? 0;
    const failedlogins = priorFailures + 1;
    const willLock = failedlogins >= MAX_FAILED_LOGINS;
    await db
      .update(users)
      .set({
        failedlogins: willLock ? 0 : failedlogins,
        lockeduntil: willLock
          ? new Date(now.getTime() + LOCKOUT_MINUTES * 60000)
          : null,
      })
      .where(eq(users.id, foundUser.id));

    if (willLock) {
      logger.warn(
        { id: foundUser.id, email: input.email },
        "Account locked after repeated failed login attempts",
      );
      throw new AccountLockedError(
        `Account locked due to too many failed attempts. Try again in ${LOCKOUT_MINUTES} minutes, or reset your password.`,
      );
    }
    logger.warn(
      { email: input.email, failedlogins },
      "Failed login attempt - invalid password",
    );
    throw new Error("Invalid email or password");
  }

  // Successful auth — clear any accumulated failure state.
  if ((foundUser.failedlogins ?? 0) > 0 || foundUser.lockeduntil) {
    await db
      .update(users)
      .set({ failedlogins: 0, lockeduntil: null })
      .where(eq(users.id, foundUser.id));
  }

  // [SCOPE 051 / FR-004] First-login browser seeding: if this is the user's very
  // first sign-in and they still carry the default locale, seed their language
  // preference from the browser's Accept-Language. A deliberate later choice
  // (non-default) is never overwritten.
  let language = foundUser.language ?? DEFAULT_LOCALE;
  const firstLogin = !foundUser.lastloginedat;
  if (firstLogin && language === DEFAULT_LOCALE && input.acceptLanguage) {
    const seeded = resolveSupportedLocale(input.acceptLanguage);
    if (seeded && seeded !== language) {
      language = seeded;
      await db.update(users).set({ language }).where(eq(users.id, foundUser.id));
    }
  }

  await db
    .update(users)
    .set({ lastloginedat: new Date() })
    .where(eq(users.id, foundUser.id));

  const [company, seatsused, settings] = await Promise.all([
    loadCompany(foundUser.companyid, foundUser.id),
    countCompanyUsers(foundUser.companyid),
    getCompanySettings(foundUser.companyid),
  ]);

  const companyContext = buildCompanyContext(foundUser.usertype, company);
  const token = signToken(foundUser.id, foundUser.emailaddr, companyContext);

  logger.info({ id: foundUser.id, email: foundUser.emailaddr }, "User signed in successfully");
  return await mapSession({ ...foundUser, language, lastloginedat: new Date() }, company, seatsused, settings, token);
}

/**
 * Get current user. Every userprofile must have a company — throws if missing.
 */
export async function getCurrentUser(userid: string): Promise<CurrentSessionUser> {
  const userResult = await db.select().from(users).where(eq(users.id, userid));
  if (!userResult.length) throw new Error("User not found");

  const foundUser = userResult[0];

  const [company, seatsused, settings] = await Promise.all([
    loadCompany(foundUser.companyid, foundUser.id),
    countCompanyUsers(foundUser.companyid),
    getCompanySettings(foundUser.companyid),
  ]);

  const { token: _t, ...session } = await mapSession(foundUser, company, seatsused, settings, "");
  return session;
}
