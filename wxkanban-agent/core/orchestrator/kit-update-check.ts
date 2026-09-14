import * as fs from "fs";
import * as path from "path";
import * as http from "http";
import * as https from "https";
import { trustSystemCertificates } from "../bootstrap/system-ca";

// Kit-update notify (ensureKitUpToDate) — spec 083 / spec 019 R15. Not
// orchestrator-fenced: out-of-band kit tooling that hosts alongside the (also
// un-fenced) command-gateway; auditfences legacy-baselined.
//
// The Dev Cockpit .vsix self-installs (ensureCockpitUpToDate, spec 042 FR-012),
// but the full kit tarball never surfaces a new release — a consumer had to
// remember to run the upgrade by hand. This closes that gap: at the session
// entry points that self-heal the cockpit (cli --help / gateway boot), ask the
// server whether a newer kit release exists and, if so, print ONE visible
// banner with the apply command. It only NOTIFIES — nothing is overwritten
// without an explicit apply (notify + confirm).
//
// SELF-CONTAINED on purpose: it calls GET /api/projects/:id/kit/latest-version
// directly rather than shelling out to scripts/check-kit-version.mjs, because
// the consumer-facing check-kit-version.mjs (shipped from the orchestrator repo)
// is a different lineage with no --json mode. Reusing the endpoint makes the
// notify work identically in the author repo and in every consumer.
//
// Best-effort contract, identical to ensureCockpitUpToDate: every failure is
// swallowed and MUST NOT affect the triggering command's exit status. Throttled
// once per process and time-cached ~6h in .wxai/kit-update-check.json.
//
// Author/source-repo safety: this repo is the kit source-of-truth, so it must
// NEVER be told to "upgrade". Detected by the author-only marker file — see
// isAuthorCheckout. WXKANBAN_NO_KIT_UPDATE_CHECK is the belt-and-suspenders
// opt-out for a full clone that lacks the marker.
const KIT_UPDATE_OPT_OUT_ENV = "WXKANBAN_NO_KIT_UPDATE_CHECK";
const CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const CACHE_REL_PATH = path.join(".wxai", "kit-update-check.json");
const REQUEST_TIMEOUT_MS = 8000;
let kitUpdateChecked = false;

// Shape persisted to .wxai/kit-update-check.json. The Dev Cockpit reads this
// file directly (no extra network call) to decide whether to show its
// "Kit update available -> Install" row.
//
// [SCOPE 083 / T010] `outcome` + `lastError` exist because the
// pre-amendment record could not distinguish "checked, you are current" from
// "the check never ran": both persisted upgradeAvailable=false with null
// versions. A negative that looks measured and is not is worse than no answer.
// `upgradeAvailable` and `authorRepo` keep their meaning and position so a
// Cockpit built before this amendment still reads a new record correctly; a
// record written before it has no `outcome` and is read as "checked".
type KitCheckOutcome = "checked" | "failed" | "author-repo";

interface KitUpdateStatus {
  checkedAt: number;
  upgradeAvailable: boolean;
  authorRepo: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
  outcome: KitCheckOutcome;
  /** Short human-readable reason when outcome is "failed"; null otherwise. */
  lastError: string | null;
}

function cachePath(): string {
  return path.join(process.cwd(), CACHE_REL_PATH);
}

function readCache(): KitUpdateStatus | null {
  try {
    return JSON.parse(fs.readFileSync(cachePath(), "utf8")) as KitUpdateStatus;
  } catch {
    return null;
  }
}

function writeCache(status: KitUpdateStatus): void {
  try {
    fs.mkdirSync(path.dirname(cachePath()), { recursive: true });
    fs.writeFileSync(cachePath(), JSON.stringify(status, null, 2));
  } catch {
    /* best-effort — a missing cache just means we re-check sooner */
  }
}

// True when this is the kit author/source checkout rather than a consumer.
// scripts/sync-to-orchestrator.mjs is author-only — scripts/ is not mirrored to
// the orchestrator, so no consumer ever receives it — which makes its presence a
// deterministic author marker, independent of git state, working-tree
// cleanliness, and whether this is a git repository at all.
//
// [SCOPE 083 / T011] A second signal used to live here: a dirty
// kit working tree, via `git status --porcelain -- wxkanban-agent mcp-server
// _wxAI`. It disabled the update check in the field. --porcelain reports
// UNTRACKED files, and the kit's own .gitignore.snippet named none of the kit's
// node_modules/ or dist/ output, so a consumer who had ever installed the kit's
// dependencies — every consumer — read as the kit author forever and the check
// returned before any network call. It could not reproduce here, where all of
// those paths are gitignored and the marker above fires first regardless.
// Narrowing it to --untracked-files=no was rejected: a consumer applying a local
// patch under wxkanban-agent/ is ordinary and must not silently lose their
// update check. Removing it also drops a subprocess and a 5s timeout from every
// session start.
function isAuthorCheckout(): boolean {
  try {
    return fs.existsSync(path.join(process.cwd(), "scripts", "sync-to-orchestrator.mjs"));
  } catch {
    return false;
  }
}

function readJson(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Minimal .env reader (mirrors check-kit-version.mjs) — the kit is dogfooded via
// the hosted MCP and authenticates with WXKANBAN_API_TOKEN.
function loadEnvFile(filePath: string): Record<string, string> {
  const vars: Record<string, string> = {};
  let body: string;
  try {
    body = fs.readFileSync(filePath, "utf8");
  } catch {
    return vars;
  }
  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    vars[key] = val;
  }
  return vars;
}

function resolveApiUrl(envBag: Record<string, string>): string {
  return (
    process.env["WXKANBAN_API_URL"] ||
    envBag["WXKANBAN_API_URL"] ||
    "http://localhost:3001"
  ).replace(/\/+$/, "");
}

function resolveApiToken(envBag: Record<string, string>, aiSettings: Record<string, unknown> | null): string | null {
  if (process.env["WXKANBAN_API_TOKEN"]) return process.env["WXKANBAN_API_TOKEN"]!;
  if (envBag["WXKANBAN_API_TOKEN"]) return envBag["WXKANBAN_API_TOKEN"];
  const tok = (aiSettings as { mcpServers?: { wxkanban?: { env?: { WXKANBAN_API_TOKEN?: string } } } } | null)
    ?.mcpServers?.wxkanban?.env?.WXKANBAN_API_TOKEN;
  if (tok && tok !== "your_api_key_here") return tok;
  return null;
}

interface LatestVersionResponse {
  currentVersion: string | null;
  latestVersion: string;
  upgradeAvailable: boolean;
  releaseUrl: string;
  publishedAt: string | null;
}

// [SCOPE 083 / T010] Reports WHY it failed rather than collapsing
// every failure to null, so the persisted record can carry a reason the operator
// can act on ("http 401" and "connection failed" want different responses).
type FetchResult =
  | { ok: true; data: LatestVersionResponse }
  | { ok: false; reason: string };

function httpGetJson(url: string, token: string): Promise<FetchResult> {
  return new Promise((resolveP) => {
    const lib = url.startsWith("https:") ? https : http;
    const req = lib.get(
      url,
      {
        timeout: REQUEST_TIMEOUT_MS,
        agent: false,
        headers: { Authorization: `Bearer ${token}`, Accept: "application/json", Connection: "close" },
      },
      (res) => {
        let body = "";
        res.on("data", (d) => (body += d));
        res.on("end", () => {
          if (res.statusCode !== 200) {
            return resolveP({ ok: false, reason: `server returned HTTP ${res.statusCode ?? "?"}` });
          }
          try {
            resolveP({ ok: true, data: JSON.parse(body) as LatestVersionResponse });
          } catch {
            resolveP({ ok: false, reason: "server returned a malformed response" });
          }
        });
      },
    );
    req.on("error", (err: NodeJS.ErrnoException) => {
      // Surface the CA case by name — it is the one failure a consumer can fix.
      const code = err.code ?? "";
      const reason = /CERT|SELF_SIGNED|UNABLE_TO_VERIFY/i.test(code)
        ? `TLS certificate not trusted (${code})`
        : `could not reach the server (${code || err.message || "network error"})`;
      resolveP({ ok: false, reason });
    });
    req.on("timeout", () => {
      req.destroy();
      resolveP({ ok: false, reason: `no response within ${REQUEST_TIMEOUT_MS / 1000}s` });
    });
  });
}

// One visible line-set on stderr (mirrors the `[cockpit]` style). Informational
// only — never blocks, never overwrites. The apply command is the consumer's
// own upgrade-kit (bare = upgrade to latest from the server).
function printBanner(status: KitUpdateStatus): void {
  const from = status.currentVersion ?? "(unknown)";
  const to = status.latestVersion ?? "(latest)";
  console.error(`[kit] Update available: ${from} -> ${to}`);
  if (status.releaseUrl) console.error(`[kit]   Release notes: ${status.releaseUrl}`);
  console.error(`[kit]   Apply: node scripts/upgrade-kit.mjs`);
  console.error(`[kit]   Or in the Dev Cockpit: "Kit update available -> Install"`);
}

// [SCOPE 083 / T010] BEGIN — record a failed check as a failed check
// The TTL still applies to a failure, so a persistent outage is recorded once
// per window rather than retried harder — but it is never again written with
// the same shape as "checked, you are current".
function writeFailure(reason: string): void {
  writeCache({
    checkedAt: Date.now(),
    upgradeAvailable: false,
    authorRepo: false,
    currentVersion: null,
    latestVersion: null,
    releaseUrl: null,
    outcome: "failed",
    lastError: reason,
  });
}
// [SCOPE 083 / T010] END

async function runCheck(): Promise<void> {
  const config = readJson(path.join(process.cwd(), ".wxkanban-project.json"));
  const projectId = typeof config?.["projectId"] === "string" ? (config["projectId"] as string) : null;
  if (!projectId) return; // not a kit install — genuinely nothing to report

  const envBag = {
    ...loadEnvFile(path.join(process.cwd(), ".env")),
    ...loadEnvFile(path.join(process.cwd(), "mcp-server", ".env")),
  };
  const aiSettings = readJson(path.join(process.cwd(), "ai-settings.json"));
  const apiUrl = resolveApiUrl(envBag);
  const token = resolveApiToken(envBag, aiSettings);
  if (!token) {
    // [SCOPE 083 / T010] Was a silent return that wrote nothing,
    // so the Cockpit showed no state at all and the network path re-ran every
    // session. An unconfigured token is a check that could not run, and the
    // operator can fix it once they are told.
    writeFailure("no API token configured (run kit:configure)");
    return;
  }

  trustSystemCertificates();
  const url = `${apiUrl}/api/projects/${projectId}/kit/latest-version`;
  const result = await httpGetJson(url, token);

  if (!result.ok) {
    writeFailure(result.reason);
    return;
  }

  const status: KitUpdateStatus = {
    checkedAt: Date.now(),
    upgradeAvailable: result.data.upgradeAvailable === true,
    authorRepo: false,
    currentVersion: result.data.currentVersion ?? null,
    latestVersion: result.data.latestVersion ?? null,
    releaseUrl: result.data.releaseUrl ?? null,
    outcome: "checked",
    lastError: null,
  };
  writeCache(status);
  if (status.upgradeAvailable) printBanner(status);
}

export function ensureKitUpToDate(): void {
  if (kitUpdateChecked) return; // once per process
  kitUpdateChecked = true;
  if (process.env[KIT_UPDATE_OPT_OUT_ENV]) return;
  try {
    // Author/source repo — never nag the developer editing the kit. Stamp the
    // cache so the Cockpit also stays silent here.
    if (isAuthorCheckout()) {
      writeCache({
        checkedAt: Date.now(),
        upgradeAvailable: false,
        authorRepo: true,
        currentVersion: null,
        latestVersion: null,
        releaseUrl: null,
        outcome: "author-repo",
        lastError: null,
      });
      return;
    }

    // Fresh cache → reuse it without hitting the network. Re-print the banner
    // from cache each session so the reminder persists until applied.
    const cached = readCache();
    if (cached && typeof cached.checkedAt === "number" && Date.now() - cached.checkedAt < CHECK_TTL_MS) {
      if (cached.upgradeAvailable && !cached.authorRepo) printBanner(cached);
      return;
    }

    // Run the network check in the background so it never blocks session start;
    // the process stays alive until it resolves (the banner prints on completion)
    // but a hung request can't wedge us — httpGetJson has its own timeout.
    void runCheck().catch(() => undefined);
  } catch {
    /* best-effort only — never affect the caller's exit status */
  }
}
