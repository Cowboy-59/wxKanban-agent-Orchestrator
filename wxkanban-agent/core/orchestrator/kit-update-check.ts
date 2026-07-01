import { spawnSync } from "child_process";
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
// NEVER be told to "upgrade". We treat a dirty kit working tree (developers edit
// the kit here; consumers never do) as the author signal and stay silent.
// WXKANBAN_NO_KIT_UPDATE_CHECK is the belt-and-suspenders opt-out.
const KIT_UPDATE_OPT_OUT_ENV = "WXKANBAN_NO_KIT_UPDATE_CHECK";
const CHECK_TTL_MS = 6 * 60 * 60 * 1000; // 6h
const CACHE_REL_PATH = path.join(".wxai", "kit-update-check.json");
const REQUEST_TIMEOUT_MS = 8000;
// Kit paths a consumer never edits — any local change here means this is a dev/
// author checkout, so we stay silent.
const KIT_DIRTY_PATHS = ["wxkanban-agent", "mcp-server", "_wxAI"];
let kitUpdateChecked = false;

// Shape persisted to .wxai/kit-update-check.json. The Dev Cockpit reads this
// file directly (no extra network call) to decide whether to show its
// "Kit update available -> Install" row.
interface KitUpdateStatus {
  checkedAt: number;
  upgradeAvailable: boolean;
  authorRepo: boolean;
  currentVersion: string | null;
  latestVersion: string | null;
  releaseUrl: string | null;
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
// Primary signal: scripts/sync-to-orchestrator.mjs is author-only — it never
// ships to consumers (scripts/ is not mirrored to the orchestrator), so its
// presence is a deterministic, git-state-independent author marker. Secondary:
// a dirty kit working tree (a developer mid-edit in a full clone). A consumer
// has neither.
function isAuthorCheckout(): boolean {
  try {
    if (fs.existsSync(path.join(process.cwd(), "scripts", "sync-to-orchestrator.mjs"))) return true;
    const res = spawnSync("git", ["status", "--porcelain", "--", ...KIT_DIRTY_PATHS], {
      cwd: process.cwd(),
      encoding: "utf8",
      windowsHide: true,
      timeout: 5000,
    });
    if (res.error || res.status !== 0 || typeof res.stdout !== "string") return false;
    return res.stdout.split(/\r?\n/).some((l) => l.trim().length > 0);
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

function httpGetJson(url: string, token: string): Promise<LatestVersionResponse | null> {
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
          if (res.statusCode !== 200) return resolveP(null);
          try {
            resolveP(JSON.parse(body) as LatestVersionResponse);
          } catch {
            resolveP(null);
          }
        });
      },
    );
    req.on("error", () => resolveP(null));
    req.on("timeout", () => {
      req.destroy();
      resolveP(null);
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

async function runCheck(): Promise<void> {
  const config = readJson(path.join(process.cwd(), ".wxkanban-project.json"));
  const projectId = typeof config?.["projectId"] === "string" ? (config["projectId"] as string) : null;
  if (!projectId) return; // not a kit install

  const envBag = {
    ...loadEnvFile(path.join(process.cwd(), ".env")),
    ...loadEnvFile(path.join(process.cwd(), "mcp-server", ".env")),
  };
  const aiSettings = readJson(path.join(process.cwd(), "ai-settings.json"));
  const apiUrl = resolveApiUrl(envBag);
  const token = resolveApiToken(envBag, aiSettings);
  if (!token) return; // can't reach the server — stay silent

  trustSystemCertificates();
  const url = `${apiUrl}/api/projects/${projectId}/kit/latest-version`;
  const result = await httpGetJson(url, token);

  const now = Date.now();
  if (!result) {
    // Network/CA/auth failure — stamp the check time so we honour the TTL and
    // don't hammer the server every open.
    writeCache({ checkedAt: now, upgradeAvailable: false, authorRepo: false, currentVersion: null, latestVersion: null, releaseUrl: null });
    return;
  }

  const status: KitUpdateStatus = {
    checkedAt: now,
    upgradeAvailable: result.upgradeAvailable === true,
    authorRepo: false,
    currentVersion: result.currentVersion ?? null,
    latestVersion: result.latestVersion ?? null,
    releaseUrl: result.releaseUrl ?? null,
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
      writeCache({ checkedAt: Date.now(), upgradeAvailable: false, authorRepo: true, currentVersion: null, latestVersion: null, releaseUrl: null });
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
