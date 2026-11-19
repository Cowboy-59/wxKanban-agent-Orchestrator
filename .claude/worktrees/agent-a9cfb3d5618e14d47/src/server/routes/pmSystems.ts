import { Router, Response } from "express";
import { randomBytes } from "crypto";
import { z } from "zod";
import {
  getUserPMConnections,
  getPMConnection,
  disconnectPMSystem,
  connectPMSystem,
} from "../services/pmSystemService.js";
import { validateBody, validateParams } from "../middleware/validation.js";
import {
  authenticateToken,
  requireAuth,
  AuthRequest,
} from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";
import { createJiraAdapter } from "../lib/pm-adapters/jira.js";
import { createMondayAdapter } from "../lib/pm-adapters/monday.js";

const router = Router();
const logger = createLogger("pm-systems-routes");

const OAUTH_STATE_COOKIE = "pm_oauth_state";
const OAUTH_STATE_MAX_AGE_MS = 10 * 60 * 1000;

function readCookie(req: { headers: { cookie?: string } }, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  const prefix = `${name}=`;
  const match = header
    .split(";")
    .map((c) => c.trim())
    .find((c) => c.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : undefined;
}

// Validation schemas
// OAuth 2.0 providers (jira/monday) send `code`; Trello's token flow sends
// `token` directly (delivered to the client via URL fragment).
const connectSchema = z
  .object({
    pmsystem: z.enum(["jira", "monday", "asana", "trello"]),
    code: z.string().min(1).optional(),
    token: z.string().min(1).optional(),
    state: z.string().min(1, "OAuth state is required"),
  })
  .refine((d) => Boolean(d.code) || Boolean(d.token), {
    message: "Either 'code' or 'token' is required",
    path: ["code"],
  });

function buildTrelloAuthorizationUrl(state: string): string {
  const apiKey = process.env.TRELLO_API_KEY;
  if (!apiKey) {
    throw new Error("TRELLO_API_KEY must be set in environment");
  }
  const returnUrl =
    process.env.TRELLO_REDIRECT_URI ||
    `${process.env.CLIENT_URL}/oauth/callback/trello`;
  // Trello appends the token to this URL as a fragment (#token=...).
  // State is carried in return_url as a query param since Trello's authorize
  // endpoint does not echo a standalone `state` back.
  const returnWithState = `${returnUrl}?state=${encodeURIComponent(state)}`;
  const params = new URLSearchParams({
    key: apiKey,
    name: "wxKanban",
    scope: "read,write",
    expiration: "never",
    response_type: "token",
    return_url: returnWithState,
  });
  return `https://trello.com/1/authorize?${params.toString()}`;
}

const paramsSchema = z.object({
  pmsystem: z.enum(["jira", "monday", "asana", "trello"]),
});

/**
 * GET /api/pm-systems
 * List all connected PM systems for authenticated user
 */
router.get(
  "/",
  authenticateToken,
  requireAuth,
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const connections = await getUserPMConnections(req.userid);

      res.status(200).json({
        success: true,
        data: connections,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch PM connections",
      );
      res.status(500).json({ error: "Failed to fetch PM connections" });
    }
  },
);

/**
 * GET /api/pm-systems/:pmsystem
 * Get a specific PM system connection
 */
router.get(
  "/:pmsystem",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const pmsystem = req.params.pmsystem as
        | "jira"
        | "monday"
        | "asana"
        | "trello";
      const connection = await getPMConnection(req.userid, pmsystem);

      if (!connection) {
        res.status(404).json({ error: `${pmsystem} connection not found` });
        return;
      }

      res.status(200).json({
        success: true,
        data: connection,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch PM connection",
      );
      res.status(500).json({ error: "Failed to fetch PM connection" });
    }
  },
);

/**
 * GET /api/pm-systems/:pmsystem/authorize
 * Begin OAuth flow: generate CSRF state, stash it in an httpOnly cookie,
 * return the provider authorization URL for the frontend to redirect to.
 */
router.get(
  "/:pmsystem/authorize",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const pmsystem = req.params.pmsystem as
        | "jira"
        | "monday"
        | "asana"
        | "trello";

      const state = randomBytes(32).toString("hex");

      let url: string;
      try {
        if (pmsystem === "jira") {
          url = createJiraAdapter().getAuthorizationUrl(state);
        } else if (pmsystem === "monday") {
          url = createMondayAdapter().getAuthorizationUrl(state);
        } else if (pmsystem === "trello") {
          url = buildTrelloAuthorizationUrl(state);
        } else {
          res.status(400).json({ error: `Unsupported PM system: ${pmsystem}` });
          return;
        }
      } catch (adapterError) {
        logger.error(
          {
            error: adapterError instanceof Error ? adapterError.message : "Unknown error",
            pmsystem,
          },
          "Failed to build OAuth authorization URL — missing credentials?",
        );
        res.status(500).json({
          error: "PM system OAuth is not configured on the server",
        });
        return;
      }

      res.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: OAUTH_STATE_MAX_AGE_MS,
        path: "/",
      });

      res.status(200).json({ success: true, data: { url } });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to initiate OAuth",
      );
      res.status(500).json({ error: "Failed to initiate OAuth" });
    }
  },
);

/**
 * POST /api/pm-systems
 * Connect to a PM system with OAuth authorization code
 * Expected flow:
 * 1. Frontend redirects user to PM system OAuth endpoint
 * 2. User authorizes wxKanban
 * 3. PM system redirects to callback URL with authorization code
 * 4. Frontend sends code to this endpoint
 * 5. Backend exchanges code for access/refresh tokens
 */
router.post(
  "/",
  authenticateToken,
  requireAuth,
  validateBody(connectSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const { pmsystem, code, token, state } = req.body;

      const cookieState = readCookie(req, OAUTH_STATE_COOKIE);
      if (!cookieState || cookieState !== state) {
        logger.warn(
          { userid: req.userid, pmsystem, hasCookie: Boolean(cookieState) },
          "OAuth state mismatch — possible CSRF or expired flow",
        );
        res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });
        res.status(400).json({
          error: "OAuth state mismatch. Please retry the connection.",
        });
        return;
      }
      res.clearCookie(OAUTH_STATE_COOKIE, { path: "/" });

      logger.info(
        { userid: req.userid, pmsystem },
        "Exchanging OAuth code for tokens"
      );

      // Exchange code for tokens using appropriate adapter. Trello uses a
      // token-flow and delivers the bearer token directly — no exchange call.
      let tokens: { accessToken: string; refreshToken?: string; expiresAt?: Date };
      try {
        if (pmsystem === "jira") {
          if (!code) {
            res.status(400).json({ error: "Missing authorization code" });
            return;
          }
          tokens = await createJiraAdapter().exchangeCode(code);
        } else if (pmsystem === "monday") {
          if (!code) {
            res.status(400).json({ error: "Missing authorization code" });
            return;
          }
          tokens = await createMondayAdapter().exchangeCode(code);
        } else if (pmsystem === "trello") {
          if (!token) {
            res.status(400).json({ error: "Missing Trello token" });
            return;
          }
          // expiration=never was requested; pick a far-future date to satisfy
          // the NOT NULL expiresat column.
          tokens = {
            accessToken: token,
            refreshToken: undefined,
            expiresAt: new Date(Date.now() + 10 * 365 * 24 * 60 * 60 * 1000),
          };
        } else {
          res.status(400).json({ error: `Unsupported PM system: ${pmsystem}` });
          return;
        }
      } catch (adapterError) {
        logger.error(
          { error: adapterError instanceof Error ? adapterError.message : "Unknown error", pmsystem },
          "OAuth token exchange failed"
        );
        res.status(400).json({
          error: "Failed to exchange authorization code",
          message: adapterError instanceof Error ? adapterError.message : "Unknown error",
        });
        return;
      }

      // Store connection in database. Some providers (e.g. Monday.com) omit
      // refresh_token / expires_in, which yields empty strings or Invalid Date.
      // Schema currently requires NOT NULL, so coerce to safe defaults.
      const expiresAt =
        tokens.expiresAt && !Number.isNaN(tokens.expiresAt.getTime())
          ? tokens.expiresAt
          : new Date(Date.now() + 60 * 60 * 1000);

      const connection = await connectPMSystem({
        userid: req.userid,
        pmsystem,
        accesstoken: tokens.accessToken,
        refreshtoken: tokens.refreshToken ?? "",
        expiresat: expiresAt,
      });

      logger.info(
        { userid: req.userid, pmsystem, connectionId: connection.id },
        "Successfully connected PM system"
      );

      res.status(201).json({
        success: true,
        message: `Successfully connected to ${pmsystem}`,
        data: {
          id: connection.id,
          pmsystem: connection.pmsystem,
          syncstatus: connection.syncstatus,
          createdat: connection.createdat,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(
        { error: message, stack, pmsystem: req.body.pmsystem },
        "Failed to connect PM system",
      );
      res.status(500).json({ error: "Failed to connect PM system", message });
    }
  },
);


/**
 * DELETE /api/pm-systems/:pmsystem
 * Disconnect a PM system
 */
router.delete(
  "/:pmsystem",
  authenticateToken,
  requireAuth,
  validateParams(paramsSchema),
  async (req: AuthRequest, res: Response) => {
    try {
      if (!req.userid) {
        res.status(401).json({ error: "Authentication required" });
        return;
      }

      const pmsystem = req.params.pmsystem as
        | "jira"
        | "monday"
        | "asana"
        | "trello";
      const success = await disconnectPMSystem(req.userid, pmsystem);

      if (!success) {
        res.status(404).json({ error: `${pmsystem} connection not found` });
        return;
      }

      res.status(200).json({
        success: true,
        message: `Disconnected from ${pmsystem}`,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to disconnect PM system",
      );
      res.status(500).json({ error: "Failed to disconnect PM system" });
    }
  },
);

export default router;
