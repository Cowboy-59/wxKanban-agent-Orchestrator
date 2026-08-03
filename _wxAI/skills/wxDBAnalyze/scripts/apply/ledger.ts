import type { ApplyMode } from "../core/policy.js";
import { codeFence } from "../core/markdown.js";

// [SCOPE 121 / T012] BEGIN — Schema change ledger
// MODIFIED-BY [SCOPE 121 / T013] — replaced the private longestBacktickRun/fence
// computation with the shared codeFence helper from core/markdown.ts; behaviour
// unchanged (proven by the pre-existing byte-identical-output test).
export interface LedgerEntry {
  timestamp: string;
  sql: string;
  rationale: string;
  findingId: string;
  result: "applied" | "failed";
  mode: ApplyMode;
}

/**
 * Collapse any newline or carriage return in free-form, finding-derived text
 * to a single space before it is interpolated into the ledger.
 *
 * `rationale` and `findingId` originate from findings — model-authored text —
 * the same class of input `applyStatements` refuses to trust for
 * classification. Left unescaped, an embedded `\n## 2099-01-01 — ...` would
 * render as a heading in the ledger indistinguishable in style from a
 * genuine hand-written entry. Collapsing (not truncating) keeps every
 * character of the original text visible on one line, so nothing is hidden —
 * it just can't start a new markdown block.
 */
function collapseLines(text: string): string {
  return text.replace(/\r\n|\r|\n/g, " ");
}

export function formatLedgerEntry(entry: LedgerEntry): string {
  const sql = entry.sql.trim().replace(/;?$/, ";");
  const fence = codeFence(sql);

  return [
    "",
    `### ${collapseLines(entry.timestamp)} — ${entry.result}`,
    "",
    `- **Finding**: ${collapseLines(entry.findingId)}`,
    `- **Reason**: ${collapseLines(entry.rationale)}`,
    `- **Applied by**: wxDBAnalyze (policy mode: ${entry.mode})`,
    "",
    `${fence}sql`,
    sql,
    fence,
    "",
  ].join("\n");
}

/**
 * Append to the manual change log.
 *
 * Every applied statement is recorded in every policy mode, including
 * auto-additive. The ledger is the only record this project has — there is no
 * migration table — so an unattended apply that skipped it would leave the
 * documented history quietly wrong.
 */
export async function appendLedger(
  path: string,
  entry: LedgerEntry,
): Promise<void> {
  const { appendFile } = await import("node:fs/promises");
  await appendFile(path, formatLedgerEntry(entry), "utf8");
}
// [SCOPE 121 / T012] END
