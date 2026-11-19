// [SCOPE 100 / T017] BEGIN — unit tests for the founder-selectable provider (FR-011)
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { availableProviders } from "../../src/server/ai/llm-provider.js";

// translationOptsFor lives in MarketingAIService, which transitively imports the DB
// client and its config validator (config.ts calls process.exit on missing env). Give it
// dummy required env and import it DYNAMICALLY so a pure unit run needs no real .env —
// postgres-js connects lazily and translationOptsFor issues no query.
let translationOptsFor: typeof import("../../src/server/services/MarketingAIService.js")["translationOptsFor"];
beforeAll(async () => {
  process.env["DATABASE_URL"] ??= "postgres://u:p@localhost:5432/db";
  process.env["JWT_SECRET"] ??= "test-jwt-secret-at-least-32-chars-long-xxxx";
  process.env["ENCRYPTION_KEY"] ??= "test-encryption-key-0123456789abcdef";
  ({ translationOptsFor } = await import("../../src/server/services/MarketingAIService.js"));
});

// availableProviders() reads process.env at call time, so each test sets exactly the
// keys it cares about and restores the environment afterward. The keys under test:
const KEYS = [
  "GROQ_API_KEY",
  "GEMINI_API_KEY",
  "ANTHROPIC_API_KEY",
  "LLM_API_KEY",
  "LLM_BASE_URL",
] as const;

const saved: Record<string, string | undefined> = {};
for (const k of KEYS) saved[k] = process.env[k];
const clearKeys = (): void => {
  for (const k of KEYS) delete process.env[k];
};

afterEach(() => {
  for (const k of KEYS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

describe("availableProviders — no dead options (FR-011)", () => {
  it("lists only providers whose key env is set", () => {
    clearKeys();
    process.env["GROQ_API_KEY"] = "x";
    expect(availableProviders()).toEqual(["groq"]);
  });

  it("includes each named provider once its key is present", () => {
    clearKeys();
    process.env["GROQ_API_KEY"] = "x";
    process.env["GEMINI_API_KEY"] = "x";
    process.env["ANTHROPIC_API_KEY"] = "x";
    const out = availableProviders();
    expect(out).toContain("groq");
    expect(out).toContain("gemini");
    expect(out).toContain("anthropic");
  });

  it("excludes openai-compatible when it has a key but no base URL", () => {
    clearKeys();
    process.env["LLM_API_KEY"] = "x"; // no LLM_BASE_URL
    expect(availableProviders()).not.toContain("openai-compatible");
  });

  it("includes openai-compatible only when both key and base URL are set", () => {
    clearKeys();
    process.env["LLM_API_KEY"] = "x";
    process.env["LLM_BASE_URL"] = "https://example.test/v1";
    expect(availableProviders()).toContain("openai-compatible");
  });
});

describe("translationOptsFor — provider→model policy (FR-011)", () => {
  it("keeps groq on the high-TPM translation model", () => {
    const opts = translationOptsFor("groq");
    expect(opts.provider).toBe("groq");
    // model comes from MARKETING_TRANSLATION_MODEL or the scout default — never bare.
    expect(opts.model).toBeTruthy();
  });

  it("pins anthropic to Sonnet by default", () => {
    const prior = process.env["MARKETING_LLM_MODEL"];
    delete process.env["MARKETING_LLM_MODEL"];
    try {
      expect(translationOptsFor("anthropic")).toEqual({
        provider: "anthropic",
        model: "claude-sonnet-4-6",
      });
    } finally {
      if (prior === undefined) delete process.env["MARKETING_LLM_MODEL"];
      else process.env["MARKETING_LLM_MODEL"] = prior;
    }
  });

  it("lets gemini and openai-compatible use their preset default model", () => {
    expect(translationOptsFor("gemini")).toEqual({ provider: "gemini" });
    expect(translationOptsFor("openai-compatible")).toEqual({ provider: "openai-compatible" });
  });
});
// [SCOPE 100 / T017] END
