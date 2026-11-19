import { Router, Request, Response } from "express";
import { softAuthenticateToken, type AuthRequest } from "~/server/middleware/auth.js";
import { ErrorCaptureService } from "~/server/services/ErrorCaptureService.js";
import { createLogger } from "~/server/lib/logger.js";
import type { CapturedErrorInput, CapturedErrorKind } from "~/shared/types/errors.js";

const router = Router();
const logger = createLogger("error-capture-route");

// [SCOPE 061] BEGIN — POST /api/errors intake (unauthenticated, abuse-bounded, fail-open)
// The endpoint is intentionally unauthenticated (client capture may fire pre-auth),
// so it is bounded at the CHANNEL — per-IP rate-limit + payload size cap + same-site
// Origin check — independently of the fingerprint. It never returns 5xx and never
// harms the caller.

const MAX_BODY_BYTES = 32 * 1024;
const WINDOW_MS = 60_000;
const MAX_PER_IP_PER_WINDOW = 60;
const ipHits = new Map<string, { count: number; reset: number }>();

function ipAllowed(ip: string): boolean {
  const now = Date.now();
  const e = ipHits.get(ip);
  if (!e || now > e.reset) {
    ipHits.set(ip, { count: 1, reset: now + WINDOW_MS });
    return true;
  }
  if (e.count >= MAX_PER_IP_PER_WINDOW) return false;
  e.count++;
  return true;
}

function originOk(req: Request): boolean {
  const origin = req.headers.origin;
  if (!origin) return true; // same-origin fetches / server-side captures may omit Origin
  try {
    return new URL(origin).host === req.headers.host;
  } catch {
    return false;
  }
}

const KNOWN_KINDS: CapturedErrorKind[] = [
  "errorBoundary", "windowError", "unhandledRejection", "apiFetch",
  "serverHandler", "uncaughtException", "unhandledRejectionServer",
];

router.post(
  "/api/errors",
  softAuthenticateToken,
  async (req: AuthRequest, res: Response) => {
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
      const ip =
        (req.headers["x-forwarded-for"] as string | undefined)?.split(",")[0]?.trim() ||
        req.ip ||
        "unknown";
      if (!originOk(req)) {
        res.status(403).json({ ok: false, reason: "origin" });
        return;
      }
      if (!ipAllowed(ip)) {
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
      const result = await ErrorCaptureService.capture(input, { userId: req.userid ?? null });
      res.status(202).json(result);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "intake error (swallowed)");
      res.status(202).json({ ok: false }); // never 5xx
    }
  },
);
// [SCOPE 061] END

export default router;
