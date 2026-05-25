import { dbpush } from '../../../dbpush';

/**
 * Handler for the dbpush command.
 * This wraps the core dbpush logic and integrates it with the orchestrator command handler pattern.
 *
 * Spec 029 / T004 — IMPORTANT: do NOT inline create_specs / upsert_document
 * MCP calls into this file. Envelope inspection (success / blocked /
 * blockingIssues) lives in dbpush.ts's pushNewSpec + pushExistingSpec. If
 * you find yourself adding a parallel write path here, route it through
 * callMcpToolWithEnvelope (core/orchestrator/mcp-client.ts) instead so the
 * blocked-envelope detection from FR-005 / FR-007 still applies.
 */
export async function handleDbPushCommand(options: {
  dryRun?: boolean;
  spec?: string;
  force?: boolean;
  skipLifecycle?: boolean;
}) {
  return await dbpush(options);
}
