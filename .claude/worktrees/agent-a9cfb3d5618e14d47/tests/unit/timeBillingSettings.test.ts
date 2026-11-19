// SPEC-005 / T008 — rates and ACH settings. The db client and config are mocked; nothing here
// opens a connection (the local .env points at production). Encryption is the real AES-256-GCM.
import { describe, it, expect, vi, beforeEach } from "vitest";

const TEST_KEY = "0123456789abcdef0123456789abcdef"; // 32 bytes, test only

const selectQueue: unknown[][] = [];
const updates: Record<string, unknown>[] = [];

// vi.mock is hoisted above TEST_KEY, so the key is repeated here.
vi.mock("../../src/server/config.js", () => ({ config: { ENCRYPTION_KEY: "0123456789abcdef0123456789abcdef" } }));

vi.mock("../../src/db/client.js", () => {
  const thenable = (rows: () => unknown[]): Record<string, unknown> => {
    const c: Record<string, unknown> = {};
    for (const m of ["from", "where", "limit"]) c[m] = () => c;
    c.then = (resolve: (v: unknown[]) => void) => resolve(rows());
    return c;
  };
  return {
    db: {
      select: () => thenable(() => selectQueue.shift() ?? []),
      update: () => ({
        set: (v: Record<string, unknown>) => {
          updates.push(v);
          return {
            where: () => ({
              returning: () => {
                const base = (selectQueue.shift() ?? [])[0] as Record<string, unknown> | undefined;
                return Promise.resolve(base ? [{ ...base, ...v }] : []);
              },
            }),
          };
        },
      }),
    },
  };
});

import { decryptToken, encryptToken } from "../../src/server/lib/crypto.js";
import {
  TimeBillingSettingsService,
  checkAchField,
  checkRate,
  isValidRoutingNumber,
} from "../../src/server/services/TimeBillingSettingsService.js";

// [SCOPE 005 / T008] BEGIN — unit tests for rates and ACH settings
const ROUTING = "021000021"; // a published test-valid ABA number
const ACCOUNT = "123456789012";

const emptyCompany = {
  hourlyrate: "150.00",
  resourcerate: "50.00",
  achbankname: null,
  achroutingnumber: null,
  achaccountnumber: null,
  achaccountname: null,
};

const enc = (v: string): string => encryptToken(v, TEST_KEY);

beforeEach(() => {
  selectQueue.length = 0;
  updates.length = 0;
});

describe("validation (FR-008, FR-012)", () => {
  it("normalizes rates and rejects bad ones", () => {
    expect(checkRate("175", "Developer rate")).toBe("175.00");
    expect(checkRate("49.5", "Resource rate")).toBe("49.50");
    expect(() => checkRate("-1", "Developer rate")).toThrow(/Developer rate/);
    expect(() => checkRate("12.345", "Developer rate")).toThrow(/2 decimals/);
    expect(() => checkRate("10000.01", "Developer rate")).toThrow(/10,000/);
  });

  it("checks the ABA routing checksum and account number shape", () => {
    expect(isValidRoutingNumber(ROUTING)).toBe(true);
    expect(isValidRoutingNumber("021000022")).toBe(false);
    expect(isValidRoutingNumber("12345678")).toBe(false);
    expect(() => checkAchField("accountnumber", "12ab")).toThrow(/4 to 17 digits/);
    expect(checkAchField("bankname", "  First Bank  ")).toBe("First Bank");
  });

  it("never repeats a rejected number in the error message", () => {
    try {
      checkAchField("routingnumber", "999999999");
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("999999999");
    }
    try {
      checkAchField("accountnumber", "99887766x");
    } catch (e) {
      expect(String((e as Error).message)).not.toContain("99887766");
    }
  });
});

describe("TimeBillingSettingsService (FR-008, FR-012)", () => {
  it("writes ciphertext only, and the view masks routing and account to the last 4", async () => {
    selectQueue.push([emptyCompany], [emptyCompany]); // before-load, then the row returning() merges into
    const r = await TimeBillingSettingsService.update("c1", {
      ach: { bankname: "First Bank", routingnumber: ROUTING, accountnumber: ACCOUNT, accountname: "wxPerts LLC" },
    });
    const written = updates[0] as Record<string, string>;
    for (const col of ["achbankname", "achroutingnumber", "achaccountnumber", "achaccountname"]) {
      expect(written[col]).toMatch(/^[0-9a-f]+:[0-9a-f]+:[0-9a-f]+$/);
    }
    expect(JSON.stringify(written)).not.toContain(ACCOUNT);
    expect(JSON.stringify(written)).not.toContain(ROUTING);
    expect(decryptToken(written.achaccountnumber!, TEST_KEY)).toBe(ACCOUNT);

    expect(r.after.ach).toEqual({
      bankname: "First Bank",
      routingnumberlast4: "0021",
      accountnumberlast4: "9012",
      accountname: "wxPerts LLC",
      complete: true,
    });
    expect(JSON.stringify(r)).not.toContain(ACCOUNT);
    expect(r.changed).toEqual(["ach.bankname", "ach.routingnumber", "ach.accountnumber", "ach.accountname"]);
  });

  it("a rate change returns before and after for the audit trail", async () => {
    selectQueue.push([emptyCompany], [emptyCompany]);
    const r = await TimeBillingSettingsService.update("c1", { developerRate: "175", resourceRate: "60" });
    expect(updates[0]).toMatchObject({ hourlyrate: "175.00", resourcerate: "60.00" });
    expect(r.before).toMatchObject({ developerRate: "150.00", resourceRate: "50.00" });
    expect(r.after).toMatchObject({ developerRate: "175.00", resourceRate: "60.00" });
  });

  it("a company with no Developer rate reads as the 150.00 default", async () => {
    selectQueue.push([{ ...emptyCompany, hourlyrate: null }]);
    const v = await TimeBillingSettingsService.get("c1");
    expect(v).toMatchObject({ developerRate: "150.00", resourceRate: "50.00" });
    expect(v.ach.complete).toBe(false);
  });

  it("rejects an empty update and an invalid routing number before writing", async () => {
    await expect(TimeBillingSettingsService.update("c1", {})).rejects.toMatchObject({ statusCode: 400 });
    await expect(
      TimeBillingSettingsService.update("c1", { ach: { routingnumber: "021000022" } }),
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(updates).toHaveLength(0);
  });

  it("the statement gets full ACH details only when every field is set", async () => {
    const full = {
      ...emptyCompany,
      achbankname: enc("First Bank"),
      achroutingnumber: enc(ROUTING),
      achaccountnumber: enc(ACCOUNT),
      achaccountname: enc("wxPerts LLC"),
    };
    selectQueue.push([full]);
    expect(await TimeBillingSettingsService.getStatementAch("c1")).toEqual({
      bankname: "First Bank",
      routingnumber: ROUTING,
      accountnumber: ACCOUNT,
      accountname: "wxPerts LLC",
    });
    selectQueue.push([{ ...full, achaccountname: null }]);
    expect(await TimeBillingSettingsService.getStatementAch("c1")).toBeNull();
  });

  it("an unreadable ACH value reads as unset instead of failing the page", async () => {
    selectQueue.push([{ ...emptyCompany, achaccountnumber: "not:valid:cipher" }]);
    const v = await TimeBillingSettingsService.get("c1");
    expect(v.ach.accountnumberlast4).toBeNull();
  });
});

describe("project rate overrides (FR-008)", () => {
  it("sets and clears overrides on a project of the company", async () => {
    const project = { id: "p1", hourlyrate: null, resourcerate: null };
    selectQueue.push([project], [project]);
    const r = await TimeBillingSettingsService.updateProjectRates("c1", "p1", { developerRate: "200", resourceRate: null });
    expect(updates[0]).toMatchObject({ hourlyrate: "200.00", resourcerate: null });
    expect(r.after).toEqual({ projectid: "p1", developerRate: "200.00", resourceRate: null });
  });

  it("a project of another company is 404", async () => {
    selectQueue.push([]);
    await expect(
      TimeBillingSettingsService.updateProjectRates("c1", "p9", { developerRate: "200" }),
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
// [SCOPE 005 / T008] END
