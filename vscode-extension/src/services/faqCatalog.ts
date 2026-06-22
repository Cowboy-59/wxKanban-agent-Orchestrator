// [SCOPE 066 / T008] BEGIN — FAQ catalog for the Dev Cockpit "FAQ" section.
// Mirrors videosCatalog: fetches the public FAQ index (SCOPE-066 GET /api/help/faq),
// read-only and unauthenticated. All failures are swallowed so the section simply
// doesn't appear when offline or unreachable.
export interface FaqEntry {
  id: string;
  question: string;
  answer: string;
  videoUrl: string | null;
}

// The public app host (same precedence as videosCatalog's docs base).
const DOCS_BASE_URL = 'https://wxkanban.wxperts.com';

function appBase(): string {
  const env = process.env.WXKANBAN_DOCS_BASE_URL;
  return (typeof env === 'string' && env ? env : DOCS_BASE_URL).replace(/\/+$/, '');
}

interface FaqApiRow {
  id: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  locale: string;
}

/**
 * Load published product FAQs for the cockpit. Empty array on any error (offline,
 * non-2xx, malformed body) — the caller then omits the FAQ section.
 */
export async function loadFaqCatalog(fetchImpl: typeof fetch = fetch): Promise<FaqEntry[]> {
  const base = appBase();
  try {
    const res = await fetchImpl(`${base}/api/help/faq`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: FaqApiRow[] };
    const rows = body.data ?? [];
    return rows
      .filter((r) => typeof r.content === 'string' && r.content.trim().length > 0)
      .map((r) => ({
        id: r.id,
        question: r.title,
        answer: r.content as string,
        videoUrl: r.fileurl && r.fileurl.length > 0 ? r.fileurl : null,
      }));
  } catch {
    return [];
  }
}
// [SCOPE 066 / T008] END
