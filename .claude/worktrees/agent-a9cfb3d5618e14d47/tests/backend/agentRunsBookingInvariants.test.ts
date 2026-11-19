/**
 * [SCOPE 154 / T010] Resource-time booking via agentruns, reused as-is (FR-009).
 *
 * Pins the one acceptance criterion this task adds no new code for: agentruns carries no
 * person-attribution column, so booking a run — Autopilot's or any other — never attributes it
 * to a person.
 */
import { describe, expect, it } from "vitest";
import { agentruns } from "../../src/db/schema/agentrun.js";

describe("agentruns schema (FR-009)", () => {
  it("has no person-attribution column", () => {
    const columns = Object.keys(agentruns);
    expect(columns).not.toContain("userid");
    expect(columns).not.toContain("createdby");
    expect(columns).not.toContain("userId");
    expect(columns).not.toContain("createdBy");
  });
});
