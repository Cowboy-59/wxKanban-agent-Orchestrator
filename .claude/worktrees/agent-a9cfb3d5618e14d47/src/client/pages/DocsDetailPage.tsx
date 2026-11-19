import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { marked } from "marked";
import { DocsVideoPlayer } from "../components/docs/DocsVideoPlayer";
import { useTranslation } from "../i18n"; // [SCOPE 052]

// [SCOPE 044 / T005] BEGIN — DocsDetailPage (public /docs/:slug)
interface DocDetail {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  content: string;
  videourl: string | null;
  posterurl: string | null;
}

/**
 * Public, logged-out Docs detail page. Renders the summary, the full
 * documentation text (markdown), then the how-to video embedded below. Unknown
 * or unpublished (draft) slugs return a not-found message — drafts never render.
 */
export default function DocsDetailPage() {
  const { t } = useTranslation();
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<DocDetail | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "notfound" | "error">("loading");

  useEffect(() => {
    setStatus("loading");
    fetch(`/api/help/docs/${slug}`)
      .then((res) => {
        if (res.status === 404) {
          setStatus("notfound");
          return null;
        }
        if (!res.ok) throw new Error("Failed");
        return res.json();
      })
      .then((body) => {
        if (body?.data) {
          setDoc(body.data);
          setStatus("ok");
        }
      })
      .catch(() => setStatus("error"));
  }, [slug]);

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <Link to="/docs" className="text-sm text-blue-600 hover:underline dark:text-blue-300">
            {t("docs.backAll")}
          </Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {status === "loading" && <p className="text-muted-foreground">{t("docs.loading")}</p>}
        {status === "error" && (
          <p className="text-red-600">{t("docs.detailError")}</p>
        )}
        {status === "notfound" && (
          <div>
            <h1 className="text-2xl font-bold">{t("docs.notFoundTitle")}</h1>
            <p className="mt-2 text-muted-foreground">
              {t("docs.notFoundBody")}
            </p>
          </div>
        )}
        {status === "ok" && doc && (
          <article>
            <h1 className="text-3xl font-bold">{doc.title}</h1>
            {doc.summary && (
              <p className="mt-3 whitespace-pre-line text-muted-foreground">{doc.summary}</p>
            )}
            <div
              className="prose prose-slate dark:prose-invert mt-6 max-w-none"
              dangerouslySetInnerHTML={{ __html: marked.parse(doc.content || "") as string }}
            />
            <DocsVideoPlayer
              videourl={doc.videourl}
              posterurl={doc.posterurl}
              title={doc.title}
            />
          </article>
        )}
      </main>
    </div>
  );
}
// [SCOPE 044 / T005] END
