/**
 * Agent-facing routes — authenticated by a Company Access Token, not a user session.
 * SCOPE-134 / T028.
 *
 *   GET  /api/agent/grants   the projects a human has ticked for this agent
 *   POST /api/agent/connect  { projectId, mintAgentToken? } → project MCP token + room
 *
 * The ticket alone reaches no project data. `connect` refuses unless a live grant exists,
 * and everything it returns is derived server-side from that grant.
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { companyAgentTokenService } from "../services/CompanyAgentTokenService.js";
import { agentConnectService, AgentConnectError } from "../services/AgentConnectService.js";
import { YappchattBrokerError } from "../lib/yappchattBroker.js";
import type { CompanyAgentToken } from "../../db/schema/companyagenttoken.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-connect-routes");

// [SCOPE 134 / T028] BEGIN — agent connect routes
interface AgentRequest extends Request {
  agentTicket?: CompanyAgentToken;
}

async function requireAgentTicket(req: AgentRequest, res: Response, next: NextFunction): Promise<void> {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) {
    res.status(401).json({ error: "missing-token" });
    return;
  }
  try {
    const ticket = await companyAgentTokenService.validate(match[1].trim());
    if (!ticket) {
      // Revoked and unknown are the same answer — see CompanyAgentTokenService.validate.
      res.status(401).json({ error: "invalid-token" });
      return;
    }
    req.agentTicket = ticket;
    next();
  } catch (err) {
    logger.error({ err }, "agent ticket validation failed");
    res.status(500).json({ error: "validation failed" });
  }
}

router.get("/grants", requireAgentTicket, async (req: AgentRequest, res: Response) => {
  const ticket = req.agentTicket as CompanyAgentToken;
  try {
    const projects = await agentConnectService.grants(ticket);
    return res.json({ agentName: ticket.agentname, projects, count: projects.length });
  } catch (err) {
    logger.error({ err }, "failed to list agent grants");
    return res.status(500).json({ error: "failed to list grants" });
  }
});

// A room id is deliberately NOT accepted (FR-013). `.strict()` makes sending one a 400
// rather than a silently ignored field, so a client that tries learns it cannot.
const connectSchema = z
  .object({
    projectId: z.string().uuid(),
    mintAgentToken: z.boolean().optional(),
  })
  .strict();

router.post("/connect", requireAgentTicket, async (req: AgentRequest, res: Response) => {
  const ticket = req.agentTicket as CompanyAgentToken;
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { projectId, mintAgentToken? }. The room is derived server-side and cannot be supplied.",
    });
  }
  try {
    const result = await agentConnectService.connect(ticket, parsed.data.projectId, {
      mintAgentToken: parsed.data.mintAgentToken,
    });
    return res.json(result);
  } catch (err) {
    if (err instanceof AgentConnectError) {
      return res.status(err.status).json({ error: err.code, message: err.message });
    }
    if (err instanceof YappchattBrokerError) {
      // Surfaced plainly, never retried (FR-016) — `not_a_member` included.
      logger.warn({ code: err.code, status: err.status }, "agent connect: YappChatt refused");
      return res.status(502).json({ error: err.code, message: err.message, upstreamStatus: err.status });
    }
    logger.error({ err }, "agent connect failed");
    return res.status(500).json({ error: "connect failed" });
  }
});
// [SCOPE 134 / T028] END

export default router;
