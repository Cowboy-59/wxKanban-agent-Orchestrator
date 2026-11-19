/**
 * [SCOPE 154 / T006] Never-push / never-production reuse (FR-005).
 */
import { describe, expect, it } from "vitest";
import { detectsGatedAction, formatProductionPark } from "../../apps/remote-bridge/src/autopilot-guard";

describe("detectsGatedAction", () => {
  it("returns undefined for an ordinary unit", () => {
    expect(detectsGatedAction({ num: "010", title: "Billing", text: "Round invoice totals to the cent." })).toBeUndefined();
  });

  it("detects a unit whose text names a production database write", () => {
    const hit = detectsGatedAction({
      num: "020",
      title: "Backfill",
      text: "Run `psql $DATABASE_URL -c \"update users set x=1 where id=1\"` to backfill one row.",
    });
    expect(hit).toEqual({ scope: "SCOPE-020", title: "Backfill", actions: ["prodatawrite"] });
  });

  it("detects a unit whose text names a git push", () => {
    const hit = detectsGatedAction({ num: "021", title: "Release", text: "After the commit, run git push origin main." });
    expect(hit).toEqual({ scope: "SCOPE-021", title: "Release", actions: ["gitpush"] });
  });

  it("does not fire on a mention of 'database' alone", () => {
    expect(detectsGatedAction({ num: "022", title: "Notes", text: "Add a note field to the database schema." })).toBeUndefined();
  });
});

describe("formatProductionPark", () => {
  it("names the scope, title, and the gated action, and says it is left untouched", () => {
    const text = formatProductionPark({ scope: "SCOPE-020", title: "Backfill", actions: ["prodatawrite"] });
    expect(text).toContain("SCOPE-020: Backfill");
    expect(text).toContain("a write against the production database");
    expect(text).toContain("never writes to production");
    expect(text).toContain("left untouched");
  });

  it("names both actions when a unit hits both", () => {
    const text = formatProductionPark({ scope: "SCOPE-023", title: "Both", actions: ["gitpush", "prodatawrite"] });
    expect(text).toContain("a git push and a write against the production database");
  });
});
