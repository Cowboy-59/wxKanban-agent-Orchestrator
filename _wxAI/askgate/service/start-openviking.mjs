// Starts the installed OpenViking container. The launcher is spawned DETACHED with stdio ignored
// and unref'd: on Windows a daemon under a non-detached child dies with the top Node process.
// Pass --dry-run to print the command only.
import { spawn } from "node:child_process";

const CONTAINER = "wxai-openviking";
const cmd = ["docker", "start", CONTAINER];

if (process.argv.includes("--dry-run")) {
  process.stdout.write(`DRY RUN: ${cmd.join(" ")} (detached, stdio ignored)\n`);
} else {
  const child = spawn(cmd[0], cmd.slice(1), { detached: true, stdio: "ignore", windowsHide: true });
  child.on("error", (e) => process.stderr.write(`Could not start: ${e.message}\n`));
  child.unref();
  process.stdout.write(`Start requested for ${CONTAINER}. Check with: node _wxAI/askgate/service/status.mjs\n`);
}
