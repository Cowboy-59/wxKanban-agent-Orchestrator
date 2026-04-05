import { spawn } from 'child_process';

// Helper to run the /wxAI-pipeline command and capture output
async function runPipelineCommand(command: string, args: string[]): Promise<{ success: boolean; output: string }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, { shell: true });
    let output = '';
    proc.stdout.on('data', (data) => {
      output += data.toString();
    });
    proc.stderr.on('data', (data) => {
      output += data.toString();
    });
    proc.on('close', (code) => {
      resolve({ success: code === 0, output });
    });
  });
}

// Extend pipelineAgent with run mode implementation
export async function pipelineAgentRun(args: string[], stateFile: string) {
  // Parse skip directives and description
  const skipDirectives = args.filter(a => a.startsWith('--skip-'));
  const description = args.slice(1).filter(a => !a.startsWith('--')).join(' ');
  const pipelineArgs = [...skipDirectives, `"${description}"`];
  // Run the /wxAI-pipeline command
  const { success, output } = await runPipelineCommand('wxAI-pipeline', pipelineArgs);
  // TODO: Parse output, update state file after each phase, handle errors, auto-approve, etc.
  return { success, output };
}
