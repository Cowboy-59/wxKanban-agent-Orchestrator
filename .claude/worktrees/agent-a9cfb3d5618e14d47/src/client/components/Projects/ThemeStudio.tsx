// Theme Studio (FR-001/002) — the dedicated theme surface, reused at project
// creation and on the project Theme tab (the StackEditor pattern). Left: a source
// switcher keyed to the app type — Presets / Inspiration + AI / Build-your-own /
// From a website (SCOPE-106) / Header & Footer chrome (SCOPE-106).
// Right: live preview + WCAG contrast badges + company templates gallery.
import { useState, type ReactNode } from "react";
import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import ThemePreview from "./ThemePreview";
import ContrastBadges from "./ContrastBadges";
import ThemeManualPickers from "./ThemeManualPickers";
import TemplateGallery from "./TemplateGallery";
import { galleriesForAppType, type LookFeelGallery } from "../../../shared/lookfeel-galleries";
import {
  presetsForAppType,
  hslTripletToHex,
  type ProjectTheme,
  type ThemePreset,
  type AppType,
} from "../../../shared/theme-tokens";
import { DEFAULT_BUSINESS_CHROME, type BusinessChrome } from "../../../shared/theme-template";
import type { NamedBlock } from "../../../shared/block-model";

// [SCOPE 108 / T006] the "chrome" (Header & Footer form) source is removed — header/footer
// are now designed in the Layout tab's Header & Footer Designer.
type SourceTab = "presets" | "inspiration" | "build" | "website" | "layout";

// [SCOPE 062 / T007] BEGIN — `ThemeStudio` component — three-source switcher, two contex…
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
// [SCOPE 062 / T007] END

export interface ThemeStudioProps {
  appType: AppType;
  value: ProjectTheme;
  onChange: (theme: ProjectTheme) => void;
  /** Optional controlled business chrome (SCOPE-106); falls back to internal state. */
  chrome?: BusinessChrome;
  onChromeChange?: (chrome: BusinessChrome) => void;
  /** SCOPE-107: the project's blocks, carried into a saved template (FR-009). */
  blocks?: NamedBlock[];
  /** Optional footer actions (project Theme tab supplies these; creation omits them). */
  onSaveProject?: () => void | Promise<void>;
  onExecute?: () => void | Promise<void>;
  onSaveCompany?: () => void | Promise<void>;
  isAdmin?: boolean;
  busy?: boolean;
  /** Hide the built-in Presets source (the Theme Studio page shows presets on its own rail). */
  showPresets?: boolean;
  /** Optional "Layout" tab content (the Block Composer) — shown full-width when its tab is active. */
  layoutSlot?: ReactNode;
}

// [SCOPE 062 / T007] BEGIN — `ThemeStudio` component — three-source switcher, two contex…
// MODIFIED-BY [SCOPE 106 / T011,T012,T015] — add "From a website" source, chrome editor, templates
export default function ThemeStudio({
  appType,
  value,
  onChange,
  chrome: chromeProp,
  onChromeChange,
  blocks,
  onSaveProject,
  onExecute,
  onSaveCompany,
  isAdmin,
  busy,
  showPresets = true,
  layoutSlot,
}: ThemeStudioProps) {
// [SCOPE 062 / T007] END
  const [tab, setTab] = useState<SourceTab>(showPresets ? "presets" : "inspiration");
  const [cited, setCited] = useState("");
  const [galleryKey, setGalleryKey] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [url, setUrl] = useState("");
  const [deriving, setDeriving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [internalChrome, setInternalChrome] = useState<BusinessChrome>(
    chromeProp ?? DEFAULT_BUSINESS_CHROME,
  );

  const chrome = chromeProp ?? internalChrome;
  // [SCOPE 108 / T006] WYSIWYG chrome editing stays in the preview (the form tab is gone).
  function updateChrome(patch: Partial<BusinessChrome>): void {
    const next = { ...chrome, ...patch };
    if (onChromeChange) onChromeChange(next);
    else setInternalChrome(next);
  }

  const presets = presetsForAppType(appType);
  const galleries = galleriesForAppType(appType);

  async function derive(path: string, body: Record<string, unknown>) {
    setDeriving(true);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/themes/derive/${path}`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ appType, ...body }),
      });
      const data = (await res.json()) as { theme?: ProjectTheme; error?: string; note?: string };
      if (!res.ok || !data.theme) throw new Error(data.error ?? "Derivation failed");
      onChange(data.theme);
      setNotice(data.note ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Derivation failed");
    } finally {
      setDeriving(false);
    }
  }

  const tabBtn = (id: SourceTab, label: string) => (
    <button
      type="button"
      onClick={() => setTab(id)}
      className={cn(
        "rounded-md px-3 py-1.5 text-sm font-medium",
        tab === id ? "bg-primary text-primary-foreground" : "hover:bg-accent hover:text-accent-foreground",
      )}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      {/* Menu — single line across the top */}
      <div className="flex flex-wrap gap-1 rounded-lg border border-border p-1">
        {showPresets && tabBtn("presets", "Presets")}
        {tabBtn("inspiration", "Inspiration + AI")}
        {tabBtn("build", "Build your own")}
        {tabBtn("website", "From a website")}
        {layoutSlot && tabBtn("layout", "Layout")}
      </div>

      {tab === "layout" && layoutSlot ? (
        <div>{layoutSlot}</div>
      ) : (
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Left — active source content */}
        <div className="space-y-4">

        {showPresets && tab === "presets" && (
          <div className="space-y-2">
            {presets.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No curated presets for {appType} yet — use Inspiration + AI or Build your own.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2">
                {presets.map((p: ThemePreset) => {
                  const selected = value.sourceRef === p.key;
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => onChange(p.theme)}
                      className={cn(
                        "rounded-lg border p-3 text-left transition-colors",
                        selected ? "border-primary ring-2 ring-ring" : "border-border hover:bg-accent",
                      )}
                    >
                      <div className="mb-2 flex gap-1">
                        {(["primary", "secondary", "accent", "muted"] as const).map((tk) => (
                          <span
                            key={tk}
                            className="h-5 w-5 rounded-full border border-border"
                            style={{ backgroundColor: hslTripletToHex(p.theme.light[tk]) }}
                          />
                        ))}
                      </div>
                      <p className="text-sm font-medium">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.description}</p>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {tab === "inspiration" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Open a gallery to browse real designs, select it, then cite a specific app/page —
              the AI derives a theme from your reference.
            </p>
            <div className="grid gap-2">
              {galleries.map((g: LookFeelGallery) => {
                const active = galleryKey === g.key;
                return (
                  <div
                    key={g.key}
                    className={cn(
                      "flex items-start justify-between gap-2 rounded-md border p-2 text-sm transition-colors",
                      active ? "border-primary ring-1 ring-ring" : "border-border",
                    )}
                  >
                    <label className="flex items-start gap-2">
                      <input
                        type="radio"
                        name="gallery"
                        checked={active}
                        onChange={() => setGalleryKey(g.key)}
                        className="mt-1"
                      />
                      <span>
                        <span className="font-medium">{g.name}</span>
                        <span className="block text-xs text-muted-foreground">{g.description}</span>
                      </span>
                    </label>
                    <a
                      href={g.url}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setGalleryKey(g.key)}
                      className="shrink-0 rounded-md border border-input px-2 py-1 text-xs font-medium hover:bg-accent hover:text-accent-foreground"
                      title={`Open ${g.name} in a new tab`}
                    >
                      Open ↗
                    </a>
                  </div>
                );
              })}
            </div>
            <input
              type="text"
              value={cited}
              onChange={(e) => setCited(e.target.value)}
              placeholder="Cited reference (app name or URL)"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              type="button"
              disabled={deriving || (!galleryKey && !cited)}
              onClick={() => derive("gallery", { galleryKey, cited: cited || null })}
            >
              {deriving ? "Deriving…" : "Derive theme from reference"}
            </Button>
          </div>
        )}

        {tab === "build" && (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" disabled={deriving} onClick={() => derive("logo", {})}>
                Derive from company logo
              </Button>
            </div>
            <div className="space-y-2">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder='Describe a look — e.g. "warm, calm, professional, high-contrast"'
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
              <Button
                type="button"
                variant="outline"
                disabled={deriving || !prompt.trim()}
                onClick={() => derive("prompt", { prompt })}
              >
                {deriving ? "Generating…" : "Generate from prompt"}
              </Button>
            </div>
            <ThemeManualPickers theme={value} onChange={onChange} />
          </div>
        )}

        {tab === "website" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Paste a website you like — we capture its colors and control look and map it onto
              your theme (your own header/footer stay yours — design them in the Layout tab).
            </p>
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <Button
              type="button"
              disabled={deriving || !url.trim()}
              onClick={() => {
                const u = url.trim();
                const normalized = /^https?:\/\//i.test(u) ? u : `https://${u}`;
                setUrl(normalized);
                void derive("url", { url: normalized });
              }}
            >
              {deriving ? "Reading site…" : "Borrow this look"}
            </Button>
          </div>
        )}

        {error && <p className="text-sm text-destructive">{error}</p>}
        {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      </div>

      {/* Right — preview + accessibility + templates */}
      <div className="space-y-4">
        <ThemePreview theme={value} chrome={chrome} onChromeChange={updateChrome} />
        <ContrastBadges theme={value} />
        {(onSaveProject || onExecute || onSaveCompany) && (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            {onExecute && (
              <Button type="button" variant="outline" disabled={busy} onClick={() => void onExecute()}>
                Execute (download)
              </Button>
            )}
            {onSaveProject && (
              <Button type="button" disabled={busy} onClick={() => void onSaveProject()}>
                Save to project
              </Button>
            )}
            {isAdmin && onSaveCompany && (
              <Button type="button" variant="secondary" disabled={busy} onClick={() => void onSaveCompany()}>
                Save as company theme
              </Button>
            )}
          </div>
        )}

        <div className="border-t border-border pt-3">
          <p className="mb-2 text-xs font-medium text-muted-foreground">Company templates</p>
          <TemplateGallery
            theme={value}
            chrome={chrome}
            blocks={blocks}
            isAdmin={isAdmin}
            onApply={(t: ProjectTheme, c: BusinessChrome) => {
              onChange(t);
              if (onChromeChange) onChromeChange(c);
              else setInternalChrome(c);
            }}
          />
        </div>
        </div>
      </div>
      )}
    </div>
  );
}
