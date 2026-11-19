/**
 * Agent-facing routes — K.A.I.N. signs in as the person, once per device (SPEC-152).
 * SCOPE-134 / T028; SCOPE-132 Amendment F.
 *
 *   POST /api/agent/signin   { email, password, deviceName } → a device token, shown once
 *   GET  /api/agent/grants   every Project in the signed-in person's reach
 *   POST /api/agent/connect  { projectId, mintAgentToken? } → project MCP token + room
 *
 * Reach is decided by agentReach on every call; `connect` refuses outside it, and everything
 * it returns is derived server-side.
 */
import { Router, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { eq, sql } from "drizzle-orm";
import { agentConnectService, AgentConnectError } from "../services/AgentConnectService.js";
import {
  agentDeviceTokenService,
  normalizeDeviceName,
  recordAgentAudit,
  type VerifiedDevice,
} from "../services/AgentDeviceTokenService.js";
import { findInAgentReach } from "../lib/agentReach.js"; // [SCOPE 155 / T005]
import { sessionStatus } from "../services/ProjectAgentConnectionService.js"; // [SCOPE 155 / T005]
import { signInUser, AccountLockedError } from "../services/userService.js";
import { agentSigninRateLimit } from "../middleware/rateLimit.js"; // [SCOPE 152 / T005]
import { YappchattBrokerError } from "../lib/yappchattBroker.js";
import { db } from "../../db/client.js";
import { userprofiles } from "../../db/schema/userprofiles.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-connect-routes");

// [SCOPE 152 / T005] BEGIN — K.A.I.N. sign-in and the device middleware (FR-064, FR-065, FR-073)
export interface AgentRequest extends Request {
  agentDevice?: VerifiedDevice;
}

/** Unknown, revoked, inactive person, left the company: one answer, so none can be probed. */
export const DEVICE_SIGNED_OUT = "device_signed_out";

export async function requireAgentDevice(req: AgentRequest, res: Response, next: NextFunction): Promise<void> {
  const match = /^Bearer\s+(.+)$/i.exec((req.header("Authorization") ?? "").trim());
  if (!match) {
    res.status(401).json({ error: "missing-token" });
    return;
  }
  try {
    const device = await agentDeviceTokenService.verify(match[1].trim());
    if (!device) {
      res.status(401).json({ error: DEVICE_SIGNED_OUT, message: "This K.A.I.N. device is signed out. Sign in again." });
      return;
    }
    req.agentDevice = device;
    next();
  } catch (err) {
    logger.error({ err }, "agent device validation failed");
    res.status(500).json({ error: "validation failed" });
  }
}

const signinSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(256),
    deviceName: z.string().min(1).max(200),
  })
  .strict();

const BAD_CREDENTIALS = "Invalid email or password";

/** The refused person's company, when the email names one — so the refusal is audited there. */
async function refusalCompany(email: string): Promise<{ id: string; companyid: string } | null> {
  const [row] = await db
    .select({ id: userprofiles.id, companyid: userprofiles.companyid })
    .from(userprofiles)
    .where(eq(sql`lower(trim(${userprofiles.emailaddr}))`, email.toLowerCase()))
    .limit(1);
  return row?.companyid ? { id: row.id, companyid: String(row.companyid) } : null;
}

async function auditRefusal(email: string, deviceName: string, reason: "bad_credentials" | "locked" | "inactive"): Promise<void> {
  const who = await refusalCompany(email);
  if (!who) return; // an unknown email has no company to file under; the Pino line below covers it
  await recordAgentAudit({
    companyid: who.companyid,
    action: "agent.signin.refused",
    changedby: who.id,
    newvalue: { userId: who.id, deviceName, reason },
    description: `K.A.I.N. sign-in refused on device "${deviceName}": ${reason}.`,
  });
}

// Rate limited before the password check, so a refused flood writes no audit rows either.
router.post("/signin", agentSigninRateLimit, async (req: Request, res: Response) => {
  res.set("Cache-Control", "no-store");
  const parsed = signinSchema.safeParse(req.body);
  if (!parsed.success) {
    // Never echo the body: it carries a password.
    return res.status(400).json({ error: "invalid request", detail: "Body is { email, password, deviceName }." });
  }
  const { email, password } = parsed.data;
  const deviceName = normalizeDeviceName(parsed.data.deviceName);
  if (!deviceName) {
    return res.status(400).json({ error: "invalid_device_name", detail: "deviceName is 1 to 100 characters." });
  }

  try {
    // The web app's own credential check and lockout (M-12). Its JWT is discarded: K.A.I.N. gets a
    // device token, and no cookie is set.
    const session = await signInUser({ email, password });
    if (!session.active) {
      logger.warn({ reason: "inactive" }, "K.A.I.N. sign-in refused");
      await auditRefusal(email, deviceName, "inactive");
      return res.status(401).json({ error: "invalid_credentials", message: BAD_CREDENTIALS });
    }

    const { token, deviceId } = await agentDeviceTokenService.issue(session.userid, session.companyid, deviceName);
    await recordAgentAudit({
      companyid: session.companyid,
      action: "agent.signin",
      changedby: session.userid,
      newvalue: { userId: session.userid, deviceId, deviceName },
      description: `K.A.I.N. signed in on device "${deviceName}".`,
    });

    return res.status(201).json({
      token, // shown once; only its SHA-256 is stored
      deviceId,
      deviceName,
      userId: session.userid,
      displayName: session.fullname ?? session.email,
      companyId: session.companyid,
      companyName: session.companyname,
    });
  } catch (err) {
    if (err instanceof AccountLockedError) {
      logger.warn({ reason: "locked" }, "K.A.I.N. sign-in refused");
      await auditRefusal(email, deviceName, "locked");
      return res.status(423).json({ error: "account_locked", message: err.message });
    }
    if (err instanceof Error && err.message === BAD_CREDENTIALS) {
      logger.warn({ reason: "bad_credentials" }, "K.A.I.N. sign-in refused");
      await auditRefusal(email, deviceName, "bad_credentials");
      return res.status(401).json({ error: "invalid_credentials", message: BAD_CREDENTIALS });
    }
    logger.error({ err }, "K.A.I.N. sign-in failed");
    return res.status(500).json({ error: "sign-in failed" });
  }
});
// [SCOPE 152 / T005] END

// [SCOPE 134 / T028] BEGIN — agent connect routes
// MODIFIED-BY: [SCOPE 144 / T008] — 409 no_company_account { contactEmail }; 503 companion_unavailable
// MODIFIED-BY: [SCOPE 152 / T006] — device token instead of a Company Access Token; reach from agentReach
/** The broker's single "companion not available" code (SPEC-144 contract C1, FR-011). */
const COMPANION_UNAVAILABLE = "companion_unavailable";

router.get("/grants", requireAgentDevice, async (req: AgentRequest, res: Response) => {
  const device = req.agentDevice as VerifiedDevice;
  try {
    const projects = await agentConnectService.grants(device);
    return res.json({ userId: device.userId, deviceId: device.deviceId, projects, count: projects.length });
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

router.post("/connect", requireAgentDevice, async (req: AgentRequest, res: Response) => {
  const device = req.agentDevice as VerifiedDevice;
  const parsed = connectSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({
      error: "invalid request",
      detail: "Body is { projectId, mintAgentToken? }. The room is derived server-side and cannot be supplied.",
    });
  }
  try {
    const result = await agentConnectService.connect(device, parsed.data.projectId, {
      mintAgentToken: parsed.data.mintAgentToken,
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
      // Surfaced plainly, never retried (FR-016) — `not_a_member` included.
      logger.warn({ code: err.code, status: err.status }, "agent connect: YappChatt refused");
      return res.status(502).json({ error: err.code, message: err.message, upstreamStatus: err.status });
    }
    logger.error({ err }, "agent connect failed");
    return res.status(500).json({ error: "connect failed" });
  }
});
// [SCOPE 134 / T028] END

// [SCOPE 155 / T005] BEGIN — session status read (SCOPE-132 Amendment G piece A, FR-004)
// Reach-checked like /connect (404 not_granted outside it) and audited like every agent read;
// the status itself is already masked/capped at the column (T001) and service (T005) layers.
const PROJECT_ID_PARAM = z.string().uuid();

router.get("/projects/:projectId/status", requireAgentDevice, async (req: AgentRequest, res: Response) => {
  const device = req.agentDevice as VerifiedDevice;
  const parsedId = PROJECT_ID_PARAM.safeParse(req.params.projectId);
  if (!parsedId.success) {
    return res.status(400).json({ error: "invalid request", detail: "projectId must be a UUID." });
  }
  const projectId = parsedId.data;
  try {
    const reached = await findInAgentReach(device.userId, projectId);
    if (!reached) {
      return res.status(404).json({ error: "not_granted", message: "This K.A.I.N. device has not been granted this project." });
    }
    const status = await sessionStatus(projectId);
    await recordAgentAudit({
      companyid: reached.companyId,
      action: "agent.status.read",
      changedby: device.userId,
      newvalue: { projectId, deviceId: device.deviceId, deviceName: device.deviceName },
      description: `K.A.I.N. read session status for "${reached.projectName}" from device "${device.deviceName}".`,
    });
    return res.json({
      summary: status.sharing ? status.summary : null,
      lastEntry: status.sharing ? status.lastEntry : null,
      blockers: status.sharing ? status.blockers : [],
      state: status.state,
      lastSeenAt: status.lastSeenAt ? status.lastSeenAt.toISOString() : null,
      liveness: status.liveness,
      director: null, // reserved for piece B (mailbox), FR-084 — out of scope here (D-0100)
      sharing: status.sharing,
    });
  } catch (err) {
    logger.error({ err, projectId }, "agent session status read failed");
    return res.status(500).json({ error: "status read failed" });
  }
});
// [SCOPE 155 / T005] END

export default router;
