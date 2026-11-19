import express, { Router, Request, Response } from "express";
import Stripe from "stripe";
import { createLogger } from "../lib/logger.js";
import {
  isStripeCcProcessingEnabled,
  verifyWebhookSignature,
} from "../lib/stripe.js";
import { handleStripeEvent } from "../services/StripeWebhookHandler.js";

const logger = createLogger("webhooks");
const router = Router();

/**
 * POST /api/webhooks/stripe — Stripe lifecycle event receiver (spec 023 FR-006).
 *
 * Mounted in app.ts BEFORE the global express.json() middleware so the raw
 * request body is preserved for Stripe signature verification. The route-local
 * express.raw() body parser converts the incoming bytes into a Buffer on
 * req.body, which is what stripe.webhooks.constructEvent() needs to validate.
 *
 * Returns 200 even on internal handler errors so Stripe does not retry until
 * its 3-day backoff window expires. Internal failures are logged structurally;
 * downstream alerting picks them up from the log stream.
 */
router.post(
  "/stripe",
  express.raw({ type: "application/json" }),
  async (req: Request, res: Response): Promise<void> => {
    if (!isStripeCcProcessingEnabled()) {
      res.status(202).json({
        received: true,
        ignored: true,
        reason: "Credit-card processing is temporarily disabled",
      });
      return;
    }

    const sig = req.headers["stripe-signature"];
    if (!sig || typeof sig !== "string") {
      logger.warn("Missing or invalid stripe-signature header");
      res.status(400).json({ error: "Missing stripe-signature" });
      return;
    }

    let event: Stripe.Event;
    try {
      const body = req.body as Buffer;
      event = verifyWebhookSignature(body, sig);
    } catch (err) {
      logger.error({ err }, "Webhook signature verification failed");
      res.status(400).json({ error: "Webhook signature verification failed" });
      return;
    }

    // Past signature verification: handler errors must not bubble to Stripe.
    // Stripe retries every non-2xx for ~3 days, which would flood logs and
    // delay legitimate later events behind a stuck retry queue.
    try {
      await handleStripeEvent(event);
      res.status(200).json({ received: true });
    } catch (err) {
      logger.error(
        { err, eventId: event.id, eventType: event.type },
        "Webhook handler failed — returning 200 to suppress Stripe retry",
      );
      res.status(200).json({ received: true, internalError: true });
    }
  },
);

export default router;
