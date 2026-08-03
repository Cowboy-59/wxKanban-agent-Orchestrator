// [SCOPE 121 / T002] BEGIN — Safe SQL identifier handling
/** Postgres truncates identifiers at 63 bytes; anything longer is not a real name. */
const IDENTIFIER_RE = /^[A-Za-z_][A-Za-z0-9_$]{0,62}$/;

export class UnsafeIdentifierError extends Error {
  constructor(name: string) {
    super(
      `refusing to build SQL with the identifier ${JSON.stringify(name)} — ` +
        "it is not a plain catalog identifier",
    );
    this.name = "UnsafeIdentifierError";
  }
}

/**
 * Catalog-derived names are still interpolated into SQL text, so they are
 * validated rather than trusted. Anything outside the plain-identifier grammar
 * is refused instead of escaped: an object we cannot name safely is one we
 * decline to probe, and that refusal is reported.
 */
export function isSafeIdentifier(name: string): boolean {
  return typeof name === "string" && IDENTIFIER_RE.test(name);
}

export function quoteIdent(name: string): string {
  if (!isSafeIdentifier(name)) throw new UnsafeIdentifierError(name);
  return `"${name}"`;
}

export function qualify(table: string, column?: string): string {
  const quotedTable = quoteIdent(table);
  return column === undefined
    ? quotedTable
    : `${quotedTable}.${quoteIdent(column)}`;
}
// [SCOPE 121 / T002] END
