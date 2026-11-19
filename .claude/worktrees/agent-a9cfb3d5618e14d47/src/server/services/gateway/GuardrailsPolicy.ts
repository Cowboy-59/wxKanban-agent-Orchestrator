import type { GatewayContext, PolicyDecision } from "~/shared/types/gateway.js";

const BLOCK_PATTERNS: Array<{ pattern: RegExp; reason: string }> = [
  { pattern: /ignore\s+(all\s+)?previous\s+instructions/i, reason: "Prompt injection attempt detected" },
  { pattern: /reveal\s+(the\s+)?system\s+prompt/i, reason: "System prompt exfiltration attempt detected" },
  { pattern: /developer\s+message/i, reason: "Instruction exfiltration attempt detected" },
  { pattern: /\brm\s+-rf\b|format\s+c:|del\s+\/s\s+\/q/i, reason: "Unsafe destructive command detected" },
  { pattern: /bypass\s+policy|disable\s+guardrails/i, reason: "Guardrail bypass attempt detected" },
];

const DOMAIN_KEYWORDS = [
  "mcp",
  "drift",
  "parity",
  "update",
  "version",
  "changelog",
  "gateway",
  "resolve",
  "project",
  "mandatory",
  "advisory",
];

const ALLOWED_TOOLS = [
  "drift.list",
  "drift.detail",
  "drift.resolve",
  "drift.summary",
  "updates.available",
  "updates.changelog",
  "updates.decide",
  "updates.apply",
  "parity.get",
  "parity.set",
  "parity.rollback",
] as const;

export class GuardrailsPolicy {
  evaluate(intent: string, _context: GatewayContext): PolicyDecision {
    for (const blockRule of BLOCK_PATTERNS) {
      if (blockRule.pattern.test(intent)) {
        return {
          status: "blocked",
          reason: blockRule.reason,
          matchedpattern: blockRule.pattern.source,
          allowedtools: [...ALLOWED_TOOLS],
        };
      }
    }

    const normalized = intent.toLowerCase();
    const matchesDomain = DOMAIN_KEYWORDS.some((keyword) => normalized.includes(keyword));
    if (!matchesDomain) {
      return {
        status: "blocked",
        reason: "Intent is outside the MCP gateway domain",
        allowedtools: [...ALLOWED_TOOLS],
      };
    }

    return {
      status: "allowed",
      allowedtools: [...ALLOWED_TOOLS],
    };
  }

  getAllowedTools(): string[] {
    return [...ALLOWED_TOOLS];
  }
}
