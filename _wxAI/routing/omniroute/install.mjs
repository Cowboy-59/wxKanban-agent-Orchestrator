// Installs OmniRoute as a SEPARATE local service (SPEC-143, FR-008). OmniRoute is MIT, never bundled here.
// Default is a DRY RUN that prints the exact commands. Pass --yes to perform them.
// Secrets are written to ~/.wxai/ (outside every repo) and are never printed.
// Usage: node install.mjs [--method docker|npm] [--yes]
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { buildEnvText, chooseMethod, IMAGE, insideDir, NODE_RANGE, paths, planCommands, PORT, VERSION } from "./lib.mjs";

const out = (s) => process.stdout.write(s + "\n");
const err = (s) => process.stderr.write(s + "\n");
const win = process.platform === "win32";

function probe(cmd) {
  // npm is npm.cmd on Windows; fixed arguments only, so a shell is safe here.
  const r = spawnSync(cmd, ["--version"], { encoding: "utf8", shell: win && cmd === "npm" });
  return !r.error && r.status === 0;
}

const argv = process.argv.slice(2);
const yes = argv.includes("--yes");
const mi = argv.indexOf("--method");
const requested = mi >= 0 ? argv[mi + 1] : undefined;
if (requested && !["docker", "npm"].includes(requested)) {
  err(`Unknown --method ${requested}. Use docker or npm. Nothing was changed.`);
  process.exit(2);
}

const hasDocker = probe("docker");
const hasNpm = probe("npm") && probe("node");
const method = chooseMethod({ requested, hasDocker, hasNpm });
if (!method) {
  err(
    requested === "docker"
      ? "Docker was not found on PATH. Install Docker Desktop, or use --method npm. Nothing was changed."
      : requested === "npm"
        ? `Node and npm were not found on PATH (Node ${NODE_RANGE} is required). Nothing was changed.`
        : "Neither Docker nor Node/npm was found on PATH. Install one of them, then re-run. Nothing was changed.",
  );
  process.exit(2);
}

const plan = planCommands({ method, home: homedir() });
if (insideDir(plan.dir, process.cwd())) {
  err(`Refusing: the key directory ${plan.dir} is inside the current directory. Run from a project outside ~/.wxai.`);
  process.exit(2);
}

out(yes ? `Installing OmniRoute ${VERSION} via ${method} (separate MIT service, never bundled):` : `DRY RUN (add --yes to perform). Method: ${method}. Commands:`);
out(`  1. create ${plan.dir} if missing; write generated secrets to ${plan.envFile} and the dashboard password to ${plan.keyFile} (never printed)`);
plan.steps.forEach((s, i) => out(`  ${i + 2}. ${s.cmd.join(" ")}`));
out(`  ${plan.steps.length + 2}. start later with: node _wxAI/routing/omniroute/start.mjs  (${plan.start.join(" ")})`);
out(`Binds to 127.0.0.1:${PORT} only. The four features (stealth, quota sharing, MITM proxy, compression) stay off.`);
out(`Then: open http://127.0.0.1:${PORT}, sign in with the password in ${plan.keyFile}, add an eligible non-Anthropic provider,`);
out(`create ONE restricted API key (allowed models only, usage limit, expiry) and save it to ${plan.tokenFile}.`);
out("Check: node _wxAI/routing/omniroute/status.mjs ; node _wxAI/routing/omniroute/features-check.mjs");
if (method === "docker") out(`Image: ${IMAGE} (pinned; never :latest).`);
if (!yes) process.exit(0);

mkdirSync(plan.dir, { recursive: true });
if (existsSync(plan.envFile)) {
  out("Existing secrets kept.");
} else {
  const password = randomBytes(18).toString("base64url");
  writeFileSync(
    plan.envFile,
    buildEnvText({ jwtSecret: randomBytes(48).toString("base64"), apiKeySecret: randomBytes(32).toString("hex"), password }),
    { mode: 0o600 },
  );
  writeFileSync(plan.keyFile, password + "\n", { mode: 0o600 });
}
for (const s of plan.steps) {
  const r = spawnSync(s.cmd[0], s.cmd.slice(1), { stdio: "inherit", shell: win && s.cmd[0] === "npm" });
  if (r.status !== 0) {
    err(`${s.cmd[0]} ${s.label} failed (exit ${r.status}).`);
    process.exit(r.status ?? 1);
  }
}
out("OmniRoute installed. Start it with start.mjs, then run status.mjs.");
