import type { GatewayContext, GatewayProviderName, LLMToolCandidate } from "~/shared/types/gateway.js";

interface RoutedCandidate {
  provider: GatewayProviderName;
  candidate: LLMToolCandidate | null;
}

export class LLMRouter {
  private readonly confidenceThreshold = 0.72;

  async route(intent: string, context: GatewayContext): Promise<RoutedCandidate> {
    const primary = this.infer(intent, context, "primary");
    if (primary && primary.confidence >= this.confidenceThreshold) {
      return { provider: "primary", candidate: primary };
    }

    const fallback = this.infer(intent, context, "fallback");
    if (fallback) {
      return { provider: primary ? "fallback" : "deterministic", candidate: fallback };
    }

    return { provider: "fallback", candidate: null };
  }

  private infer(intent: string, context: GatewayContext, mode: "primary" | "fallback"): LLMToolCandidate | null {
    const normalized = intent.toLowerCase();
    const uuidMatch = intent.match(/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
    const projectId = context.projectid ?? uuidMatch?.[0];
    const versionMatch = intent.match(/v?(\d+\.\d+\.\d+)/i);

    if (normalized.includes("drift") && normalized.includes("summary")) {
      return { toolname: "drift.summary", args: projectId ? { projectId } : {}, confidence: 0.94 };
    }

    if (normalized.includes("resolve") && normalized.includes("drift") && uuidMatch) {
      return { toolname: "drift.resolve", args: { id: uuidMatch[0] }, confidence: 0.93 };
    }

    if ((normalized.includes("drift event") || normalized.includes("drift details")) && uuidMatch) {
      return { toolname: "drift.detail", args: { id: uuidMatch[0] }, confidence: 0.9 };
    }

    if (normalized.includes("drift")) {
      return { toolname: "drift.list", args: projectId ? { projectId } : {}, confidence: 0.82 };
    }

    if ((normalized.includes("available") || normalized.includes("check")) && normalized.includes("update") && projectId) {
      return { toolname: "updates.available", args: { projectId }, confidence: 0.91 };
    }

    if (normalized.includes("changelog") && versionMatch) {
      return { toolname: "updates.changelog", args: { version: versionMatch[1] }, confidence: 0.92 };
    }

    if ((normalized.includes("accept") || normalized.includes("defer") || normalized.includes("reject")) && normalized.includes("update") && projectId && versionMatch) {
      const decision = normalized.includes("accept")
        ? "accepted"
        : normalized.includes("defer")
          ? "deferred"
          : "rejected";
      return {
        toolname: "updates.decide",
        args: { projectId, version: versionMatch[1], decision },
        confidence: 0.88,
      };
    }

    if (normalized.includes("apply") && normalized.includes("update") && projectId && versionMatch) {
      return { toolname: "updates.apply", args: { projectId, version: versionMatch[1] }, confidence: 0.89 };
    }

    if ((normalized.includes("parity") || normalized.includes("gate")) && normalized.includes("rollback")) {
      return { toolname: "parity.rollback", args: {}, confidence: 0.95 };
    }

    if ((normalized.includes("parity") || normalized.includes("gate")) && (normalized.includes("mandatory") || normalized.includes("advisory"))) {
      return {
        toolname: "parity.set",
        args: { gateMode: normalized.includes("mandatory") ? "mandatory" : "advisory" },
        confidence: 0.93,
      };
    }

    if (normalized.includes("parity") || normalized.includes("gate")) {
      return { toolname: "parity.get", args: {}, confidence: mode === "fallback" ? 0.78 : 0.68 };
    }

    return null;
  }
}
