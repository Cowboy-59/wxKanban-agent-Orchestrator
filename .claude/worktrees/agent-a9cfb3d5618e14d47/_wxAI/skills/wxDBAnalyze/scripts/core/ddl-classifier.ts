import type { EngineId } from "./engine.js";

// [SCOPE 121 / T011] BEGIN — DDL classification types
export type DdlClass = "additive-safe" | "destructive" | "unrecognised";

export interface Classification {
  class: DdlClass;
  reason: string;
  lockClass: string;
}

interface Rule {
  pattern: RegExp;
  /**
   * Called only when `pattern` matches. Returns a refusal reason when the
   * match should be treated as destructive despite matching the whitelist
   * pattern; returns null when the match stands as additive-safe.
   */
  veto?: (normalised: string) => string | null;
  lockClass: string;
  reason: string;
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Statement normalisation
/**
 * Strip comments and normalise whitespace so classification sees the statement
 * the server will see. Comments are removed BEFORE the single-statement check,
 * because `create table x; -- ok\ndrop table y` is two statements wearing a
 * comment as a disguise.
 */
function normalise(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the text contains exactly one statement, ignoring a trailing `;`. */
function isSingleStatement(normalised: string): boolean {
  const body = normalised.replace(/;\s*$/, "");
  return !body.includes(";");
}

/**
 * True when `sql` contains a block comment that is never closed, or a
 * single-quoted string that is never closed. Postgres's own lexer would
 * reject either, but `normalise()`'s regex-based comment stripping
 * (`/\/\*[\s\S]*?\*\//g`) simply no-ops when there is no closing `*/` —
 * anything typed after an unterminated `/*` would otherwise ride through
 * unclassified. A malformed statement must be refused as `unrecognised`,
 * never blessed as `additive-safe`.
 */
function hasUnterminatedToken(sql: string): boolean {
  let i = 0;
  let inString = false;
  while (i < sql.length) {
    const ch = sql[i];
    if (inString) {
      if (ch === "'") {
        if (sql[i + 1] === "'") {
          i += 2;
          continue;
        }
        inString = false;
      }
      i++;
      continue;
    }
    if (ch === "'") {
      inString = true;
      i++;
      continue;
    }
    if (ch === "-" && sql[i + 1] === "-") {
      const nl = sql.indexOf("\n", i);
      i = nl === -1 ? sql.length : nl + 1;
      continue;
    }
    if (ch === "/" && sql[i + 1] === "*") {
      const close = sql.indexOf("*/", i + 2);
      if (close === -1) return true;
      i = close + 2;
      continue;
    }
    i++;
  }
  return inString;
}

/**
 * True when a comma appears outside any quoted string at parenthesis depth
 * zero. Postgres allows several comma-separated actions in one ALTER TABLE
 * with no semicolon involved (`add column x, disable trigger y`). Every
 * legitimate whitelisted statement keeps its commas inside parentheses —
 * column lists, index column lists, FK column lists — so a depth-zero comma
 * reliably means a second, unvetted clause riding along with the first.
 */
function hasDepthZeroComma(normalised: string): boolean {
  let depth = 0;
  let inString = false;
  for (let i = 0; i < normalised.length; i++) {
    const ch = normalised[i];
    if (inString) {
      if (ch === "'") {
        if (normalised[i + 1] === "'") {
          i++;
        } else {
          inString = false;
        }
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
    } else if (ch === "(") {
      depth++;
    } else if (ch === ")") {
      depth = Math.max(0, depth - 1);
    } else if (ch === "," && depth === 0) {
      return true;
    }
  }
  return false;
}

/**
 * True when `expr` is a plain literal — a quoted string, a signed integer or
 * decimal, `true`, `false`, or `null`. Anything else, including a function
 * call, is not a literal. This is deliberately an allow-list of shapes, not
 * a blocklist of volatile function names: a user's own SQL function can be
 * volatile too, so "not a literal" is refused regardless of what it's named.
 */
function isLiteralDefault(expr: string): boolean {
  const trimmed = expr.trim();
  return (
    /^'(?:[^']|'')*'$/.test(trimmed) ||
    /^-?\d+(?:\.\d+)?$/.test(trimmed) ||
    /^(?:true|false|null)$/i.test(trimmed)
  );
}
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Per-engine additive whitelists
/**
 * Column-constraint keywords that can trail a DEFAULT expression in an
 * ADD COLUMN clause (`DEFAULT 'x' NOT NULL`, `DEFAULT 0 PRIMARY KEY`, ...).
 * `NULL` alone is deliberately excluded: it is ambiguous with the literal
 * default value `NULL` itself (`DEFAULT NULL`), and none of the required
 * orderings need it as a stop word — only `NOT NULL` (two words) does.
 */
const DEFAULT_STOP_KEYWORDS =
  /^(?:not\s+null|primary\s+key|unique|check|references|collate|generated)\b/i;

/**
 * Extract the DEFAULT expression from an ADD COLUMN statement, stopping at
 * the next column-constraint keyword — found outside any quoted string —
 * rather than capturing to end-of-string. Without this, `DEFAULT 'x' NOT
 * NULL` would capture `'x' not null` as the "default", which is not a
 * literal and would be wrongly refused; capturing correctly means `DEFAULT
 * 'x' NOT NULL` and `NOT NULL DEFAULT 'x'` both yield the same `'x'`
 * regardless of which order the constraints were written in.
 */
function extractDefaultExpr(normalised: string): string | null {
  const match = normalised.match(/\bdefault\s+([\s\S]+)$/i);
  if (!match) return null;
  const rest = match[1];

  let inString = false;
  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (inString) {
      if (ch === "'") {
        if (rest[i + 1] === "'") {
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (DEFAULT_STOP_KEYWORDS.test(rest.slice(i))) {
      return rest.slice(0, i).replace(/;\s*$/, "").trim();
    }
  }

  return rest.replace(/;\s*$/, "").trim();
}

/**
 * FIX (SCOPE-121 final wave, I1 — Important): the whole-statement veto below
 * only ever inspected the DEFAULT clause, so `ADD COLUMN "c" int GENERATED
 * ALWAYS AS IDENTITY`, `ADD COLUMN "c" int GENERATED ALWAYS AS (1) STORED`,
 * `ADD COLUMN "c" text UNIQUE` and `ADD COLUMN "c" uuid PRIMARY KEY` all fell
 * straight through as `additive-safe` with a lock class claiming "ACCESS
 * EXCLUSIVE, catalog-only on PG 11+" — the volatile-default hole re-entering
 * through different syntax, on statements that are actually full table
 * rewrites (`GENERATED ... STORED`, `GENERATED ... AS IDENTITY`, both of
 * which must compute/populate a value for every existing row) or a blocking,
 * non-concurrent index build (`UNIQUE`, `PRIMARY KEY` both create an index
 * inline) — exactly the class of statement `DESTRUCTIVE_HINTS` already
 * refuses a bare `CREATE INDEX` for. Matched case-insensitively against the
 * statement with quoted-string contents masked out, so a literal default
 * value that happens to contain one of these words (`DEFAULT 'unique'`)
 * cannot trip it.
 */
const STRUCTURAL_VETO_PATTERNS: ReadonlyArray<[RegExp, string]> = [
  [
    /\bunique\b/i,
    "ADD COLUMN ... UNIQUE builds a unique index inline while adding the " +
      "column, which blocks writes for the duration exactly like a " +
      "non-concurrent CREATE INDEX — refused for the same reason",
  ],
  [
    /\bprimary\s+key\b/i,
    "ADD COLUMN ... PRIMARY KEY builds a unique index and a NOT NULL " +
      "constraint inline while adding the column, which blocks writes for " +
      "the duration exactly like a non-concurrent CREATE INDEX",
  ],
  [
    /\bgenerated\s+always\s+as\s*\([\s\S]*\)\s*stored\b/i,
    "ADD COLUMN ... GENERATED ALWAYS AS (...) STORED computes and stores a " +
      "value for every existing row, which is a full table rewrite under " +
      "ACCESS EXCLUSIVE, not a catalog-only change",
  ],
  [
    /\bgenerated\s+(?:always\s+)?as\s+identity\b/i,
    "ADD COLUMN ... GENERATED AS IDENTITY populates a sequence-backed value " +
      "for every existing row, which is a full table rewrite under ACCESS " +
      "EXCLUSIVE, not a catalog-only change",
  ],
];

/**
 * Blank out the contents of every single-quoted string in `text` (keeping
 * length and every non-quoted character intact) so a keyword search cannot
 * be tripped by a literal value that happens to contain one of the vetoed
 * words, e.g. `DEFAULT 'unique'`. Doubled `''` (the SQL-escaped quote) is
 * consumed as part of the same string, matching every other quote-aware scan
 * in this file (`extractDefaultExpr`, `hasDepthZeroComma`).
 */
function maskQuotedLiterals(text: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "'" && text[i + 1] === "'") {
        out += "  ";
        i++;
        continue;
      }
      if (ch === "'") {
        inString = false;
        out += " ";
        continue;
      }
      out += " ";
      continue;
    }
    if (ch === "'") {
      inString = true;
      out += " ";
      continue;
    }
    out += ch;
  }
  return out;
}

function addColumnStructuralVeto(normalised: string): string | null {
  const masked = maskQuotedLiterals(normalised);
  for (const [pattern, reason] of STRUCTURAL_VETO_PATTERNS) {
    if (pattern.test(masked)) return reason;
  }
  return null;
}

/**
 * Veto for `ADD COLUMN ...`. Checks the structural forms above first — they
 * apply regardless of whether a DEFAULT clause is present at all — then
 * falls through to the existing DEFAULT-expression check. Applies whenever a
 * DEFAULT is present, whether or not NOT NULL is also present — NOT NULL was
 * never what triggers Postgres's rewrite-the-table behaviour; a VOLATILE
 * default does. Postgres's fast-default optimisation (PG 11+) avoids a full
 * table rewrite only for a non-volatile constant; `now()`, `gen_random_uuid()`,
 * `random()`, `nextval(...)`, `current_timestamp`, and any user-defined
 * function are all evaluated per existing row under ACCESS EXCLUSIVE
 * regardless of what they are named — refused here by shape (they are not
 * a quoted string, a number, `true`/`false`, or `null`), never by a
 * blocklist of function names, since a user's own function can be volatile
 * too. Separately, NOT NULL with no DEFAULT at all is refused outright — it
 * rewrites the table and fails outright if any row exists.
 */
function addColumnDefaultVeto(normalised: string): string | null {
  const structural = addColumnStructuralVeto(normalised);
  if (structural) return structural;

  const hasNotNull = /\bnot null\b/i.test(normalised);
  const expr = extractDefaultExpr(normalised);

  if (expr === null) {
    if (hasNotNull) {
      return (
        "ADD COLUMN NOT NULL without a DEFAULT rewrites the table and fails " +
        "outright if any row exists"
      );
    }
    return null;
  }

  if (!isLiteralDefault(expr)) {
    return (
      "ADD COLUMN DEFAULT <non-literal> may be a volatile expression, " +
      "which forces Postgres to rewrite the whole table and its indexes " +
      "under ACCESS EXCLUSIVE — only a literal default (a quoted string, " +
      "a number, true, false, or null) is treated as constant"
    );
  }

  return null;
}

const POSTGRES_RULES: Rule[] = [
  {
    pattern: /^create table (if not exists )?/i,
    lockClass: "none — new relation",
    reason: "creates a new table; touches no existing data",
  },
  {
    pattern: /^alter table .+ add column /i,
    veto: addColumnDefaultVeto,
    lockClass: "ACCESS EXCLUSIVE, catalog-only on PG 11+",
    reason: "adds a nullable or defaulted column without rewriting the table",
  },
  {
    pattern: /^create (unique )?index concurrently /i,
    lockClass: "SHARE UPDATE EXCLUSIVE — does not block reads or writes",
    reason: "builds the index online",
  },
  {
    pattern: /^alter table .+ add constraint .+ not valid\s*;?$/i,
    lockClass: "SHARE ROW EXCLUSIVE, held briefly",
    reason: "constrains new rows without scanning existing ones",
  },
  {
    pattern: /^alter table .+ validate constraint /i,
    lockClass: "SHARE UPDATE EXCLUSIVE — does not block writes",
    reason: "validates an existing NOT VALID constraint without blocking writes",
  },
  { pattern: /^comment on /i, lockClass: "none", reason: "metadata only" },
  {
    pattern: /^create schema (if not exists )?/i,
    lockClass: "none",
    reason: "creates a new namespace",
  },
];

/**
 * Firebird deliberately has NO foreign-key rule. It has no NOT VALID, so
 * adding a constraint validates immediately and needs effectively exclusive
 * access. "Safe" is not portable, and copying the Postgres list here would
 * apply a blocking statement to a customer's live database.
 */
const FIREBIRD_RULES: Rule[] = [
  {
    pattern: /^create table /i,
    lockClass: "none — new relation",
    reason: "creates a new table",
  },
  {
    pattern: /^alter table .+ add /i,
    veto: (normalised) =>
      /\b(not null|constraint)\b/i.test(normalised)
        ? "Firebird validates NOT NULL and constraint additions immediately, " +
          "requiring exclusive access on a live table"
        : null,
    lockClass: "metadata lock",
    reason: "adds a nullable column",
  },
];

const DESTRUCTIVE_HINTS: ReadonlyArray<[RegExp, string]> = [
  [/^drop /i, "DROP removes an object and its data"],
  [/^truncate /i, "TRUNCATE removes all rows"],
  [/^delete from /i, "DELETE modifies data"],
  [/^update /i, "UPDATE modifies data"],
  [/\balter column\b/i, "ALTER COLUMN can rewrite the table and change semantics"],
  [/\bdrop column\b/i, "DROP COLUMN removes data"],
  [/\brename\b/i, "RENAME breaks every existing reference to the old name"],
  [
    /^create (unique )?index (?!concurrently)/i,
    "CREATE INDEX without CONCURRENTLY holds a lock that blocks writes for the build",
  ],
];

const WHITELISTS: Partial<Record<EngineId, Rule[]>> = {
  postgres: POSTGRES_RULES,
  firebird: FIREBIRD_RULES,
};
// [SCOPE 121 / T011] END

// [SCOPE 121 / T011] BEGIN — Statement classification
const REFUSED_LOCK = "n/a — statement refused";

/**
 * Classify one DDL statement for one engine.
 *
 * Default-deny: a statement is additive-safe only if it matches an explicit
 * rule for that engine AND that rule's match spans the whole statement (no
 * unvetted second clause riding a depth-zero comma) AND, where a veto is
 * defined, the veto does not fire. Everything else is refused, including
 * statements this classifier simply does not recognise. Permitting the
 * unrecognised case would mean the whitelist protects only against mistakes
 * it already anticipated.
 */
export function classifyStatement(
  engine: EngineId,
  sql: string,
): Classification {
  if (hasUnterminatedToken(sql)) {
    return {
      class: "unrecognised",
      reason:
        "refused: the statement contains an unterminated comment or string " +
        "literal and cannot be safely classified",
      lockClass: REFUSED_LOCK,
    };
  }

  const normalised = normalise(sql);

  if (normalised.length === 0) {
    return { class: "unrecognised", reason: "empty statement", lockClass: REFUSED_LOCK };
  }

  if (!isSingleStatement(normalised)) {
    return {
      class: "unrecognised",
      reason:
        "refused: the text contains more than one statement. Exactly one " +
        "statement is classified and applied at a time.",
      lockClass: REFUSED_LOCK,
    };
  }

  for (const [pattern, reason] of DESTRUCTIVE_HINTS) {
    if (pattern.test(normalised)) {
      return { class: "destructive", reason, lockClass: REFUSED_LOCK };
    }
  }

  for (const rule of WHITELISTS[engine] ?? []) {
    if (!rule.pattern.test(normalised)) continue;
    const vetoReason = rule.veto?.(normalised);
    if (vetoReason) {
      return { class: "destructive", reason: vetoReason, lockClass: REFUSED_LOCK };
    }
    if (hasDepthZeroComma(normalised)) {
      return {
        class: "unrecognised",
        reason:
          "refused: a comma outside parentheses signals a second clause or " +
          "action appended to this statement, which is not individually vetted",
        lockClass: REFUSED_LOCK,
      };
    }
    return { class: "additive-safe", reason: rule.reason, lockClass: rule.lockClass };
  }

  return {
    class: "unrecognised",
    reason:
      `no additive rule for ${engine} matches this statement, so it is ` +
      "refused by default",
    lockClass: REFUSED_LOCK,
  };
}
// [SCOPE 121 / T011] END
