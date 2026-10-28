import { readFileSync } from "fs";
import { join } from "path";
import { createHandoffLogger } from "./handoff-log";
import { preflightEnv, readHandoffInput, runHandoff } from "./handoff-writer";

// [SCOPE 149 / T002] BEGIN — HANDOFF REMOTE writer entry point (FR-001 – FR-005)
//
// Run by the /remote command (HANDOFF REMOTE) through bin/handoff-remote.mjs:
//
//   node wxkanban-agent/apps/remote-bridge/bin/handoff-remote.mjs --input <fields.json>
//   ... or the same JSON on stdin.
//
// Prints exactly one line on stdout — the file and the masked count, or the blocked cause and
// its fix — and exits 0 when written, 1 when blocked, 2 on bad input. It launches no process
// and never posts to the room. From .env it reads only the preflight's token keys
// (preflightEnv, FR-002). Audit lines (Pino) go to stderr.

const REPO_ROOT = process.env.WXKANBAN_REPO_ROOT || join(__dirname, "..", "..", "..", "..");

function readInputText(argv: string[]): string {
  const i = argv.indexOf("--input");
  if (i >= 0) {
    const path = argv[i + 1];
    if (!path) throw new Error("--input needs a file path");
    return readFileSync(path, "utf-8");
  }
  return readFileSync(0, "utf-8");
}

async function handoffMain(): Promise<number> {
  let input;
  try {
    input = readHandoffInput(readInputText(process.argv.slice(2)));
  } catch (err) {
    process.stdout.write(`Handoff stopped: the summary input could not be read (${(err as Error).message}). Fix: pass the fields as JSON with --input <file> or on stdin.\n`);
    return 2;
  }
  const result = await runHandoff(input, { repoRoot: REPO_ROOT, env: preflightEnv(REPO_ROOT, process.env), logger: createHandoffLogger() });
  process.stdout.write(`${result.line}\n`);
  return result.ok ? 0 : 1;
}

void handoffMain().then(
  (code) => {
    process.exitCode = code;
  },
  (err: unknown) => {
    process.stdout.write(`Handoff stopped: ${(err as Error).message}. Fix: try again; nothing was posted.\n`);
    process.exitCode = 1;
  },
);
// [SCOPE 149 / T002] END
