import { generateOnce } from "~/server/ai/llm-provider.js";
import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("bug-suggestion");

// [SCOPE 063 / T008] BEGIN — on-demand AI-suggested fix (fail-open, soft-throttled)
// Proposes a likely cause + fix for a trapped error using the project's
// LLM_PROVIDER. Mirrors deriveThemeViaAI's strict-JSON + fail-open shape: any
// error leaves the report's suggestion columns untouched and returns null.
// Runs ON DEMAND (not at ingest) so capture latency/availability is never
// coupled to the model. Soft throttle lives in the route (suggestedat window).

export interface BugSuggestion {
  solution: string;
  rationale: string;
}

export interface BugSuggestionInput {
  title: string;
  name?: string;
  message?: string;
  stack?: string;
  kind?: string;
  route?: string;
  appVersion?: string;
}

const SYSTEM_PROMPT =
  "You are a senior software engineer triaging a runtime error. Output ONLY a compact JSON object — no prose, no markdown fences.";

export class BugSuggestionService {
  /** Best-effort suggestion. Returns null on any failure (never throws). */
  static async suggest(input: BugSuggestionInput): Promise<BugSuggestion | null> {
    try {
      const userPrompt =
        `A trapped error from a running application:\n` +
        `Title: ${input.title}\n` +
        `Error: ${input.name ?? ""}: ${input.message ?? ""}\n` +
        `Kind: ${input.kind ?? "unknown"}\n` +
        `Route: ${input.route ?? "unknown"}\n` +
        `App version: ${input.appVersion ?? "unknown"}\n` +
        `Stack (truncated):\n${(input.stack ?? "").slice(0, 3000)}\n\n` +
        `Return JSON exactly: {"solution":"<likely cause and a concrete fix, 2-5 sentences>",` +
        `"rationale":"<one short line: why, and your confidence low|medium|high>"}`;

      const raw = await generateOnce(userPrompt, {
        systemPrompt: SYSTEM_PROMPT,
        temperature: 0.3,
        maxTokens: 700,
      });
      const json = raw.trim().replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
      const parsed = JSON.parse(json) as Partial<BugSuggestion>;
      if (typeof parsed.solution === "string" && parsed.solution.trim()) {
        return {
          solution: parsed.solution.trim().slice(0, 4000),
          rationale: (parsed.rationale ?? "").toString().trim().slice(0, 500),
        };
      }
      return null;
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "AI suggestion failed (swallowed)");
      return null;
    }
  }
}
// [SCOPE 063 / T008] END
