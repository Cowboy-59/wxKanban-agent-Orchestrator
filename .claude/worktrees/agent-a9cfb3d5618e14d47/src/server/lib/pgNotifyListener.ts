import { EventEmitter } from "events";
import { Client } from "pg";
import { createLogger } from "./logger.js";

const logger = createLogger("pg-notify");
const CHANNEL = "wxk_events";
const RECONNECT_DELAY_MS = 5_000;

export interface WxkEvent {
  type:
    | "task_status_changed"
    | "spec_lifecycle_changed"
    | "task_created"
    | "task_deleted"
    | "phase_status_changed"
    | "spec_created"
    | "note_added"
    | "notification_created"
    | "time_entry_created";
  id: string;
  projectid: string;
  status?: string;
  prev_status?: string;
  updatedat: string;
}
class PgNotifyListener extends EventEmitter {
  private client: Client | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isShuttingDown = false;

  async connect(): Promise<void> {
    // Reuse the same sslmode-stripping logic as db/client.ts
    const dbUrl = process.env.DATABASE_URL!
      .replace(/([?&])sslmode=[^&]*/g, "$1")
      .replace(/[?&]$/, "");

    this.client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
    });

    this.client.on("error", (err: Error) => {
      logger.error({ err }, "pg_notify client error");
      this.scheduleReconnect();
    });

    this.client.on("end", () => {
      if (!this.isShuttingDown) {
        logger.warn("pg_notify client disconnected — will reconnect");
        this.scheduleReconnect();
      }
    });

    this.client.on("notification", (msg) => {
      if (msg.channel !== CHANNEL || !msg.payload) return;
      try {
        const event = JSON.parse(msg.payload) as WxkEvent;
        logger.debug({ event }, "pg_notify event received");
        this.emit("event", event);
      } catch (err) {
        logger.error({ err, payload: msg.payload }, "Failed to parse pg_notify payload");
      }
    });

    try {
      await this.client.connect();
      await this.client.query(`LISTEN ${CHANNEL}`);
      logger.info({ channel: CHANNEL }, "pg_notify listener connected");
    } catch (err) {
      logger.error({ err }, "pg_notify listener failed to connect");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.isShuttingDown) return;
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;
      if (this.client) {
        await this.client.end().catch(() => {});
        this.client = null;
      }
      await this.connect();
    }, RECONNECT_DELAY_MS);
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.client) {
      await this.client.end().catch(() => {});
      this.client = null;
    }
    logger.info("pg_notify listener shut down");
  }
}

export const pgNotifyListener = new PgNotifyListener();
