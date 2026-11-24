// Predictions, owner review and hit rate (SPEC-159 FR-036, FR-037, FR-038).
// Pure decision + a JSONL store. Writing assumptions.yaml and the review queue is injected, so
// the existing gate.mjs / kain.mjs paths stay the only writers. Nothing here touches the ledger.

import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";

// [SCOPE 159 / T011] BEGIN — Predict, then proceed or ask (FR-036)
export type Confidence = "high" | "low";
export type HeavyTouch = "security" | "auth" | "money" | "schema" | "migration" | "production";
export const HEAVY_TOUCHES: readonly HeavyTouch[] = ["security", "auth", "money", "schema", "migration", "production"];

export interface Prediction {
  id: string;
  question: string;
  area: string;
  persona: string;
  answer: string;
  confidence: Confidence;
  nuggetsCited: string[];
  touches: string[];
  /** An approved, non-superseded ledger entry answered it: certain, no review. */
  ledgerId?: string;
}

export type Decision =
  | { action: "answer"; reason: "ledger"; ledgerId: string }
  | { action: "assume"; reason: "high_confidence"; review: true }
  | { action: "ask"; reason: "heavy_class" | "low_confidence" };

export function isHeavy(touches: readonly string[]): boolean {
  return touches.some((t) => (HEAVY_TOUCHES as readonly string[]).includes(t));
}

/** Only an approved ledger entry is certain. Heavy class always asks; high confidence assumes and queues a review. */
export function decide(p: Pick<Prediction, "confidence" | "touches" | "ledgerId">): Decision {
  if (p.ledgerId) return { action: "answer", reason: "ledger", ledgerId: p.ledgerId };
  if (isHeavy(p.touches)) return { action: "ask", reason: "heavy_class" };
  if (p.confidence === "high") return { action: "assume", reason: "high_confidence", review: true };
  return { action: "ask", reason: "low_confidence" };
}
// [SCOPE 159 / T011] END

// [SCOPE 159 / T011] BEGIN — Scoring and hit rate per area and persona (FR-037)
export type Verdict = "approve" | "change";

export interface ScoredRow {
  predictionId: string;
  area: string;
  persona: string;
  verdict: Verdict;
}

export interface HitRate {
  key: string;
  approved: number;
  scored: number;
  rate: number;
}

function rates(rows: ScoredRow[], by: "area" | "persona"): HitRate[] {
  const m = new Map<string, { approved: number; scored: number }>();
  for (const r of rows) {
    const k = r[by];
    const c = m.get(k) ?? { approved: 0, scored: 0 };
    c.scored += 1;
    if (r.verdict === "approve") c.approved += 1;
    m.set(k, c);
  }
  return [...m.entries()].map(([key, c]) => ({ key, approved: c.approved, scored: c.scored, rate: c.approved / c.scored }));
}

/** Hit rate = approved verdicts over scored predictions. */
export const hitRatePerArea = (rows: ScoredRow[]): HitRate[] => rates(rows, "area");
export const hitRatePerPersona = (rows: ScoredRow[]): HitRate[] => rates(rows, "persona");

export interface ThresholdPolicy {
  mode: "observe" | "enforce";
  /** The hit rate an area must reach, with at least minScored verdicts, to earn a lower threshold. */
  earnRate: number;
  minScored: number;
}
export const DEFAULT_POLICY: ThresholdPolicy = { mode: "observe", earnRate: 0.9, minScored: 20 };

/** In observe mode no threshold changes, whatever the hit rate. */
export function thresholdMayDrop(h: HitRate, policy: ThresholdPolicy = DEFAULT_POLICY): boolean {
  if (policy.mode === "observe") return false;
  return h.scored >= policy.minScored && h.rate >= policy.earnRate;
}
// [SCOPE 159 / T011] END

// [SCOPE 159 / T011] BEGIN — Prediction store (decisions/predictions.jsonl)
export interface PredictionHooks {
  /** Appends to decisions/assumptions.yaml through gate.mjs. */
  logAssumption?: (p: Prediction) => void;
  /** Puts the prediction in the owner review queue through kain.mjs. */
  queueReview?: (p: Prediction) => void;
}

type Line = { t: "prediction"; p: Prediction } | { t: "verdict"; v: ScoredRow };

export class PredictionStore {
  private readonly file: string;
  constructor(root: string, private readonly hooks: PredictionHooks = {}) {
    this.file = join(root, "decisions", "predictions.jsonl");
  }

  private lines(): Line[] {
    if (!existsSync(this.file)) return [];
    return readFileSync(this.file, "utf8").split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as Line);
  }

  private push(l: Line): void {
    mkdirSync(dirname(this.file), { recursive: true });
    appendFileSync(this.file, `${JSON.stringify(l)}\n`, "utf8");
  }

  /** Record the prediction, then act on the decision. Every assumption gets a matching review item. */
  record(p: Prediction): Decision {
    const d = decide(p);
    this.push({ t: "prediction", p });
    if (d.action === "assume") {
      this.hooks.logAssumption?.(p);
      this.hooks.queueReview?.(p);
    }
    return d;
  }

  /** The owner's later verdict scores the prediction. */
  score(predictionId: string, verdict: Verdict): ScoredRow | undefined {
    const p = this.lines().find((l): l is Extract<Line, { t: "prediction" }> => l.t === "prediction" && l.p.id === predictionId);
    if (!p) return undefined;
    const row: ScoredRow = { predictionId, area: p.p.area, persona: p.p.persona, verdict };
    this.push({ t: "verdict", v: row });
    return row;
  }

  scored(): ScoredRow[] {
    return this.lines().filter((l): l is Extract<Line, { t: "verdict" }> => l.t === "verdict").map((l) => l.v);
  }
}
// [SCOPE 159 / T011] END
