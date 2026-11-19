/**
 * Project-agent route — the kit's per-project agent binds its supervised room.
 * SCOPE-134 / T029 (SCOPE-132 Amendment A, FR-031).
 *
 *   POST /api/project-agent/room  { supervisor?, mintAgentToken?, createCompanyAccount? }
 *   GET  /api/project-agent/approver?yappchattUserId=<uuid>   (SCOPE-144 FR-008)
 *
 * Authenticated by the project's own kit API token (`mcpapitokens`). The project is the
 * token's; a project or room id in the body is a 400, never honoured (FR-013).
 */
import { Router, Request, Response } from "express";
import { z } from "zod";
import { apiTokenService } from "../services/ApiTokenService.js";
import { agentConnectService, AgentConnectError } from "../services/AgentConnectService.js";
import { YappchattBrokerError } from "../lib/yappchattBroker.js";
import { companyYappchattService } from "../services/CompanyYappchattService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("project-agent-routes");

// [SCOPE 134 / T029] BEGIN — project agent room route
// MODIFIED-BY: [SCOPE 144 / T008] — createCompanyAccount; 409 no_company_account { contactEmail }; 503 companion_unavailable
/** The broker's single "companion not available" code (SPEC-144 contract C1, FR-011). */
const COMPANION_UNAVAILABLE = "companion_unavailable";

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
    // SCOPE-144 FR-006: the developer answered yes to creating the company account.
    createCompanyAccount: z.boolean().optional(),
  })
  .strict();

router.post("/room", async (req: Request, res: Response) => {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) return res.status(401).json({ error: "missing-token" });

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { supervisor?, mintAgentToken?, createCompanyAccount? }. The project and room come from the token.",
    });
  }

  try {
    const token = await apiTokenService.validateToken(match[1].trim());
    if (!token) return res.status(401).json({ error: "invalid-token" });

    const result = await agentConnectService.projectAgentRoom(token, parsed.data.supervisor ?? "KAIN", {
      mintAgentToken: parsed.data.mintAgentToken,
      createCompanyAccount: parsed.data.createCompanyAccount,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof AgentConnectError) {
      return res.status(err.status).json({ error: err.code, message: err.message, ...err.extra });
    }
    if (err instanceof YappchattBrokerError && err.code === COMPANION_UNAVAILABLE) {
      return res.status(503).json({ error: COMPANION_UNAVAILABLE, message: err.message });
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

// [SCOPE 144 / T009] BEGIN — Room Approver check route (FR-008, contract C3)
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

router.get("/approver", async (req: Request, res: Response) => {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) return res.status(401).json({ error: "missing-token" });

  const raw = req.query.yappchattUserId;
  const yappchattUserId = typeof raw === "string" ? raw.trim() : "";
  if (!UUID_RE.test(yappchattUserId)) {
    return res.status(400).json({ error: "invalid_id", detail: "yappchattUserId must be a YappChatt user id (uuid)." });
  }

  try {
    const token = await apiTokenService.validateToken(match[1].trim());
    if (!token) return res.status(401).json({ error: "invalid-token" });
    if (token.expiresat && token.expiresat.getTime() <= Date.now()) {
      return res.status(401).json({ error: "token_expired" });
    }
    const result = await companyYappchattService.approver(token, yappchattUserId.toLowerCase());
    return res.json(result);
  } catch (err) {
    logger.error({ err }, "approver check failed");
    return res.status(500).json({ error: "approver check failed" });
  }
});
// [SCOPE 144 / T009] END

export default router;
