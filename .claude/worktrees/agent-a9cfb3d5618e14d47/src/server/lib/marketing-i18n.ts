// [SCOPE 046 / T006] BEGIN — i18n capture strings (locale-keyed, en-US fallback)
// Public-facing strings returned by the marketing lead-capture endpoint. Every
// string is locale-keyed; a missing locale (or a missing key within a locale)
// falls back to en-US and never errors (spec 046 FR-016). en-US authored first;
// other locales (fr-FR, es, pt-BR, it, de) are added here as marketing translates.

export type MarketingStringKey =
  | "captureSuccess"
  | "invalidEmail"
  | "missingFields"
  | "rejected";

type LocaleStrings = Record<MarketingStringKey, string>;

const DEFAULT_LOCALE = "en-US";

const STRINGS: Record<string, Partial<LocaleStrings>> = {
  "en-US": {
    captureSuccess: "Thanks — you're on the list. We'll be in touch soon.",
    invalidEmail: "Please enter a valid email address.",
    missingFields: "Please complete the required fields.",
    rejected: "We couldn't process that request.",
  },
  // Translations land here as marketing supplies them, e.g.:
  // "fr-FR": { captureSuccess: "Merci — vous êtes inscrit. …", ... },
};

/**
 * Resolve a marketing string for a requested locale, falling back to the exact
 * locale's region-stripped base (e.g. "fr-CA" → "fr-FR" if present), then to
 * en-US. Always returns a string — never throws on an unknown locale/key.
 */
export function marketingString(
  key: MarketingStringKey,
  locale: string | undefined,
): string {
  const candidates: string[] = [];
  if (locale) {
    candidates.push(locale);
    const base = locale.split("-")[0];
    // match any configured locale sharing the base language
    for (const known of Object.keys(STRINGS)) {
      if (known !== locale && known.split("-")[0] === base) {
        candidates.push(known);
      }
    }
  }
  candidates.push(DEFAULT_LOCALE);

  for (const loc of candidates) {
    const val = STRINGS[loc]?.[key];
    if (val) return val;
  }
  // Guaranteed fallback — en-US always defines every key.
  return STRINGS[DEFAULT_LOCALE][key]!;
}
// [SCOPE 046 / T006] END
