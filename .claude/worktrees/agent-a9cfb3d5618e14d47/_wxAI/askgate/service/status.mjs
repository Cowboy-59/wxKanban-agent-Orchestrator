// Prints whether the OpenViking service is up or down, and the health-call latency in ms.
// Exit 0 when up, 1 when down. Down is not an error for the gate: it falls back to file search.
import { createOpenVikingBackend } from "../openviking.mjs";

// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export async function checkStatus(opts = {}) {
// [SCOPE 142 / T016] END
  return createOpenVikingBackend(opts).ping();
}

const r = await checkStatus();
process.stdout.write(
  r.up ? `openviking: up (${r.ms} ms)\n` : `openviking: down (${r.ms} ms; ${r.error}); gate uses file search\n`,
);
process.exit(r.up ? 0 : 1);
