import { describe, expect, it } from "vitest";
import {
  UnsafeIdentifierError,
  isSafeIdentifier,
  qualify,
  quoteIdent,
} from "../../_wxAI/skills/wxDBAnalyze/scripts/core/identifiers.js";

describe("isSafeIdentifier", () => {
  it.each(["users", "project_users", "companyId", "t1"])("accepts %s", (n) => {
    expect(isSafeIdentifier(n)).toBe(true);
  });

  it.each([
    "users; drop table x",
    'users"',
    "users--",
    "",
    "a".repeat(64),
    "user name",
  ])("rejects %s", (n) => {
    expect(isSafeIdentifier(n)).toBe(false);
  });
});

describe("quoteIdent", () => {
  it("double-quotes a safe identifier", () => {
    expect(quoteIdent("tasks")).toBe('"tasks"');
  });

  it("throws rather than emitting an unsafe identifier", () => {
    expect(() => quoteIdent('x"; drop table y --')).toThrow(
      UnsafeIdentifierError,
    );
  });
});

describe("qualify", () => {
  it("qualifies a column against its table", () => {
    expect(qualify("tasks", "projectid")).toBe('"tasks"."projectid"');
  });

  it("qualifies a bare table", () => {
    expect(qualify("tasks")).toBe('"tasks"');
  });
});
