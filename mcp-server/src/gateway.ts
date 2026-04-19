import { db } from './db/connection.js';
import { events } from './db/schema.js';
import logger from './utils/logger.js';
/**
 * Post-tool audit log
 */
export async function auditToolCall(toolName: string, args: any, result: any): Promise<void> {
  try {
    await db.insert(events).values({
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
