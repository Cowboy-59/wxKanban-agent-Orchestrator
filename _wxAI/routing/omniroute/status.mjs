// Prints whether the OmniRoute gateway is up or down, and the health-call latency in ms.
// Exit 0 when up, 1 when down. Down is not an error for a run: routing falls back to the official route.
// Usage: node status.mjs [--url http://127.0.0.1:20128]
import { HOST, ping, PORT } from "./lib.mjs";

const argv = process.argv.slice(2);
const ui = argv.indexOf("--url");
const url = ui >= 0 ? argv[ui + 1] : process.env.OMNIROUTE_URL || `http://${HOST}:${PORT}`;

const r = await ping({ url });
process.stdout.write(
  r.up ? `omniroute: up (${r.ms} ms)\n` : `omniroute: down (${r.ms} ms; ${r.error}); runs use the official route\n`,
);
process.exitCode = r.up ? 0 : 1; // exitCode, not exit(): exit() right after fetch trips a libuv assertion on Windows
