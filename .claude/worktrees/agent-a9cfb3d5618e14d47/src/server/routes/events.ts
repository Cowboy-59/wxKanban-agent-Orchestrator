import { Router, Response } from "express";
import { pgNotifyListener, WxkEvent } from "../lib/pgNotifyListener.js";
import { authenticateToken, AuthRequest } from "../middleware/auth.js";
import { createLogger } from "../lib/logger.js";

const router = Router();
const logger = createLogger("sse-events");

// projectid → active SSE response objects
const connections = new Map<string, Set<Response>>();

// Forward pg_notify events to all SSE clients subscribed to that project
pgNotifyListener.on("event", (event: WxkEvent) => {
  const clients = connections.get(event.projectid);
  if (!clients?.size) return;
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const res of clients) {
    res.write(payload);
  }
});

/**
 * GET /api/events/:projectid
 * SSE stream for real-time task/spec status updates scoped to a project.
 * EventSource sends cookies automatically (withCredentials), so JWT auth works here.
 */
router.get("/:projectid", authenticateToken, (req: AuthRequest, res: Response): void => {
  const { projectid } = req.params;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no"); // disable nginx proxy buffering
  res.flushHeaders();

  // Initial comment to confirm the connection
  res.write(": connected\n\n");

  if (!connections.has(projectid)) {
    connections.set(projectid, new Set());
  }
  connections.get(projectid)!.add(res);

  logger.debug({ projectid, userid: req.userid }, "SSE client subscribed");

  // Heartbeat every 25 s keeps the connection alive through proxies/load-balancers
  const heartbeat = setInterval(() => {
    res.write(": heartbeat\n\n");
  }, 25_000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const clients = connections.get(projectid);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) connections.delete(projectid);
    }
    logger.debug({ projectid }, "SSE client disconnected");
  });
});

export default router;
