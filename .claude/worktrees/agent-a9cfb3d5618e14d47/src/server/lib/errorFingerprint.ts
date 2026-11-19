import { createHash } from "crypto";

// [SCOPE 061] BEGIN — deterministic error fingerprint for grouping auto-errors.
// MODIFIED-BY: [SCOPE 110 / T002] — drop browser route from the identity basis
// Hash over the error class + capture kind + a NORMALIZED message and stack
// (volatile bits stripped), so the same logical error yields the same fingerprint
// across occurrences regardless of ids/line-numbers/paths/timestamps.
//
// SCOPE-110 / FR-008: the browser route is deliberately NOT part of identity. A
// failure in a poll that runs on every page must be ONE error, not one record per
// page. The route is still recorded and displayed on the record elsewhere; it just
// no longer distinguishes one error from another. `route` is retained on the input
// for call-site compatibility but is intentionally unused here.

interface FingerprintInput {
  name?: string;
  message?: string;
  stack?: string;
  route?: string; // recorded/displayed on the record; NOT part of identity (FR-008)
  kind?: string;
}

export function computeErrorFingerprint(e: FingerprintInput): string {
  const basis = [
    e.name || "Error",
    e.kind || "",
    normalize(e.message || ""),
    normalize(topFrames(e.stack || "")),
  ].join("|");
  return createHash("sha256").update(basis).digest("hex").slice(0, 32);
}

/** First few stack frames carry the signal; deeper frames are noise. */
function topFrames(stack: string): string {
  return stack.split("\n").slice(0, 6).join("\n");
}

/** Strip occurrence-specific noise so logically-identical errors collapse. */
function normalize(s: string): string {
  return s
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    .replace(/0x[0-9a-f]+/gi, "<hex>")
    .replace(/[A-Za-z]:\\[^\s):]+|\/[\w./-]+/g, (m) => basename(m)) // abs paths -> basename
    .replace(/:\d+:\d+/g, "") // :line:col
    .replace(/\?[^\s)]*/g, "") // query strings
    .replace(/\b\d+\b/g, "#") // any remaining numbers
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2000);
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}
// [SCOPE 061] END
