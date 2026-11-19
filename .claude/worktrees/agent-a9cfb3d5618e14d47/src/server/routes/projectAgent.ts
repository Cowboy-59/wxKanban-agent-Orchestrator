/**
 * Project-agent route — the kit's per-project agent binds its supervised room.
 * SCOPE-134 / T029 (SCOPE-132 Amendment A, FR-031).
 *
 *   POST /api/project-agent/room  { supervisor?, mintAgentToken?, createCompanyAccount? }
 *   GET  /api/project-agent/approver?yappchattUserId=<uuid>   (SCOPE-144 FR-008)
 *   GET  /api/project-agent/settings                          (SPEC-145 FR-004)
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
import { projectRemoteAccessService } from "../services/ProjectRemoteAccessService.js";
import { projectAutopilotService } from "../services/ProjectAutopilotService.js"; // [SCOPE 154 / T002]
import { SINK_PROJECT_ID } from "../services/FeedbackTriageService.js"; // [SCOPE 148 / T006]
import {
  AGENT_CONNECTION_STATES,
  projectAgentConnectionService,
  type UpdateResult,
} from "../services/ProjectAgentConnectionService.js"; // [SCOPE 151 / T003]
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

// [SCOPE 145 / T004] BEGIN — project agent settings route (FR-004)
// MODIFIED-BY: [SCOPE 148 / T006] — feedbackSink: whether the token's project is the feedback sink (SPEC-148 FR-001)
// MODIFIED-BY: [SCOPE 154 / T002] — also returns autopilotEnabled (FR-001)
/**
 * GET /api/project-agent/settings — what the Cockpit needs before it starts the agent:
 * whether the token's project allows remote, its Autopilot setting, and its name. Read-only;
 * never audited. `feedbackSink` tells the project agent whether to arm the daily feedback
 * triage; it is decided from the token's project, never from anything the caller sends.
 */
router.get("/settings", async (req: Request, res: Response) => {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) return res.status(401).json({ error: "missing-token" });

  try {
    const token = await apiTokenService.validateToken(match[1].trim());
    if (!token) return res.status(401).json({ error: "invalid-token" });
    if (token.expiresat && token.expiresat.getTime() <= Date.now()) {
      return res.status(401).json({ error: "token_expired" });
    }
    const [project, autopilotProject] = await Promise.all([
      projectRemoteAccessService.project(token.projectid),
      projectAutopilotService.project(token.projectid),
    ]);
    if (!project) return res.status(404).json({ error: "no_project" });
    return res.json({
      allowRemote: project.allowremote,
      autopilotEnabled: autopilotProject?.autopilotenabled ?? false,
      projectName: project.name,
      feedbackSink: token.projectid === SINK_PROJECT_ID,
    });
  } catch (err) {
    logger.error({ err }, "project agent settings failed");
    return res.status(500).json({ error: "project agent settings failed" });
  }
});
// [SCOPE 145 / T004] END

// [SCOPE 151 / T003] BEGIN — project agent connection routes (FR-059 – FR-061)
// MODIFIED-BY [SCOPE 155 / T004] — heartbeat now carries/clears the rolling-summary columns (FR-003)
/**
 *   POST /api/project-agent/connections                 { machine, repo, agentTag, kitVersion?, supervisor? }
 *   POST /api/project-agent/connections/:id/heartbeat   { state, summary?, lastEntry?, blockers?, sharing? }
 *   POST /api/project-agent/connections/:id/close
 *
 * The record of which project agent is connected, for KAIN (SCOPE-132 Amendment D). Kit-token
 * authenticated like the room route; the project and the room come from the token (FR-013), and an
 * id belonging to another project is a 404, never a write.
 */
const openBodySchema = z
  .object({
    machine: z.string().trim().min(1).max(255),
    repo: z.string().trim().min(1).max(255),
    agentTag: z.string().trim().min(1).max(100),
    kitVersion: z.string().trim().min(1).max(50).nullable().optional(),
    supervisor: z
      .string()
      .min(2)
      .max(64)
      .regex(/^[A-Za-z][A-Za-z0-9_-]*$/)
      .optional(),
  })
  .strict();

const heartbeatBodySchema = z
  .object({
    state: z.enum(AGENT_CONNECTION_STATES),
    summary: z.string().max(1500).optional(),
    lastEntry: z.string().max(500).optional(),
    blockers: z.array(z.string()).optional(),
    sharing: z.boolean().optional(),
  })
  .strict();

/** A live kit token's project, or the response already sent. */
async function tokenProject(req: Request, res: Response): Promise<string | null> {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) {
    res.status(401).json({ error: "missing-token" });
    return null;
  }
  const token = await apiTokenService.validateToken(match[1].trim());
  if (!token) {
    res.status(401).json({ error: "invalid-token" });
    return null;
  }
  if (token.expiresat && token.expiresat.getTime() <= Date.now()) {
    res.status(401).json({ error: "token_expired" });
    return null;
  }
  return token.projectid;
}

router.post("/connections", async (req: Request, res: Response) => {
  const parsed = openBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { machine, repo, agentTag, kitVersion?, supervisor? }. The project and room come from the token.",
    });
  }
  try {
    const projectId = await tokenProject(req, res);
    if (!projectId) return;
    const project = await projectRemoteAccessService.project(projectId);
    if (!project) return res.status(404).json({ error: "no_project" });
    if (!project.allowremote) {
      return res.status(403).json({ error: "remote_not_allowed", message: "Remote is not allowed on this project." });
    }
    const { supervisor, kitVersion, ...rest } = parsed.data;
    const result = await projectAgentConnectionService.open(projectId, supervisor ?? "KAIN", {
      ...rest,
      kitVersion: kitVersion ?? null,
    });
    if (result.kind === "conflict") {
      return res.status(409).json({
        error: "agent_already_connected",
        message: `The project agent is already connected from ${result.machine}.`,
        machine: result.machine,
        connectedAt: result.connectedAt.toISOString(),
        lastSeenAt: result.lastSeenAt.toISOString(),
      });
    }
    return res.status(201).json({ connectionId: result.connectionId, heartbeatSeconds: result.heartbeatSeconds });
  } catch (err) {
    logger.error({ err }, "project agent connection open failed");
    return res.status(500).json({ error: "connection open failed" });
  }
});

async function updateConnection(req: Request, res: Response, run: (id: string, projectId: string) => Promise<UpdateResult>) {
  const id = String(req.params.id ?? "");
  if (!UUID_RE.test(id)) return res.status(400).json({ error: "invalid_id" });
  try {
    const projectId = await tokenProject(req, res);
    if (!projectId) return;
    const result = await run(id.toLowerCase(), projectId);
    if (result === "not_found") return res.status(404).json({ error: "not_found" });
    if (result === "closed") return res.status(410).json({ error: "connection_closed" });
    return res.json({ ok: true });
  } catch (err) {
    logger.error({ err }, "project agent connection update failed");
    return res.status(500).json({ error: "connection update failed" });
  }
}

router.post("/connections/:id/heartbeat", async (req: Request, res: Response) => {
  const parsed = heartbeatBodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { state: idle | working | waiting, summary?, lastEntry?, blockers?, sharing? }.",
    });
  }
  const { state, summary, lastEntry, blockers, sharing } = parsed.data;
  // Only pass a summary-input object through when the bridge actually sent one of the four new
  // fields — an old bridge sending just { state } must drive the exact same call as before (FR-003
  // backward compatibility).
  const hasSummaryInput = summary !== undefined || lastEntry !== undefined || blockers !== undefined || sharing !== undefined;
  return updateConnection(req, res, (id, projectId) =>
    hasSummaryInput
      ? projectAgentConnectionService.heartbeat(id, projectId, state, { summary, lastEntry, blockers, sharing })
      : projectAgentConnectionService.heartbeat(id, projectId, state),
  );
});

router.post("/connections/:id/close", async (req: Request, res: Response) => {
  return updateConnection(req, res, (id, projectId) => projectAgentConnectionService.close(id, projectId));
});
// [SCOPE 151 / T003] END

export default router;
