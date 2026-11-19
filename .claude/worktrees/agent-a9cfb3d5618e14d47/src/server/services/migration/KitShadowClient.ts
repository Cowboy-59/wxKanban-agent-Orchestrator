/**
 * KitShadowClient
 *
 * Fire-and-forget HTTP client that sends tool calls to the kit MCP server
 * running on localhost:3002. Used by the shadow-call wrapper in GatewayService
 * during Phase B of the spec 019 migration.
 *
 * This client never throws — all errors are returned as structured results
 * so the legacy gateway path is never disrupted.
 */

import { createLogger } from "~/server/lib/logger.js";

const logger = createLogger("kit-shadow-client");

const KIT_MCP_URL = process.env.KIT_MCP_URL ?? "http://localhost:3002";
const KIT_API_KEY = process.env.API_KEY ?? "wxkanban-mcp-local-dev-key";

export interface KitShadowResult {
  success: boolean;
  tool: string;
  response?: unknown;
  error?: string;
  latencyMs: number;
}

/**
 * Map legacy gateway tool names to kit MCP tool equivalents.
 * Returns null if there is no kit equivalent (tool is obsolete under 019).
 */
function mapLegacyToolToKit(legacyTool: string): { tool: string; argTransform: (args: Record<string, unknown>) => Record<string, unknown> } | null {
  switch (legacyTool) {
    // Drift tools — obsolete under 019 (single MCP tree), but we shadow them
    // to prove the kit's project.capture_event can absorb drift logging
    case "drift.list":
      return {
        tool: "project.list_open_items",
        argTransform: (args) => ({ projectId: args.projectId }),
      };
    case "drift.summary":
      return {
        tool: "project.mcp_health",
        argTransform: () => ({}),
      };

    // Update tools — kit has project.check_for_updates and project.upgrade_mcp
    case "updates.available":
      return {
        tool: "project.check_for_updates",
        argTransform: (args) => ({ projectId: args.projectId }),
      };
    case "updates.apply":
      return {
        tool: "project.upgrade_mcp",
        argTransform: (args) => ({ version: args.version }),
      };

    // Parity tools — fully obsolete, no kit equivalent
    case "parity.get":
    case "parity.set":
    case "parity.rollback":
      return null;

    // Pass-through for any future additions
    default:
      return null;
  }
}

export async function shadowCallKit(
  legacyTool: string,
  legacyArgs: Record<string, unknown>,
): Promise<KitShadowResult> {
  const start = Date.now();
  const mapping = mapLegacyToolToKit(legacyTool);

  if (!mapping) {
    return {
      success: true,
      tool: legacyTool,
      response: { skipped: true, reason: "No kit equivalent (obsolete under 019)" },
      latencyMs: Date.now() - start,
    };
  }

  try {
    const kitArgs = mapping.argTransform(legacyArgs);
    const res = await fetch(`${KIT_MCP_URL}/call`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": KIT_API_KEY,
      },
      body: JSON.stringify({ tool: mapping.tool, arguments: kitArgs }),
      signal: AbortSignal.timeout(10_000),
    });

    const body = await res.json();
    const latencyMs = Date.now() - start;

    if (!res.ok) {
      logger.warn({ legacyTool, kitTool: mapping.tool, status: res.status, body, latencyMs }, "Kit shadow call returned non-OK");
      return { success: false, tool: mapping.tool, error: `HTTP ${res.status}`, response: body, latencyMs };
    }

    return { success: true, tool: mapping.tool, response: body, latencyMs };
  } catch (err) {
    const latencyMs = Date.now() - start;
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ legacyTool, kitTool: mapping.tool, error: message, latencyMs }, "Kit shadow call failed");
    return { success: false, tool: mapping.tool, error: message, latencyMs };
  }
}
