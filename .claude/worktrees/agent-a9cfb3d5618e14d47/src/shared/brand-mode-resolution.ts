/**
 * Which mode is active — SPEC-128 / T004.
 *
 * Resolution happens on the server so the answer is already in the shell's opening tag when the
 * first byte reaches the browser. A mode applied by a client after paint produces a visible
 * reskin on every page load, which reads as a defect; on a workshop wall screen it is one.
 *
 * Resolution never fails. A request for a mode that does not exist falls back to the resting mode
 * and SAYS SO, because a silent fallback would leave a tenant wondering why their selection had
 * no effect, with nothing anywhere to explain it.
 */
import type { BrandSchema } from "./brand-schema.js";

export type ModeResolutionReason =
  /** A valid mode was requested and honoured. */
  | "requested"
  /** Nothing was requested; the schema's resting mode is in use. */
  | "resting"
  /** A mode was requested that this schema does not declare. */
  | "unknown-mode-requested"
  /** The schema declares no resting mode, which validation should have refused. */
  | "no-resting-mode";

export interface ResolvedMode {
  /** The mode to put on the shell, or null when none can be determined. */
  mode: string | null;
  reason: ModeResolutionReason;
  /** Human-readable, and shown rather than swallowed when a selection was not honoured. */
  message: string | null;
}

/**
 * Resolve the active mode for a schema.
 *
 * `requested` is whatever the tenant has selected — a company-level setting, or a per-request
 * override. It is treated as untrusted input and checked against the schema's declared modes
 * rather than written onto the shell as given.
 */
// [SCOPE 128 / T004] BEGIN — Shell contract and server-side mode emission
export function resolveMode(schema: BrandSchema, requested?: string | null): ResolvedMode {
  const declared = Object.keys(schema.modes);
  const resting = Object.values(schema.modes).find((m) => m.resting)?.name ?? null;

  if (requested && declared.includes(requested)) {
    return { mode: requested, reason: "requested", message: null };
  }

  if (requested && !declared.includes(requested)) {
    return {
      mode: resting,
      reason: "unknown-mode-requested",
      message:
        `Mode '${requested}' is not declared by brand '${schema.name}'. ` +
        (resting
          ? `Rendering '${resting}' instead. Declared modes: ${declared.join(", ")}.`
          : `This schema also declares no resting mode, so no mode was applied. Declared modes: ${declared.join(", ")}.`),
    };
  }

  if (!resting) {
    return {
      mode: null,
      reason: "no-resting-mode",
      message:
        `Brand '${schema.name}' declares no resting mode, so nothing could be applied. ` +
        "Exactly one mode must be marked resting; validation should have refused this schema.",
    };
  }

  return { mode: resting, reason: "resting", message: null };
}
// [SCOPE 128 / T004] END

/**
 * Whether a resolution should be surfaced to an operator rather than passed over.
 *
 * Only the two failure reasons qualify. Rendering the resting mode because nothing was requested
 * is ordinary and needs no announcement — an application that narrated its normal behaviour would
 * train people to ignore it, which is how a real warning gets missed.
 */
// [SCOPE 128 / T004] BEGIN — Shell contract and server-side mode emission
export function shouldAnnounce(resolved: ResolvedMode): boolean {
  return resolved.reason === "unknown-mode-requested" || resolved.reason === "no-resting-mode";
}
// [SCOPE 128 / T004] END
