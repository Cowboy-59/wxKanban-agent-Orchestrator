// OpenViking backend for the ask-gate search interface (SPEC-142, contract C2).
//
// OpenViking is an AGPLv3 context database run as a SEPARATE local service. Nothing from it is
// bundled or copied here: this file only speaks HTTP to it. See _wxAI/askgate/service/README.md.
//
// Only ledger entries and approved patterns are ever indexed. Never code.
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";

export const BUDGET_MS = 2000;
export const DEFAULT_BASE_URL = "http://127.0.0.1:1933";
export const MAX_ENTRY_CHARS = 4000;

// ---------------------------------------------------------------------------------------------
// ADAPTER TABLE: UNVERIFIED against a running service.
// Every endpoint path, header name and payload shape lives here and nowhere else. Known from the
// public README: GET /health -> {"status":"ok"} on 1933, POST /api/v1/resources, POST
// /api/v1/search/find with `query` and `limit`. NOT known: the auth header name, how a namespace
// or raw inline text is passed, and the shape of a search hit. Fix this table, not the code below,
// once a real service has been probed.
// ---------------------------------------------------------------------------------------------
export const ADAPTER = {
  // Documented (third-party docs mirror): `Authorization: Bearer {api_key}` plus an optional
  // `X-OpenViking-Agent`. Still UNVERIFIED against a running service.
  authHeader: "Authorization",
  authValue: (key) => `Bearer ${key}`,
  agentHeader: "X-OpenViking-Agent",
  agentName: "wxai-askgate",
  // The container sees the staging directory at this read-only mount point.
  containerStagingDir: "/staging",
  health: {
    method: "GET",
    path: "/health",
    isOk: (body) => Boolean(body) && body.status === "ok",
  },
  add: {
    method: "POST",
    path: "/api/v1/resources", // documented: takes a PATH or URL, not inline text
    // UNVERIFIED against a running service: `path` is documented; `namespace` is a guess.
    // `containerPath` is where the staged .md file appears inside the container.
    build: (namespace, item) => ({ path: item.containerPath, namespace }),
  },
  search: {
    method: "POST",
    path: "/api/v1/search/find", // documented path
    build: (namespace, query, limit) => ({ query, limit, namespace }), // `namespace` UNVERIFIED
    // UNVERIFIED response shape: { results: [ { score, content, metadata: { id, tier } } ] }.
    // Returns null when the body does not look like that, which makes the backend fail soft.
    parse: (body) => {
      const rows = body && (body.results ?? body.result ?? body.data);
      if (!Array.isArray(rows)) return null;
      const out = [];
      for (const r of rows) {
        const id = r?.metadata?.id ?? r?.id;
        const text = r?.content ?? r?.text;
        const score = typeof r?.score === "number" ? r.score : null;
        if (typeof id !== "string" || typeof text !== "string" || score === null) return null;
        out.push({ id, score, text, tier: r?.metadata?.tier });
      }
      return out;
    },
  },
};

// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export class OpenVikingError extends Error {
  constructor(message, cause) {
    super(message);
    this.name = "OpenVikingError";
    if (cause) this.cause = cause;
  }
}
// [SCOPE 142 / T016] END

/** One namespace per repo: stable across runs, distinct for same-named folders. */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function repoNamespace(root) {
  const abs = resolve(root);
  const hash = createHash("sha256").update(abs.toLowerCase()).digest("hex").slice(0, 8);
  const name = basename(abs).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "repo";
  return `repo-${name}-${hash}`;
}
// [SCOPE 142 / T016] END

export const GLOBAL_NAMESPACE = "global";

/** API key: env var first, then the key file under the user's home. Never logged. */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function readApiKey(env = process.env, home = homedir()) {
  if (env.OPENVIKING_API_KEY) return env.OPENVIKING_API_KEY.trim();
  try {
    return readFileSync(join(home, ".wxai", "openviking.key"), "utf8").trim() || null;
  } catch {
    return null;
  }
}
// [SCOPE 142 / T016] END

/** Text to index for a ledger entry (C1 shape) or a pattern ({id, tier, text}). */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function entryText(entry) {
  if (typeof entry.text === "string" && entry.text.trim()) return entry.text.trim();
  const parts = [entry.question, entry.decision, entry.rationale].filter(
    (p) => typeof p === "string" && p.trim(),
  );
  return parts.join(" | ");
}
// [SCOPE 142 / T016] END

/** Refuses anything that is not a ledger entry or approved pattern, and anything code-shaped. */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function validateIndexable(entry) {
  if (!entry || typeof entry !== "object") return "entry missing";
  if (typeof entry.id !== "string" || !/^[DG]-\d{4,}$/.test(entry.id)) {
    return "id must be a ledger id (D-nnnn) or pattern id (G-nnnn)";
  }
  const tier = entry.tier ?? (entry.id.startsWith("G-") ? "global" : "repo");
  if (tier !== "repo" && tier !== "global") return "tier must be repo or global";
  const text = entryText(entry);
  if (!text) return "entry has no text";
  if (text.length > MAX_ENTRY_CHARS) return "entry text too long; code bodies are never indexed";
  if (text.includes("```")) return "entry contains a code block; code is never indexed";
  return null;
}
// [SCOPE 142 / T016] END

/**
 * Build a backend. Options are all injectable for tests:
 *   fetch, baseUrl, apiKey, root (repo root, for its namespace), timeoutMs.
 */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export function createOpenVikingBackend(opts = {}) {
// [SCOPE 142 / T016] END
  const doFetch = opts.fetch ?? globalThis.fetch;
  const baseUrl = (opts.baseUrl ?? process.env.OPENVIKING_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, "");
  const timeoutMs = opts.timeoutMs ?? BUDGET_MS;
  const apiKey = opts.apiKey === undefined ? readApiKey() : opts.apiKey;
  const state = { lastOk: null, lastError: null };

  async function call(spec, body) {
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), timeoutMs);
    try {
      const headers = { accept: "application/json" };
      if (body !== undefined) headers["content-type"] = "application/json";
      if (apiKey) headers[ADAPTER.authHeader] = ADAPTER.authValue(apiKey);
      headers[ADAPTER.agentHeader] = ADAPTER.agentName;
      const res = await doFetch(baseUrl + spec.path, {
        method: spec.method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: ctl.signal,
      });
      if (!res.ok) throw new OpenVikingError(`HTTP ${res.status} from ${spec.path}`);
      let json;
      try {
        json = await res.json();
      } catch (err) {
        throw new OpenVikingError(`non-JSON response from ${spec.path}`, err);
      }
      return json;
    } catch (err) {
      if (err instanceof OpenVikingError) throw err;
      const aborted = err && (err.name === "AbortError" || ctl.signal.aborted);
      throw new OpenVikingError(aborted ? `timed out after ${timeoutMs} ms` : `request failed: ${err?.message ?? err}`, err);
    } finally {
      clearTimeout(timer);
    }
  }

  const backend = {
    name: "openviking",
    state,
    /** Async: resolves true only when /health answers {"status":"ok"} inside the budget. */
    async available() {
      try {
        const body = await call(ADAPTER.health);
        const ok = ADAPTER.health.isOk(body);
        state.lastOk = ok;
        state.lastError = ok ? null : "unexpected health response";
        return ok;
      } catch (err) {
        state.lastOk = false;
        state.lastError = err.message;
        return false;
      }
    },
    /**
     * Search the named namespaces. Throws OpenVikingError on timeout, HTTP error or an unexpected
     * body, so the caller falls back to the file backend (contract C2).
     */
    async search(query, scopeNames) {
      const names = Array.isArray(scopeNames) && scopeNames.length ? scopeNames : [opts.root ? repoNamespace(opts.root) : GLOBAL_NAMESPACE];
      const merged = [];
      for (const ns of names) {
        try {
          const body = await call(ADAPTER.search, ADAPTER.search.build(ns, query, opts.limit ?? 5));
          const rows = ADAPTER.search.parse(body);
          if (rows === null) throw new OpenVikingError("unexpected search response shape");
          for (const r of rows) {
            merged.push({ id: r.id, tier: ns === GLOBAL_NAMESPACE ? "global" : "repo", score: r.score, text: r.text });
          }
        } catch (err) {
          state.lastOk = false;
          state.lastError = err.message;
          throw err instanceof OpenVikingError ? err : new OpenVikingError(String(err?.message ?? err), err);
        }
      }
      merged.sort((a, b) => b.score - a.score);
      return merged;
    },
    /** Add one ledger entry or approved pattern to its namespace. Returns { ok, reason? }. */
    async index(entry) {
      const problem = validateIndexable(entry);
      if (problem) return { ok: false, reason: problem };
      const tier = entry.tier ?? (entry.id.startsWith("G-") ? "global" : "repo");
      const namespace = tier === "global" ? GLOBAL_NAMESPACE : repoNamespace(opts.root ?? process.cwd());
      try {
        // UNVERIFIED against a running service: the add call takes a path, so stage the entry as
        // a small .md file (title = id, body = text) under the read-only-mounted staging dir.
        const stagingRoot = opts.stagingDir ?? join(homedir(), ".wxai", "openviking-staging");
        const dir = join(stagingRoot, namespace);
        mkdirSync(dir, { recursive: true });
        writeFileSync(join(dir, `${entry.id}.md`), `# ${entry.id}\n\n${entryText(entry)}\n`, "utf8");
        const containerPath = `${ADAPTER.containerStagingDir}/${namespace}/${entry.id}.md`;
        await call(ADAPTER.add, ADAPTER.add.build(namespace, { id: entry.id, tier, containerPath }));
        return { ok: true, namespace };
      } catch (err) {
        state.lastOk = false;
        state.lastError = err.message;
        return { ok: false, reason: err.message };
      }
    },
    /** Latency of one health call, for status.mjs. */
    async ping() {
      const t0 = Date.now();
      const up = await backend.available();
      return { up, ms: Date.now() - t0, error: up ? null : state.lastError };
    },
  };
  return backend;
}

/** Standalone index(entry) using defaults, for callers that do not hold a backend object. */
// [SCOPE 142 / T016] BEGIN — OpenViking backend: install script, detached launcher, name…
export async function index(entry, opts = {}) {
// [SCOPE 142 / T016] END
  return createOpenVikingBackend(opts).index(entry);
}
