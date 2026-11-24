/**
 * [SCOPE 159 / T011] Predictions, review and hit rate (FR-036..FR-038).
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  PredictionStore,
  decide,
  hitRatePerArea,
  hitRatePerPersona,
  thresholdMayDrop,
  type Prediction,
} from "../../apps/remote-bridge/src/predictions";

const dirs: string[] = [];
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "pr-"));
  dirs.push(d);
  return d;
};
afterEach(() => {
  while (dirs.length) rmSync(dirs.pop() as string, { recursive: true, force: true });
});

const pred = (id: string, o: Partial<Prediction> = {}): Prediction => ({
  id, question: "q", area: "ui", persona: "builder", answer: "a", confidence: "high", nuggetsCited: ["n1"], touches: [], ...o,
});

describe("UT-048 decide", () => {
  it("a heavy-class question with a high-confidence prediction still asks", () => {
    expect(decide({ confidence: "high", touches: ["money"] })).toEqual({ action: "ask", reason: "heavy_class" });
  });
  it("an approved ledger entry answers directly with no review", () => {
    expect(decide({ confidence: "low", touches: ["auth"], ledgerId: "L-9" })).toEqual({ action: "answer", reason: "ledger", ledgerId: "L-9" });
  });
  it("high confidence assumes with review; low confidence asks", () => {
    expect(decide({ confidence: "high", touches: [] })).toMatchObject({ action: "assume", review: true });
    expect(decide({ confidence: "low", touches: [] })).toEqual({ action: "ask", reason: "low_confidence" });
  });
});

describe("UT-049 store, hit rate and observe mode", () => {
  it("every logged assumption has a matching review item; ledger answers have none", () => {
    const assumed: string[] = [];
    const reviewed: string[] = [];
    const s = new PredictionStore(tmp(), { logAssumption: (p) => assumed.push(p.id), queueReview: (p) => reviewed.push(p.id) });
    s.record(pred("a"));
    s.record(pred("b", { ledgerId: "L-1" }));
    s.record(pred("c", { confidence: "low" }));
    expect(assumed).toEqual(["a"]);
    expect(reviewed).toEqual(assumed);
  });
  it("per-area hit rate is approved over scored, and per persona", () => {
    const s = new PredictionStore(tmp());
    s.record(pred("a")); s.record(pred("b")); s.record(pred("c", { area: "db", persona: "dba" }));
    s.score("a", "approve"); s.score("b", "change"); s.score("c", "approve");
    expect(s.score("zzz", "approve")).toBeUndefined();
    const area = Object.fromEntries(hitRatePerArea(s.scored()).map((h) => [h.key, h.rate]));
    expect(area).toEqual({ ui: 0.5, db: 1 });
    expect(hitRatePerPersona(s.scored()).find((h) => h.key === "dba")?.scored).toBe(1);
  });
  it("observe mode never drops a threshold; enforce needs the rate and the sample", () => {
    const perfect = { key: "ui", approved: 50, scored: 50, rate: 1 };
    expect(thresholdMayDrop(perfect)).toBe(false);
    expect(thresholdMayDrop(perfect, { mode: "enforce", earnRate: 0.9, minScored: 20 })).toBe(true);
    expect(thresholdMayDrop({ ...perfect, scored: 5 }, { mode: "enforce", earnRate: 0.9, minScored: 20 })).toBe(false);
  });
});
