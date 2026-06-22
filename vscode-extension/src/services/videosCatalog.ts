// [SCOPE 042 / Videos] BEGIN — DocVideo catalog for the Dev Cockpit "Help —
// Videos" section. Fetches the public landing-page docs index (Scope 044) and
// keeps only docs that carry a how-to video. Read-only and unauthenticated (the
// docs index is a public endpoint). All failures are swallowed so the section
// simply doesn't appear when offline or unreachable.
export interface DocVideo {
  slug: string;
  title: string;
  // A single-line, shortened version of the doc's summary.
  summary: string;
  // The public /docs/:slug page (embedded player + walkthrough) opened in the browser.
  pageUrl: string;
}

// The public Docs site host. Overridable for staging via WXKANBAN_DOCS_BASE_URL,
// mirroring the WXKANBAN_MCP_BASE_URL precedence used for the MCP endpoint.
const DOCS_BASE_URL = 'https://wxkanban.wxperts.com';

function docsBase(): string {
  const env = process.env.WXKANBAN_DOCS_BASE_URL;
  return (typeof env === 'string' && env ? env : DOCS_BASE_URL).replace(/\/+$/, '');
}

interface DocIndexEntry {
  slug: string;
  title: string;
  summary: string | null;
  videourl: string | null;
  posterurl: string | null;
}

// Collapse whitespace to one line and cap the length for the tree's description.
function shorten(s: string | null | undefined): string {
  if (!s) return '';
  const oneLine = s.replace(/\s+/g, ' ').trim();
  return oneLine.length > 100 ? `${oneLine.slice(0, 99)}…` : oneLine;
}

/**
 * Load the cockpit video catalog from the public docs index. Returns the docs
 * that have a video, shaped for the tree. Empty array on any error (offline,
 * non-2xx, malformed body) — the caller then omits the Videos section.
 */
export async function loadVideoCatalog(fetchImpl: typeof fetch = fetch): Promise<DocVideo[]> {
  const base = docsBase();
  try {
    const res = await fetchImpl(`${base}/api/help/docs`);
    if (!res.ok) return [];
    const body = (await res.json()) as { data?: DocIndexEntry[] };
    const docs = body.data ?? [];
    return docs
      .filter((d) => typeof d.videourl === 'string' && d.videourl.length > 0)
      .map((d) => ({
        slug: d.slug,
        title: d.title,
        summary: shorten(d.summary),
        pageUrl: `${base}/docs/${d.slug}`,
      }));
  } catch {
    return [];
  }
}
// [SCOPE 042 / Videos] END

// [SCOPE 066 / T008] BEGIN — categorized marketing videos (Open / Training)
interface MarketingVideoRow {
  id: string;
  title: string;
  fileurl: string | null;
  category: string;
  locale: string;
}

/** Open + Training marketing videos, shaped like DocVideo (pageUrl = the video URL). */
export interface MarketingVideoGroups {
  open: DocVideo[];
  training: DocVideo[];
}

/**
 * Load published marketingassets videos grouped by category for the cockpit's
 * Videos section (SCOPE-066 FR-011). Empty groups on any error — caller omits the
 * subtrees. Distinct from loadVideoCatalog (the docs how-to videos), which stays.
 */
export async function loadMarketingVideoCatalog(
  fetchImpl: typeof fetch = fetch,
): Promise<MarketingVideoGroups> {
  const base = docsBase();
  const empty: MarketingVideoGroups = { open: [], training: [] };
  try {
    const res = await fetchImpl(`${base}/api/help/marketing-videos`);
    if (!res.ok) return empty;
    const body = (await res.json()) as { data?: MarketingVideoRow[] };
    const rows = body.data ?? [];
    const groups: MarketingVideoGroups = { open: [], training: [] };
    for (const r of rows) {
      if (!r.fileurl) continue;
      const item: DocVideo = { slug: r.id, title: r.title, summary: '', pageUrl: r.fileurl };
      if (r.category === 'training') groups.training.push(item);
      else groups.open.push(item);
    }
    return groups;
  } catch {
    return empty;
  }
}
// [SCOPE 066 / T008] END
