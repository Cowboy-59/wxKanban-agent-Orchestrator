// [SCOPE 121 / T011] BEGIN — Apply policy resolution
export type ApplyMode = "manual" | "approve-each" | "auto-additive";

export interface ApplyPolicy {
  mode: ApplyMode;
  source: string;
}

const MODES: ReadonlySet<string> = new Set([
  "manual",
  "approve-each",
  "auto-additive",
]);

const DEFAULT_SOURCE = "default (no .wxai/db-policy.json)";

/**
 * Resolve the apply mode from parsed policy JSON.
 *
 * Absent a file the mode is `approve-each` — the skill asks before it writes.
 * A file that IS present but malformed throws rather than falling back: a typo
 * silently downgrading to a permissive default is the one failure this
 * function exists to prevent.
 */
export function resolveApplyPolicy(raw: unknown): ApplyPolicy {
  if (raw === undefined || raw === null) {
    return { mode: "approve-each", source: DEFAULT_SOURCE };
  }

  const apply = (raw as { apply?: { mode?: unknown } }).apply;
  const mode = apply?.mode;

  if (typeof mode !== "string") {
    throw new Error(
      ".wxai/db-policy.json is present but apply.mode is missing — set it to " +
        "one of: manual, approve-each, auto-additive",
    );
  }
  if (!MODES.has(mode)) {
    throw new Error(
      `.wxai/db-policy.json declares an unknown apply.mode ${JSON.stringify(mode)} — ` +
        "valid values: manual, approve-each, auto-additive",
    );
  }

  return { mode: mode as ApplyMode, source: ".wxai/db-policy.json" };
}

/** Read and resolve the policy from a project root. */
export async function loadApplyPolicy(cwd: string): Promise<ApplyPolicy> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const text = await readFile(join(cwd, ".wxai", "db-policy.json"), "utf8");
    return resolveApplyPolicy(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return resolveApplyPolicy(undefined);
    }
    throw error;
  }
}
// [SCOPE 121 / T011] END

// [SCOPE 111 / T046] BEGIN — Columns whose emptiness is the design, not a defect
/**
 * `data.all-null-column` reads a column that no row has ever written as evidence
 * of a bug — usually correctly. But a column can be all-null *by design*: a
 * nullable override where null carries meaning, and where nobody has yet needed
 * the override. `testplanitems.forcetest` is exactly that (null = inherit the
 * plan's flag, FR-030), and acting on the finding — a NOT NULL default, or a
 * drop as dead weight — would silently un-force every inheriting item.
 *
 * Entries are `table.column`, lowercase, matched exactly. Declaring one is a
 * claim that the emptiness is understood, NOT that the column is unimportant —
 * so a reason is mandatory and is echoed into the report.
 */
export interface IntentionalNullColumn {
  column: string;
  reason: string;
}

export interface AnalysisPolicy {
  intentionalNullColumns: ReadonlyMap<string, string>;
  source: string;
}

const EMPTY_ANALYSIS: AnalysisPolicy = {
  intentionalNullColumns: new Map(),
  source: DEFAULT_SOURCE,
};

/** Resolve the analysis policy from parsed policy JSON. */
export function resolveAnalysisPolicy(raw: unknown): AnalysisPolicy {
  if (raw === undefined || raw === null) return EMPTY_ANALYSIS;

  const declared = (raw as { analysis?: { intentionalNullColumns?: unknown } })
    .analysis?.intentionalNullColumns;
  if (declared === undefined) {
    return { ...EMPTY_ANALYSIS, source: ".wxai/db-policy.json" };
  }
  if (!Array.isArray(declared)) {
    throw new Error(
      ".wxai/db-policy.json declares analysis.intentionalNullColumns but it is not " +
        'an array — expected [{ "column": "table.column", "reason": "..." }]',
    );
  }

  const map = new Map<string, string>();
  for (const entry of declared) {
    const { column, reason } = (entry ?? {}) as Partial<IntentionalNullColumn>;
    // Both fields are required. A silent skip here would turn a typo into a
    // suppression that nobody notices — the opposite of the intent.
    if (typeof column !== "string" || !column.includes(".")) {
      throw new Error(
        "analysis.intentionalNullColumns entries need a `column` of the form " +
          `"table.column" — got ${JSON.stringify(column)}`,
      );
    }
    if (typeof reason !== "string" || reason.trim() === "") {
      throw new Error(
        `analysis.intentionalNullColumns["${column}"] needs a non-empty \`reason\` — ` +
          "an unexplained suppression is indistinguishable from a forgotten bug",
      );
    }
    map.set(column.toLowerCase(), reason.trim());
  }

  return { intentionalNullColumns: map, source: ".wxai/db-policy.json" };
}

/** Read and resolve the analysis policy from a project root. */
export async function loadAnalysisPolicy(cwd: string): Promise<AnalysisPolicy> {
  const { readFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  try {
    const text = await readFile(join(cwd, ".wxai", "db-policy.json"), "utf8");
    return resolveAnalysisPolicy(JSON.parse(text));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return EMPTY_ANALYSIS;
    }
    throw error;
  }
}
// [SCOPE 111 / T046] END
