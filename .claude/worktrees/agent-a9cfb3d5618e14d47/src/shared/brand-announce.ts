/**
 * Schema announcement — SPEC-129 / T010.
 *
 * Every run that consumes brand rules states whether a schema is active and names it, and states
 * plainly when one is declared but could not be resolved.
 *
 * THIS IS THE COUNTERWEIGHT AND IT MUST NOT BE TRIMMED AS NOISE.
 *
 * A silent rules pipeline cannot be told apart from a dead one. This codebase has shipped a gate
 * switched off, a welcome message that was inert, and a compliance context that loaded for nobody
 * — in every case the code was correct and unreachable, and in every case nothing said so. The
 * only difference between those features and this one is that this one announces itself.
 *
 * The announcement is deliberately one line. A paragraph would be skimmed; a line is read.
 */
import type { BrandSchema } from "./brand-schema.js";

export type BrandPresence =
  /** A schema resolved and its rules are in use. */
  | "active"
  /** The project declares a schema that could not be resolved. This is a defect, not a default. */
  | "declared-but-missing"
  /** No schema, and none expected. Ordinary. */
  | "none";

export interface BrandAnnouncement {
  presence: BrandPresence;
  /** One line, or null when there is genuinely nothing to say. */
  line: string | null;
  /** Whether the caller should treat this as a problem. */
  isProblem: boolean;
}

export interface AnnounceInput {
  schema: BrandSchema | null;
  /** Whether something — a project setting, a company selection — said a schema should exist. */
  declared: boolean;
  /** Where the schema resolved from, for the line. */
  tier?: string | null;
  /** How many rules were supplied to the consumer. */
  rulesDelivered?: number;
  /** How many of those a machine can decide. */
  mechanicalRules?: number;
}

/**
 * Build the announcement for a run.
 *
 * Returns a line for BOTH the active case and the declared-but-missing case. Only the genuinely
 * unbranded case is silent, because announcing "no brand" on every run in a codebase with no
 * brands would train people to ignore the line — and then the one run that mattered would be
 * ignored too.
 */
// [SCOPE 129 / T010] BEGIN — Schema announcement
export function announceBrand(input: AnnounceInput): BrandAnnouncement {
  const { schema, declared } = input;

  if (schema) {
    const modes = Object.keys(schema.modes).length;
    const rules = input.rulesDelivered ?? schema.rules.length;
    const mechanical = input.mechanicalRules ?? schema.rules.filter((r) => r.mechanical).length;
    const tier = input.tier ? ` (${input.tier})` : "";
    return {
      presence: "active",
      line:
        `Brand schema active: '${schema.name}' v${schema.version}${tier} — ` +
        `${modes} mode(s), ${rules} rule(s) supplied, ${mechanical} mechanically checked.`,
      isProblem: false,
    };
  }

  if (declared) {
    return {
      presence: "declared-but-missing",
      line:
        "Brand schema DECLARED BUT NOT RESOLVED — this run proceeded with no brand rules. " +
        "Screens generated now will not be checked against the brand, and nothing downstream will " +
        "say so again. Resolve the schema or remove the declaration.",
      isProblem: true,
    };
  }

  return { presence: "none", line: null, isProblem: false };
}
// [SCOPE 129 / T010] END

/**
 * Whether a run must print something.
 *
 * Exported so a consumer cannot quietly decide an announcement is optional: the two cases that
 * return a line are exactly the two cases that must be printed.
 */
// [SCOPE 129 / T010] BEGIN — Schema announcement
export function mustAnnounce(announcement: BrandAnnouncement): boolean {
  return announcement.line !== null;
}
// [SCOPE 129 / T010] END
