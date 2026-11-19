// [SCOPE 075 / T8] BEGIN — Portfolio Analyzer tab: AI cross-project reuse search + report PDF.
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Search, Loader2, RefreshCw, Network, AlertCircle, Download } from "lucide-react";
import { MermaidBlock } from "~/client/components/MermaidBlock";

interface CapabilityMatch {
  owner: string;
  sourceRef: string;
  capabilityType: string;
  name: string;
  projectName: string;
  score: number;
}

export default function PortfolioAnalyzerTab({ projectId, isAdmin }: { projectId: string; isAdmin: boolean }) {
  // ── Cross-project reuse search ───────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [matches, setMatches] = useState<CapabilityMatch[] | null>(null);
  const [synthesis, setSynthesis] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);

  async function runSearch(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (!q) return;
    setSearching(true);
    setSearchError(null);
    try {
      const r = await fetch(`/api/projects/${projectId}/portfolio/search`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: q }),
      });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Search failed (${r.status})`);
      }
      const data = (await r.json()) as { matches: CapabilityMatch[]; synthesis: string | null };
      setMatches(data.matches);
      setSynthesis(data.synthesis);
    } catch (err) {
      setSearchError(err instanceof Error ? err.message : String(err));
      setMatches(null);
    } finally {
      setSearching(false);
    }
  }

  // ── Scope flow (073) — live in-browser Mermaid render. App Runner's managed runtime can't
  // launch Chromium (missing libnspr4.so), so the graph is rendered client-side; the doc is also
  // auto-rewritten on every scope/spec/task change, so a stored server PDF would go stale anyway.
  // A "Download PDF" button prints the rendered SVG to PDF via the browser (no server Chromium).
  const [flowStatus, setFlowStatus] = useState<"checking" | "available" | "none">("checking");
  const [flowChart, setFlowChart] = useState<string>("");
  const [flowWarnings, setFlowWarnings] = useState<string[]>([]);
  const flowRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let cancelled = false;
    setFlowStatus("checking");
    fetch(`/api/projects/${projectId}/scopeflow`, { credentials: "include" })
      .then(async (r) => {
        if (!r.ok) { if (!cancelled) setFlowStatus("none"); return; }
        const data = (await r.json()) as { markdown?: string };
        const md = data.markdown ?? "";
        const chart = md.match(/```mermaid\s*([\s\S]*?)```/)?.[1]?.trim() ?? "";
        const warnings = md
          .split(/\r?\n/)
          .filter((l) => /^\s*-\s+\*\*/.test(l))
          .map((l) => l.replace(/^\s*-\s+/, "").replace(/\*\*/g, "").replace(/`/g, "").trim());
        if (!cancelled) {
          setFlowChart(chart);
          setFlowWarnings(warnings);
          setFlowStatus(chart ? "available" : "none");
        }
      })
      .catch(() => { if (!cancelled) setFlowStatus("none"); });
    return () => { cancelled = true; };
  }, [projectId]);

  // Print the rendered Mermaid SVG (+ warnings) to PDF via a hidden iframe — the browser's
  // "Save as PDF" produces a vector PDF with no server-side Chromium.
  function downloadFlowPdf() {
    const svg = flowRef.current?.querySelector("svg");
    if (!svg) return;
    const esc = (s: string) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const warningsHtml = flowWarnings.length
      ? `<h2>Graph-health warnings (${flowWarnings.length}) — non-blocking</h2><ul>${flowWarnings
          .map((w) => `<li>${esc(w)}</li>`)
          .join("")}</ul>`
      : "";
    const doc = `<!doctype html><html><head><meta charset="utf-8" /><title>Scope Flow</title>
<style>
  @page { size: auto; margin: 14mm; }
  body { font-family: 'Inter', system-ui, -apple-system, sans-serif; color: #111827; }
  h1 { font-size: 18px; border-bottom: 2px solid #3b82f6; padding-bottom: 6px; }
  h2 { font-size: 13px; color: #b45309; margin-top: 22px; }
  ul { font-size: 12px; color: #374151; padding-left: 18px; }
  svg { width: 100%; height: auto; }
</style></head><body>
  <h1>Scope Flow</h1>
  <div>${svg.outerHTML}</div>
  ${warningsHtml}
</body></html>`;
    const iframe = document.createElement("iframe");
    iframe.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(iframe);
    const idoc = iframe.contentWindow?.document;
    if (!idoc) { iframe.remove(); return; }
    idoc.open();
    idoc.write(doc);
    idoc.close();
    const win = iframe.contentWindow;
    if (!win) { iframe.remove(); return; }
    win.onload = () => {
      win.focus();
      win.print();
      window.setTimeout(() => iframe.remove(), 1000);
    };
  }

  // ── Report PDF (mirrors LearningsWorkspace) ──────────────────────────────
  const [pdfStatus, setPdfStatus] = useState<"checking" | "available" | "not-generated" | "generating">("checking");
  const [genError, setGenError] = useState<string | null>(null);
  const [pdfKey, setPdfKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setPdfStatus("checking");
    fetch(`/api/projects/${projectId}/portfolio`, { method: "HEAD", credentials: "include" })
      .then((r) => { if (!cancelled) setPdfStatus(r.ok ? "available" : "not-generated"); })
      .catch(() => { if (!cancelled) setPdfStatus("not-generated"); });
    return () => { cancelled = true; };
  }, [projectId, pdfKey]);

  async function handleGenerate() {
    setGenError(null);
    setPdfStatus("generating");
    try {
      const r = await fetch(`/api/admin/projects/${projectId}/portfolio/regenerate`, { method: "POST", credentials: "include" });
      if (!r.ok) {
        const d = (await r.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? `Failed (${r.status})`);
      }
      setPdfKey((k) => k + 1);
    } catch (err) {
      setGenError(err instanceof Error ? err.message : String(err));
      setPdfStatus("not-generated");
    }
  }

  return (
    <div className="space-y-6">
      {/* AI cross-project reuse search */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 bg-gray-50/60 dark:bg-gray-800/40">
        <div className="flex items-center gap-2 mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">
          <Network className="w-4 h-4 text-indigo-500" />
          Has the company already built this?
        </div>
        <form onSubmit={runSearch} className="flex gap-2">
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Describe a capability, e.g. 'invoice generation' or 'dedupe bug reports'"
            className="flex-1 px-3 py-2 text-sm rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
          <button
            type="submit"
            disabled={searching || !query.trim()}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-md transition-colors"
          >
            {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            Search
          </button>
        </form>

        {searchError && (
          <div className="flex items-center gap-2 mt-3 text-xs text-red-600 dark:text-red-400">
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            {searchError}
          </div>
        )}

        {/* Results block under the question */}
        {matches !== null && (
          <div className="mt-3 space-y-2">
            {synthesis && (
              <p className="text-sm text-gray-700 dark:text-gray-300 italic">{synthesis}</p>
            )}
            {matches.length === 0 ? (
              <p className="text-sm text-gray-500 dark:text-gray-400">No matching capabilities found across your company's projects — this looks net-new.</p>
            ) : (
              <ul className="divide-y divide-gray-200 dark:divide-gray-700 rounded-md border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
                {matches.map((m, i) => (
                  <li key={`${m.projectName}-${m.owner}-${m.name}-${i}`} className="flex items-center justify-between px-3 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-gray-800 dark:text-gray-100">{m.name}</span>
                      <span className="ml-2 text-xs text-gray-400">{m.capabilityType}</span>
                      <div className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {m.owner} · {m.projectName}
                      </div>
                    </div>
                    <span className="ml-3 shrink-0 text-xs font-mono text-indigo-600 dark:text-indigo-400">
                      {(m.score * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Scope flow (073) — dependency graph, auto-maintained, rendered live in-browser */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Scope flow</span>
          {flowStatus === "available" && (
            <button
              type="button"
              onClick={downloadFlowPdf}
              className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline"
            >
              <Download className="w-3 h-3" /> Download PDF
            </button>
          )}
        </div>
        {flowStatus === "checking" && (
          <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        )}
        {flowStatus === "available" && (
          <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-3 bg-white dark:bg-gray-900">
            <div ref={flowRef} className="bg-white rounded-md p-2">
              <MermaidBlock chart={flowChart} />
            </div>
            {flowWarnings.length > 0 && (
              <div className="mt-3 border-t border-gray-100 dark:border-gray-800 pt-3">
                <div className="text-xs font-semibold text-amber-600 dark:text-amber-400 mb-1">
                  Graph-health warnings ({flowWarnings.length}) — non-blocking
                </div>
                <ul className="list-disc pl-5 space-y-0.5">
                  {flowWarnings.map((w, i) => (
                    <li key={i} className="text-xs text-gray-600 dark:text-gray-300">{w}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
        {flowStatus === "none" && (
          <div className="flex flex-col items-center justify-center py-12 text-center space-y-2 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <Network className="w-10 h-10 text-gray-300 dark:text-gray-600" />
            <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No scope flow yet</p>
            <p className="text-xs text-gray-400 dark:text-gray-500 max-w-sm">
              The dependency graph builds automatically as scopes capture their <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Depends On</code> / <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">Related Scopes</code> (on create_specs or saving a scope file).
            </p>
          </div>
        )}
      </div>

      {/* Portfolio analysis report */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-semibold text-gray-700 dark:text-gray-200">Portfolio analysis report</span>
          {pdfStatus === "available" && isAdmin && (
            <button type="button" onClick={handleGenerate} className="flex items-center gap-1.5 text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
              <RefreshCw className="w-3 h-3" /> Regenerate
            </button>
          )}
        </div>

        {pdfStatus === "checking" && (
          <div className="flex items-center justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-indigo-500" /></div>
        )}

        {pdfStatus === "available" && (
          <iframe
            key={pdfKey}
            src={`/api/projects/${projectId}/portfolio`}
            title="Portfolio Capability Analysis"
            className="w-full h-[calc(100vh-360px)] border border-gray-200 dark:border-gray-700 rounded"
          />
        )}

        {(pdfStatus === "not-generated" || pdfStatus === "generating") && (
          <div className="flex flex-col items-center justify-center py-16 text-center space-y-4 border border-dashed border-gray-300 dark:border-gray-700 rounded-lg">
            <Network className="w-12 h-12 text-gray-300 dark:text-gray-600" />
            <div>
              <p className="text-sm font-semibold text-gray-600 dark:text-gray-300">No portfolio report yet</p>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1 max-w-sm">
                The build/extend/share report is generated from the capability index across your company's projects.
                {isAdmin ? " Generate it below." : " An admin can generate it."}
              </p>
            </div>
            {genError && (
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                {genError}
              </div>
            )}
            {isAdmin && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={pdfStatus === "generating"}
                className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 rounded-lg transition-colors"
              >
                {pdfStatus === "generating" ? <><Loader2 className="w-4 h-4 animate-spin" /> Generating…</> : <><Network className="w-4 h-4" /> Generate Report</>}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
// [SCOPE 075 / T8] END
