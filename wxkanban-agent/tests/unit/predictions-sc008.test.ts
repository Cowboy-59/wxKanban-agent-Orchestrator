/**
 * [SCOPE 159 / T020] SC-008: 100% of logged assumptions have a review item; agents write 0 ledger
 * entries; in observe mode 0 thresholds change.
 */
import { afterEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DEFAULT_POLICY,
  HEAVY_TOUCHES,
  PredictionStore,
  hitRatePerArea,
  hitRatePerPersona,
  thresholdMayDrop,
  type Prediction,
  type ScoredRow,
} from "../../apps/remote-bridge/src/predictions";

const dirs: string[] = [];
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "sc008-"));
  dirs.push(d);
  return d;
};

function make(n: number): Prediction {
  const kind = n % 4;
  return {
    id: `p${n}`,
    question: `q${n}`,
    area: `area${n % 5}`,
    persona: `persona${n % 3}`,
    answer: `a${n}`,
    confidence: kind === 1 || kind === 2 ? "high" : "low",
    nuggetsCited: [],
    touches: kind === 2 ? [HEAVY_TOUCHES[n % HEAVY_TOUCHES.length] as string] : [],
    ledgerId: kind === 3 ? `L${n}` : undefined,
  };
}

describe("SC-008 every logged assumption has a review item", () => {
  it("400 mixed predictions: assumptions == reviews, same ids, none missing, none extra", () => {
    const assumed: string[] = [];
    const reviewed: string[] = [];
    const store = new PredictionStore(tmp(), { logAssumption: (p) => assumed.push(p.id), queueReview: (p) => reviewed.push(p.id) });
    const expected: string[] = [];
    for (let n = 1; n <= 400; n += 1) {
      const p = make(n);
      const d = store.record(p);
      if (d.action === "assume") {
        expected.push(p.id);
        expect(d.review).toBe(true);
      }
    }
    expect(expected.length).toBeGreaterThan(50);
    expect(assumed).toEqual(expected);
    expect(reviewed).toEqual(expected);
  });

  it("ledger, heavy and low confidence never assume, so they log no assumption", () => {
    const assumed: string[] = [];
    const reviewed: string[] = [];
    const store = new PredictionStore(tmp(), { logAssumption: (p) => assumed.push(p.id), queueReview: (p) => reviewed.push(p.id) });
    for (let n = 1; n <= 400; n += 1) {
      const p = make(n);
      const d = store.record(p);
      if (d.action !== "assume") {
        expect(assumed).not.toContain(p.id);
        expect(reviewed).not.toContain(p.id);
      }
    }
  });
});

describe("SC-008 agents write 0 ledger entries", () => {
  it("the store writes only decisions/predictions.jsonl; no ledger file appears", () => {
    const root = tmp();
    const store = new PredictionStore(root, { logAssumption: () => undefined, queueReview: () => undefined });
    for (let n = 1; n <= 200; n += 1) {
      const p = make(n);
      store.record(p);
      if (n % 2 === 0) store.score(p.id, n % 4 === 0 ? "approve" : "change");
    }
    const files: string[] = [];
    const walk = (dir: string) => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(dir, e.name));
        else files.push(join(dir, e.name).slice(root.length + 1).replace(/\\/g, "/"));
      }
    };
    walk(root);
    expect(files).toEqual(["decisions/predictions.jsonl"]);
    expect(files.some((f) => /ledger/i.test(f))).toBe(false);
    expect(existsSync(join(root, "decisions", "ledger.jsonl"))).toBe(false);
    expect(existsSync(join(root, "_wxAI", "askgate"))).toBe(false);
  });
});

describe("SC-008 observe mode changes 0 thresholds", () => {
  it("no area or persona may drop its threshold at any hit rate, even 100% over many verdicts", () => {
    const rows: ScoredRow[] = [];
    for (let i = 0; i < 300; i += 1) {
      rows.push({ predictionId: `p${i}`, area: `area${i % 6}`, persona: `persona${i % 4}`, verdict: "approve" });
    }
    const areas = hitRatePerArea(rows);
    const personas = hitRatePerPersona(rows);
    expect(areas.length).toBe(6);
    expect(personas.length).toBe(4);
    for (const h of [...areas, ...personas]) {
      expect(h.rate).toBe(1);
      expect(h.scored).toBeGreaterThanOrEqual(DEFAULT_POLICY.minScored);
      expect(thresholdMayDrop(h)).toBe(false);
      expect(thresholdMayDrop(h, DEFAULT_POLICY)).toBe(false);
    }
    expect(DEFAULT_POLICY.mode).toBe("observe");
  });

  it("control: the same rows in enforce mode would earn a drop, so the observe result is the mode, not the data", () => {
    const h = { key: "a", approved: 30, scored: 30, rate: 1 };
    expect(thresholdMayDrop(h, { ...DEFAULT_POLICY, mode: "enforce" })).toBe(true);
    expect(thresholdMayDrop(h)).toBe(false);
  });
});
