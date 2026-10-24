// Confirms the four OmniRoute features are OFF (stealth, quota sharing, MITM proxy, compression), the gateway is
// localhost-bound, and OmniRoute's MCP server is not registered with our agents or pointed at by Claude Code.
// Exit 0 = every item verified safe. Exit 1 = a feature is on. Exit 2 = something could not be verified.
// Live checks need a management credential in OMNIROUTE_CHECK_TOKEN (never printed). Without it they are UNVERIFIED.
// Usage: node features-check.mjs [--url U] [--env-file F] [--claude-json F] [--claude-settings F] [--mcp-json F] [--static-only]
import { homedir } from "node:os";
import { join } from "node:path";
import { checkAgentConfig, checkEnv, checkLive, HOST, paths, PORT, readEnvFile, verdict } from "./lib.mjs";

const argv = process.argv.slice(2);
const arg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : dflt;
};
const home = homedir();
const url = arg("--url", process.env.OMNIROUTE_URL || `http://${HOST}:${PORT}`);
const envFile = arg("--env-file", paths(home).envFile);

const results = [
  ...checkEnv(readEnvFile(envFile)),
  ...(argv.includes("--static-only") ? [] : await checkLive({ url, token: process.env.OMNIROUTE_CHECK_TOKEN })),
  ...checkAgentConfig({
    claudeJson: arg("--claude-json", join(home, ".claude.json")),
    claudeSettings: arg("--claude-settings", join(home, ".claude", "settings.json")),
    projectMcp: arg("--mcp-json", join(process.cwd(), ".mcp.json")),
  }),
];

for (const r of results) process.stdout.write(`${r.state.padEnd(10)} ${r.feature.padEnd(14)} ${r.detail}\n`);
const code = verdict(results);
process.stdout.write(
  code === 0 ? "features-check: all off\n" : code === 1 ? "features-check: FAIL, a feature is on\n" : "features-check: UNVERIFIED items remain\n",
);
process.exitCode = code;
