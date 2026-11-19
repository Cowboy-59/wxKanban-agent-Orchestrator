/**
 * AIScaffoldingService — regression guard for the withdrawal of auto-generated
 * scope stubs (SPEC-008 FR-008, withdrawn 2026-09-22 / Clarification Q6).
 *
 * Until 2026-09-22 a second LLM round-trip invented three to six draft scopes in
 * every new project and inserted them straight into `projectspecifications`.
 * Those scopes were guesses, they occupied real scope numbers, and the project
 * owner had to delete them by hand before `buildscope` output could be numbered
 * cleanly.
 *
 * These tests pin the two halves of that decision:
 *   1. the overview (FR-007) is still generated — one LLM call, one document;
 *   2. scaffolding writes NOTHING to the database beyond that document.
 *
 * The db mock is deliberately kept even though the service no longer imports
 * `db` at all: if someone re-adds an insert here, `insert`/`values` fire and the
 * assertion catches it instead of the feature quietly coming back.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// vi.mock factories are hoisted above every other statement, so the spies they
// close over have to be created inside vi.hoisted().
const { insertSpy, valuesSpy, selectSpy, generateOnceSpy, upsertDocumentSpy } = vi.hoisted(() => {
  const values = vi.fn(() => Promise.resolve());
  return {
    valuesSpy: values,
    insertSpy: vi.fn(() => ({ values })),
    selectSpy: vi.fn(() => ({ from: () => ({ where: () => Promise.resolve([]) }) })),
    generateOnceSpy: vi.fn(() => Promise.resolve("# Acme — Overview\n\nGenerated body.")),
    upsertDocumentSpy: vi.fn(() => Promise.resolve()),
  };
});

vi.mock("~/db/client.js", () => ({
  db: { insert: insertSpy, select: selectSpy },
}));

vi.mock("~/server/ai/llm-provider.js", () => ({
  generateOnce: generateOnceSpy,
}));

vi.mock("~/server/services/ProjectDocumentService.js", () => ({
  ProjectDocumentService: { upsertDocument: upsertDocumentSpy },
}));

vi.mock("~/server/lib/logger.js", () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

import { AIScaffoldingService } from "../../src/server/services/AIScaffoldingService";

const PROJECT_ID = "0199a1f0-0000-7000-8000-000000000001";
const USER_ID = "0199a1f0-0000-7000-8000-000000000002";

describe("AIScaffoldingService — no auto-generated scope stubs (SPEC-008 FR-008 withdrawn)", () => {
  beforeEach(() => {
    insertSpy.mockClear();
    valuesSpy.mockClear();
    selectSpy.mockClear();
    generateOnceSpy.mockClear();
    upsertDocumentSpy.mockClear();
  });

  it("writes no rows to the database — scaffolding never creates a scope", async () => {
    await AIScaffoldingService.scaffold(PROJECT_ID, "Acme", "A billing portal for Acme", USER_ID);

    expect(insertSpy).not.toHaveBeenCalled();
    expect(valuesSpy).not.toHaveBeenCalled();
  });

  it("still generates the project overview document (FR-007)", async () => {
    await AIScaffoldingService.scaffold(PROJECT_ID, "Acme", "A billing portal for Acme", USER_ID);

    expect(upsertDocumentSpy).toHaveBeenCalledTimes(1);
    const [projectid, doctype, title, content, createdbyid] = upsertDocumentSpy.mock.calls[0] as unknown as [
      string,
      string,
      string,
      string,
      string,
    ];
    expect(projectid).toBe(PROJECT_ID);
    expect(doctype).toBe("overview");
    expect(title).toBe("Acme — Overview");
    expect(content).toContain("Generated body.");
    expect(createdbyid).toBe(USER_ID);
  });

  it("makes exactly one LLM call — the stub-generation round-trip is gone", async () => {
    await AIScaffoldingService.scaffold(PROJECT_ID, "Acme", "A billing portal for Acme", USER_ID);

    expect(generateOnceSpy).toHaveBeenCalledTimes(1);
    const prompt = String(generateOnceSpy.mock.calls[0]?.[0] ?? "");
    expect(prompt).toContain("project overview document");
    expect(prompt).not.toContain("specification stubs");
  });

  it("never looks up the Design phase — nothing is linked to a phase any more", async () => {
    await AIScaffoldingService.scaffold(PROJECT_ID, "Acme", null, USER_ID);

    expect(selectSpy).not.toHaveBeenCalled();
  });

  it("swallows an LLM failure without creating anything (project creation must not break)", async () => {
    generateOnceSpy.mockRejectedValueOnce(new Error("provider down"));

    await expect(
      AIScaffoldingService.scaffold(PROJECT_ID, "Acme", "desc", USER_ID)
    ).resolves.toBeUndefined();

    expect(upsertDocumentSpy).not.toHaveBeenCalled();
    expect(insertSpy).not.toHaveBeenCalled();
  });
});
