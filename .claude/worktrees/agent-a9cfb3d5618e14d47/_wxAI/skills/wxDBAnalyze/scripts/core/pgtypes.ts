// [SCOPE 121 / T007] BEGIN — Postgres type canonicalisation
/**
 * FIX (SCOPE-121/T007, round 2 — code review Critical finding): the schema
 * dimension compared `column.sqlType !== liveColumn.sqlType` as raw strings.
 * The declared side is Drizzle's `getSQLType()` shorthand ("timestamp",
 * "varchar(255)", "serial"); the live side is Postgres's
 * `pg_catalog.format_type()` canonical spelling ("timestamp without time
 * zone", "character varying(255)", "integer"). Comparing the two verbatim
 * against a real production database produced 548 false positives out of 558
 * total type differences — 91% of the `high` severity bucket was spelling,
 * not drift — and the noise buried the 10 real mismatches inside it. This
 * module normalises both sides to Postgres's canonical vocabulary before any
 * comparison happens, so equality means "the same Postgres type," not "the
 * same author wrote it the same way."
 *
 * Direction: converge on Postgres's `format_type()` spelling, since it is
 * already the authoritative, canonical form — the declared (Drizzle) side is
 * resolved through an alias table into it, not the other way round.
 *
 * This is an ALIAS TABLE, not a fuzzy or substring match, on purpose: a
 * similarity heuristic would just as happily collapse `varchar(20)` and
 * `character varying(50)` (different lengths — a real defect) as it collapses
 * `timestamp` and `timestamp without time zone` (a real alias). An exact
 * lookup on a whole type name, with parameters and array-depth compared
 * separately and exactly, cannot do that: it either recognises a known
 * spelling or it leaves the input untouched, so an unrecognised or genuinely
 * different type always falls through to "different."
 */

/**
 * Drizzle shorthand (and a few common driver aliases) -> Postgres's
 * `format_type()` canonical spelling. Keys are matched against the *base*
 * type name only, after array brackets and any `(...)` parameter list have
 * already been stripped — so this table never needs to know about
 * parameters or array-ness.
 *
 * SERIAL: `serial`/`bigserial`/`smallserial` are not real Postgres types —
 * `pg_catalog` never reports them; they expand at DDL time to
 * `integer`/`bigint`/`smallint` plus a sequence-backed default. Postgres's
 * live-side `format_type()` output can therefore never say "serial", so for
 * the *type* comparison the honest canonical form of a declared `serial`
 * column is its underlying integer type — mapping it there is what lets a
 * declared `serial` column match a live `integer` column instead of being
 * reported as a permanent, unfixable "type mismatch". That mapping resolves
 * the type dimension only. It does NOT verify that the live column actually
 * carries the sequence-backed default (`nextval(...)`) that makes a plain
 * integer column "serial" in the first place — confirming the default/
 * identity side of serial-ness is a distinct check with different evidence
 * (`hasDefault` / `pg_get_serial_sequence`), and is explicitly deferred to a
 * later phase rather than silently folded into this alias.
 */
const BASE_TYPE_ALIASES: ReadonlyMap<string, string> = new Map([
  ["timestamp", "timestamp without time zone"],
  ["timestamptz", "timestamp with time zone"],
  ["time", "time without time zone"],
  ["timetz", "time with time zone"],
  ["varchar", "character varying"],
  ["char", "character"],
  ["bpchar", "character"],
  ["int4", "integer"],
  ["int", "integer"],
  ["int8", "bigint"],
  ["int2", "smallint"],
  ["bool", "boolean"],
  ["float8", "double precision"],
  ["float4", "real"],
  ["decimal", "numeric"],
  // Serial family — see the SERIAL note above: type-dimension only.
  ["serial", "integer"],
  ["serial4", "integer"],
  ["bigserial", "bigint"],
  ["serial8", "bigint"],
  ["smallserial", "smallint"],
  ["serial2", "smallint"],
]);

export interface CanonicalType {
  /** Canonical Postgres base type name, e.g. "character varying", "numeric", "integer". */
  base: string;
  /**
   * Canonical parameter list with whitespace collapsed (`"10, 2"` ->
   * `"10,2"`) but every value left exactly as written — this normalises
   * spelling, never magnitude. `null` when the type has no `(...)` at all,
   * which is itself significant: bare `numeric` and `numeric(10,2)` must
   * stay unequal.
   */
  params: string | null;
  /** Number of trailing `[]` markers. 0 for a non-array type. */
  arrayDepth: number;
}

/**
 * Parse a raw SQL type string (from either Drizzle's `getSQLType()` or
 * Postgres's `format_type()`) into its canonical parts. Pure string
 * manipulation — no lookup outside `BASE_TYPE_ALIASES`, no I/O.
 */
export function canonicalizeType(raw: string): CanonicalType {
  let value = raw.trim().toLowerCase();

  // Array-ness is compared as its own dimension, never folded into the base
  // type: `text[]` must stay distinguishable from `text`, not collapse to it.
  let arrayDepth = 0;
  while (value.endsWith("[]")) {
    arrayDepth++;
    value = value.slice(0, -2).trimEnd();
  }

  // Base name is everything outside an optional trailing "(...)" parameter
  // list. The base name itself may contain spaces ("character varying",
  // "timestamp without time zone"), so this is not a simple split on "(".
  const match = value.match(/^([^()]+?)\s*(?:\(([^)]*)\))?$/);
  const base = (match ? match[1] : value).trim();
  const paramsRaw = match ? match[2] : undefined;

  const params =
    paramsRaw === undefined
      ? null
      : paramsRaw
          .split(",")
          .map((part) => part.trim())
          .join(",");

  return {
    base: BASE_TYPE_ALIASES.get(base) ?? base,
    params,
    arrayDepth,
  };
}

/**
 * True when two raw SQL type strings denote the same Postgres type once both
 * are canonicalised — same base type, same parameters, same array depth.
 * Every field is compared exactly; there is no "close enough."
 */
export function typesEquivalent(declaredType: string, liveType: string): boolean {
  const a = canonicalizeType(declaredType);
  const b = canonicalizeType(liveType);
  return a.base === b.base && a.params === b.params && a.arrayDepth === b.arrayDepth;
}
// [SCOPE 121 / T007] END
