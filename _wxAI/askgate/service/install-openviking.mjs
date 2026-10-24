// Installs OpenViking as a separate local Docker service (SPEC-142, FR-016).
// Default is a DRY RUN that prints the exact commands. Pass --yes to perform them.
// The API key is written to ~/.wxai/ (outside every repo) and is never printed.
import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve } from "node:path";

// UNVERIFIED: image name and tag, the in-container env var for the root key, and the data path.
// v0.4.18 comes from a Sealos template and must be confirmed. Never :latest or :main.
export const IMAGE = process.env.OPENVIKING_IMAGE || "ghcr.io/volcengine/openviking:v0.4.18";
export const CONTAINER = "wxai-openviking";
export const PORT = 1933;
export const KEY_ENV_VAR = "ROOT_API_KEY"; // UNVERIFIED variable name

// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function planCommands({ image = IMAGE, home = homedir() } = {}) {
// [SCOPE 142 / T016] END
  const dir = join(home, ".wxai");
  const envFile = join(dir, "openviking.env");
  return {
    dir,
    keyFile: join(dir, "openviking.key"),
    envFile,
    run: [
      "docker", "run", "-d", "--name", CONTAINER, "--restart", "unless-stopped",
      "-p", `127.0.0.1:${PORT}:${PORT}`,
      "--env-file", envFile,
      "-v", `${CONTAINER}-data:/data`, // UNVERIFIED data path
      "-v", `${join(dir, "openviking-staging")}:/staging:ro`, // staged entry files, read-only
      image,
    ],
  };
}

// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
function main() {
  const argv = process.argv.slice(2);
  const yes = argv.includes("--yes");
  const imgIdx = argv.indexOf("--image");
  const image = imgIdx >= 0 ? argv[imgIdx + 1] : IMAGE;
  const out = (s) => process.stdout.write(s + "\n");
  const err = (s) => process.stderr.write(s + "\n");

  const probe = spawnSync("docker", ["--version"], { encoding: "utf8", shell: false });
  if (probe.error || probe.status !== 0) {
    err("Docker was not found on PATH. OpenViking is installed Docker-first; install Docker, then re-run. Nothing was changed.");
    process.exit(2);
  }

  const plan = planCommands({ image });
  const rel = relative(resolve(process.cwd()), plan.dir);
  if (rel === "" || !(rel.startsWith("..") || resolve(rel) === rel)) {
    err(`Refusing: the key directory ${plan.dir} is inside the current repository.`);
    process.exit(2);
  }

  out(yes ? "Installing OpenViking (separate AGPL service, never bundled):" : "DRY RUN (add --yes to perform). Commands:");
  out(`  1. create ${plan.dir} if missing; write a new random API key to ${plan.keyFile} and ${plan.envFile} (key never printed)`);
  out(`  2. docker pull ${image}`);
  out(`  3. ${plan.run.join(" ")}`);
  out(`     mount: ${join(plan.dir, "openviking-staging")} -> /staging (read-only); entries are staged there as .md files and added by path`);
  out(`Then: node _wxAI/askgate/service/status.mjs`);
  if (!yes) return;

  mkdirSync(plan.dir, { recursive: true });
  mkdirSync(join(plan.dir, "openviking-staging"), { recursive: true });
  if (existsSync(plan.keyFile)) {
    out("Existing key file kept.");
  } else {
    const key = randomBytes(32).toString("hex");
    writeFileSync(plan.keyFile, key + "\n", { mode: 0o600 });
    writeFileSync(plan.envFile, `${KEY_ENV_VAR}=${key}\n`, { mode: 0o600 });
  }
  for (const args of [["pull", image], plan.run.slice(1)]) {
    const r = spawnSync("docker", args, { stdio: "inherit", shell: false });
    if (r.status !== 0) {
      err(`docker ${args[0]} failed (exit ${r.status}).`);
      process.exit(r.status ?? 1);
    }
  }
  out("OpenViking container started. Run status.mjs to check it.");
}
// [SCOPE 142 / T016] END

main();
