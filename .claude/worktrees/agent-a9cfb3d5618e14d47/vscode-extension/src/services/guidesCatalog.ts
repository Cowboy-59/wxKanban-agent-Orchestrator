// [SCOPE 066 / Guides] BEGIN — downloadable guide catalog for the Dev Cockpit
// "Help — Conversion Guides" section. Fetches the public guide index
// (GET /api/help/guides — published marketingassets rows, type='guide'), the same
// source the /docs Guides tab reads. Read-only and unauthenticated. All failures
// are swallowed so the section simply doesn't appear when offline or unreachable.

/** One downloadable file: a single language variant of a guide. */
export interface GuideVariant {
  id: string;
  // Language name in its own language, so it reads for the person who wants it.
  language: string;
  // The raw locale as stored (en-US, fr-FR, …) — shown in the tooltip.
  locale: string;
  // Public S3/CloudFront URL of the PDF, opened in the external browser.
  fileUrl: string;
}

/** One guide, with every language it exists in. */
export interface GuideEntry {
  key: string;
  title: string;
  // A single-line, shortened version of the guide's description.
  summary: string;
  variants: GuideVariant[];
}

// The public app host (same precedence as videosCatalog / faqCatalog).
const DOCS_BASE_URL = 'https://wxkanban.wxperts.com';

function appBase(): string {
  const env = process.env.WXKANBAN_DOCS_BASE_URL;
  return (typeof env === 'string' && env ? env : DOCS_BASE_URL).replace(/\/+$/, '');
}

interface GuideApiRow {
  id: string;
  assetkey: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  category: string;
  locale: string;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
  it: 'Italiano',
  pt: 'Português',
};

const langOf = (loc: string): string => (loc || '').toLowerCase().split(/[-_]/)[0];
const languageName = (loc: string): string => LANGUAGE_NAMES[langOf(loc)] ?? loc;

function shorten(s: string | null | undefined): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 99)}…` : oneLine;
}

/**
 * Group the flat API rows into one entry per guide, each carrying its languages.
 *
 * Rows are grouped by TITLE (case-insensitively), not by `assetkey`: the same
 * guide's translations have been filed under more than one assetkey in the asset
 * library, and grouping by key would render the identical title twice with the
 * languages split across the two rows. Title is what the reader is choosing by.
 *
 * Every language that exists is listed rather than auto-selecting the editor's —
 * only some guides are translated, so silently handing a German reader the
 * English PDF would hide that a German one is there. English sorts first, then
 * the rest alphabetically by language name.
 */
export function groupGuides(rows: GuideApiRow[]): GuideEntry[] {
  const byTitle = new Map<string, GuideEntry>();
  for (const r of rows) {
    if (!r.fileurl) continue;
    const key = (r.title || '').trim().toLowerCase();
    if (!key) continue;
    let entry = byTitle.get(key);
    if (!entry) {
      entry = { key, title: (r.title || '').trim(), summary: shorten(r.content), variants: [] };
      byTitle.set(key, entry);
    }
    // The first non-empty description wins — translated rows sometimes leave it null.
    if (!entry.summary) entry.summary = shorten(r.content);
    // Display the ENGLISH row's title. Rows arrive newest-first, so without this
    // the heading takes the casing of whichever translation was uploaded last
    // ("Windev/Webdev" from the Portuguese row rather than "WinDev/WebDev").
    if (langOf(r.locale) === 'en') entry.title = (r.title || '').trim();
    entry.variants.push({
      id: r.id,
      language: languageName(r.locale),
      locale: r.locale,
      fileUrl: r.fileurl,
    });
  }
  const entries = [...byTitle.values()];
  for (const e of entries) {
    e.variants.sort((a, b) => {
      const aEn = langOf(a.locale) === 'en';
      const bEn = langOf(b.locale) === 'en';
      if (aEn !== bEn) return aEn ? -1 : 1;
      return a.language.localeCompare(b.language);
    });
  }
  return entries.sort((a, b) => a.title.localeCompare(b.title));
}

/**
 * Load the published downloadable guides for the cockpit. Empty array on any
 * error (offline, non-2xx, malformed body) — the caller then omits the section.
 *
 * No `?locale=` is sent: the endpoint would then return only that language, and
 * the tree lists them all on purpose (see groupGuides).
 */
export async function loadGuideCatalog(fetchImpl: typeof fetch = fetch): Promise<GuideEntry[]> {
  const base = appBase();
  try {
    const res = await fetchImpl(`${base}/api/help/guides`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: GuideApiRow[] };
    return groupGuides(body.data ?? []);
  } catch {
    return [];
  }
}
// [SCOPE 066 / Guides] END
