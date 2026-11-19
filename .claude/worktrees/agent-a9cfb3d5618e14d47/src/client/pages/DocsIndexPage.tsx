import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, CalendarClock, ChevronDown, Download, HelpCircle, PlaySquare } from "lucide-react";
import { useTranslation } from "../i18n"; // [SCOPE 052]

// [SCOPE 044 / T004] BEGIN — DocsIndexPage (public /docs index)
interface DocSummary {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  posterurl: string | null;
  sortorder: number;
}

interface FaqEntry {
  id: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  locale: string;
}

interface SessionEntry {
  id: string;
  title: string;
  startsAt: string;
  timezone: string;
  description: string;
  registerUrl: string;
  locale: string;
}

type DocsSection = "faq" | "videos" | "sessions" | "guides";

// Downloadable guides, served from GET /api/help/guides as marketingassets rows
// (type='guide'). Locale variants of one guide share an `assetkey` and differ by
// `locale`; `category` groups guides into a titled section ('migrationguides' →
// "Migration Guides").
//
// Every language that actually exists is listed rather than auto-selecting the
// active locale: only some guides are translated, so a
// locale-with-English-fallback rule (what FAQ and sessions do) would quietly hand
// a German reader the English PDF with no hint that Spanish and French exist. The
// language filter below is opt-in for the same reason — it defaults to "all".
interface GuideAsset {
  id: string;
  assetkey: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  category: string;
  locale: string;
}

/** Section headings for guide categories. Unknown categories fall back to the raw value. */
const GUIDE_CATEGORY_LABELS: Record<string, string> = {
  migrationguides: "Migration Guides",
};

/** Language name in its own language, so it reads for the person who wants it. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  es: "Español",
  fr: "Français",
  de: "Deutsch",
  it: "Italiano",
  pt: "Português",
};

const langOf = (loc: string): string => (loc || "").toLowerCase().split(/[-_]/)[0];
const languageName = (loc: string): string => LANGUAGE_NAMES[langOf(loc)] ?? loc;

/**
 * Public, logged-out Help & Tutorials index. A left sidebar switches between two
 * sections: FAQ (published product Q&A from the public GET /api/help/faq) and
 * Videos (published docs — title + multi-line summary + optional poster thumbnail
 * in SysAdmin-defined order, each linking to its detail page). Reached from the
 * landing-page "Docs" menu.
 */
export default function DocsIndexPage() {
  const { t, locale } = useTranslation();
  const [section, setSection] = useState<DocsSection>("faq");

  // Videos
  const [docs, setDocs] = useState<DocSummary[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsError, setDocsError] = useState("");

  // FAQ
  const [faqs, setFaqs] = useState<FaqEntry[]>([]);
  const [faqLoading, setFaqLoading] = useState(true);
  const [faqError, setFaqError] = useState("");
  const [openFaqId, setOpenFaqId] = useState<string | null>(null);

  // Training sessions
  const [sessions, setSessions] = useState<SessionEntry[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [sessionsError, setSessionsError] = useState("");

  // Downloadable guides. Fetched without ?locale so the language filter can be
  // built from what actually exists; "" means show every language.
  const [guides, setGuides] = useState<GuideAsset[]>([]);
  const [guidesLoading, setGuidesLoading] = useState(true);
  const [guidesError, setGuidesError] = useState("");
  const [guideLang, setGuideLang] = useState("");

  useEffect(() => {
    fetch("/api/help/docs")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load docs");
        return res.json();
      })
      .then((body) => setDocs(body.data ?? []))
      .catch(() => setDocsError(t("docs.loadError")))
      .finally(() => setDocsLoading(false));
  }, [t]);

  useEffect(() => {
    // Forward the active language. GET /api/help/faq?locale= returns ONE row per FAQ
    // in that language, with a per-FAQ en-US fallback applied server-side. The endpoint
    // was deduped to one-row-per-FAQ (commit dafdc3cd), so the old client-side
    // `f.locale === locale` filter no longer works: without ?locale it returns only
    // en-US rows, and every non-English visitor fell back to English.
    fetch(`/api/help/faq?locale=${encodeURIComponent(locale)}`)
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load FAQ");
        return res.json();
      })
      .then((body) => {
        setFaqs(body.data ?? []);
      })
      .catch(() => setFaqError(t("docs.loadError")))
      .finally(() => setFaqLoading(false));
  }, [t, locale]);

  useEffect(() => {
    fetch("/api/help/training-sessions")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load sessions");
        return res.json();
      })
      .then((body) => {
        const all: SessionEntry[] = body.data ?? [];
        // Same locale-with-English-fallback rule as the FAQ section.
        let visible = all.filter((s) => s.locale === locale);
        if (visible.length === 0 && locale !== "en-US") {
          visible = all.filter((s) => s.locale === "en-US");
        }
        setSessions(visible);
      })
      .catch(() => setSessionsError(t("docs.loadError")))
      .finally(() => setSessionsLoading(false));
  }, [t, locale]);

  useEffect(() => {
    // No ?locale — the page needs every variant to build the language filter and to
    // show which translations exist. Server-side filtering is available via ?locale.
    fetch("/api/help/guides")
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load guides");
        return res.json();
      })
      .then((body) => setGuides(body.data ?? []))
      .catch(() => setGuidesError(t("docs.loadError")))
      .finally(() => setGuidesLoading(false));
  }, [t]);

  // Languages actually present across the guides, for the filter dropdown.
  const guideLanguages = [...new Set(guides.map((g) => langOf(g.locale)))].sort();

  // category -> assetkey -> the locale variants of that one guide.
  const visibleGuides = guideLang
    ? guides.filter((g) => langOf(g.locale) === guideLang)
    : guides;
  const guidesByCategory = new Map<string, Map<string, GuideAsset[]>>();
  for (const g of visibleGuides) {
    if (!guidesByCategory.has(g.category)) guidesByCategory.set(g.category, new Map());
    const byKey = guidesByCategory.get(g.category)!;
    if (!byKey.has(g.assetkey)) byKey.set(g.assetkey, []);
    byKey.get(g.assetkey)!.push(g);
  }

  // Format a session start time in the visitor's active language.
  const formatWhen = (iso: string): string => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    try {
      return new Intl.DateTimeFormat(locale, { dateStyle: "full", timeStyle: "short" }).format(d);
    } catch {
      return d.toLocaleString();
    }
  };

  const navItems: { key: DocsSection; label: string; icon: typeof HelpCircle }[] = [
    { key: "faq", label: t("docs.navFaq"), icon: HelpCircle },
    { key: "videos", label: t("docs.navVideos"), icon: PlaySquare },
    { key: "sessions", label: t("docs.navSessions"), icon: CalendarClock },
    { key: "guides", label: t("docs.navGuides"), icon: BookOpen },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold">{t("docs.title")}</h1>
          <Link to="/" className="text-sm text-blue-600 hover:underline dark:text-blue-300">
            {t("docs.backHome")}
          </Link>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col gap-8 md:flex-row">
        {/* Left section nav */}
        <nav className="md:w-56 md:flex-shrink-0">
          <ul className="flex gap-2 md:flex-col md:gap-1" aria-label={t("docs.sectionsLabel")}>
            {navItems.map((item) => {
              const active = section === item.key;
              const Icon = item.icon;
              return (
                <li key={item.key}>
                  <button
                    type="button"
                    onClick={() => setSection(item.key)}
                    aria-current={active ? "page" : undefined}
                    className={`flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        {/* Content */}
        <div className="min-w-0 flex-1">
          {section === "faq" && (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-xl font-semibold">{t("docs.faqHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("docs.faqSubtitle")}</p>

              <div className="mt-6">
                {faqLoading && <p className="text-muted-foreground">{t("docs.loading")}</p>}
                {faqError && <p className="text-red-600">{faqError}</p>}
                {!faqLoading && !faqError && faqs.length === 0 && (
                  <p className="text-muted-foreground">{t("docs.faqEmpty")}</p>
                )}

                <ul className="space-y-3">
                  {faqs.map((faq) => {
                    const open = openFaqId === faq.id;
                    return (
                      <li key={faq.id} className="rounded-xl border border-border">
                        <button
                          type="button"
                          onClick={() => setOpenFaqId(open ? null : faq.id)}
                          aria-expanded={open}
                          className="flex w-full items-center justify-between gap-2 p-4 text-left"
                        >
                          <span className="font-medium">{faq.title}</span>
                          <ChevronDown
                            className={`h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform ${
                              open ? "rotate-180" : ""
                            }`}
                          />
                        </button>
                        {open && (
                          <div className="space-y-3 px-4 pb-4">
                            {faq.content && (
                              <p className="whitespace-pre-line text-sm text-muted-foreground">
                                {faq.content}
                              </p>
                            )}
                            {faq.fileurl && (
                              <video
                                src={faq.fileurl}
                                controls
                                className="w-full rounded-lg border border-border"
                              />
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            </section>
          )}

          {section === "videos" && (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-xl font-semibold">{t("docs.videosHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("docs.videosSubtitle")}</p>

              <div className="mt-6">
                {docsLoading && <p className="text-muted-foreground">{t("docs.loading")}</p>}
                {docsError && <p className="text-red-600">{docsError}</p>}
                {!docsLoading && !docsError && docs.length === 0 && (
                  <p className="text-muted-foreground">{t("docs.videosEmpty")}</p>
                )}

                <ul className="space-y-4">
                  {docs.map((doc) => (
                    <li key={doc.id}>
                      <Link
                        to={`/docs/${doc.slug}`}
                        className="flex gap-4 rounded-xl border border-border p-4 transition-colors hover:bg-muted"
                      >
                        {doc.posterurl && (
                          <img
                            src={doc.posterurl}
                            alt=""
                            className="hidden sm:block h-24 w-40 flex-shrink-0 rounded-lg object-cover"
                          />
                        )}
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold">{doc.title}</h3>
                          {doc.summary && (
                            <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                              {doc.summary}
                            </p>
                          )}
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}

          {section === "sessions" && (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-xl font-semibold">{t("docs.sessionsHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("docs.sessionsSubtitle")}</p>

              <div className="mt-6">
                {sessionsLoading && <p className="text-muted-foreground">{t("docs.loading")}</p>}
                {sessionsError && <p className="text-red-600">{sessionsError}</p>}

                {!sessionsLoading && !sessionsError && sessions.length === 0 && (
                  <div className="rounded-xl border border-dashed border-border p-8 text-center">
                    <CalendarClock className="mx-auto h-8 w-8 text-muted-foreground" />
                    <p className="mt-3 text-sm font-medium">{t("docs.sessionsEmpty")}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{t("docs.sessionsRegister")}</p>
                    <a
                      href="mailto:admin@wxperts.com?subject=wxKanban%20Training"
                      className="mt-4 inline-flex items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                    >
                      {t("docs.sessionsCta")}
                    </a>
                  </div>
                )}

                <ul className="space-y-4">
                  {sessions.map((s) => (
                    <li key={s.id} className="rounded-xl border border-border p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h3 className="text-lg font-semibold">{s.title}</h3>
                          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
                            <CalendarClock className="h-4 w-4 flex-shrink-0" />
                            {formatWhen(s.startsAt)}
                            {s.timezone && <span>· {s.timezone}</span>}
                          </p>
                          {s.description && (
                            <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                              {s.description}
                            </p>
                          )}
                        </div>
                        {s.registerUrl && (
                          <a
                            href={s.registerUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex flex-shrink-0 items-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
                          >
                            {t("docs.sessionsJoin")}
                          </a>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          )}
          {section === "guides" && (
            <section className="rounded-2xl border border-border p-6">
              <h2 className="text-xl font-semibold">{t("docs.guidesHeading")}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{t("docs.guidesSubtitle")}</p>

              {guideLanguages.length > 1 && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  <label htmlFor="guide-lang" className="text-sm text-muted-foreground">
                    {t("docs.guidesLanguageLabel")}
                  </label>
                  <select
                    id="guide-lang"
                    value={guideLang}
                    onChange={(e) => setGuideLang(e.target.value)}
                    className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    <option value="">{t("docs.guidesLanguageAll")}</option>
                    {guideLanguages.map((lang) => (
                      <option key={lang} value={lang}>
                        {LANGUAGE_NAMES[lang] ?? lang}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {guidesLoading && (
                <p className="mt-6 text-sm text-muted-foreground">{t("docs.guidesLoading")}</p>
              )}
              {guidesError && <p className="mt-6 text-sm text-destructive">{guidesError}</p>}
              {!guidesLoading && !guidesError && visibleGuides.length === 0 && (
                <p className="mt-6 text-sm text-muted-foreground">{t("docs.guidesEmpty")}</p>
              )}

              {[...guidesByCategory.entries()].map(([category, byKey]) => (
                <div key={category} className="mt-6">
                  <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                    {GUIDE_CATEGORY_LABELS[category] ?? category}
                  </h3>

                  <div className="mt-3 space-y-4">
                    {[...byKey.entries()].map(([assetkey, variants]) => (
                      <div key={assetkey} className="rounded-xl border border-border p-4">
                        <h4 className="text-lg font-semibold">{variants[0].title}</h4>
                        {variants[0].content && (
                          <p className="mt-1 text-sm text-muted-foreground">
                            {variants[0].content}
                          </p>
                        )}

                        <ul className="mt-4 space-y-2">
                          {variants
                            .slice()
                            .sort((a, b) => languageName(a.locale).localeCompare(languageName(b.locale)))
                            .map((g) => (
                              <li key={g.id}>
                                <a
                                  href={g.fileurl ?? "#"}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted"
                                >
                                  <span className="flex items-center gap-2 font-medium">
                                    <Download className="h-4 w-4 flex-shrink-0 text-muted-foreground" />
                                    {languageName(g.locale)}
                                    <span className="text-xs font-normal text-muted-foreground">
                                      PDF
                                    </span>
                                  </span>
                                </a>
                              </li>
                            ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
// [SCOPE 044 / T004] END
