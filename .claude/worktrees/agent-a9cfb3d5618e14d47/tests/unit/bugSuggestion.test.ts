import { describe, it, expect, vi, beforeEach } from "vitest";

// [SCOPE 063 / T011] FR-008 — AI suggestion must parse strict JSON and FAIL OPEN
// (return null, never throw) on any provider error or unparseable output.
// Mock the LLM provider so this is a pure unit test (no network, no key).
const { generateOnce } = vi.hoisted(() => ({ generateOnce: vi.fn() }));
vi.mock("~/server/ai/llm-provider.js", () => ({ generateOnce }));

import { BugSuggestionService } from "~/server/services/BugSuggestionService";

const input = {
  title: "[client/windowError] TypeError: x is undefined",
  name: "TypeError",
  message: "x is undefined",
  stack: "at a (b.js:1:1)",
  kind: "windowError",
  route: "/dashboard",
};

describe("BugSuggestionService.suggest", () => {
  beforeEach(() => generateOnce.mockReset());

  it("parses a well-formed JSON suggestion", async () => {
    generateOnce.mockResolvedValue(
      '{"solution":"Guard x before use with optional chaining.","rationale":"null deref; high"}',
    );
    const r = await BugSuggestionService.suggest(input);
    expect(r).not.toBeNull();
    expect(r!.solution).toContain("Guard x");
    expect(r!.rationale).toContain("high");
  });

  it("strips markdown code fences before parsing", async () => {
    generateOnce.mockResolvedValue(
      '```json\n{"solution":"Fix it.","rationale":"medium"}\n```',
    );
    const r = await BugSuggestionService.suggest(input);
    expect(r?.solution).toBe("Fix it.");
  });

  it("fails open (null) when the provider returns a non-string/garbage response", async () => {
    generateOnce.mockResolvedValue(undefined as unknown as string);
    const r = await BugSuggestionService.suggest(input);
    expect(r).toBeNull();
  });

  it("fails open (null) on unparseable output", async () => {
    generateOnce.mockResolvedValue("not json at all");
    const r = await BugSuggestionService.suggest(input);
    expect(r).toBeNull();
  });

  it("fails open (null) when JSON lacks a solution", async () => {
    generateOnce.mockResolvedValue('{"rationale":"no solution field"}');
    const r = await BugSuggestionService.suggest(input);
    expect(r).toBeNull();
  });
});
