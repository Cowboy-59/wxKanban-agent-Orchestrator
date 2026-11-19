// Project Theme tab (Theme Studio Phase 1) — a PICKER, not a builder. Lists the company
// theme profiles (themetemplates) and applies one to this project as a snapshot copy via
// POST /api/projects/:id/theme/apply-template. Building/editing profiles now lives on the
// top-level Theme Studio page (/themes). Keeps "Execute to code" for the applied theme.
import { useState, useEffect, useCallback } from "react";
import { cn } from "../../lib/utils";
// [SCOPE-114 Amendment A] the curated catalog, reused here in "project" mode.
import DesignSystemCatalog from "../Themes/DesignSystemCatalog";
import { Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  WXKANBAN_DEFAULT_THEME,
  hslTripletToHex,
  type ProjectTheme,
  type AppType,
} from "../../../shared/theme-tokens";
import { DEFAULT_BUSINESS_CHROME, type BusinessChrome } from "../../../shared/theme-template";
import type { NamedBlock } from "../../../shared/block-model";

const APP_TYPES: AppType[] = ["web", "desktop", "mobile"];

function authHeaders(json = false): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return {
    ...(json ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

interface ThemeProfile {
  id: string;
  name: string;
  theme: ProjectTheme;
  chrome: BusinessChrome;
  blocks: NamedBlock[] | null;
  updatedat: string;
}

function Swatches({ theme, size = "h-5 w-5" }: { theme: ProjectTheme; size?: string }) {
  const t = theme.light;
  return (
    <div className="flex gap-1">
      {[t.background, t.primary, t.accent, t.foreground].map((hsl, i) => (
        <span key={i} className={`${size} rounded-sm border border-border`} style={{ background: hslTripletToHex(hsl) }} />
      ))}
    </div>
  );
}

// [SCOPE 062 / T011] BEGIN — Project Theme tab (converted to a profile picker)
export default function ThemeTabView({
  projectId,
  isAdmin: _isAdmin,
}: {
  projectId: string;
  isAdmin?: boolean;
}) {
  const [appType, setAppType] = useState<AppType>("web");
  const [current, setCurrent] = useState<ProjectTheme>(WXKANBAN_DEFAULT_THEME);
  const [tier, setTier] = useState<string>("default");
  const [profiles, setProfiles] = useState<ThemeProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<"profiles" | "catalog">("profiles");
  /** The catalog entry currently applied to this project+appType, if any, so the grid can mark it. */
  const [appliedSlug, setAppliedSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [themeRes, profRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/theme?appType=${appType}`, { credentials: "include", headers: authHeaders() }),
        fetch(`/api/themes/templates`, { credentials: "include", headers: authHeaders() }),
      ]);
      const themeData = (await themeRes.json()) as { theme?: ProjectTheme; tier?: string; error?: string };
      if (!themeRes.ok || !themeData.theme) throw new Error(themeData.error ?? "Failed to load theme");
      setCurrent(themeData.theme);
      setTier(themeData.tier ?? "default");
      // A catalog-sourced theme records its slug in `sourceRef` (set by assembleTheme at ingest),
      // so the live look can be marked in the grid without a second request. A hand-built or
      // URL-derived theme carries something else here and simply matches no card.
      setAppliedSlug(themeData.theme.sourceRef ?? null);
      const profData = (await profRes.json()) as { templates?: ThemeProfile[]; error?: string };
      if (!profRes.ok) throw new Error(profData.error ?? "Failed to load profiles");
      setProfiles(profData.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, [projectId, appType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function applyProfile(p: ThemeProfile) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/theme/apply-template`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ appType, templateId: p.id }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Apply failed");
      }
      setMsg(`Applied "${p.name}" to this project.`);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Apply failed");
    } finally {
      setBusy(false);
    }
  }

  // SCOPE-114 Amendment A — apply a curated design system to THIS project only.
  //
  // Deliberately not routed through the profile gallery. Adding a company-wide profile every
  // time someone themes a single application would fill the gallery with one-off names nobody
  // chose to keep. The project still records `designsystemslug`, so the same look can be
  // promoted to a reusable profile from the Studio later if it turns out to be worth keeping.
  async function applyDesignSystem(system: { slug: string; name: string }) {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/theme/apply-design-system`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ appType, designsystemslug: system.slug }),
      });
      if (!res.ok) {
        const b = (await res.json()) as { error?: string };
        throw new Error(b.error ?? "Apply failed");
      }
      setMsg(`Applied "${system.name}" to this ${appType} application.`);
      await load();
    } catch (e) {
      // Rethrown as well as shown: the catalog grid needs it to clear its own spinner.
      const message = e instanceof Error ? e.message : "Apply failed";
      setError(message);
      throw new Error(message);
    } finally {
      setBusy(false);
    }
  }

  async function execute() {
    setBusy(true);
    setMsg(null);
    setError(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/theme/execute`, {
        method: "POST",
        credentials: "include",
        headers: authHeaders(true),
        body: JSON.stringify({ appType }),
      });
      const data = (await res.json()) as { artifacts?: { css?: string }; error?: string };
      if (!res.ok || !data.artifacts?.css) throw new Error(data.error ?? "Execute failed");
      const blob = new Blob([data.artifacts.css], { type: "text/css" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "theme.css";
      a.click();
      URL.revokeObjectURL(url);
      setMsg("theme.css generated and downloaded; artifacts saved beside the stack.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Execute failed");
    } finally {
      setBusy(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Loading theme…
      </div>
    );
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium">Application type</label>
          <select
            value={appType}
            onChange={(e) => setAppType(e.target.value as AppType)}
            className="rounded-md border border-input bg-background px-2 py-1 text-sm"
          >
            {APP_TYPES.map((t) => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>
        <Link to="/themes" className="text-sm font-medium text-primary hover:underline">
          Build &amp; manage themes in Theme Studio →
        </Link>
      </div>

      {msg && <p className="text-sm text-green-600">{msg}</p>}
      {error && <p className="text-sm text-destructive">{error}</p>}

      {/* Current applied look */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-3">
          <Swatches theme={current} size="h-8 w-8" />
          <div>
            <p className="text-sm font-medium text-foreground">Current look</p>
            <p className="text-xs text-muted-foreground">
              Source: <span className="font-medium">{tier}</span>
              {tier === "default" && " (wxKanban built-in — pick a profile below)"}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => void execute()}
          disabled={busy}
          className="rounded-md border border-input bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
        >
          Execute to code
        </button>
      </div>

      {/* [SCOPE-114 Amendment A] Two sources for this application's look: the company's saved
          profiles, or the curated catalog applied directly to this project. */}
      <div className="flex w-fit overflow-hidden rounded-md border border-input">
        {([
          ["profiles", `Company profiles${profiles.length ? ` (${profiles.length})` : ""}`],
          ["catalog", "Design system catalog"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setSource(key)}
            className={cn(
              "px-3 py-1.5 text-sm",
              source === key ? "bg-accent font-medium text-accent-foreground" : "hover:bg-accent/50",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {source === "catalog" ? (
        <div>
          <p className="mb-2 text-xs text-muted-foreground">
            Applies straight to this <span className="font-medium">{appType}</span> application.
            Nothing is added to your company profiles — use Theme Studio if you want the look
            reusable across projects.
          </p>
          <DesignSystemCatalog
            variant="project"
            appliedSlug={appliedSlug}
            onApply={(s) => applyDesignSystem({ slug: s.slug, name: s.name })}
          />
        </div>
      ) : (
      <div>
        <p className="mb-2 text-sm font-medium text-foreground">Pick a theme profile</p>
        {profiles.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No theme profiles yet. Create one in{" "}
            <Link to="/themes" className="text-primary hover:underline">Theme Studio</Link>.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {profiles.map((p) => (
              <div key={p.id} className="flex flex-col gap-2 rounded-lg border border-border p-3">
                <span className="truncate text-sm font-medium text-foreground">{p.name}</span>
                <Swatches theme={p.theme} />
                <button
                  type="button"
                  onClick={() => void applyProfile(p)}
                  disabled={busy}
                  className="mt-1 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
                >
                  Apply to project
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
    </div>
  );
}
// [SCOPE 062 / T011] END
