import { Router, type Response } from "express";
import { authenticateToken, type AuthRequest, requireAuth } from "../middleware/auth.js";
import type { GatewayIntentRequest } from "~/shared/types/gateway.js";
import { GatewayService } from "~/server/services/gateway/GatewayService.js";

const router = Router();
const gatewayService = new GatewayService();

router.post("/invoke", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  const body = req.body as GatewayIntentRequest;
  const requestId = crypto.randomUUID();

  if (!body?.intent || typeof body.intent !== "string") {
    return res.status(400).json({ error: "Intent is required", code: "GATEWAY_INVALID_REQUEST", requestId });
  }

  try {
    const result = await gatewayService.invoke(body, {
      requestid: requestId,
      userid: req.userid!,
      companyid: req.companyid,
      projectid: body.context?.projectId,
      outputmode: body.outputMode ?? "structured",
      source: "api",
    });

    return res.status(200).json(result);
  } catch (error) {
    if (error instanceof Error && error.message === "GATEWAY_NO_TOOL_MATCH") {
      return res.status(422).json({
        error: "Intent could not be mapped to an allowed MCP tool",
        code: "GATEWAY_NO_TOOL_MATCH",
        requestId,
      });
    }

    return res.status(503).json({
      error: "All providers failed policy or quality checks",
      code: "GATEWAY_FAIL_CLOSED",
      requestId,
    });
  }
});

export default router;
