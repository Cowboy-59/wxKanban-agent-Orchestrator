/**
 * Stage Enforcement for MCP Server
 *
 * Queries the database for the project's active lifecycle phase and
 * blocks MCP tool calls that are not permitted in that phase.
 *
 * This is the HARD enforcement layer — it cannot be bypassed by any AI tool.
 */

import { eq, and, inArray } from 'drizzle-orm';
import { projectphases, companyprojects } from '../db/schema.js';

/** Lifecycle stages as stored in projectphases.phasename */
type LifecycleStage =
  | 'Design'
  | 'Implementation'
  | 'QA'
  | 'HumanTesting'
  | 'Beta'
  | 'Release';

/**
 * MCP tool names that are stage-gated.
 * Tools not listed here are allowed in any stage (cross-cutting).
 */
const STAGE_GATED_TOOLS: Record<string, LifecycleStage[]> = {
  'project.buildscope': ['Design'],
  'project.create_specs': ['Design'],
  'project.implement': ['Implementation'],
  'project.createtesttasks': ['Implementation'],
  'project.runqa': ['QA'],
  'project.runhuman': ['HumanTesting'],
  'project.prepareRelease': ['Beta'],
  'project.finalizeRelease': ['Release'],
};

/** Active phase statuses (pending phases haven't started yet) */
const ACTIVE_PHASE_STATUSES = ['in_progress', 'reopened'];

export interface StageEnforcementResult {
  allowed: boolean;
  currentStage: string | null;
  requestedTool: string;
  reason?: string;
}

/**
 * Check whether a tool call is permitted given the project's current lifecycle stage.
 *
 * @param db - Drizzle database instance
 * @param projectId - The project ID from the MCP context
 * @param toolName - The MCP tool being called (e.g. 'project.implement')
 * @returns StageEnforcementResult with allowed=true if permitted
 */
export async function enforceStage(
  db: any,
  projectId: string,
  toolName: string,
): Promise<StageEnforcementResult> {
  // If tool is not stage-gated, allow it
  const allowedStages = STAGE_GATED_TOOLS[toolName];
  if (!allowedStages) {
    return { allowed: true, currentStage: null, requestedTool: toolName };
  }

  // Query the active phase for this project
  const activePhases = await db
    .select({ phaseName: projectphases.phaseName, status: projectphases.status })
    .from(projectphases)
    .where(
      and(
        eq(projectphases.projectId, projectId),
        inArray(projectphases.status, ACTIVE_PHASE_STATUSES),
      ),
    );

  if (activePhases.length === 0) {
    // No active phase — check if project exists at all
    const [project] = await db
      .select({ id: companyprojects.id })
      .from(companyprojects)
      .where(eq(companyprojects.id, projectId))
      .limit(1);

    if (!project) {
      return {
        allowed: false,
        currentStage: null,
        requestedTool: toolName,
        reason: `Project '${projectId}' not found in database. Cannot determine lifecycle stage.`,
      };
    }

    // Project exists but no active phase — default to Design (initial state)
    if (allowedStages.includes('Design')) {
      return { allowed: true, currentStage: 'Design', requestedTool: toolName };
    }

    return {
      allowed: false,
      currentStage: 'Design (default — no active phase)',
      requestedTool: toolName,
      reason: `Tool '${toolName}' requires stage ${allowedStages.join(' or ')} but project is in Design phase (no active phase found). Complete the current phase before proceeding.`,
    };
  }

  // Check if any active phase matches the allowed stages
  const activePhaseNames = activePhases.map((p: { phaseName: string }) => p.phaseName);
  const stageMatch = allowedStages.some((stage) => activePhaseNames.includes(stage));

  if (stageMatch) {
    return {
      allowed: true,
      currentStage: activePhaseNames.join(', '),
      requestedTool: toolName,
    };
  }

  return {
    allowed: false,
    currentStage: activePhaseNames.join(', '),
    requestedTool: toolName,
    reason: `STAGE GATE BLOCKED: Tool '${toolName}' is only permitted in ${allowedStages.join(' or ')} stage. Current active stage: ${activePhaseNames.join(', ')}. Advance the project lifecycle before using this tool.`,
  };
}

/**
 * Returns the list of stage-gated tool names for documentation/introspection.
 */
export function getStageGatedTools(): Record<string, LifecycleStage[]> {
  return { ...STAGE_GATED_TOOLS };
}
