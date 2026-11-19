import type {
  GatewayBlockedResult,
  GatewayContext,
  GatewayIntentRequest,
  GatewaySuccessResult,
  UpdateDecisionInput,
} from "~/shared/types/gateway.js";
import { DriftEventService } from "~/server/services/drift/DriftEventService.js";
import { ParityGateService } from "~/server/services/parity/ParityGateService.js";
import { UpdateAdoptionService } from "~/server/services/updates/UpdateAdoptionService.js";
import { GuardrailsPolicy } from "./GuardrailsPolicy.js";
import { GatewayAuditLog } from "./GatewayAuditLog.js";
import { LLMRouter } from "./LLMRouter.js";
import { MCPToolCallBuilder } from "./MCPToolCallBuilder.js";
// Phase B (spec 019): shadow-call kit MCP and compare results
import { shadowCallKit } from "~/server/services/migration/KitShadowClient.js";
import { compareDivergence } from "~/server/services/migration/KitDivergenceComparator.js";

export class GatewayService {
  private readonly driftEventService = new DriftEventService();
  private readonly updateAdoptionService = new UpdateAdoptionService();
  private readonly parityGateService = new ParityGateService();
  private readonly policy = new GuardrailsPolicy();
  private readonly router = new LLMRouter();
  private readonly auditLog = new GatewayAuditLog();
  private readonly toolBuilder = new MCPToolCallBuilder(new Set(this.policy.getAllowedTools()));

  async invoke(intentRequest: GatewayIntentRequest, context: GatewayContext): Promise<GatewaySuccessResult | GatewayBlockedResult> {
    this.auditLog.started(context, intentRequest.intent);

    const decision = this.policy.evaluate(intentRequest.intent, context);
    this.auditLog.policy(context, decision);
    if (decision.status === "blocked") {
      return {
        requestId: context.requestid,
        blocked: true,
        reason: decision.reason ?? "Request blocked by policy",
        executedAt: new Date().toISOString(),
      };
    }

    const routed = await this.router.route(intentRequest.intent, context);
    if (!routed.candidate) {
      throw new Error("GATEWAY_NO_TOOL_MATCH");
    }

    const toolCall = this.toolBuilder.build({
      ...routed.candidate,
      args: {
        ...routed.candidate.args,
        ...(context.projectid && !Object.hasOwn(routed.candidate.args, "projectId") ? { projectId: context.projectid } : {}),
      },
    });
    this.auditLog.routed(context, routed.provider, toolCall);

    try {
      const result = await this.execute(toolCall.toolname, toolCall.args, context);
      this.auditLog.succeeded(context, toolCall);

      // Phase B (spec 019): fire-and-forget shadow call to kit MCP
      shadowCallKit(toolCall.toolname, toolCall.args).then((kitResult) => {
        compareDivergence(context.requestid, toolCall.toolname, result, kitResult);
      }).catch(() => { /* shadow path must never affect legacy */ });

      return {
        requestId: context.requestid,
        toolName: toolCall.toolname,
        args: toolCall.args,
        result: context.outputmode === "human" ? this.humanize(toolCall.toolname, result) : result,
        outputMode: context.outputmode,
        executedAt: new Date().toISOString(),
      };
    } catch (error) {
      this.auditLog.failed(context, error);
      throw error;
    }
  }

  private async execute(toolname: string, args: Record<string, unknown>, context: GatewayContext): Promise<unknown> {
    switch (toolname) {
      case "drift.list":
        return this.driftEventService.list({ projectid: this.asOptionalString(args.projectId), limit: 50, offset: 0 });
      case "drift.detail":
        return this.driftEventService.getById(this.asString(args.id));
      case "drift.resolve":
        return this.driftEventService.resolve(this.asString(args.id));
      case "drift.summary":
        return this.driftEventService.aggregate({ projectid: this.asOptionalString(args.projectId) });
      case "updates.available":
        return this.updateAdoptionService.checkAvailable(this.asString(args.projectId));
      case "updates.changelog":
        return this.updateAdoptionService.presentToUser(context.projectid ?? "", this.asString(args.version));
      case "updates.decide":
        return this.updateAdoptionService.recordDecision({
          projectId: this.asString(args.projectId),
          version: this.asString(args.version),
          decision: this.asDecision(args.decision),
        } satisfies UpdateDecisionInput);
      case "updates.apply":
        return this.updateAdoptionService.applyUpdate(this.asString(args.projectId), this.asString(args.version));
      case "parity.get":
        return this.parityGateService.getMode();
      case "parity.set":
        return this.parityGateService.setMode(this.asGateMode(args.gateMode), context.userid);
      case "parity.rollback":
        return this.parityGateService.rollback(context.userid);
      default:
        throw new Error("GATEWAY_NO_TOOL_MATCH");
    }
  }

  private humanize(toolname: string, result: unknown): { summary: string; data: unknown } {
    return {
      summary: `Gateway executed ${toolname} successfully.`,
      data: result,
    };
  }

  private asString(value: unknown): string {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error("GATEWAY_NO_TOOL_MATCH");
    }
    return value;
  }

  private asOptionalString(value: unknown): string | undefined {
    return typeof value === "string" && value.length > 0 ? value : undefined;
  }

  private asDecision(value: unknown): "accepted" | "deferred" | "rejected" {
    if (value === "accepted" || value === "deferred" || value === "rejected") {
      return value;
    }
    throw new Error("GATEWAY_NO_TOOL_MATCH");
  }

  private asGateMode(value: unknown): "advisory" | "mandatory" {
    if (value === "advisory" || value === "mandatory") {
      return value;
    }
    throw new Error("GATEWAY_NO_TOOL_MATCH");
  }
}
