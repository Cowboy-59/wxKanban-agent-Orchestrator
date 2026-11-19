// SPEC-142 T007 / FR-009 / SC-3: the Ask Gate's keyword classifier fails closed.
//
// The test that matters is the first one: a blocker filed as an assumption means an agent picks a
// default for something only the owner may decide (money, client data, a push). It must never pass
// while that happens. Assumptions misfiled as blockers are safe and only reported.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { classify, explain, questionText } from "../../../_wxAI/askgate/classify.mjs";

type Labelled = { label: "blocker" | "assumption"; why: string; text: string };
const FIXTURE = JSON.parse(
  readFileSync(join(process.cwd(), "tests", "unit", "askgate", "fixtures", "labelled-questions.json"), "utf-8"),
) as { questions: Labelled[]; conversion: Labelled[] };

describe("labelled question set (SC-3)", () => {
  it("has at least 30 questions", () => {
    expect(FIXTURE.questions.length).toBeGreaterThanOrEqual(30);
  });

  it("classifies NO blocker as an assumption", () => {
    const misfiled = FIXTURE.questions
      .filter((q) => q.label === "blocker")
      .filter((q) => classify(q.text) !== "blocker")
      .map((q) => `${q.why}: ${q.text}`);
    expect(misfiled).toEqual([]);
  });

  it("in conversion mode, classifies NO blocker as an assumption", () => {
    const all = [...FIXTURE.questions, ...FIXTURE.conversion];
    const misfiled = all
      .filter((q) => q.label === "blocker")
      .filter((q) => classify(q.text, { conversion: true }) !== "blocker")
      .map((q) => q.text);
    expect(misfiled).toEqual([]);
  });

  it("lets ordinary choices through as assumptions (usefulness, reported)", () => {
    const assumptions = FIXTURE.questions.filter((q) => q.label === "assumption");
    const kept = assumptions.filter((q) => classify(q.text) === "assumption");
    // Fail-closed means some may become blockers; the set is written so all of these pass today.
    expect(kept.length).toBe(assumptions.length);
  });

  it("legacy questions are assumptions outside conversion mode and blockers inside it", () => {
    const q = FIXTURE.conversion.find((c) => c.why === "missing legacy evidence" && /business rule/.test(c.text));
    expect(q).toBeTruthy();
    expect(classify(q!.text, { conversion: false })).toBe("assumption");
    expect(classify(q!.text, { conversion: true })).toBe("blocker");
  });
});

describe("fails closed", () => {
  it.each([
    ["empty string", ""],
    ["whitespace", "   \n "],
    ["null", null],
    ["undefined", undefined],
    ["number", 42],
    ["empty object", {}],
    ["symbols only", "?? !!"],
    ["one word", "Thoughts?"],
  ])("%s is a blocker", (_name, q) => {
    expect(classify(q as unknown as string)).toBe("blocker");
  });

  it("an approval request with no subject is a blocker", () => {
    expect(classify("All done here. Okay to proceed with the next step?")).toBe("blocker");
  });

  it("a ledger item still open on this subject (context at or above threshold) is a blocker", () => {
    const q = "Should the export button sit on the left or the right?";
    expect(classify(q)).toBe("assumption");
    expect(classify(q, { threshold: 0.75, context: [{ id: "D-0003", score: 0.8, text: "parked" }] })).toBe("blocker");
    expect(classify(q, { threshold: 0.75, context: [{ id: "D-0003", score: 0.3, text: "weak" }] })).toBe("assumption");
  });

  it("explains which rule fired", () => {
    const r = explain("Should I drop the legacy_users table?");
    expect(r.class).toBe("blocker");
    expect(r.reasons.map((x: { rule: string }) => x.rule)).toContain("irreversible");
  });

  it("is deterministic", () => {
    const q = "Is the 20% discount applied before or after tax?";
    const runs = Array.from({ length: 20 }, () => classify(q));
    expect(new Set(runs)).toEqual(new Set(["blocker"]));
  });

  it("reads an AskUserQuestion question object, options included", () => {
    expect(questionText({ question: "Which one?", options: [{ label: "Drop the table" }, { label: "Keep it" }] })).toContain("Drop the table");
    expect(classify({ question: "Which one?", options: [{ label: "Drop the table" }, { label: "Keep it" }] } as unknown as string)).toBe("blocker");
  });
});
