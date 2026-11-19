import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AppShell } from "../components/layout/AppShell";
import { ArrowLeft, RefreshCw, AlertCircle, FileText } from "lucide-react";
import { useTranslation } from "~/client/i18n";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Block {
  type: "text";
  text: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBlocks(content: string): Block[] {
  return content.split("\n").map((line) => ({ type: "text", text: line }));
}

function MarkdownLine({ line }: { line: string }) {
  if (line.startsWith("### ")) {
    return (
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-200 mt-6 mb-1">
        {line.slice(4)}
      </h3>
    );
  }
  if (line.startsWith("## ")) {
    return (
      <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100 mt-8 mb-2 border-b border-slate-200 dark:border-slate-700 pb-1">
        {line.slice(3)}
      </h2>
    );
  }
  if (line.startsWith("# ")) {
    return (
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mt-4 mb-3">
        {line.slice(2)}
      </h1>
    );
  }
  if (line.startsWith("- ") || line.startsWith("* ")) {
    return (
      <li className="text-sm text-slate-700 dark:text-slate-300 ml-5 list-disc leading-relaxed">
        {line.slice(2)}
      </li>
    );
  }
  if (/^\d+\.\s/.test(line)) {
    return (
      <li className="text-sm text-slate-700 dark:text-slate-300 ml-5 list-decimal leading-relaxed">
        {line.replace(/^\d+\.\s/, "")}
      </li>
    );
  }
  if (line.trim() === "---" || line.trim() === "***") {
    return <hr className="border-slate-200 dark:border-slate-700 my-6" />;
  }
  if (line.trim() === "") {
    return <div className="h-2" />;
  }
  return (
    <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
      {line}
    </p>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function OverviewPage() {
  const { t } = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOverview = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/overview");
      if (!res.ok)
        throw new Error(t("overviewPage.loadFailed", { status: res.status }));
      const data = await res.json();
      setContent(data.content ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("overviewPage.unknownError"));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchOverview();
  }, []);

  const blocks = content !== null ? parseBlocks(content) : [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-4">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link
              to="/admin/dashboard"
              className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              {t("overviewPage.dashboard")}
            </Link>
            <span className="text-slate-300 dark:text-slate-600">/</span>
            <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-indigo-500" />
              {t("overviewPage.projectOverview")}
            </h2>
          </div>
          <button
            onClick={fetchOverview}
            disabled={loading}
            className="flex items-center gap-1.5 text-xs text-indigo-600 dark:text-indigo-400 hover:underline disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            {t("overviewPage.refresh")}
          </button>
        </div>

        {/* Content panel */}
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8">
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500" />
            </div>
          )}

          {error && !loading && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-700 dark:text-red-400">
                  {t("overviewPage.loadErrorTitle")}
                </p>
                <p className="text-xs text-red-600 dark:text-red-500 mt-0.5">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && content !== null && (
            <div className="space-y-1">
              {blocks.map((block, i) => (
                <MarkdownLine key={i} line={block.text} />
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
