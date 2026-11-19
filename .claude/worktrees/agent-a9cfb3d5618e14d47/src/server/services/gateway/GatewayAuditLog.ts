import { createLogger } from "~/server/lib/logger.js";
import type { GatewayContext, GatewayProviderName, MCPToolCall, PolicyDecision } from "~/shared/types/gateway.js";

const logger = createLogger("gateway-audit-log");

export class GatewayAuditLog {
  started(context: GatewayContext, intent: string): void {
    logger.info({ requestid: context.requestid, userid: context.userid, projectid: context.projectid, outputmode: context.outputmode, intent }, "Gateway request started");
  }

  policy(context: GatewayContext, decision: PolicyDecision): void {
    logger.info({ requestid: context.requestid, status: decision.status, reason: decision.reason }, "Gateway policy evaluated");
  }

  routed(context: GatewayContext, provider: GatewayProviderName, toolCall: MCPToolCall): void {
    logger.info({ requestid: context.requestid, provider, toolname: toolCall.toolname, args: toolCall.args }, "Gateway request routed");
  }

  succeeded(context: GatewayContext, toolCall: MCPToolCall): void {
    logger.info({ requestid: context.requestid, toolname: toolCall.toolname }, "Gateway request succeeded");
  }

  failed(context: GatewayContext, error: unknown): void {
    logger.error({ requestid: context.requestid, error }, "Gateway request failed");
  }
}
