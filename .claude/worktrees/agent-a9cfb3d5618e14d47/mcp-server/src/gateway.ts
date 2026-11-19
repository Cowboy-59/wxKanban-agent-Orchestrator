import { events } from './db/schema.js';
import type { ScopedDb } from './db/scoped-query.js';
import logger from './utils/logger.js';
/**
 * Post-tool audit log.
 *
 * Spec 028 / T010 — uses the per-request scoped-query wrapper so the
 * inserted audit row cannot escape the caller's (customerid, projectid).
 * The dispatcher in server.ts builds `scoped` from `request._meta.mcpScope`
 * and passes it in.
 */
export async function auditToolCall(
  scoped: ScopedDb,
  toolName: string,
  args: any,
  result: any,
): Promise<void> {
  try {
    await scoped.insertScoped(events, {
      projectId: args.projectId,
      type: 'mcp_tool_call',
      source: 'mcp',
      actor: 'mcp-server',
      rawContent: JSON.stringify({ tool: toolName, args, result: result.content || result }),
      normalizedContent: null,
      metadata: {
        toolName,
      },
      createdAt: new Date(),
    });
    logger.debug('Gateway audit logged');
  } catch (error) {
    logger.error('Gateway audit failed', error as Error);
  }
}
