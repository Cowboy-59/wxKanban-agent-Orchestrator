/**
 * MCP Server Gateway Middleware (Spec 018)
 * Server-side project scoping and policy enforcement
 */

import type { CallToolRequestParams } from '@modelcontextprotocol/sdk/types.js';
import { getMcpHealthState, setMcpLoadedProject } from './utils/mcp-health.js';
import logger from './utils/logger.js';
import { companyprojects, events } from './db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from './db/connection.js';

export interface GatewayToolParams {
  projectId: string;
  // Tool-specific
}

/**
 * Server-side middleware - validate project context before tool execution
 */
export async function gatewayMiddleware(_params: CallToolRequestParams): Promise<boolean> {
  const projectContext = getMcpHealthState().projectContext;
  
  if (!projectContext.projectId) {
    logger.error('Gateway: No project context for tool call');
    return false;
  }

  // Ensure project exists
  try {
    const [project] = await db
      .select()
      .from(companyprojects)
      .where(eq(companyprojects.id, projectContext.projectId))
      .limit(1);

    if (!project) {
      logger.error(`Gateway: Project not found: ${projectContext.projectId}`);
      return false;
    }

    // Update loaded project
    setMcpLoadedProject({
      id: project.id,
      name: project.name,
      status: project.status ?? null,
      currentPhase: null,
      companyId: project.companyId ?? null,
      updatedAt: project.updatedAt ? project.updatedAt.toISOString() : null,
    });

    logger.info(`Gateway: Authenticated project ${project.name} for tool execution`);
    return true;
  } catch (error) {
    logger.error('Gateway: DB check failed', error as Error);
    return false;
  }
}

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
