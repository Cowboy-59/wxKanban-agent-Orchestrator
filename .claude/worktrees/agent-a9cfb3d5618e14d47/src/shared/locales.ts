// [SCOPE 051] Canonical supported-locale list — the single source shared by the
// client i18n framework and the server (browser-seeding on first login). Only
// en-US is authored in v1; the rest fall back to en-US per key until authored.

export const DEFAULT_LOCALE = "en-US";

export interface SupportedLocale {
  code: string;
  label: string;
  /** Whether a string bundle is authored for this locale (false → en-US fallback). */
  authored: boolean;
}

export const SUPPORTED_LOCALES: readonly SupportedLocale[] = [
  // [SCOPE 052/053] all 6 have an authored bundle (landing + common/settings);
  // app-wide string extraction continues in 052.
  { code: "en-US", label: "English", authored: true },
  { code: "fr-FR", label: "Français", authored: true },
  { code: "es-ES", label: "Español", authored: true },
  { code: "it-IT", label: "Italiano", authored: true },
  { code: "de-DE", label: "Deutsch", authored: true },
  { code: "pt-BR", label: "Português", authored: true },
];

/**
 * Resolve an input locale to a supported code. Accepts a single tag ("fr-FR") or
 * a full Accept-Language header ("fr-FR,fr;q=0.9,en;q=0.8"). Matches by exact code
 * then by base language; returns null when nothing supported matches.
 */
export function resolveSupportedLocale(input: string | null | undefined): string | null {
  if (!input) return null;
  const first = input.split(",")[0]?.trim().split(";")[0]?.trim();
  if (!first) return null;
  const exact = SUPPORTED_LOCALES.find((l) => l.code.toLowerCase() === first.toLowerCase());
  if (exact) return exact.code;
  const base = first.split("-")[0].toLowerCase();
  const byBase = SUPPORTED_LOCALES.find((l) => l.code.split("-")[0].toLowerCase() === base);
  return byBase ? byBase.code : null;
}
