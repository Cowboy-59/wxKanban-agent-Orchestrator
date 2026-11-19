import { Router, Request, Response } from "express";
import { apiTokenService } from "~/server/services/ApiTokenService.js";
import { ErrorCaptureService } from "~/server/services/ErrorCaptureService.js";
import { createLogger } from "~/server/lib/logger.js";
import { extractToken } from "~/server/lib/jwt.js";
import type { CapturedErrorInput, CapturedErrorKind } from "~/shared/types/errors.js";

const router = Router();
const logger = createLogger("project-error-ingest");

// [SCOPE 063 / T004] BEGIN — POST /api/projects/:id/errors (token-auth external ingest, fail-open)
// The customer-facing counterpart to SCOPE-061's unauthenticated /api/errors:
// a customer's OWN application posts trapped errors here with its project ingest
// token; the error is stored against THAT project (not the central sink). The
// trust anchor is the bearer token bound to the project — so there is NO Origin
// check (external apps are cross-origin by definition). Bounded per-IP AND
// per-token. Never returns 5xx and never harms the caller.

const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_IP_PER_WINDOW = 60;
const MAX_PER_TOKEN_PER_WINDOW = 120; // a busy app may legitimately exceed the per-IP bound behind one egress IP
const ipHits = new Map<string, { count: number; reset: number }>();
const tokenHits = new Map<string, { count: number; reset: number }>();

function allowed(map: Map<string, { count: number; reset: number }>, key: string, max: number): boolean {
  const now = Date.now();
  const e = map.get(key);
  if (!e || now > e.reset) {
    map.set(key, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= max) return false;
  e.count++;
  return true;
}

const KNOWN_KINDS: CapturedErrorKind[] = [
  "errorBoundary", "windowError", "unhandledRejection", "apiFetch",
  "serverHandler", "uncaughtException", "unhandledRejectionServer",
];

function clientIp(req: Request): string {
  return (
    (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
    req.ip ||
    "unknown"
  );
}

router.post(
  "/api/projects/:id/errors",
  async (req: Request, res: Response) => {
    try {
      if (!ErrorCaptureService.isEnabled()) {
        res.status(204).end();
        return;
      }
      const len = Number(req.headers["content-length"] ?? 0);
      if (len > MAX_BODY_BYTES) {
        res.status(413).json({ ok: false, reason: "too-large" });
        return;
      }
      if (!allowed(ipHits, clientIp(req), MAX_PER_IP_PER_WINDOW)) {
        res.status(429).json({ ok: false, reason: "rate" });
        return;
      }

      // Bearer token is the trust anchor — bind the write to the token's project.
      const token = extractToken(req.headers.authorization);
      if (!token) {
        res.status(401).json({ ok: false, reason: "missing-token" });
        return;
      }
      const projectId = String(req.params.id ?? "");
      const tokenRecord = await apiTokenService.validateToken(token);
      if (!tokenRecord) {
        res.status(401).json({ ok: false, reason: "invalid-token" });
        return;
      }
      if (tokenRecord.projectid !== projectId) {
        logger.warn(
          { tokenId: tokenRecord.id, tokenProjectId: tokenRecord.projectid, urlProjectId: projectId },
          "ingest token used against a different project",
        );
        res.status(403).json({ ok: false, reason: "wrong-project" });
        return;
      }
      if (!allowed(tokenHits, tokenRecord.id, MAX_PER_TOKEN_PER_WINDOW)) {
        res.status(429).json({ ok: false, reason: "rate" });
        return;
      }

      const b = (req.body ?? {}) as Partial<CapturedErrorInput>;
      if (!b || typeof b !== "object" || !b.name || !b.source || !b.kind || !KNOWN_KINDS.includes(b.kind)) {
        res.status(202).json({ ok: false, reason: "incomplete" }); // accept, never 5xx
        return;
      }
      const input: CapturedErrorInput = {
        source: b.source === "server" ? "server" : "client",
        kind: b.kind,
        name: String(b.name).slice(0, 200),
        message: String(b.message ?? "").slice(0, 4000),
        stack: b.stack ? String(b.stack).slice(0, 16000) : undefined,
        componentStack: b.componentStack ? String(b.componentStack).slice(0, 8000) : undefined,
        route: b.route ? String(b.route).slice(0, 500) : undefined,
        status: typeof b.status === "number" ? b.status : undefined,
        appVersion: b.appVersion ? String(b.appVersion).slice(0, 32) : undefined,
      };
      const result = await ErrorCaptureService.capture(input, {
        userId: tokenRecord.userid,
        projectId,
      });
      res.status(202).json(result);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "project ingest error (swallowed)");
      res.status(202).json({ ok: false }); // never 5xx
    }
  },
);
// [SCOPE 063 / T004] END

export default router;
