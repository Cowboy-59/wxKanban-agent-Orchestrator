// [SCOPE 100 / T003] BEGIN — Locale resolution for the public bio (FR-003)
// MODIFIED-BY: T015 — added hasPublishedEnglish gate (whole-branch review fix, FR-003/US6)
// Ports the scoring proven at src/server/routes/help.ts:317-328, which exists because
// the unauthenticated FAQ fetch once returned every FAQ once per language. Extracted
// here as pure functions so the behavior is unit-testable without a database.

/** Reduce "fr-FR" | "pt_BR" | "EN-US" to a bare lowercase language. */
export function normalizeLang(locale: string): string {
  return (locale || "").toLowerCase().split(/[-_]/)[0] ?? "";
}

/** Higher wins: requested language (2) > English (1) > anything (0). */
export function scoreLocale(rowLocale: string, requestedLang: string): number {
  const lang = normalizeLang(rowLocale);
  const requestedLangNormalized = normalizeLang(requestedLang);
  if (requestedLangNormalized && lang === requestedLangNormalized) return 2;
  if (lang === "en") return 1;
  return 0;
}

/** Pick the single best row for the requested locale, or null when there are none. */
export function pickBestByLocale<T extends { locale: string }>(
  rows: T[],
  requested: string,
): T | null {
  const reqLang = normalizeLang(requested.trim());
  let best: T | null = null;
  let bestScore = -1;
  for (const row of rows) {
    const s = scoreLocale(row.locale, reqLang);
    if (s > bestScore) {
      best = row;
      bestScore = s;
    }
  }
  return best;
}

/**
 * Gate the whole bio group on the English source's own status (FR-003/US6, T015).
 *
 * Without this, a Translate press fans out `status: "published"` to the 5 locale
 * rows regardless of the en-US row's status (BioTranslationService.ts). Since a new
 * en-US row defaults to "draft" and `save()` never sends `status`, that meant an
 * English visitor with no en-US publish could still be served one of the 5 published
 * translations by `pickBestByLocale` — every row scoring 0, first-in-array wins. This
 * gate makes "no published en-US row" mean "no bio at all", independent of how many
 * translated rows are published, so `/bio` correctly redirects to `/about` (FR-004)
 * until the founder explicitly publishes English.
 */
export function hasPublishedEnglish<T extends { locale: string; status: string }>(
  rows: T[],
): boolean {
  return rows.some((row) => normalizeLang(row.locale) === "en" && row.status === "published");
}
// [SCOPE 100 / T003] END
