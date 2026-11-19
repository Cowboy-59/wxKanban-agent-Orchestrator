import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, RefreshCw, Workflow, Download } from "lucide-react";
import { marked, type Tokens } from "marked";
import mermaid from "mermaid";

// [SCOPE 059 / T007] BEGIN — Per-scope Process Flow viewer (inline Mermaid SVG)
let mermaidInitialized = false;

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export default function ScopeProcessFlowPage() {
  const navigate = useNavigate();
  const { projectId = "", specId = "" } = useParams();
  const [html, setHtml] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/specs/${specId}/process-flow`,
        { credentials: "include" },
      );
      if (res.status === 404) {
        setHtml("");
        setError("No process flow yet for this scope. It builds from tasks automatically; use “Refresh AI flow” to add the AI-derived view.");
        return;
      }
      if (!res.ok) throw new Error(`Failed to load (${res.status})`);
      const { markdown } = (await res.json()) as { markdown: string };
      const renderer = new marked.Renderer();
      renderer.code = ({ text, lang }: Tokens.Code): string =>
        (lang ?? "").trim() === "mermaid"
          ? `<div class="mermaid">${escapeHtml(text)}</div>`
          : `<pre><code>${escapeHtml(text)}</code></pre>`;
      setHtml(marked.parse(markdown, { renderer, async: false }) as string);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load process flow");
    } finally {
      setLoading(false);
    }
  }, [projectId, specId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!html || !containerRef.current) return;
    if (!mermaidInitialized) {
      mermaid.initialize({ startOnLoad: false, theme: "default", securityLevel: "loose" });
      mermaidInitialized = true;
    }
    const nodes = Array.from(containerRef.current.querySelectorAll<HTMLElement>(".mermaid"));
    let cancelled = false;
    void (async () => {
      for (let i = 0; i < nodes.length; i++) {
        const el = nodes[i];
        const src = (el.textContent ?? "").trim();
        try {
          const { svg } = await mermaid.render(`pf-mmd-${Date.now()}-${i}`, src);
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

  // Download the PDF in-place (blob) so the SVG page stays up — no new tab, no navigation.
  async function downloadPdf() {
    try {
      const res = await fetch(
        `/api/projects/${projectId}/specs/${specId}/process-flow/pdf`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error(`PDF failed (${res.status})`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `process-flow-${specId}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "PDF download failed");
    }
  }

  async function refreshAi() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/specs/${specId}/process-flow/regenerate?part=ai`,
        { method: "POST", credentials: "include" },
      );
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || `Refresh failed (${res.status})`);
      }
      await load();
    } catch (err) {
      window.alert(err instanceof Error ? err.message : "Refresh failed");
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <div className="flex flex-col h-screen bg-slate-100 dark:bg-slate-900">
      <style>{`
        .pf-content h1 { font-size: 1.4rem; font-weight: 700; margin: 0 0 .5rem; }
        .pf-content h2 { font-size: 1.1rem; font-weight: 700; margin: 1.5rem 0 .5rem; padding-bottom: .25rem; border-bottom: 1px solid #e2e8f0; }
        .pf-content .mermaid { margin: 12px 0 24px; overflow-x: auto; }
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
          <Workflow className="w-5 h-5 text-indigo-500" />
          <h1 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Scope Process Flow</h1>
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
            onClick={refreshAi}
            disabled={refreshing}
            className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:border-indigo-300 disabled:opacity-60"
          >
            <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
            {refreshing ? "Refreshing…" : "Refresh AI flow"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <p className="text-slate-500 dark:text-slate-400">Loading…</p>
        ) : error ? (
          <div className="space-y-3">
            <p className="text-amber-700 dark:text-amber-400">{error}</p>
            <button
              type="button"
              onClick={refreshAi}
              disabled={refreshing}
              className="inline-flex items-center gap-2 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-600 disabled:opacity-60"
            >
              <RefreshCw className={`w-4 h-4 ${refreshing ? "animate-spin" : ""}`} />
              Build it now
            </button>
          </div>
        ) : (
          <div
            ref={containerRef}
            className="pf-content bg-white rounded-lg border border-slate-200 p-6 text-slate-900"
            dangerouslySetInnerHTML={{ __html: html }}
          />
        )}
      </div>
    </div>
  );
}
// [SCOPE 059 / T007] END
