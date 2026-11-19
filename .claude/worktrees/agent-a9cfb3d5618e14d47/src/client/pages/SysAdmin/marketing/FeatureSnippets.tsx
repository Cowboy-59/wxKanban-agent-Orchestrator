// [SCOPE 096 / T007] Marketing Feature Snippets manager.
// Curate the customer-facing feature set that drives the landing billboard
// carousel: toggle each snippet on/off (controls the carousel), suppress in-flux
// ones, set per-snippet dwell + featured, edit the CTA link, review each locale's
// translation, and add a new snippet by drafting it from a Project-Scope doc.
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { MarketingHeader } from "./MarketingTabs";

interface Snippet {
  slug: string;
  assetkey: string;
  name: string;
  on: boolean;
  ctaUrl: string | null;
  dwellMs: number;
  enhanced: boolean;
  sortOrder: number;
  sourceScope: string | null;
}
interface Translation {
  locale: string;
  present: boolean;
  title: string | null;
  content: string | null;
  status: string | null;
}

export default function FeatureSnippets() {
  const navigate = useNavigate();
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Snippet | null>(null);
  const [translations, setTranslations] = useState<Translation[]>([]);
  const [locale, setLocale] = useState("en-US");
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [ctaDraft, setCtaDraft] = useState("");
  const [scopeId, setScopeId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/sysadmin/marketing/feature-snippets", {
        credentials: "include",
      });
      if (res.status === 401) return navigate("/login");
      if (res.status === 403) return navigate("/dashboard");
      const data = await res.json();
      setSnippets(data.snippets ?? []);
    } catch {
      /* non-fatal */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const patch = async (assetkey: string, body: Record<string, unknown>) => {
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sysadmin/marketing/feature-snippets/${encodeURIComponent(assetkey)}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify(body),
        },
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        alert(d.error || "Update failed");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  };

  const openDetail = async (s: Snippet) => {
    setSelected(s);
    setCtaDraft(s.ctaUrl ?? "");
    setLocale("en-US");
    setTranslations([]);
    try {
      const res = await fetch(
        `/api/sysadmin/marketing/feature-snippets/${encodeURIComponent(s.assetkey)}/translations`,
        { credentials: "include" },
      );
      const data = await res.json();
      const list: Translation[] = data.translations ?? [];
      setTranslations(list);
      const en = list.find((t) => t.locale === "en-US");
      setEditTitle(en?.title ?? "");
      setEditContent(en?.content ?? "");
    } catch {
      /* non-fatal */
    }
  };

  const onPickLocale = (loc: string) => {
    setLocale(loc);
    const t = translations.find((x) => x.locale === loc);
    setEditTitle(t?.title ?? "");
    setEditContent(t?.content ?? "");
  };

  const saveCopy = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/sysadmin/marketing/feature-snippets/${encodeURIComponent(selected.assetkey)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ locale, title: editTitle, content: editContent }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(d.error || "Save failed");
        return;
      }
      await openDetail(selected);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const addFromScope = async () => {
    const id = scopeId.trim();
    if (!id) return;
    setBusy(true);
    try {
      const res = await fetch(
        "/api/sysadmin/marketing/feature-snippets/from-scope",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ scopeId: id }),
        },
      );
      const d = await res.json().catch(() => ({}));
      if (!res.ok || d.ok === false) {
        alert(d.error || "Couldn't draft from that scope.");
        return;
      }
      setScopeId("");
      await load();
      alert(`Drafted "${d.draft?.name ?? d.slug}" (off, for review).`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Feature Snippets" onRefresh={() => void load()} />

        {/* Add from scope */}
        <div className="flex items-center gap-2">
          <input
            value={scopeId}
            onChange={(e) => setScopeId(e.target.value)}
            placeholder="Scope number (e.g. 096) — AI drafts a snippet"
            className="w-80 bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
          />
          <Button
            disabled={busy || !scopeId.trim()}
            onClick={() => void addFromScope()}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-9"
          >
            Add from scope
          </Button>
          <span className="text-xs text-slate-500">
            Drafts land off; you review, then toggle on.
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Snippet table */}
          <Card className="lg:col-span-2 bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white text-base">
                Feature Snippets {loading ? "" : `(${snippets.length})`}
              </CardTitle>
            </CardHeader>
            <CardContent className="overflow-x-auto">
              {loading ? (
                <div className="text-slate-400 text-sm">Loading…</div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-[11px] uppercase text-slate-500 border-b border-slate-700">
                      <th className="py-2 pr-2">On</th>
                      <th className="py-2 pr-2">#</th>
                      <th className="py-2 pr-2">Feature</th>
                      <th className="py-2 pr-2">CTA</th>
                      <th className="py-2 pr-2">Dwell</th>
                      <th className="py-2 pr-2">★</th>
                    </tr>
                  </thead>
                  <tbody>
                    {snippets.map((s) => (
                      <tr
                        key={s.assetkey}
                        className={`border-b border-slate-800 hover:bg-slate-800/40 cursor-pointer ${
                          selected?.assetkey === s.assetkey ? "bg-slate-700/40" : ""
                        }`}
                        onClick={() => void openDetail(s)}
                      >
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <button
                            disabled={busy}
                            onClick={() => void patch(s.assetkey, { on: !s.on })}
                            className={`px-2 py-0.5 rounded-full text-[10px] font-semibold ${
                              s.on
                                ? "bg-emerald-500/20 text-emerald-300"
                                : "bg-slate-600/40 text-slate-400"
                            }`}
                          >
                            {s.on ? "ON" : "off"}
                          </button>
                        </td>
                        <td className="py-2 pr-2 text-slate-400">{s.sortOrder}</td>
                        <td className="py-2 pr-2">
                          <div className="text-white">{s.name}</div>
                          <div className="text-[10px] text-slate-500">{s.slug}</div>
                        </td>
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          {s.ctaUrl ? (
                            <a
                              href={s.ctaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-indigo-400 hover:underline text-xs break-all"
                            >
                              {s.ctaUrl}
                            </a>
                          ) : (
                            <span className="text-slate-600 text-xs">none</span>
                          )}
                        </td>
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="number"
                            defaultValue={s.dwellMs}
                            min={1000}
                            max={60000}
                            step={500}
                            onBlur={(e) => {
                              const v = Number(e.target.value);
                              if (v !== s.dwellMs && v >= 1000)
                                void patch(s.assetkey, { dwellMs: v });
                            }}
                            className="w-20 bg-slate-900 border border-slate-700 rounded px-2 py-0.5 text-xs text-white"
                          />
                        </td>
                        <td className="py-2 pr-2" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={s.enhanced}
                            disabled={busy}
                            onChange={() => void patch(s.assetkey, { enhanced: !s.enhanced })}
                            className="accent-purple-500"
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardContent>
          </Card>

          {/* Detail: CTA + translations + edit copy */}
          <Card className="lg:col-span-1 bg-slate-800/50 border-slate-700">
            {!selected ? (
              <CardContent className="py-16 text-center text-slate-400">
                Select a snippet to edit its CTA and translations.
              </CardContent>
            ) : (
              <>
                <CardHeader>
                  <CardTitle className="text-white text-base">{selected.name}</CardTitle>
                  <div className="text-xs text-slate-400 mt-1">
                    {selected.slug}
                    {selected.sourceScope ? ` · from ${selected.sourceScope}` : ""}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  {/* CTA link */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">CTA link</div>
                    <div className="flex gap-2">
                      <input
                        value={ctaDraft}
                        onChange={(e) => setCtaDraft(e.target.value)}
                        placeholder="https://…"
                        className="flex-1 bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                      />
                      <Button
                        disabled={busy}
                        onClick={() =>
                          void patch(selected.assetkey, { ctaUrl: ctaDraft.trim() || null })
                        }
                        className="bg-slate-600 hover:bg-slate-500 text-white text-xs h-8"
                      >
                        Save
                      </Button>
                    </div>
                  </div>

                  {/* Language dropdown */}
                  <div>
                    <div className="text-xs uppercase text-slate-500 mb-1">Language</div>
                    <select
                      value={locale}
                      onChange={(e) => onPickLocale(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded px-3 py-1.5 text-sm text-slate-200"
                    >
                      {translations.map((t) => (
                        <option key={t.locale} value={t.locale}>
                          {t.locale}
                          {t.present ? "" : " — untranslated"}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Edit copy */}
                  <div className="space-y-2">
                    <input
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Title"
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                    />
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      placeholder="Copy (markdown)"
                      rows={7}
                      className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs text-slate-200 font-mono"
                    />
                    <Button
                      disabled={busy || !editTitle.trim()}
                      onClick={() => void saveCopy()}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs h-8"
                    >
                      Save {locale} copy
                    </Button>
                  </div>
                </CardContent>
              </>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}
