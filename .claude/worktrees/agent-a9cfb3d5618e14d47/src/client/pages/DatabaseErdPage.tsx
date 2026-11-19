import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, RefreshCw, Database, Download } from "lucide-react";
import { marked, type Tokens } from "marked";
import mermaid from "mermaid";

// [SCOPE 021 / T017] BEGIN — Database ER Diagram viewer (inline Mermaid SVG)
/**
 * Renders the platform-wide ER diagram inline as Mermaid SVG. The PDF endpoint is kept
 * for explicit download/print, but browsers force-download application/pdf even inside an
 * iframe, so the on-screen view uses the stored markdown rendered to SVG instead.
 */
let mermaidInitialized = false;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function DatabaseErdPage() {
  const navigate = useNavigate();
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/database/erdiagram/markdown", { credentials: "include" });
      if (res.status === 404) {
        setHtml("");
        setError("Not generated yet — click Regenerate to build it.");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load diagram (${res.status})`);
      const { markdown } = (await res.json()) as { markdown: string };

      const renderer = new marked.Renderer();
      renderer.code = ({ text, lang }: Tokens.Code): string =>
        (lang ?? "").trim() === "mermaid"
          ? `<div class="mermaid">${escapeHtml(text)}</div>`
          : `<pre class="erd-pre"><code>${escapeHtml(text)}</code></pre>`;
      setHtml(marked.parse(markdown, { renderer, async: false }) as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load diagram");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Render the mermaid blocks to SVG whenever the markup changes.
  useEffect(() => {
    if (!html || !containerRef.current) return;
    if (!mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      mermaidInitialized = true;
    }
    const nodes = Array.from(
      containerRef.current.querySelectorAll<HTMLElement>(".mermaid"),
    );
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const src = (el.textContent ?? "").trim();
        try {
          const { svg } = await mermaid.render(`erd-mmd-${Date.now()}-${i}`, src);
          if (!cancelled) el.innerHTML = svg;
        } catch {
          if (!cancelled) {
            el.innerHTML =
              `<div style="color:#b45309;font-size:13px;margin-bottom:6px">This diagram couldn't be rendered (invalid Mermaid). Raw source:</div>` +
              `<pre style="white-space:pre-wrap;font-size:12px;background:#f8fafc;border:1px solid #e2e8f0;padding:8px;border-radius:6px;overflow:auto">${escapeHtml(src)}</pre>`;
          }
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [html]);

  // Download the PDF in-place (blob) so this viewer page stays up — no blank tab.
  async function downloadPdf() {
    try {
      const res = await fetch("/api/admin/database/erdiagram", { credentials: "include" });
      if (!res.ok) throw new Error(`PDF failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "database-erdiagram.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "PDF download failed");
    }
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      const res = await fetch("/api/admin/database/erdiagram/regenerate", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Regenerate failed (${res.status})`);
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Regenerate failed");
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900">
      <style>{`
        .erd-content h1 { font-size: 1.5rem; font-weight: 700; margin: 0 0 .5rem; }
        .erd-content h2 { font-size: 1.15rem; font-weight: 700; margin: 1.5rem 0 .5rem; padding-bottom: .25rem; border-bottom: 1px solid #e2e8f0; }
        .erd-content table { border-collapse: collapse; margin: .5rem 0 1rem; }
        .erd-content th, .erd-content td { border: 1px solid #e2e8f0; padding: 4px 10px; font-size: .85rem; text-align: left; }
        .erd-content th { background: #f1f5f9; }
        .erd-content .mermaid { margin: 12px 0 24px; overflow-x: auto; }
        .erd-content .mermaid svg { max-width: none; }
      `}</style>
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shrink-0">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="text-slate-500 hover:text-indigo-600 dark:text-slate-400 dark:hover:text-indigo-400"
            title="Back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <Database className="w-5 h-5 text-indigo-500" />
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            Database Entity-Relationship Diagram
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={downloadPdf}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-indigo-300"
          >
            <Download className="w-4 h-4" />
            PDF
          </button>
          <button
            type="button"
            onClick={handleRegenerate}
            disabled={regenerating}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-indigo-300 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${regenerating ? "animate-spin" : ""}`} />
            {regenerating ? "Regenerating…" : "Regenerate"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-slate-500 dark:text-slate-400">Loading diagram…</p>
        ) : error ? (
          <p className="text-amber-700 dark:text-amber-400">{error}</p>
        ) : (
          <div
            ref={containerRef}
            className="erd-content bg-white rounded-lg border border-slate-200 p-6 text-slate-900"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
// [SCOPE 021 / T017] END
