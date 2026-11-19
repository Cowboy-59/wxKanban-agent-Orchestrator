/**
 * Brand schema contract validation — SPEC-126 / T002.
 *
 * Answers one question: does every mode declare everything the schema's own contract says it
 * must? A mode that omits a contract token is a defect, never a fallback. Nothing here inherits
 * a missing value from another mode, from the base theme, or from a default — the whole point of
 * a declared contract is that silence is an error rather than an invitation to guess.
 *
 * Kept separate from the shape guard in `brand-schema.ts`: a structural check can never be
 * mistaken for a quality verdict.
 */
import type { BrandSchema, ModeTokenSet } from "./brand-schema.js";
import { contractTokenNames } from "./brand-schema.js";

/** A single validation failure, named precisely enough to act on without opening the source. */
export interface ContractIssue {
  /** Stable identifier for the failing check, e.g. `contract:instrument:missing-token`. */
  check: string;
  /** The mode this concerns, or null for schema-level failures. */
  mode: string | null;
  message: string;
}

export interface ContractReport {
  valid: boolean;
  issues: ContractIssue[];
  /** Modes examined, in declaration order. */
  modesChecked: string[];
  /** How many contract tokens each mode was required to declare. */
  contractSize: number;
}

/**
 * Tokens a mode fails to declare, in contract order.
 *
 * A token declared with an empty or whitespace-only value counts as missing. A brand that writes
 * a token name and no value has not declared it, and treating the name alone as sufficient is
 * exactly the kind of near-miss a completeness check exists to catch.
 */
// [SCOPE 126 / T002] BEGIN — Contract validator
export function missingContractTokens(schema: BrandSchema, mode: ModeTokenSet): string[] {
  return contractTokenNames(schema).filter((name) => {
    const value = mode.tokens[name];
    return typeof value !== "string" || value.trim().length === 0;
  });
}
// [SCOPE 126 / T002] END

/** Tokens a mode declares that the contract does not name. */
// [SCOPE 126 / T002] BEGIN — Contract validator
export function undeclaredContractTokens(schema: BrandSchema, mode: ModeTokenSet): string[] {
  const declared = new Set(contractTokenNames(schema));
  return Object.keys(mode.tokens).filter((name) => !declared.has(name));
}
// [SCOPE 126 / T002] END

/**
 * Full contract validation: completeness per mode, exactly one resting mode, and a non-empty
 * contract.
 *
 * An empty contract is rejected rather than passing vacuously. A schema that requires nothing
 * would report every mode as complete, which is the most misleading possible result from a
 * completeness check.
 */
// [SCOPE 126 / T002] BEGIN — Contract validator
export function validateContract(schema: BrandSchema): ContractReport {
  const issues: ContractIssue[] = [];
  const contractNames = contractTokenNames(schema);
  const modes = Object.values(schema.modes);
  const modesChecked = modes.map((m) => m.name);

  if (contractNames.length === 0) {
    issues.push({
      check: "contract:empty",
      mode: null,
      message:
        "The schema declares no token contract. An empty contract would report every mode as complete, so it is rejected rather than passing vacuously.",
    });
  }

  const duplicateNames = contractNames.filter((n, i) => contractNames.indexOf(n) !== i);
  for (const name of new Set(duplicateNames)) {
    issues.push({
      check: "contract:duplicate-token",
      mode: null,
      message: `The contract declares '${name}' more than once. A duplicated token makes the required count ambiguous.`,
    });
  }

  if (modes.length === 0) {
    issues.push({
      check: "contract:no-modes",
      mode: null,
      message: "The schema declares no modes. A brand needs at least one, which is what a captured product yields.",
    });
  }

  for (const mode of modes) {
    const missing = missingContractTokens(schema, mode);
    if (missing.length > 0) {
      issues.push({
        check: "contract:missing-token",
        mode: mode.name,
        message:
          `Mode '${mode.name}' omits ${missing.length} of ${contractNames.length} contract tokens: ` +
          `${missing.join(", ")}. A missing token is a defect, not a fallback — it is never inherited ` +
          "from another mode, from the base theme, or from a default.",
      });
    }

    const undeclared = undeclaredContractTokens(schema, mode);
    if (undeclared.length > 0) {
      issues.push({
        check: "contract:undeclared-token",
        mode: mode.name,
        message:
          `Mode '${mode.name}' declares ${undeclared.length} token(s) the contract does not name: ` +
          `${undeclared.join(", ")}. Either the contract is incomplete or the mode carries a stray value; ` +
          "both are worth resolving before the schema is stored.",
      });
    }
  }

  const resting = modes.filter((m) => m.resting);
  if (resting.length === 0) {
    issues.push({
      check: "contract:no-resting-mode",
      mode: null,
      message:
        "No mode is marked resting. The resting mode is what the base stylesheet renders when nothing selects otherwise, so a schema without one has no defined appearance.",
    });
  } else if (resting.length > 1) {
    issues.push({
      check: "contract:multiple-resting-modes",
      mode: null,
      message: `${resting.length} modes are marked resting (${resting.map((m) => m.name).join(", ")}). Exactly one is required.`,
    });
  }

  return {
    valid: issues.length === 0,
    issues,
    modesChecked,
    contractSize: contractNames.length,
  };
}
// [SCOPE 126 / T002] END

/**
 * Whether a mode may be added to this schema.
 *
 * A closed set is the brand's own statement about itself, recorded on the schema rather than
 * assumed by wxKanban. Adding to a closed schema fails and says so; an open schema accepts it.
 */
// [SCOPE 126 / T002] BEGIN — Contract validator
export function canAddMode(schema: BrandSchema, modeName: string): ContractIssue | null {
  if (Object.prototype.hasOwnProperty.call(schema.modes, modeName)) {
    return {
      check: "contract:duplicate-mode",
      mode: modeName,
      message: `Mode '${modeName}' already exists in this schema.`,
    };
  }
  if (schema.closed) {
    return {
      check: "contract:closed-set",
      mode: modeName,
      message:
        `Mode '${modeName}' cannot be added: this schema declares its mode set closed. ` +
        "The closed flag is the brand's own statement about itself — changing it is a brand decision, not an implementation one.",
    };
  }
  return null;
}
// [SCOPE 126 / T002] END
