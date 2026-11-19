import { desc, eq } from "drizzle-orm";
import { db } from "~/db/client.js";
import { mcpparityconfig } from "~/db/schema/index.js";
import { createLogger } from "~/server/lib/logger.js";
import type { ParityConfigResponse, ParityGateMode } from "~/shared/types/gateway.js";

const logger = createLogger("parity-gate-service");

function toResponse(row: typeof mcpparityconfig.$inferSelect): ParityConfigResponse {
  return {
    id: row.id,
    gateMode: row.gatemode as ParityGateMode,
    advisoryStartedAt: row.advisorystartedat ? row.advisorystartedat.toISOString() : null,
    mandatoryActivatedAt: row.mandatoryactivatedat ? row.mandatoryactivatedat.toISOString() : null,
    rollbackAt: row.rollbackat ? row.rollbackat.toISOString() : null,
    rollbackBy: row.rollbackby ?? null,
    createdAt: row.createdat.toISOString(),
    updatedAt: row.updatedat.toISOString(),
  };
}

export class ParityGateService {
  async getMode(): Promise<ParityConfigResponse> {
    const [existing] = await db.select().from(mcpparityconfig).orderBy(desc(mcpparityconfig.createdat)).limit(1);
    if (existing) {
      return toResponse(existing);
    }

    const now = new Date();
    const [created] = await db.insert(mcpparityconfig).values({ advisorystartedat: now, updatedat: now }).returning();
    return toResponse(created);
  }

  async setMode(mode: ParityGateMode, actorid: string): Promise<ParityConfigResponse> {
    const current = await this.getMode();
    const now = new Date();
    const [updated] = await db
      .update(mcpparityconfig)
      .set({
        gatemode: mode,
        advisorystartedat: current.advisoryStartedAt ? new Date(current.advisoryStartedAt) : now,
        mandatoryactivatedat: mode === "mandatory" ? now : null,
        rollbackat: mode === "advisory" ? now : null,
        rollbackby: mode === "advisory" ? actorid : null,
        updatedat: now,
      })
      .where(eq(mcpparityconfig.id, current.id))
      .returning();

    logger.info({ actorid, mode }, "Parity gate mode updated");
    return toResponse(updated);
  }

  async rollback(actorid: string): Promise<ParityConfigResponse> {
    return this.setMode("advisory", actorid);
  }
}
