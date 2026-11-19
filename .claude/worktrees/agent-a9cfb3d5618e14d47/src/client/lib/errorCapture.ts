// [SCOPE 061] BEGIN — client-side automatic error capture (POST /api/errors)
// Fail-open telemetry: every entry point swallows its own errors so capture can
// NEVER throw into app code or block rendering. Used by main.tsx (global
// handlers), ErrorBoundary, and apiFetch.
import type { CapturedErrorInput } from "~/shared/types/errors";
import { APP_VERSION } from "../version";

/** Recursion guard — true while a capture POST is in flight so an error thrown
 *  INSIDE captureError (e.g. fetch internals) can't re-trigger capture. */
let sending = false;

/** Cheap in-memory dedup/rate-limit: signature → last-sent epoch ms. */
const lastSent = new Map<string, number>();
const DEDUP_WINDOW_MS = 5000;

/** Opt-out via Vite env (default ON). Off only when explicitly "false". */
const ENABLED = import.meta.env.VITE_ERROR_CAPTURE_ENABLED !== "false";

/** Cheap signature so identical errors don't flood the intake. */
function signature(input: Omit<CapturedErrorInput, "source">, route: string): string {
  const firstStackLine = input.stack ? input.stack.split("\n", 1)[0] : "";
  return `${input.name}|${input.kind}|${route}|${firstStackLine}`;
}

/** Browser-extension / injected-script origins — errors from these are not ours. */
const EXTENSION_ORIGIN =
  /(?:moz-extension|chrome-extension|safari-web-extension|safari-extension|ms-browser-extension|webkit-masked-url):\/\//i;

/**
 * True when an error clearly originates from a browser extension or a third-party
 * cross-origin script rather than wxKanban's own code — telemetry noise we cannot
 * fix and must not file as feedback. Two cases:
 *   1. The browser's opaque cross-origin marker: message "Script error." with the
 *      real message/stack stripped for security — un-actionable by definition.
 *   2. A stack whose ONLY provenance is a browser-extension origin (e.g. a password
 *      manager's inject.js hitting a cross-origin SecurityError). A stack that also
 *      contains one of our own app frames is kept.
 */
function isThirdPartyNoise(input: Omit<CapturedErrorInput, "source">): boolean {
  // Case 1 — opaque cross-origin "Script error." (with/without a trailing period).
  const message = (input.message ?? "").trim().replace(/[.\s]+$/, "").toLowerCase();
  if (message === "script error") return true;

  // Case 2 — extension-origin stack with no first-party (app) frame.
  const stack = input.stack;
  if (typeof stack !== "string" || !EXTENSION_ORIGIN.test(stack)) return false;
  const hasAppFrame = /https?:\/\/[^\s)]+\/assets\//i.test(stack) || /\/src\//.test(stack);
  return !hasAppFrame;
}

/**
 * Best-effort report of a captured client error to POST /api/errors.
 * Non-blocking and fail-open: returns immediately and swallows ALL errors.
 */
export function captureError(input: Omit<CapturedErrorInput, "source">): void {
  try {
    if (!ENABLED || sending) return;
    // Drop browser-extension / third-party injected errors (ref feedback 019f853f).
    if (isThirdPartyNoise(input)) return;

    const route =
      input.route ?? `${window.location.pathname}${window.location.search}`;

    // Rate-limit identical signatures within the dedup window.
    const sig = signature(input, route);
    const now = Date.now();
    const prev = lastSent.get(sig);
    if (prev !== undefined && now - prev < DEDUP_WINDOW_MS) return;
    lastSent.set(sig, now);

    const payload: CapturedErrorInput = {
      ...input,
      source: "client",
      route,
      appVersion: input.appVersion ?? APP_VERSION,
    };

    sending = true;
    try {
      void fetch("/api/errors", {
        method: "POST",
        keepalive: true,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }).catch(() => {});
    } finally {
      sending = false;
    }
  } catch {
    // Never let telemetry break the app.
  }
}
// [SCOPE 061] END
