import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { marked } from "marked";
import { StaticPageLayout } from "../components/StaticPageLayout";
import { useTranslation } from "../i18n";
import { BIO_MARKDOWN_CLASS } from "../lib/bioMarkdown";

// [SCOPE 100 / T007] BEGIN — Public founder bio page (FR-004)
interface BioData {
  title: string;
  content: string;
  fileurl: string | null;
  locale: string;
}

/**
 * Public founder bio page. Consumes GET /api/bio?locale= (T006), which returns
 * the published bio for the active locale (or null when none is published).
 *
 * Per FR-004: the static marketing site carries a hard-coded Bio link that
 * cannot be conditionally hidden, so when no published bio exists this page
 * must absorb the no-content case by redirecting to /about — never a 404,
 * never a blank page.
 */
export default function BioPage() {
  const { t, locale } = useTranslation();
  const navigate = useNavigate();
  const [bio, setBio] = useState<BioData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const res = await fetch(`/api/bio?locale=${encodeURIComponent(locale)}`);
        const json = (await res.json()) as { success: boolean; data: BioData | null };
        if (cancelled) return;
        if (!json.data) {
          navigate("/about", { replace: true });
          return;
        }
        setBio(json.data);
      } catch {
        if (!cancelled) navigate("/about", { replace: true });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [locale, navigate]);

  if (loading) {
    return (
      <StaticPageLayout title={t("bioPage.title")}>
        <p className="text-muted-foreground">{t("bioPage.loading")}</p>
      </StaticPageLayout>
    );
  }
  if (!bio) return null;

  return (
    <StaticPageLayout title={bio.title}>
      {bio.fileurl && (
        <img
          src={bio.fileurl}
          alt={t("bioPage.photoAlt")}
          className="mb-6 w-40 rounded-lg sm:float-right sm:ml-8"
        />
      )}
      <div
        className={BIO_MARKDOWN_CLASS}
        dangerouslySetInnerHTML={{ __html: marked.parse(bio.content) as string }}
      />
    </StaticPageLayout>
  );
}
// [SCOPE 100 / T007] END
