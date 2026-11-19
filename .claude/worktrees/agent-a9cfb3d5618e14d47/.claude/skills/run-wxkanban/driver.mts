// run-wxkanban driver — drive the running wxKanban app in headless Chromium.
// One command per line on stdin (see SKILL.md for the table). Needs the serve bundle running.
//
//   npx tsx .claude/skills/run-wxkanban/driver.mts <<'EOF'
//   login admin
//   nav /admin/settings
//   screenshot settings
//   EOF
//
// Logs in by minting the same JWT cookie /api/auth/signin issues (src/server/lib/jwt.ts), for a real
// user of the TEST company (default Wxperts LLC — our own; override with WXK_RUN_COMPANY).
// The local DB is PRODUCTION: the driver snapshots the test company's `companies` row at start and
// writes back any column that changed when it exits, unless the script says `keep`.
// Other tables are NOT restored.
import path from "node:path";
import fs from "node:fs";
import readline from "node:readline";
import { createRequire } from "node:module";
import { pathToFileURL, fileURLToPath } from "node:url";
import type { BrowserContext, ConsoleMessage, Page, Response as PwResponse } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
process.chdir(root);
const req = createRequire(path.join(root, "package.json"));
req("dotenv").config({ path: path.join(root, ".env"), quiet: true });
const { chromium } = req("playwright") as typeof import("playwright");
const { eq, and } = req("drizzle-orm");
const imp = (p: string) => import(pathToFileURL(path.join(root, p)).href);
const { db } = await imp("src/db/client.ts");
const { companies } = await imp("src/db/schema/company.ts");
const { userprofiles } = await imp("src/db/schema/userprofiles.ts");
const { signToken } = await imp("src/server/lib/jwt.ts");

const BASE = `http://127.0.0.1:${process.env.WXK_RUN_PORT ?? "5199"}`;
const COMPANY = process.env.WXK_RUN_COMPANY ?? "019c777f-a918-774a-80ae-821c3310eb0a"; // Wxperts LLC
const SHOTS = path.join(root, "dist", "run-wxkanban", "shots");
const TIMEOUT = 30000;
fs.mkdirSync(SHOTS, { recursive: true });

try {
  const r = await fetch(`${BASE}/health`);
  if (!r.ok) throw new Error(String(r.status));
} catch {
  console.error(`FAIL: no server at ${BASE}. Start it first (SKILL.md → Run).`);
  process.exit(2);
}

type Row = Record<string, unknown>;
const companyRow = async (): Promise<Row | undefined> =>
  (await db.select().from(companies).where(eq(companies.id, COMPANY)))[0];
const before = await companyRow();
if (!before) {
  console.error(`FAIL: company ${COMPANY} not found`);
  process.exit(2);
}

const ROLES: Record<string, string[]> = {
  admin: ["ADMIN"],
  manager: ["TEAM_MANAGER"],
  member: ["TEAM_MEMBER", "TEAM_MANAGER"],
  sysadmin: ["SYSADMIN"],
};
async function mintToken(role: string): Promise<{ token: string; who: string }> {
  const types = ROLES[role];
  if (!types) throw new Error(`unknown role "${role}" (admin | manager | member | sysadmin)`);
  for (const usertype of types) {
    const where = role === "sysadmin"
      ? eq(userprofiles.usertype, usertype)
      : and(eq(userprofiles.usertype, usertype), eq(userprofiles.companyid, COMPANY));
    const u = (await db
      .select({ id: userprofiles.id, email: userprofiles.emailaddr, companyid: userprofiles.companyid, usertype: userprofiles.usertype })
      .from(userprofiles).where(where).limit(1))[0];
    if (!u) continue;
    const co = (await db
      .select({ billingplan: companies.billingplan, subscriptionstatus: companies.subscriptionstatus, maxusers: companies.maxusers })
      .from(companies).where(eq(companies.id, u.companyid)))[0];
    const token = signToken(u.id, u.email, {
      companyid: u.companyid, usertype: u.usertype,
      billingplan: co?.billingplan, subscriptionstatus: co?.subscriptionstatus, maxusers: co?.maxusers,
    });
    return { token, who: `${u.email} (${u.usertype})` };
  }
  throw new Error(`no ${types.join("/")} user in company ${COMPANY}`);
}

// "a => b" → ["a", "b"]; no arrow → [whole, undefined]. Text after "=> " is kept verbatim.
const arrow = (s: string): [string, string | undefined] => {
  const i = s.indexOf(" =>");
  return i < 0 ? [s.trim(), undefined] : [s.slice(0, i).trim(), s.slice(i + 3).replace(/^ /, "")];
};

const browser = await chromium.launch();
let ctx: BrowserContext | null = null;
let page: Page | null = null;
let bearer = ""; // the minted JWT — kit routes read the Authorization header, never the cookie
const problems: string[] = [];
const need = () => {
  if (!page) throw new Error("not logged in: run `login <role>` first");
  return page;
};

let keep = false;
let exitCode = 0;
const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
try {
  for await (const raw of rl) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim() || line.trim().startsWith("#")) continue;
    const sp = line.indexOf(" ");
    const cmd = sp < 0 ? line.trim() : line.slice(0, sp);
    const rest = sp < 0 ? "" : line.slice(sp + 1);
    console.log(`> ${line}`);
    try {
      let out = "ok";
      switch (cmd) {
        case "login": {
          const { token, who } = await mintToken(rest.trim());
          bearer = token;
          if (ctx) await ctx.close();
          ctx = await browser.newContext({ viewport: { width: 1400, height: 1000 } });
          await ctx.addCookies([{ name: "token", value: token, domain: "127.0.0.1", path: "/", httpOnly: true }]);
          page = await ctx.newPage();
          page.on("console", (m: ConsoleMessage) => { if (m.type() === "error") problems.push(`console: ${m.text()}`); });
          page.on("pageerror", (e: Error) => problems.push(`pageerror: ${e.message}`));
          page.on("response", (r: PwResponse) => { if (r.status() >= 400) problems.push(`HTTP ${r.status()} ${r.request().method()} ${r.url()}`); });
          out = `as ${who}`;
          break;
        }
        case "nav":
          await need().goto(BASE + rest.trim(), { waitUntil: "load" });
          out = need().url();
          break;
        case "wait-for":
          await need().locator(rest.trim()).first().waitFor({ state: "visible", timeout: TIMEOUT });
          break;
        case "wait-gone":
          await need().locator(rest.trim()).first().waitFor({ state: "hidden", timeout: TIMEOUT });
          break;
        case "click":
          await need().locator(rest.trim()).first().click({ timeout: TIMEOUT });
          break;
        case "fill": {
          const [sel, text] = arrow(rest);
          await need().locator(sel).first().fill(text ?? "", { timeout: TIMEOUT });
          break;
        }
        case "value":
          out = JSON.stringify(await need().locator(rest.trim()).first().inputValue({ timeout: TIMEOUT }));
          break;
        case "text":
          out = JSON.stringify((await need().locator(rest.trim()).first().innerText({ timeout: TIMEOUT })).trim());
          break;
        case "expect-value":
        case "expect-text": {
          const [sel, want = ""] = arrow(rest);
          const loc = need().locator(sel).first();
          let got = "";
          const deadline = Date.now() + TIMEOUT; // inputs render empty until their fetch lands — poll
          do {
            got = cmd === "expect-value" ? await loc.inputValue() : (await loc.innerText()).trim();
            if (got === want) break;
            await new Promise((r) => setTimeout(r, 250));
          } while (Date.now() < deadline);
          if (got !== want) throw new Error(`expected ${JSON.stringify(want)}, got ${JSON.stringify(got)}`);
          out = `= ${JSON.stringify(got)}`;
          break;
        }
        case "screenshot": {
          const [name, sel] = arrow(rest);
          const file = path.join(SHOTS, `${name || "shot"}.png`);
          if (sel) await need().locator(sel).first().screenshot({ path: file });
          else await need().screenshot({ path: file, fullPage: true });
          out = file;
          break;
        }
        case "api": {
          if (!ctx) throw new Error("not logged in: run `login <role>` first");
          const m = rest.trim().match(/^(\S+)\s+(\S+)\s*(.*)$/);
          if (!m) throw new Error("usage: api <METHOD> <path> [json-body]");
          const res = await ctx.request.fetch(BASE + m[2], {
            method: m[1].toUpperCase(),
            headers: { Authorization: `Bearer ${bearer}` },
            data: m[3] ? JSON.parse(m[3]) : undefined,
          });
          const type = res.headers()["content-type"] ?? "";
          const body = /json|text|html/.test(type)
            ? (await res.text()).slice(0, 600)
            : `<${type || "binary"}, ${(await res.body()).length} bytes>`;
          out = `${res.status()} ${body}`;
          break;
        }
        case "errors":
          out = problems.length ? `${problems.length}\n  ${problems.join("\n  ")}` : "none";
          break;
        case "keep":
          keep = true;
          out = "company row will NOT be restored on exit";
          break;
        case "quit":
          rl.close();
          break;
        default:
          throw new Error(`unknown command "${cmd}"`);
      }
      console.log(`  ${out}`);
      if (cmd === "quit") break;
    } catch (e) {
      exitCode = 1;
      console.log(`  FAIL: ${(e as Error).message.split("\n")[0]}`);
      if (page) {
        const file = path.join(SHOTS, "FAIL.png");
        await page.screenshot({ path: file, fullPage: true }).catch(() => {});
        console.log(`  failure screenshot: ${file}`);
      }
      break;
    }
  }
} finally {
  await browser.close();
  const after = await companyRow();
  const changed = Object.keys(before).filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after?.[k]));
  if (changed.length && !keep) {
    const restore: Row = {};
    for (const k of changed) restore[k] = before[k];
    await db.update(companies).set(restore).where(eq(companies.id, COMPANY));
  }
  console.log(`company "${String(before.name)}": ${changed.length ? `${keep ? "changed, KEPT" : "restored"} (${changed.join(", ")})` : "unchanged"}`);
  console.log(`browser problems: ${problems.length}`);
  for (const p of problems) console.log(`  ${p}`);
  process.exit(exitCode);
}
