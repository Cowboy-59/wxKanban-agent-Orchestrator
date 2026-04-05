import fs from 'fs-extra';
import path from 'path';

// Pipeline state file location
const STATE_DIR = '.wxai';
const STATE_FILE = path.join(STATE_DIR, 'pipeline-state.json');

// Modes supported
const MODES = ['run', 'resume', 'parallel', 'status', 'retry'];

// Main orchestrator handler
export async function pipelineAgent(args: string[]) {
  // 1. Pre-flight: Check for empty args
  if (!args || args.length === 0) {
    throw new Error(`ERROR: No operation or feature description provided.\n\nUsage: /wxAI-pipeline-agent <mode> [feature description] [options]\n...`);
  }

  // 2. Parse mode and arguments
  const mode = args[0];
  if (!MODES.includes(mode)) {
    throw new Error(`ERROR: Invalid mode '${mode}'. Valid modes: ${MODES.join(', ')}`);
  }

  // 3. Handle --dry-run
  if (args.includes('--dry-run')) {
    // Construct the pipeline command and state entry
    const description = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
    const skipDirectives = args.filter(a => a.startsWith('--skip-'));
    const stateEntry = {
      specNumber: null,
      mode,
      status: 'in_progress',
      phases: 'all pending',
      skipDirectives,
    };
    return {
      dryRun: true,
      mode,
      command: `/wxAI-pipeline ${skipDirectives.join(' ')} "${description}"`,
      stateEntry,
      message: 'DRY RUN — No changes will be made',
    };
  }

  // 4. State file initialization
  await fs.ensureDir(STATE_DIR);
  // Add .wxai/ to .gitignore if not present
  const gitignorePath = '.gitignore';
  if (await fs.pathExists(gitignorePath)) {
    const gi = await fs.readFile(gitignorePath, 'utf-8');
    if (!gi.includes('.wxai/')) {
      await fs.appendFile(gitignorePath, '\n.wxai/\n');
    }
  }
  if (!(await fs.pathExists(STATE_FILE))) {
    await fs.writeJson(STATE_FILE, { version: '1.0', pipelines: [] }, { spaces: 2 });
  }
  // ...rest of orchestrator logic for run/resume/parallel/status/retry
}
