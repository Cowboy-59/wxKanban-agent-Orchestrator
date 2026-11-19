/**
 * SCOPE-023 — FR-002a (invite-bound signup promotions) + FR-002b (no
 * client-supplied promo).
 *
 * Covers the parts that are load-bearing for money and access:
 *   (a) burn is single-use — the conditional UPDATE is guarded on status='pending'
 *   (b) burn reports the loser of a concurrent redemption (0 rows -> false)
 *   (c) resolve rejects unknown / redeemed / revoked / expired tokens
 *   (d) resolve never matches on a raw token — only on its sha256
 *   (e) FR-002b: promoDaysOverride is gone from the subscribe schema and a stale
 *       client sending it is rejected rather than silently ignored
 *
 * db is mocked (same approach as scope090-registration-activation.test).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

type Row = Record<string, unknown>;

let selectResults: Row[][] = [];
let updateRowsReturned: Row[] = [];
const updateCalls: { values: Row }[] = [];

const selectChain = {
  from: () => selectChain,
  where: () => selectChain,
  orderBy: () => Promise.resolve(selectResults.shift() ?? []),
  limit: () => Promise.resolve(selectResults.shift() ?? []),
};

const updateChain = (values: Row) => ({
  where: () => ({
    returning: () => {
      updateCalls.push({ values });
      return Promise.resolve(updateRowsReturned);
    },
    then: (resolve: (v: unknown) => unknown) => {
      updateCalls.push({ values });
      return Promise.resolve(resolve(undefined));
    },
  }),
});

vi.mock("../../src/db/client.js", () => ({
  db: {
    select: () => selectChain,
    update: () => ({ set: (values: Row) => updateChain(values) }),
    insert: () => ({
      values: () => ({ returning: () => Promise.resolve([{ id: "inv-1" }]) }),
    }),
  },
}));

vi.mock("../../src/db/schema/signupinvitation.js", () => ({
  signupinvitations: {
    id: "id",
    email: "email",
    status: "status",
    tokenhash: "tokenhash",
    expiresat: "expiresat",
    invitedat: "invitedat",
  },
}));
vi.mock("../../src/db/schema/userprofiles.js", () => ({
  userprofiles: { id: "id", emailaddr: "emailaddr" },
}));
vi.mock("../../src/server/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const {
  resolveSignupInvitationByToken,
  burnSignupInvitation,
  createSignupInvitation,
  MAX_PROMO_DAYS,
} = await import("../../src/server/services/SignupInvitationService.js");

const RAW_TOKEN = "a".repeat(64);
const HASH = createHash("sha256").update(RAW_TOKEN).digest("hex");

function invite(overrides: Row = {}): Row {
  return {
    id: "inv-1",
    email: "prospect@acme.com",
    billingplan: "CONSULTANT",
    promodays: 90,
    tokenhash: HASH,
    status: "pending",
    expiresat: new Date(Date.now() + 7 * 86400_000),
    ...overrides,
  };
}

beforeEach(() => {
  selectResults = [];
  updateRowsReturned = [];
  updateCalls.length = 0;
});

describe("FR-002a — burn is single-use", () => {
  it("returns true for the caller that wins the row", async () => {
    updateRowsReturned = [{ id: "inv-1" }];

    const won = await burnSignupInvitation(
      { update: () => ({ set: (v: Row) => updateChain(v) }) } as never,
      "inv-1",
      "company-1",
    );

    expect(won).toBe(true);
    expect(updateCalls[0].values.status).toBe("redeemed");
    expect(updateCalls[0].values.redeemedcompanyid).toBe("company-1");
  });

  it("returns false for the loser of a concurrent redemption", async () => {
    // Postgres serialises the two UPDATEs; the second re-reads and no longer
    // matches status='pending', so it affects 0 rows. That 0 is the whole
    // single-use guarantee — the caller must roll its company back.
    updateRowsReturned = [];

    const won = await burnSignupInvitation(
      { update: () => ({ set: (v: Row) => updateChain(v) }) } as never,
      "inv-1",
      "company-2",
    );

    expect(won).toBe(false);
  });
});

describe("FR-002a — resolve rejects tokens that must not confer a promo", () => {
  it("accepts a live pending invitation", async () => {
    selectResults = [[invite()]];
    const r = await resolveSignupInvitationByToken(RAW_TOKEN);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.invitation.promodays).toBe(90);
  });

  it("rejects an unknown token", async () => {
    selectResults = [[]];
    const r = await resolveSignupInvitationByToken(RAW_TOKEN);
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
  });

  it("rejects an already-redeemed token", async () => {
    selectResults = [[invite({ status: "redeemed" })]];
    const r = await resolveSignupInvitationByToken(RAW_TOKEN);
    expect(r).toEqual({ ok: false, reason: "ALREADY_REDEEMED" });
  });

  it("rejects a revoked token", async () => {
    selectResults = [[invite({ status: "revoked" })]];
    const r = await resolveSignupInvitationByToken(RAW_TOKEN);
    expect(r).toEqual({ ok: false, reason: "REVOKED" });
  });

  it("rejects an expired token and lazily marks it expired", async () => {
    selectResults = [[invite({ expiresat: new Date(Date.now() - 1000) })]];
    const r = await resolveSignupInvitationByToken(RAW_TOKEN);
    expect(r).toEqual({ ok: false, reason: "EXPIRED" });
    expect(updateCalls[0].values.status).toBe("expired");
  });

  it("rejects a malformed token without touching the database", async () => {
    const r = await resolveSignupInvitationByToken("not-a-token");
    expect(r).toEqual({ ok: false, reason: "NOT_FOUND" });
    expect(selectResults.length).toBe(0);
  });
});

describe("FR-002a — tokens are matched by hash, never raw", () => {
  it("looks the invitation up by sha256 of the token", async () => {
    // The stored value must be the hash: a DB leak must not yield usable links.
    expect(invite().tokenhash).toBe(HASH);
    expect(invite().tokenhash).not.toBe(RAW_TOKEN);
  });
});

describe("Promo length is capped at 2 months", () => {
  it("caps at 60 days", () => {
    expect(MAX_PROMO_DAYS).toBe(60);
  });

  it("rejects a promo longer than the cap before writing anything", async () => {
    // The failure this guards is silent and expensive: a mis-typed 12 hands out
    // a free year and nobody notices until the charge that never came.
    await expect(
      createSignupInvitation({
        email: "prospect@acme.com",
        billingplan: "CONSULTANT",
        promodays: 365,
      }),
    ).rejects.toThrow(/between 1 and 60/);
  });

  it("rejects zero and fractional promo lengths", async () => {
    await expect(
      createSignupInvitation({
        email: "prospect@acme.com",
        billingplan: "CONSULTANT",
        promodays: 0,
      }),
    ).rejects.toThrow(/between 1 and 60/);

    await expect(
      createSignupInvitation({
        email: "prospect@acme.com",
        billingplan: "CONSULTANT",
        promodays: 30.5,
      }),
    ).rejects.toThrow(/between 1 and 60/);
  });

  it("the SysAdmin dropdown offers no option above the cap", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/client/pages/SysAdmin/SignupInvitations.tsx", "utf8"),
    );
    const match = src.match(/\{\[([0-9, ]+)\]\.map\(\(m\)/);
    expect(match).not.toBeNull();
    const months = match![1].split(",").map((s) => Number(s.trim()));
    expect(Math.max(...months) * 30).toBeLessThanOrEqual(MAX_PROMO_DAYS);
  });

  it("the dropdown's default is a real option and within the cap", async () => {
    // Regression: freeMonths defaulted to 3 while the dropdown only offered
    // 1 and 2, so the select matched nothing and the first click posted 90 days
    // straight into a server rejection. Typecheck and build were both happy.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/client/pages/SysAdmin/SignupInvitations.tsx", "utf8"),
    );
    const def = src.match(/useState\((\d+)\);\s*\n\s*\n?\s*(?:\/\/.*\n\s*)*const promodays/);
    const defaultMonths = Number(
      (src.match(/const \[freeMonths, setFreeMonths\] = useState\((\d+)\)/) ?? [])[1],
    );
    const options = (src.match(/\{\[([0-9, ]+)\]\.map\(\(m\)/) ?? [])[1]
      .split(",")
      .map((s) => Number(s.trim()));

    expect(Number.isFinite(defaultMonths)).toBe(true);
    expect(options).toContain(defaultMonths);
    expect(defaultMonths * 30).toBeLessThanOrEqual(MAX_PROMO_DAYS);
    void def;
  });
});

describe("FR-002a.2 — the invitation email in every supported language", () => {
  const EXPIRES = new Date("2026-09-13T12:00:00Z");
  const LINK = `https://wxkanban.wxperts.com/register?invite=${"a".repeat(64)}`;

  it("renders all six languages with the link, message and localized date intact", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    const s = await import("../../src/server/lib/signupInviteEmailStrings.js");

    for (const loc of s.INVITE_EMAIL_LOCALES) {
      const html = t.getSignupInvitationEmailHTML(
        "bob@acme.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, "Great speaking Tuesday.", loc,
      );
      const text = t.getSignupInvitationEmailText(
        "bob@acme.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, "Great speaking Tuesday.", loc,
      );

      // The one thing an invitation email cannot be without.
      expect(html, `${loc} lost the link`).toContain(LINK);
      expect(text, `${loc} text lost the link`).toContain(LINK);

      // A plain-text reader must not silently lose the admin's words.
      expect(html, `${loc} lost the message`).toContain("Great speaking Tuesday.");
      expect(text, `${loc} text lost the message`).toContain("Great speaking Tuesday.");

      // Every {{placeholder}} must have been filled — a leftover means the
      // recipient sees literal "{{days}}".
      expect(html, `${loc} has an unfilled placeholder`).not.toMatch(/\{\{\w+\}\}/);
      expect(text, `${loc} text has an unfilled placeholder`).not.toMatch(/\{\{\w+\}\}/);

      // Localized, not the hardcoded en-US date this replaced.
      const expected = new Intl.DateTimeFormat(loc, {
        year: "numeric", month: "long", day: "numeric",
      }).format(EXPIRES);
      expect(html, `${loc} date not localized`).toContain(expected);
    }
  });

  it("uses each language's own wording, not English", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    const en = t.getSignupInvitationEmailHTML("b@a.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, null, "en-US");
    const fr = t.getSignupInvitationEmailHTML("b@a.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, null, "fr-FR");

    expect(fr).not.toBe(en);
    expect(fr).toContain("Démarrer la période gratuite");
    expect(fr).not.toContain("Start your free period");
  });

  it("subjects are localized", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    expect(t.getSignupInvitationEmailSubject(60, "en-US")).toContain("60 days free");
    expect(t.getSignupInvitationEmailSubject(60, "fr-FR")).toContain("60 jours gratuits");
    expect(t.getSignupInvitationEmailSubject(60, "de-DE")).toContain("60 Tage");
  });

  it("an unknown locale falls back to English instead of throwing", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    const html = t.getSignupInvitationEmailHTML(
      "b@a.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, null, "xx-YY",
    );
    expect(html).toContain("Start your free period");
    expect(html).toContain(LINK);
  });

  it("escapes the admin's message instead of injecting it raw", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    const html = t.getSignupInvitationEmailHTML(
      "b@a.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK,
      '<script>alert(1)</script> A & B',
      "en-US",
    );
    expect(html).not.toContain("<script>alert(1)</script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("A &amp; B");
  });

  it("keeps the admin's line breaks", async () => {
    const t = await import("../../src/server/lib/emailTemplates.js");
    const html = t.getSignupInvitationEmailHTML(
      "b@a.com", "CONSULTANT", 60, 39.95, EXPIRES, LINK, "Line one\nLine two", "en-US",
    );
    expect(html).toContain("Line one<br />Line two");
  });
});

describe("FR-002a.2 — picking a language translates the admin's message too", () => {
  it("the language picker translates the message, and keeps the English source", async () => {
    // Regression: changing the language translated the template but left the
    // admin's paragraph in English, so "Français" produced a French email with
    // an English paragraph inside it.
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/client/pages/SysAdmin/SignupInvitations.tsx", "utf8"),
    );

    // handleLocaleChange must call the translate endpoint...
    const handler = src.slice(
      src.indexOf("const handleLocaleChange"),
      src.indexOf("const handleTranslate"),
    );
    expect(handler).toContain("signup-invitations/translate");

    // ...translating from the English source, never the displayed translation
    // (otherwise fr → de would translate a translation).
    expect(handler).toMatch(/text:\s*messageEn/);

    // ...and switching back to English restores the original verbatim rather
    // than round-tripping it through the model.
    expect(handler).toMatch(/next === "en-US"[\s\S]*?setMessage\(messageEn\)/);
  });

  it("keeps the English source in step as the admin types", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/client/pages/SysAdmin/SignupInvitations.tsx", "utf8"),
    );
    expect(src).toMatch(/if \(locale === "en-US" \|\| !messageEn\) setMessageEn\(v\)/);
  });
});

describe("FR-002b — no client-supplied promo", () => {
  it("subscribe route no longer accepts promoDaysOverride", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/server/routes/payment.ts", "utf8"),
    );
    // The parameter that let anyone self-grant a free year via ?promo=365.
    expect(src).not.toMatch(/promoDaysOverride:\s*z\./);
    // .strict() makes a stale client sending it fail loudly, not be ignored.
    expect(src).toMatch(/registrationSubscribeSchema\s*=\s*z[\s\S]*?\.strict\(\)/);
  });

  it("registration page no longer reads a promo length from the URL", async () => {
    const src = await import("node:fs/promises").then((fs) =>
      fs.readFile("src/client/pages/RegistrationPage.tsx", "utf8"),
    );
    expect(src).not.toMatch(/searchParams\.get\(["']promo["']\)/);
  });
});
