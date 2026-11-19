import type { LLMToolCandidate, MCPToolCall } from "~/shared/types/gateway.js";

const REQUIRED_ARGS: Record<string, string[]> = {
  "drift.detail": ["id"],
  "drift.resolve": ["id"],
  "updates.available": ["projectId"],
  "updates.changelog": ["version"],
  "updates.decide": ["projectId", "version", "decision"],
  "updates.apply": ["projectId", "version"],
  "parity.set": ["gateMode"],
};

export class MCPToolCallBuilder {
  constructor(private readonly allowedTools: Set<string>) {}

  build(candidate: LLMToolCandidate): MCPToolCall {
    if (!this.allowedTools.has(candidate.toolname)) {
      throw new Error("Intent could not be mapped to an allowed MCP tool");
    }

    const required = REQUIRED_ARGS[candidate.toolname] ?? [];
    for (const arg of required) {
      if (candidate.args[arg] === undefined || candidate.args[arg] === null || candidate.args[arg] === "") {
        throw new Error(`Missing required MCP argument: ${arg}`);
      }
    }

    return {
      toolname: candidate.toolname,
      args: candidate.args,
    };
  }
}
