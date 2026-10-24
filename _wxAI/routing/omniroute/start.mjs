// Starts the installed OmniRoute. The launcher is spawned DETACHED with stdio ignored and unref'd: on Windows a
// daemon under a non-detached child dies with the top Node process. Pass --dry-run to print the command only.
// Usage: node start.mjs [--method docker|npm] [--dry-run]
import { spawn, spawnSync } from "node:child_process";
import { homedir } from "node:os";
import { CONTAINER, HOST, paths, PORT, readEnvFile } from "./lib.mjs";

const argv = process.argv.slice(2);
const mi = argv.indexOf("--method");
let method = mi >= 0 ? argv[mi + 1] : undefined;
const p = paths(homedir());

if (!method) {
  // Prefer the container if it exists, else the npm install.
  const r = spawnSync("docker", ["inspect", "--format", "{{.Name}}", CONTAINER], { encoding: "utf8" });
  method = !r.error && r.status === 0 ? "docker" : "npm";
}

const win = process.platform === "win32";
const env = { ...process.env };
let cmd;
if (method === "docker") {
  cmd = ["docker", "start", CONTAINER];
} else {
  Object.assign(env, readEnvFile(p.envFile) ?? {}, { OMNIROUTE_SERVER_HOST: HOST, PORT: String(PORT) });
  cmd = ["omniroute", "--no-open"];
}

if (argv.includes("--dry-run")) {
  process.stdout.write(`DRY RUN: ${cmd.join(" ")} (detached, stdio ignored, bound to ${HOST}:${PORT})\n`);
} else {
  const child = spawn(cmd[0], cmd.slice(1), {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    env,
    shell: win && cmd[0] === "omniroute", // omniroute is omniroute.cmd on Windows; fixed arguments only
  });
  child.on("error", (e) => process.stderr.write(`Could not start: ${e.message}\n`));
  child.unref();
  process.stdout.write(`Start requested (${method}). Check with: node _wxAI/routing/omniroute/status.mjs\n`);
}
