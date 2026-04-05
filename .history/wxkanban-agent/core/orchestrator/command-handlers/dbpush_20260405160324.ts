import { dbpush } from '../../../dbpush';

/**
 * Handler for the dbpush command.
 * This wraps the core dbpush logic and integrates it with the orchestrator command handler pattern.
 */
export async function handleDbPushCommand(options: {
  dryRun?: boolean;
  spec?: string;
  force?: boolean;
  skipLifecycle?: boolean;
}) {
  return await dbpush(options);
}
