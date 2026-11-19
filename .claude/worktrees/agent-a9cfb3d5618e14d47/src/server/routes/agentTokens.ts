/**
 * Company agent tokens — the Company Profile surface for KAIN and friends.
 * SCOPE-134 / T026.
 *
 * `requireAdmin` on every mutating route, deliberately. The nearest existing per-project
 * write, `PATCH /api/projects/:id`, is open to ANY authenticated user in the company —
 * hanging agent credentials off that pattern would let every team member issue one.
 */
import { Router, Response } from "express";
import { z } from "zod";
import { authenticateToken, requireAuth, AuthRequest } from "../middleware/auth.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { companyAgentTokenService } from "../services/CompanyAgentTokenService.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("agent-token-routes");

// [SCOPE 134 / T026] BEGIN — agent token routes
// MODIFIED-BY: [SCOPE 152 / T008] — issue schema removed with the issue route (FR-069)
/**
 * GET /api/company/agent-tokens — live tickets for the caller's company.
 * Never returns a token or a hash; a listing is not a credential.
 */
router.get("/", authenticateToken, requireAuth, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.companyid) return res.status(400).json({ error: "no company on this session" });
    const tokens = await companyAgentTokenService.list(req.companyid);
    return res.json({ tokens, count: tokens.length });
  } catch (err) {
    logger.error({ err }, "failed to list agent tokens");
    return res.status(500).json({ error: "failed to list agent tokens" });
  }
});

/**
 * POST /api/company/agent-tokens — retired.
 * MODIFIED-BY: [SCOPE 152 / T008] — 410 use_signin (SCOPE-132 Amendment F, FR-069)
 *
 * K.A.I.N. now signs in as the person, per device (POST /api/agent/signin), so no company
 * ticket is issued any more. Listing and revoking old tickets stay, for the record.
 */
router.post("/", authenticateToken, requireAuth, requireAdmin, (_req: AuthRequest, res: Response) => {
  return res.status(410).json({
    error: "use_signin",
    message: "Company Access Tokens are retired. Sign K.A.I.N. in with your own wxKanban email and password.",
  });
});

/**
 * DELETE /api/company/agent-tokens/:id — revoke.
 *
 * Scoped by company as well as id inside the service: a uuid is not an authorization.
 */
router.delete(
  "/:id",
  authenticateToken,
  requireAuth,
  requireAdmin,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.companyid) return res.status(400).json({ error: "no company on this session" });
      if (!req.userid) return res.status(400).json({ error: "no user on this session" });

      // req.params.id is typed `string | string[]` here. Validate the shape rather than
      // coerce it — a malformed id should be a 400, not a query with an array in it.
      const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
      if (!id || !z.string().uuid().safeParse(id).success) {
        return res.status(400).json({ error: "invalid token id" });
      }

      const revoked = await companyAgentTokenService.revoke(req.companyid, id, req.userid);
      // Not-found and not-yours are the same answer on purpose: distinguishing them
      // confirms which ids exist in other companies.
      if (!revoked) return res.status(404).json({ error: "token not found or already revoked" });
      return res.json({ revoked: true });
    } catch (err) {
      logger.error({ err }, "failed to revoke agent token");
      return res.status(500).json({ error: "failed to revoke agent token" });
    }
  },
);
// [SCOPE 134 / T026] END

export default router;
