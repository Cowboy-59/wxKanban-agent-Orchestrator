// [SCOPE 100 / T009] BEGIN — SysAdmin founder bio editor (FR-005, FR-006)
// MODIFIED-BY: T010 — added locale staleness strip + Translate action (FR-007/FR-008)
// MODIFIED-BY: T011 — added AI revision chat panel with accept/discard preview (FR-009)
// MODIFIED-BY: T014 — added draft/published status control with live/not-live messaging (US1)
// MODIFIED-BY: T015 — preview now renders through the same `marked` path /bio uses
// (FR-005 whole-branch review fix); uploadPhoto now propagates fileurl to the whole
// assetkey group via PATCH /bio/photo and surfaces a failed persist via alert()
// (FR-001 + upload-failure whole-branch review fixes)
// MODIFIED-BY: T017 — added the "Translation & AI provider" picker (FR-011): loads
// configured providers, persists the choice via PUT /bio/provider, governs Translate + Ask.
// English-only authoring surface for the `founder-bio` asset (see
// src/shared/bio/constants.ts). Saving is its own committed write via the existing
// generic asset PATCH/POST — there is no bespoke bio save route (see
// specs/Project-Scope/100-founder-bio-page.md API Routes). Translation (the other
// five locales) and the AI assistant chat are later tasks (T010/T011) and are
// deliberately not wired here; a translation failure must never roll back this save.
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import MDEditor, { type MDEditorProps } from "@uiw/react-md-editor";
import { marked } from "marked";
import { Button } from "../../../components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "../../../components/ui/Card";
import { MarketingHeader } from "./MarketingTabs";
import { BIO_ASSETKEY, BIO_TYPE, BIO_CATEGORY, BIO_SOURCE_LOCALE } from "../../../../shared/bio/constants";
import { localeState, anyStale, type LocaleState } from "../../../../shared/bio/staleness";
import { BIO_MARKDOWN_CLASS } from "../../../lib/bioMarkdown";

// @uiw/react-md-editor's package.json "exports" gives a single, unconditioned
// "types" entry (lib/index.d.ts) alongside separate "import"/"require" JS entries
// (esm|lib index.js) — a known dual-package hazard under TS's node16/nodenext
// module resolution. It causes the default import to type as the whole module
// namespace instead of the default export, so `<MDEditor .../>` fails TS2604/TS2786
// ("cannot be used as a JSX component") even though it renders correctly at runtime
// (Vite/esbuild resolve the same import fine). Re-typing the binding through the
// package's own exported `MDEditorProps` fixes the JSX typing without `any` or
// `@ts-ignore` and without touching the upstream package.
const MarkdownEditor = MDEditor as unknown as React.ComponentType<MDEditorProps>;

interface BioAsset {
  id: string;
  title: string;
  content: string | null;
  fileurl: string | null;
  locale: string;
  status: string;
  updatedat: string;
}

// Mirrors MarketingAIService.TRANSLATION_LOCALES (server-only module, not imported
// into the client bundle) — the 5 non-English targets the Translate action fans out to.
const NON_ENGLISH_LOCALES = ["fr-FR", "de-DE", "es-ES", "it-IT", "pt-BR"] as const;

// T017/FR-011: friendly labels for the provider ids the server returns. Unknown ids
// fall back to the raw id, so a newly-supported provider still renders without a client change.
const PROVIDER_LABELS: Record<string, string> = {
  groq: "Groq (Llama)",
  gemini: "Google Gemini",
  anthropic: "Anthropic (Claude)",
  "openai-compatible": "OpenAI-compatible",
};

// T015 (FR-005 whole-branch review fix): the editor's built-in preview renders via
// react-markdown's remark/rehype pipeline, while /bio (BioPage.tsx) renders the same
// content via `marked`. GFM tables, autolinks, and raw HTML render differently between
// the two, so an unwired preview shows the founder something other than what publishes.
// `components.preview` fully replaces MDEditor's built-in preview renderer (it bypasses
// `previewOptions` entirely — see @uiw/react-md-editor's Editor.factory.js), so mirroring
// BioPage.tsx's `marked.parse` call here is enough to make preview and publish agree.
// T012: uses the SAME BIO_MARKDOWN_CLASS as the public page (BioPage.tsx), not the
// old `prose`/`wmde-markdown` mix. `prose` was inert (no typography plugin) so the
// public page lost all paragraph spacing while this preview kept it via wmde-markdown
// — preview and publish disagreed. One shared class makes them identical.
const renderBioPreview = (source: string) => (
  <div
    className={`${BIO_MARKDOWN_CLASS} p-3`}
    dangerouslySetInnerHTML={{ __html: marked.parse(source) as string }}
  />
);

export default function Bio() {
  const navigate = useNavigate();
  const [asset, setAsset] = useState<BioAsset | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [uploadMsg, setUploadMsg] = useState("");
  const [locales, setLocales] = useState<BioAsset[]>([]);
  const [translating, setTranslating] = useState(false);
  const [instruction, setInstruction] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [asking, setAsking] = useState(false);
  const [statusBusy, setStatusBusy] = useState(false);
  // T017/FR-011: configured providers + the founder's current choice.
  const [providers, setProviders] = useState<string[]>([]);
  const [provider, setProvider] = useState<string>("");
  const [providerBusy, setProviderBusy] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/sysadmin/marketing/assets?assetkey=${BIO_ASSETKEY}&locale=${BIO_SOURCE_LOCALE}`,
        { credentials: "include" },
      );
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        navigate("/dashboard");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const row: BioAsset | null = (data.assets ?? [])[0] ?? null;
      setAsset(row);
      setTitle(row?.title ?? "");
      setContent(row?.content ?? "");
    } catch {
      /* leave prior state on transient failure */
    } finally {
      setLoading(false);
    }
  }, [navigate]);

  // T010: every locale row (en-US + the 5 translations), used to derive the
  // staleness strip. Not locale-scoped — the admin assets GET returns all rows
  // for an assetkey when no `locale` query param is given (marketingAdmin.ts:308).
  const loadLocales = useCallback(async () => {
    try {
      const res = await fetch(`/api/sysadmin/marketing/assets?assetkey=${BIO_ASSETKEY}`, {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      setLocales((data.assets ?? []) as BioAsset[]);
    } catch {
      /* leave prior state on transient failure */
    }
  }, []);

  // T017/FR-011: the providers the founder can pick from (configured keys only) and
  // the current selection. Read-only load; the choice is written by changeProvider.
  const loadProviders = useCallback(async () => {
    try {
      const res = await fetch("/api/sysadmin/marketing/bio/providers", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      setProviders((data.available ?? []) as string[]);
      if (typeof data.selected === "string") setProvider(data.selected);
    } catch {
      /* leave prior state on transient failure */
    }
  }, []);

  useEffect(() => {
    void load();
    void loadLocales();
    void loadProviders();
  }, [load, loadLocales, loadProviders]);

  // T010: fan out the saved English bio to the 5 other locales (FR-007). Saving
  // alone spends no LLM calls — this is the only action that does.
  const translate = async (): Promise<void> => {
    setTranslating(true);
    try {
      const res = await fetch("/api/sysadmin/marketing/bio/translate", {
        method: "POST",
        credentials: "include",
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        navigate("/dashboard");
        return;
      }
      if (res.status === 429) {
        // Matches AIStudio.tsx's aiPost 429 handling — the user sees a "slow down"
        // message, not a silent failure or an error page.
        alert("Too many requests — give it a few seconds.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      const results = (data.results ?? []) as Array<{ locale: string; ok: boolean }>;
      const failed = results.filter((r) => !r.ok).map((r) => r.locale);
      if (failed.length) {
        alert(`Translation failed for: ${failed.join(", ")} — previous text kept.`);
      } else if (!results.length) {
        alert(data.error || "Translation failed — please try again.");
      }
      await loadLocales();
    } catch {
      alert("Translation failed — please try again.");
    } finally {
      setTranslating(false);
    }
  };

  // T011: ask the AI assistant to revise the bio per a free-text instruction
  // (e.g. "make this warmer"). Mirrors translate()'s 401/403/429 handling exactly.
  // FR-009 / US7: the result ALWAYS lands in `draft` for preview — setContent is
  // only ever called from the explicit Accept button below, so a model error, a
  // 429, or a Discard all leave the editor's content untouched.
  const ask = async (): Promise<void> => {
    if (!instruction.trim()) return;
    setAsking(true);
    try {
      const res = await fetch("/api/sysadmin/marketing/ai/bio", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ current: content, instruction: instruction.trim() }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        navigate("/dashboard");
        return;
      }
      if (res.status === 429) {
        alert("Too many requests — give it a few seconds.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!data.ok || typeof data.draft !== "string") {
        alert(data.error || "The assistant could not produce a draft. Your text is unchanged.");
        return;
      }
      setDraft(data.draft);
    } catch {
      alert("The assistant could not produce a draft. Your text is unchanged.");
    } finally {
      setAsking(false);
    }
  };

  // FR-005: saving English is its own committed write — it succeeds or fails on its
  // own and is never rolled back by a translation failure (Translate is T010's button).
  const save = async () => {
    if (!title.trim()) {
      alert("Title is required.");
      return;
    }
    setBusy(true);
    try {
      const body = JSON.stringify({
        assetkey: BIO_ASSETKEY,
        locale: BIO_SOURCE_LOCALE,
        type: BIO_TYPE,
        category: BIO_CATEGORY,
        title: title.trim(),
        content,
      });
      const url = asset
        ? `/api/sysadmin/marketing/assets/${asset.id}`
        : "/api/sysadmin/marketing/assets";
      const res = await fetch(url, {
        method: asset ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Save failed");
        return;
      }
      await load();
    } catch {
      alert("Save failed");
    } finally {
      setBusy(false);
    }
  };

  // T014/US1: flip the en-US row between draft and published. This is the switch that
  // decides whether /bio is live or silently redirects to /about (see BioPage.tsx), so
  // it PATCHes status on its own the moment the founder picks it — it does not wait for
  // "Save English" and does not touch title/content. Mirrors uploadPhoto's single-field
  // PATCH below, and the same 401/403/429 handling as translate()/ask().
  const setBioStatus = async (status: "draft" | "published"): Promise<void> => {
    if (!asset) return;
    setStatusBusy(true);
    try {
      const res = await fetch(`/api/sysadmin/marketing/assets/${asset.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ status }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        navigate("/dashboard");
        return;
      }
      if (res.status === 429) {
        alert("Too many requests — give it a few seconds.");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.error || "Status change failed");
        return;
      }
      await load();
    } catch {
      alert("Status change failed");
    } finally {
      setStatusBusy(false);
    }
  };

  // T017/FR-011: persist the founder's provider choice the moment they pick it, mirroring
  // setBioStatus's immediate single-field write. Optimistic — reflect the pick at once and
  // revert on failure so the control never shows a choice the server didn't accept.
  const changeProvider = async (next: string): Promise<void> => {
    if (!next || next === provider) return;
    const prev = provider;
    setProvider(next);
    setProviderBusy(true);
    try {
      const res = await fetch("/api/sysadmin/marketing/bio/provider", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ provider: next }),
      });
      if (res.status === 401) {
        navigate("/login");
        return;
      }
      if (res.status === 403) {
        navigate("/dashboard");
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.ok) {
        setProvider(prev);
        alert(data.error || "Could not save the provider choice.");
      }
    } catch {
      setProvider(prev);
      alert("Could not save the provider choice.");
    } finally {
      setProviderBusy(false);
    }
  };

  // FR-006: presign -> PUT direct to S3 -> PATCH fileurl. Bytes never transit the API,
  // mirroring the proven three-step flow at Assets.tsx:139-169.
  const uploadPhoto = async (file: File) => {
    if (!asset) {
      alert("Save the bio once before uploading a portrait.");
      return;
    }
    setBusy(true);
    setUploadMsg("Requesting upload URL…");
    try {
      const presign = await fetch("/api/sysadmin/marketing/bio/photo/upload-url", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type,
          contentLength: file.size,
        }),
      });
      const pdata = await presign.json().catch(() => ({}));
      if (!presign.ok) {
        setUploadMsg(pdata.error || "Could not get an upload URL.");
        return;
      }
      setUploadMsg("Uploading to storage…");
      const put = await fetch(pdata.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: file,
      });
      if (!put.ok) {
        setUploadMsg("Upload failed; the existing portrait is unchanged.");
        return;
      }
      // T015 (FR-001 whole-branch review fix): propagate fileurl to the whole
      // assetkey group (en-US + all translated locale rows) in one write, instead of
      // PATCHing only the en-US row — otherwise a portrait uploaded after a Translate
      // press leaves the 5 locale rows pointing at a stale or null fileurl until the
      // founder spends more paid LLM calls re-translating just to refresh a URL.
      const apply = await fetch("/api/sysadmin/marketing/bio/photo", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ fileurl: pdata.publicUrl }),
      });
      if (!apply.ok) {
        // T015: the persist step was previously unchecked, so a failure here still
        // showed "Uploaded ✓" even though the portrait never made it onto any row.
        const adata = await apply.json().catch(() => ({}));
        setUploadMsg("Upload failed; the existing portrait is unchanged.");
        alert(adata.error || "The image uploaded, but could not be attached to the bio. Please try again.");
        return;
      }
      setUploadMsg("Uploaded ✓");
      await Promise.all([load(), loadLocales()]);
    } catch {
      setUploadMsg("Upload failed.");
    } finally {
      setBusy(false);
    }
  };

  // FR-005 requires the editor's `data-color-mode` to be "driven by the app's
  // existing theme so it is not permanently light inside a dark dashboard." Every
  // sibling SysAdmin Marketing tab (Assets.tsx, FeatureSnippets.tsx, AIStudio.tsx,
  // MarketingTabs.tsx) hardcodes a dark palette (bg-slate-900/bg-slate-800, text-white)
  // with zero Tailwind `dark:` variants — this whole area does not itself react to the
  // app-wide light/dark toggle (ThemeProvider/useTheme), unlike e.g. Dashboard/Header.tsx.
  // Reading `useTheme()` reactively here would therefore desync the editor from the page
  // around it: toggling the app to light leaves this page's own chrome dark (per that
  // unchanged convention) while the editor box flipped light — the opposite of what
  // FR-005 is actually asking for. A one-shot `document.documentElement.classList`
  // read (the sketch's approach) is equally wrong, just wrong in a different way: it
  // still ties the editor to a toggle this page ignores, and never re-renders on change.
  // Hardcoding "dark" matches what this page, and every sibling tab, actually renders
  // in every theme state — the correct reading of "not permanently light inside a dark
  // dashboard" given how the dashboard is actually built today.
  return (
    <div className="min-h-screen bg-slate-900 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        <MarketingHeader title="Marketing — Bio" onRefresh={() => void load()} />

        <Card className="bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white text-base">Founder bio (English)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading ? (
              <div className="text-slate-400 text-sm">Loading…</div>
            ) : (
              <>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Bio title"
                  className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                />

                {/* T014/US1: status control. The founder writes a bio and saves it, but
                    new rows default to status "draft" server-side and /bio only serves
                    "published" rows (BioPage.tsx) — a draft bio silently redirects
                    visitors to /about. This makes that consequence explicit instead of
                    leaving publishing to a hunt through the general Assets page. */}
                {asset ? (
                  <div
                    className={`flex flex-wrap items-center gap-3 rounded border p-3 text-sm ${
                      asset.status === "published"
                        ? "border-emerald-700 bg-emerald-900/20"
                        : "border-amber-700 bg-amber-900/20"
                    }`}
                  >
                    <span
                      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                        asset.status === "published"
                          ? "bg-emerald-600/30 text-emerald-300"
                          : "bg-amber-600/30 text-amber-300"
                      }`}
                    >
                      {asset.status === "published" ? "Live" : "Draft"}
                    </span>
                    <span className="text-slate-300">
                      {asset.status === "published"
                        ? "Published — this is what visitors see at /bio."
                        : "Not live — visitors to /bio are redirected to /about until you publish."}
                    </span>
                    <select
                      value={asset.status === "published" ? "published" : "draft"}
                      disabled={statusBusy}
                      onChange={(e) => void setBioStatus(e.target.value as "draft" | "published")}
                      className="ml-auto bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                    >
                      <option value="draft">Draft</option>
                      <option value="published">Published</option>
                    </select>
                    {statusBusy && <span className="text-xs text-slate-400">Updating…</span>}
                  </div>
                ) : (
                  <div className="text-xs text-amber-400">Save the bio once below to enable publishing.</div>
                )}

                <div className="flex items-center gap-3">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void uploadPhoto(f);
                    }}
                    className="text-sm text-slate-300"
                  />
                  {asset?.fileurl && (
                    <img
                      src={asset.fileurl}
                      alt="Founder portrait"
                      className="h-16 w-16 rounded object-cover"
                    />
                  )}
                  {uploadMsg && <span className="text-xs text-slate-400">{uploadMsg}</span>}
                </div>

                <div data-color-mode="dark">
                  <MarkdownEditor
                    value={content}
                    onChange={(v) => setContent(v ?? "")}
                    height={480}
                    components={{ preview: (source) => renderBioPreview(source) }}
                  />
                </div>

                <Button
                  disabled={busy || !title.trim()}
                  onClick={() => void save()}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
                >
                  {busy ? "Saving…" : "Save English"}
                </Button>

                {/* T011: AI revision chat. FR-009/US7 — a revision NEVER silently
                    overwrites the editor: it lands here as a preview the founder
                    must explicitly Accept or Discard. */}
                <div className="space-y-2 rounded border border-slate-700 p-3">
                  <div className="text-xs text-slate-400">Ask the assistant to revise this bio</div>
                  <input
                    value={instruction}
                    onChange={(e) => setInstruction(e.target.value)}
                    placeholder="e.g. make this warmer, tighten to 200 words"
                    className="w-full bg-slate-900 border border-slate-700 rounded px-3 py-2 text-sm text-white"
                  />
                  <Button
                    disabled={asking || busy || !instruction.trim()}
                    onClick={() => void ask()}
                    className="bg-slate-600 hover:bg-slate-500 text-white text-sm"
                  >
                    {asking ? "Thinking…" : "Ask the assistant"}
                  </Button>

                  {draft !== null && (
                    <div className="space-y-2">
                      <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded bg-slate-950 p-3 text-xs text-slate-200">
                        {draft}
                      </pre>
                      <div className="flex gap-2">
                        <Button
                          onClick={() => {
                            setContent(draft);
                            setDraft(null);
                          }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm"
                        >
                          Accept
                        </Button>
                        <Button
                          variant="outline"
                          onClick={() => setDraft(null)}
                          className="border-slate-600 text-slate-200 text-sm"
                        >
                          Discard
                        </Button>
                      </div>
                    </div>
                  )}
                </div>

                {/* T010: staleness strip + explicit Translate action (FR-007/FR-008).
                    Mirrors the FeatureSnippets.tsx idiom — state derived from
                    updatedat, no flag column. localeStates/needsStale feed both the
                    per-locale strip and the Translate button's own stale badge, so
                    the two never disagree. */}
                {(() => {
                  const src = locales.find((a) => a.locale === BIO_SOURCE_LOCALE);
                  const localeStates: Record<string, LocaleState> = Object.fromEntries(
                    NON_ENGLISH_LOCALES.map((loc) => {
                      const row = locales.find((a) => a.locale === loc);
                      const state = src
                        ? localeState(
                            new Date(src.updatedat),
                            row ? { updatedat: new Date(row.updatedat) } : undefined,
                          )
                        : "untranslated";
                      return [loc, state];
                    }),
                  );
                  const needsTranslate = anyStale(localeStates);
                  return (
                    <div className="flex flex-wrap items-center gap-4 pt-2 border-t border-slate-700">
                      {/* T017/FR-011: provider picker. Governs both Translate (below) and
                          the Ask-the-assistant revision above — the server reads the saved
                          choice, so neither action sends a provider in its body. */}
                      <label className="flex items-center gap-2 text-sm text-slate-300">
                        <span className="text-slate-400">Translation &amp; AI provider</span>
                        <select
                          value={provider}
                          disabled={providerBusy || translating || providers.length === 0}
                          onChange={(e) => void changeProvider(e.target.value)}
                          className="bg-slate-900 border border-slate-700 rounded px-3 py-1.5 text-sm text-white"
                        >
                          {providers.length === 0 && <option value="">Loading…</option>}
                          {provider && !providers.includes(provider) && (
                            <option value={provider}>{PROVIDER_LABELS[provider] ?? provider}</option>
                          )}
                          {providers.map((p) => (
                            <option key={p} value={p}>
                              {PROVIDER_LABELS[p] ?? p}
                            </option>
                          ))}
                        </select>
                        {providerBusy && <span className="text-xs text-slate-400">Saving…</span>}
                      </label>

                      <div className="flex gap-3 text-sm">
                        {NON_ENGLISH_LOCALES.map((loc) => {
                          const state = localeStates[loc];
                          return (
                            <span
                              key={loc}
                              className={state === "current" ? "text-slate-300" : "text-amber-400"}
                            >
                              {loc}
                              {state === "current" ? "" : ` — ${state}`}
                            </span>
                          );
                        })}
                      </div>

                      <Button
                        disabled={translating || busy}
                        onClick={() => void translate()}
                        title={needsTranslate ? "One or more locales are stale or untranslated." : undefined}
                        className="bg-slate-600 hover:bg-slate-500 text-white text-sm"
                      >
                        {translating ? "Translating…" : "Translate"}
                        {!translating && needsTranslate && (
                          <span
                            aria-hidden="true"
                            className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-400 align-middle"
                          />
                        )}
                      </Button>
                    </div>
                  );
                })()}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
// [SCOPE 100 / T009] END
