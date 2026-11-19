// Shared fixture builders for the SPEC-143 report and learning tests.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

export type Rec = Record<string, unknown>;

export function run(over: Rec): Rec {
  return {
    id: "x",
    projectid: null,
    aispecsessionid: null,
    taskid: null,
    command: "implement",
    kind: "subagent",
    difficulty: "moderate",
    model: "claude-sonnet-5-5",
    provider: "anthropic-subscription",
    route: "official",
    inputtokens: 1_000_000,
    outputtokens: 100_000,
    cachereadtokens: 0,
    cachewritetokens: 0,
    activeseconds: 3600,
    waitingseconds: 0,
    escalated: false,
    comparisonid: null,
    starttime: "2026-10-23T17:00:00.000Z",
    endtime: "2026-10-23T18:00:00.000Z",
    ...over,
  };
}

export function writeLog(root: string, recs: Rec[]): void {
  const p = join(root, "decisions", "agentrun-log.jsonl");
  mkdirSync(dirname(p), { recursive: true });
  writeFileSync(p, recs.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf-8");
}

// n comparisons: candidate (haiku) cheaper than current (sonnet); firstpass per variant given.
export function comparisons(n: number, curPass: (i: number) => boolean, candPass: (i: number) => boolean): Rec[] {
  const out: Rec[] = [];
  for (let i = 0; i < n; i++) {
    const comparisonid = "cmp-" + i;
    out.push(run({ comparisonid, variant: "current", firstpass: curPass(i), neverbilled: true, difficulty: "easy", model: "claude-sonnet-5-5", taskid: "T" + i }));
    out.push(run({ comparisonid, variant: "candidate", firstpass: candPass(i), neverbilled: true, difficulty: "easy", model: "claude-haiku-5-5", taskid: "T" + i }));
  }
  return out;
}
