import { join } from "path";
import { agentCommand } from "./command-lane";

// [SCOPE 159 / T022] BEGIN — Agent-command writer entry point (FR-095)
// MODIFIED-BY: [SCOPE 159 / T023] — "status" is answered here from disk, exit 0, may print several lines, writes nothing (FR-096)
// MODIFIED-BY: [SCOPE 159 / T024] — "autopilot" waits up to 30 s for the agent's list and prints it, or the sent line; go, no and skip with nothing waiting exit 5 (FR-097)
//
// Run by the local Claude session through bin/agent-command.mjs:
//
//   node wxkanban-agent/apps/remote-bridge/bin/agent-command.mjs --list
//   node wxkanban-agent/apps/remote-bridge/bin/agent-command.mjs <command>
//
// --list prints the one command list, one line per command. A command prints exactly one line:
// sent, not a command, not for the lane, or the agent is not running. The exceptions are
// "status": the one status builder's summary, one or more lines, agent up or down; and
// "autopilot": the devplan list the agent posted (several lines), or the sent line when it has not
// answered within 30 seconds. Exit codes:
// 0 sent (or --list, or status), 1 the Project Agent is not running, 2 not a command, 3 a command with its own local
// rule (push, transfer to agent) or a room-only word, 4 the file could not be written, 5 nothing
// for the command to act on (go, no or skip with no list or question waiting; autopilot during a
// run). Nothing is written unless the agent is running. No network, no token mint, no process started.

const REPO_ROOT = process.env.WXKANBAN_REPO_ROOT || join(__dirname, "..", "..", "..", "..");

function fail(err: unknown): void {
  process.stdout.write(`The command could not be sent (${(err as Error).message}). Nothing was written.\n`);
  process.exitCode = 4;
}

try {
  agentCommand(process.argv.slice(2), { repoRoot: REPO_ROOT }).then((result) => {
    for (const line of result.lines) process.stdout.write(`${line}\n`);
    process.exitCode = result.code;
  }, fail);
} catch (err) {
  fail(err);
}
// [SCOPE 159 / T022] END
