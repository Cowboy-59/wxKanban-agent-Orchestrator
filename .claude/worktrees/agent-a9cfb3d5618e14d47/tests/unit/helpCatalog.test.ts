// [SCOPE 084 / T009] Tests: catalog coverage, authoritative availability,
// tier-model drift, and viewer-plan auto-selection.
import { describe, it, expect } from "vitest";
import {
  PLANS,
  HELP_FEATURES,
  CATEGORIES,
  availabilityFor,
  billingPlanToPublicPlan,
  type PlanId,
} from "../../src/shared/help/catalog.js";
import { checkHelpDrift, unexpectedHelpDrift } from "../../src/server/services/helpDrift.js";
import { HELP_GUIDES } from "../../src/shared/help/guides.js";
import { HELP_ARTICLES, hasArticle } from "../../src/shared/help/articles.js";

describe("Help catalog — coverage (metric 1)", () => {
  it("documents every dashboard nav area and gated feature", () => {
    // Areas surfaced in AppShell nav + the tier-gated capabilities.
    const required = [
      "dashboard", "projects", "tasks", "settings", "faq",
      "lifecycle", "specs", "audit", "cockpit",
      "pmIntegrations", "team",
      "timeTracking", "invoices", "reports", "workHub",
      "stackProfiles", "themeProfiles",
      "sso", "customIntegrations", "dedicatedSupport", "sla",
    ];
    const ids = new Set(HELP_FEATURES.map((f) => f.id));
    for (const id of required) {
      expect(ids.has(id), `missing catalog entry: ${id}`).toBe(true);
    }
  });

  it("has no duplicate ids and every feature sits in a known, non-empty category", () => {
    const ids = HELP_FEATURES.map((f) => f.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const f of HELP_FEATURES) {
      expect(CATEGORIES).toContain(f.category);
    }
    for (const cat of CATEGORIES) {
      expect(HELP_FEATURES.some((f) => f.category === cat), `empty category: ${cat}`).toBe(true);
    }
  });

  it("every feature has a description and how-to", () => {
    for (const f of HELP_FEATURES) {
      expect(f.description.trim().length).toBeGreaterThan(0);
      expect(f.howTo.trim().length).toBeGreaterThan(0);
    }
  });

  it("every feature has a non-empty step-by-step guide (drill-down page)", () => {
    for (const f of HELP_FEATURES) {
      const steps = HELP_GUIDES[f.id];
      expect(Array.isArray(steps) && steps.length > 0, `missing guide: ${f.id}`).toBe(true);
      for (const s of steps) expect(s.trim().length).toBeGreaterThan(0);
    }
    // No orphan guides for features that don't exist.
    const ids = new Set(HELP_FEATURES.map((f) => f.id));
    for (const key of Object.keys(HELP_GUIDES)) expect(ids.has(key), `orphan guide: ${key}`).toBe(true);
  });
});

describe("Help — deep per-area articles", () => {
  const UI_AREAS = [
    "dashboard", "projects", "tasks", "pmIntegrations", "team",
    "timeTracking", "invoices", "reports", "workHub",
    "stackProfiles", "themeProfiles", "settings", "faq",
  ];

  it("every real UI area has a rich article", () => {
    for (const id of UI_AREAS) {
      expect(hasArticle(id), `missing article: ${id}`).toBe(true);
    }
  });

  it("articles map only to real features, and controls have a label + description", () => {
    const ids = new Set(HELP_FEATURES.map((f) => f.id));
    for (const [key, article] of Object.entries(HELP_ARTICLES)) {
      expect(ids.has(key), `orphan article: ${key}`).toBe(true);
      for (const c of article.controls ?? []) {
        expect(c.label.trim().length).toBeGreaterThan(0);
        expect(c.does.trim().length).toBeGreaterThan(0);
      }
      for (const t of article.tasks ?? []) {
        expect(t.title.trim().length).toBeGreaterThan(0);
        expect(t.steps.length).toBeGreaterThan(0);
      }
    }
  });
});

describe("Help catalog — authoritative availability (metric 2)", () => {
  const plansAsc: PlanId[] = ["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"];

  it("Time Tracking, Invoices, and Reports are Consultant+ (not Single User / Small Business)", () => {
    for (const id of ["timeTracking", "invoices", "reports"]) {
      const f = HELP_FEATURES.find((x) => x.id === id)!;
      expect(availabilityFor(f, "SINGLE_USER").status).toBe("upgrade_required");
      expect(availabilityFor(f, "SMALL_BUSINESS").status).toBe("upgrade_required");
      expect(availabilityFor(f, "SINGLE_USER").unlockingPlan).toBe("CONSULTANT");
      expect(availabilityFor(f, "CONSULTANT").status).toBe("included");
      expect(availabilityFor(f, "ENTERPRISE").status).toBe("included");
    }
  });

  it("Team Management is Small Business+ (not on Single User)", () => {
    const team = HELP_FEATURES.find((x) => x.id === "team")!;
    expect(availabilityFor(team, "SINGLE_USER").status).toBe("upgrade_required");
    expect(availabilityFor(team, "SMALL_BUSINESS").status).toBe("included");
  });

  it("core areas are included on every plan", () => {
    for (const id of ["dashboard", "projects", "tasks"]) {
      const f = HELP_FEATURES.find((x) => x.id === id)!;
      for (const p of plansAsc) expect(availabilityFor(f, p).status).toBe("included");
    }
  });

  it("availability is monotonic — once included, it stays included at higher plans", () => {
    for (const f of HELP_FEATURES) {
      let seenIncluded = false;
      for (const p of plansAsc) {
        const inc = availabilityFor(f, p).status === "included";
        if (seenIncluded) expect(inc, `${f.id} regressed at ${p}`).toBe(true);
        if (inc) seenIncluded = true;
      }
    }
  });
});

describe("Help catalog — drift vs code tier model (metric 2)", () => {
  it("has no unexpected drift — only the two documented, accepted divergences", () => {
    expect(unexpectedHelpDrift()).toEqual([]);
  });

  it("still surfaces the known accepted divergences (guard against silent 'fixes')", () => {
    const drifts = checkHelpDrift();
    const ids = drifts.map((d) => d.featureId).sort();
    expect(ids).toEqual(["pmIntegrations", "timeTracking"]);
    expect(drifts.every((d) => d.accepted)).toBe(true);
  });
});

describe("Help — viewer plan auto-selection (metric 3)", () => {
  it("maps each of the four public plans to itself", () => {
    for (const p of ["SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE"] as PlanId[]) {
      expect(billingPlanToPublicPlan(p)).toBe(p);
    }
  });

  it("maps internal FREE and unknown values to the entry-level Single User plan", () => {
    expect(billingPlanToPublicPlan("FREE")).toBe("SINGLE_USER");
    expect(billingPlanToPublicPlan(null)).toBe("SINGLE_USER");
    expect(billingPlanToPublicPlan(undefined)).toBe("SINGLE_USER");
    expect(billingPlanToPublicPlan("SOMETHING_ELSE")).toBe("SINGLE_USER");
  });

  it("PLANS are the four public plans in ascending order", () => {
    expect(PLANS.map((p) => p.id)).toEqual([
      "SINGLE_USER", "SMALL_BUSINESS", "CONSULTANT", "ENTERPRISE",
    ]);
    expect(PLANS.map((p) => p.order)).toEqual([1, 2, 3, 4]);
  });
});
