/**
 * Project-agent route — the kit's per-project agent binds its supervised room.
 * SCOPE-134 / T029 (SCOPE-132 Amendment A, FR-031).
 *
 *   POST /api/project-agent/room  { supervisor?, mintAgentToken? }
 *
 * Authenticated by the project's own kit API token (`mcpapitokens`). The project is the
 * token's; a project or room id in the body is a 400, never honoured (FR-013).
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { apiTokenService } from "../services/ApiTokenService.js";
import { agentConnectService, AgentConnectError } from "../services/AgentConnectService.js";
import { YappchattBrokerError } from "../lib/yappchattBroker.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("project-agent-routes");

// [SCOPE 134 / T029] BEGIN — project agent room route
const bodySchema = z
  .object({
    // The supervising agent whose room this is. Same shape as an agent name everywhere.
    supervisor: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
      .optional(),
    mintAgentToken: z.boolean().optional(),
  })
  .strict();

router.post("/room", async (req: Request, res: Response) => {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) return res.status(401).json({ error: "missing-token" });

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { supervisor?, mintAgentToken? }. The project and room come from the token.",
    });
  }

  try {
    const token = await apiTokenService.validateToken(match[1].trim());
    if (!token) return res.status(401).json({ error: "invalid-token" });

    const result = await agentConnectService.projectAgentRoom(token, parsed.data.supervisor ?? "KAIN", {
      mintAgentToken: parsed.data.mintAgentToken,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof AgentConnectError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err instanceof YappchattBrokerError) {
      logger.warn({ code: err.code, status: err.status }, "project agent room: YappChatt refused");
      return res.status(502).json({ error: err.code, message: err.message, upstreamStatus: err.status });
    }
    logger.error({ err }, "project agent room failed");
    return res.status(500).json({ error: "room binding failed" });
  }
});
// [SCOPE 134 / T029] END

export default router;
