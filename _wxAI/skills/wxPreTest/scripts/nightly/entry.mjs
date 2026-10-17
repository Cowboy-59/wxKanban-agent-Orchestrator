// Nightly Testing: the Entry Path, real sign-in, and the permission check (SCOPE-140 FR-005, FR-006).
//
// The run signs in the way a person does: through the real sign-in page, directly or through a
// named portal (Workbench, wxHub), with a local test login and dedicated normal-user accounts, and
// two-factor from a stored authenticator secret. It never mints a session cookie. A portal that
// does not offer the app to the test account is a setup problem, not an app failure.
//
// The permission check then asks, as that normal user, for a sample of admin-only pages. Any page
// that is reachable fails the run.

import { createHmac } from 'node:crypto';
import { createRequire } from 'node:module';
import { join } from 'node:path';

// [SCOPE 140 / T005] BEGIN — Entry Path configuration and the authenticator code (FR-005)
export const ENTRA_STATEMENT = 'Entra ID sign-in is not tested nightly; it stays a human UAT check.';

/** Problems with the Entry Path and accounts, as setup messages. An empty list means usable. */
export function checkEntryPath(entryPath, accounts) {
  const problems = [];
  if (!entryPath) return ['no Entry Path is configured (docs-workspace/config.json entryPath)'];
  if (!['direct', 'portal'].includes(entryPath.kind)) problems.push('entryPath.kind must be "direct" or "portal"');
  if (!entryPath.signInUrl) problems.push('entryPath.signInUrl is required');
  const sel = entryPath.selectors ?? {};
  for (const k of ['username', 'password', 'submit', 'signedIn']) if (!sel[k]) problems.push(`entryPath.selectors.${k} is required`);
  if (entryPath.kind === 'portal') {
    if (!entryPath.portalName) problems.push('entryPath.portalName is required for a portal');
    if (!entryPath.appTile) problems.push('entryPath.appTile (the selector that opens the app from the portal) is required for a portal');
    if (!entryPath.appUrl) problems.push('entryPath.appUrl (where the app opens) is required for a portal');
  }
  const normal = (accounts ?? []).filter((a) => (a.role ?? 'normal') === 'normal');
  if (normal.length < 2) problems.push(`at least two normal-user test accounts are required (found ${normal.length})`);
  for (const a of accounts ?? []) {
    if (!a.name || !a.usernameSecret || !a.passwordSecret) problems.push(`account "${a.name ?? '?'}" needs name, usernameSecret and passwordSecret`);
    if (a.realPerson) problems.push(`account "${a.name}" is marked as a real person's account; only dedicated test accounts may be used`);
  }
  return problems;
}

function base32(s) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
  let bits = '';
  for (const c of clean) {
    const v = alphabet.indexOf(c);
    if (v < 0) throw new Error('the authenticator secret is not base32');
    bits += v.toString(2).padStart(5, '0');
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(bytes);
}

/** RFC 6238 time-based code (SHA-1, 30 s, 6 digits), the kind authenticator apps show. */
export function totp(secret, { now = Date.now(), step = 30, digits = 6 } = {}) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / step)));
  const h = createHmac('sha1', base32(secret)).update(counter).digest();
  const o = h[h.length - 1] & 0x0f;
  const code = ((h.readUInt32BE(o) & 0x7fffffff) % 10 ** digits).toString();
  return code.padStart(digits, '0');
}
// [SCOPE 140 / T005] END

// [SCOPE 140 / T005] BEGIN — Sign in through the real page, directly or through the portal (FR-005)
/** Playwright's chromium from the project being tested, then from wherever this kit runs. */
export function loadChromium(root) {
  for (const base of [join(root, 'package.json'), import.meta.url]) {
    try {
      const req = createRequire(base);
      for (const name of ['playwright', '@playwright/test']) {
        try {
          return req(name).chromium;
        } catch {
          // try the next
        }
      }
    } catch {
      // try the next base
    }
  }
  return null;
}

const outcome = (ok, step, detail, kind = ok ? null : 'app') => ({ ok, step, detail, kind });

/**
 * Sign one account in. Returns { ok, step, detail, kind } where kind is 'setup' for a problem with
 * the portal assignment or the account, and 'app' for the app failing. The page is left signed in.
 * Password fields are never captured: screenshots taken later mask them (maskSelectors).
 */
export async function signIn(page, entryPath, account, secrets, { timeoutMs = 30_000 } = {}) {
  const sel = entryPath.selectors;
  const user = secrets[account.usernameSecret];
  const pass = secrets[account.passwordSecret];
  if (!user || !pass) return outcome(false, 'credentials', `the secrets for account "${account.name}" are not available`, 'setup');
  try {
    await page.goto(entryPath.signInUrl, { timeout: timeoutMs });
    await page.fill(sel.username, user, { timeout: timeoutMs });
    await page.fill(sel.password, pass, { timeout: timeoutMs });
    await page.click(sel.submit, { timeout: timeoutMs });
    if (account.otpSecret) {
      if (!sel.otp) return outcome(false, 'two-factor', 'the account has an authenticator secret but entryPath.selectors.otp is not set', 'setup');
      await page.waitForSelector(sel.otp, { timeout: timeoutMs });
      await page.fill(sel.otp, totp(secrets[account.otpSecret]), { timeout: timeoutMs });
      await page.click(sel.otpSubmit ?? sel.submit, { timeout: timeoutMs });
    }
  } catch (e) {
    return outcome(false, 'sign-in page', `the sign-in page did not accept the steps: ${shortError(e)}`);
  }
  try {
    await page.waitForSelector(sel.signedIn, { timeout: timeoutMs });
  } catch {
    const refused = sel.signInError ? await page.$(sel.signInError) : null;
    return refused
      ? outcome(false, 'sign-in', `account "${account.name}" was refused at sign-in (expired or wrong credentials?)`, 'setup')
      : outcome(false, 'sign-in', 'the signed-in page never appeared');
  }
  if (entryPath.kind !== 'portal') return outcome(true, 'signed in', 'direct');

  // The portal hand-off: open the app from the portal, and come back.
  const tile = await page.$(entryPath.appTile);
  if (!tile) return outcome(false, 'portal', `${entryPath.portalName} does not offer the app to account "${account.name}" (portal assignment missing)`, 'setup');
  try {
    await tile.click();
    await page.waitForURL((u) => String(u).startsWith(entryPath.appUrl), { timeout: timeoutMs });
    if (sel.appReady) await page.waitForSelector(sel.appReady, { timeout: timeoutMs });
  } catch (e) {
    return outcome(false, 'portal hand-off', `the app did not open from ${entryPath.portalName}: ${shortError(e)}`);
  }
  if (entryPath.returnUrl) {
    try {
      await page.goto(entryPath.returnUrl, { timeout: timeoutMs });
      await page.waitForSelector(sel.signedIn, { timeout: timeoutMs });
      await page.goto(entryPath.appUrl, { timeout: timeoutMs });
    } catch (e) {
      return outcome(false, 'portal return', `returning to ${entryPath.portalName} failed: ${shortError(e)}`);
    }
  }
  return outcome(true, 'signed in', `through ${entryPath.portalName}`);
}

function shortError(e) {
  return String(e instanceof Error ? e.message : e).split('\n')[0].slice(0, 200);
}
// [SCOPE 140 / T005] END

// [SCOPE 140 / T006] BEGIN — The normal user must be refused on admin pages (FR-006)
/**
 * Visit each sampled admin page as the signed-in normal user. A page is REFUSED when the response
 * is 401, 403 or 404, when it redirected away from the admin path, or when it shows a configured
 * refusal text. It is REACHABLE otherwise, and a reachable admin page is a failure (SC-8).
 */
export async function checkAdminPages(page, appUrl, adminPages, { refusedTexts = ['access denied', 'not authorized', 'forbidden', 'permission'], adminMarker = null, timeoutMs = 30_000 } = {}) {
  const results = [];
  for (const path of adminPages ?? []) {
    const target = new URL(path, appUrl).toString();
    let status = null;
    let finalUrl = target;
    let refused = false;
    let why = '';
    try {
      const res = await page.goto(target, { timeout: timeoutMs });
      status = res?.status() ?? null;
      await page.waitForLoadState('networkidle', { timeout: timeoutMs }).catch(() => {});
      finalUrl = page.url();
      const text = (await page.textContent('body').catch(() => '')) ?? '';
      if ([401, 403, 404].includes(status)) [refused, why] = [true, `HTTP ${status}`];
      else if (new URL(finalUrl).pathname !== new URL(target).pathname) [refused, why] = [true, `redirected to ${new URL(finalUrl).pathname}`];
      else if (refusedTexts.some((t) => text.toLowerCase().includes(t))) [refused, why] = [true, 'refusal shown'];
      else if (adminMarker && !(await page.$(adminMarker))) [refused, why] = [true, 'admin content absent'];
      else why = `HTTP ${status ?? '?'} and the page rendered`;
    } catch (e) {
      [refused, why] = [true, `navigation failed: ${shortError(e)}`];
    }
    results.push({ path, refused, why });
  }
  const leaks = results.filter((r) => !r.refused);
  return { ok: leaks.length === 0 && results.length > 0, results, leaks, empty: results.length === 0 };
}
// [SCOPE 140 / T006] END
