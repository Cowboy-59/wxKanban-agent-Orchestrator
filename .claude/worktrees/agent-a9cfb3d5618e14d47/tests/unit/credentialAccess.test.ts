/**
 * SPEC-017 FR-007 — credential scope policy.
 *
 * This guards decrypted secrets, so every branch is asserted. The property that
 * matters most: a PERSONAL credential is readable by its owner and by NOBODY
 * else — including a Team Manager, an Admin and a SysAdmin. The spec grants no
 * elevated-role exemption, so none exists, and these tests are what stop one
 * being added by accident later.
 */

import { describe, it, expect } from "vitest";
import {
  canViewConnectionMetadata,
  canDecryptCredentials,
  canDeleteConnection,
  canEditConnection,
  toPublicConnection,
} from "../../src/server/lib/credentialAccess.js";

const COMPANY = "11111111-1111-1111-1111-111111111111";
const OTHER_COMPANY = "22222222-2222-2222-2222-222222222222";
const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";

const personal = { consultantid: OWNER, companyid: COMPANY, credentialscope: "PERSONAL" };
const team = { consultantid: OWNER, companyid: COMPANY, credentialscope: "TEAM" };

const owner = { userid: OWNER, companyid: COMPANY, usertype: "TEAM" };
const colleague = { userid: OTHER, companyid: COMPANY, usertype: "TEAM" };
const manager = { userid: OTHER, companyid: COMPANY, usertype: "TEAM_MANAGER" };
const admin = { userid: OTHER, companyid: COMPANY, usertype: "ADMIN" };
const sysadmin = { userid: OTHER, companyid: COMPANY, usertype: "SYSADMIN" };
const outsider = { userid: OTHER, companyid: OTHER_COMPANY, usertype: "ADMIN" };

describe("FR-010 — metadata visibility is deliberately wide", () => {
  it("any member of the owning company can see a connection exists", () => {
    for (const c of [owner, colleague, manager, admin, sysadmin]) {
      expect(canViewConnectionMetadata(personal, c)).toBe(true);
      expect(canViewConnectionMetadata(team, c)).toBe(true);
    }
  });

  it("nobody outside the company can", () => {
    expect(canViewConnectionMetadata(personal, outsider)).toBe(false);
    expect(canViewConnectionMetadata(team, outsider)).toBe(false);
  });

  it("an unauthenticated caller cannot", () => {
    expect(canViewConnectionMetadata(personal, { companyid: COMPANY })).toBe(false);
  });
});

describe("FR-007 — PERSONAL credentials are the owner's alone", () => {
  it("the owner can decrypt", () => {
    expect(canDecryptCredentials(personal, owner)).toBe(true);
  });

  it("a colleague CANNOT", () => {
    expect(canDecryptCredentials(personal, colleague)).toBe(false);
  });

  it("a Team Manager CANNOT — no elevated-role exemption exists", () => {
    expect(canDecryptCredentials(personal, manager)).toBe(false);
  });

  it("an Admin CANNOT", () => {
    expect(canDecryptCredentials(personal, admin)).toBe(false);
  });

  it("a SysAdmin CANNOT — the highest role in the system still cannot read a personal secret", () => {
    expect(canDecryptCredentials(personal, sysadmin)).toBe(false);
  });
});

describe("FR-007 — TEAM credentials open to managers, not to peers", () => {
  it("the owner can decrypt", () => {
    expect(canDecryptCredentials(team, owner)).toBe(true);
  });

  it("a Team Manager can", () => {
    expect(canDecryptCredentials(team, manager)).toBe(true);
  });

  it("an Admin and a SysAdmin can", () => {
    expect(canDecryptCredentials(team, admin)).toBe(true);
    expect(canDecryptCredentials(team, sysadmin)).toBe(true);
  });

  it("an ordinary colleague still CANNOT — TEAM means managers, not everyone", () => {
    expect(canDecryptCredentials(team, colleague)).toBe(false);
  });

  it("nobody outside the company can, whatever their role", () => {
    expect(canDecryptCredentials(team, outsider)).toBe(false);
  });
});

describe("fail-closed on unexpected input", () => {
  it("denies an unrecognised scope rather than falling through to allow", () => {
    const corrupt = { consultantid: OWNER, companyid: COMPANY, credentialscope: "EVERYONE" };
    expect(canDecryptCredentials(corrupt, manager)).toBe(false);
    expect(canDecryptCredentials(corrupt, admin)).toBe(false);
    // The owner still gets their own row — ownership is checked before scope.
    expect(canDecryptCredentials(corrupt, owner)).toBe(true);
  });

  it("denies a missing row rather than throwing", () => {
    expect(canDecryptCredentials(null, owner)).toBe(false);
    expect(canViewConnectionMetadata(undefined, owner)).toBe(false);
    expect(canDeleteConnection(null, owner)).toBe(false);
  });
});

describe("FR-010 — deletion is administrative, not a read", () => {
  it("the owner can delete", () => {
    expect(canDeleteConnection(personal, owner)).toBe(true);
  });

  it("a Team Manager can delete a PERSONAL connection they cannot read", () => {
    expect(canDecryptCredentials(personal, manager)).toBe(false);
    expect(canDeleteConnection(personal, manager)).toBe(true);
  });

  it("an ordinary colleague cannot delete", () => {
    expect(canDeleteConnection(personal, colleague)).toBe(false);
  });
});

describe("editing requires the ability to read", () => {
  it("a manager cannot blind-overwrite a PERSONAL credential", () => {
    expect(canEditConnection(personal, manager)).toBe(false);
  });

  it("but can edit a TEAM one", () => {
    expect(canEditConnection(team, manager)).toBe(true);
  });
});

describe("secrets never cross the API boundary", () => {
  it("toPublicConnection strips credentialsencrypted", () => {
    const row = {
      id: "c1",
      name: "Jira Cloud",
      credentialsencrypted: "iv:tag:ciphertext",
      status: "connected",
    };
    const pub = toPublicConnection(row);
    expect(pub).not.toHaveProperty("credentialsencrypted");
    expect(pub).toMatchObject({ id: "c1", name: "Jira Cloud", status: "connected" });
  });

  it("is safe on a row that has no credentials field", () => {
    const pub = toPublicConnection({ id: "c1", name: "X" });
    expect(pub).toMatchObject({ id: "c1", name: "X" });
  });
});
