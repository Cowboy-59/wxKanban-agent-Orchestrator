// [SCOPE 051] Lightweight i18n framework for the wxKanban app.
//
// Deliberately NOT i18next: a small Context-based layer mirrors the existing
// hand-rolled marketing-i18n pattern, keeps the dependency footprint flat, and is
// sufficient for "framework only, en-US authored" (spec 046). It provides:
//   - a t(key, vars?) resolver with GUARANTEED per-key en-US fallback (FR-002),
//   - a per-user-driven active locale (FR-004, synced from the auth user),
//   - locale-aware date/number formatting via Intl (FR-011).
//
// Only en-US is authored in v1; every other locale resolves through en-US per key,
// so the UI is always complete and never blank/errored.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { enUS, type LocaleBundle, type PartialLocaleBundle } from "./locales/en-US";
import { frFR } from "./locales/fr-FR";
import { esES } from "./locales/es-ES";
import { itIT } from "./locales/it-IT";
import { deDE } from "./locales/de-DE";
import { ptBR } from "./locales/pt-BR";
import { DEFAULT_LOCALE, SUPPORTED_LOCALES, resolveSupportedLocale } from "~/shared/locales";

export { DEFAULT_LOCALE, SUPPORTED_LOCALES };
const STORAGE_KEY = "wxkanban_locale";

// Authored bundles, keyed by locale. en-US is the guaranteed fallback; other
// bundles may be partial (PartialLocaleBundle) and fall back per key.
const BUNDLES: Record<string, PartialLocaleBundle> = {
  "en-US": enUS,
  // [SCOPE 052/053] landing page + common/settings authored in all 5 languages
  "fr-FR": frFR,
  "es-ES": esES,
  "it-IT": itIT,
  "de-DE": deDE,
  "pt-BR": ptBR,
};

type Vars = Record<string, string | number>;

function lookup(bundle: unknown, path: string[]): string | undefined {
  let cur: unknown = bundle;
  for (const seg of path) {
    if (cur && typeof cur === "object" && seg in (cur as Record<string, unknown>)) {
      cur = (cur as Record<string, unknown>)[seg];
    } else {
      return undefined;
    }
  }
  return typeof cur === "string" ? cur : undefined;
}

function interpolate(str: string, vars?: Vars): string {
  if (!vars) return str;
  return str.replace(/\{\{(\w+)\}\}/g, (_, k: string) =>
    k in vars ? String(vars[k]) : `{{${k}}}`,
  );
}

/** Resolve a dotted key for a locale → en-US fallback → the key itself (never blank). */
export function translate(locale: string, key: string, vars?: Vars): string {
  const path = key.split(".");
  const active = BUNDLES[locale];
  const fromActive = active ? lookup(active, path) : undefined;
  if (fromActive !== undefined) return interpolate(fromActive, vars);
  const fromDefault = lookup(BUNDLES[DEFAULT_LOCALE], path);
  if (fromDefault !== undefined) return interpolate(fromDefault, vars);
  return key; // last-resort signal — never empty
}

function detectInitialLocale(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) return stored;
  } catch {
    /* ignore */
  }
  const nav = typeof navigator !== "undefined" ? navigator.language : DEFAULT_LOCALE;
  return resolveSupportedLocale(nav) ?? DEFAULT_LOCALE;
}

interface I18nContextValue {
  locale: string;
  setLocale: (code: string) => void;
  t: (key: string, vars?: Vars) => string;
  formatDate: (value: Date | string | number, opts?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (value: number, opts?: Intl.NumberFormatOptions) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<string>(detectInitialLocale);

  const setLocale = useCallback((code: string) => {
    setLocaleState(code);
    try {
      localStorage.setItem(STORAGE_KEY, code);
    } catch {
      /* ignore */
    }
  }, []);

  // Reflect the active locale on <html lang> for accessibility / formatting.
  useEffect(() => {
    if (typeof document !== "undefined") document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      formatDate: (v, opts) =>
        new Intl.DateTimeFormat(locale, opts).format(typeof v === "string" || typeof v === "number" ? new Date(v) : v),
      formatNumber: (v, opts) => new Intl.NumberFormat(locale, opts).format(v),
    }),
    [locale, setLocale],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within <I18nProvider>");
  return ctx;
}
