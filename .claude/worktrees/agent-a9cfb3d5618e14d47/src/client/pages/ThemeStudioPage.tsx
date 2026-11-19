// Theme Studio (Phase 1) — top-level page where theme *profiles* are built and switched.
// Profiles are the company-scoped themetemplates gallery. Selecting one loads it into the
// builder (wired in Phase-1 sub-pass 3). All members may create/edit; rename/delete are
// ADMIN-gated server-side. Projects pick a profile from their Theme tab (snapshot copy).
import { useState, useEffect, useCallback } from "react";
import { AppShell } from "../components/layout/AppShell";
import { useAuth } from "../context/AuthContext";
import { Button } from "../components/ui/Button";
import { cn } from "../lib/utils";
import { hslTripletToHex, presetsForAppType, WXKANBAN_DEFAULT_THEME, type ProjectTheme, type ThemePreset } from "../../shared/theme-tokens";
import { DEFAULT_BUSINESS_CHROME, type BusinessChrome } from "../../shared/theme-template";
import type { NamedBlock } from "../../shared/block-model";
import ThemeStudio from "../components/Projects/ThemeStudio";
// [SCOPE 108 / T006,T007] Layout tab hosts the Header & Footer Designer; the flat
// BlockComposer canvas has been deleted outright (retarget).
import HeaderFooterDesigner from "../components/Projects/HeaderFooterDesigner";
// [SCOPE 116 / T005,T007] The curated design-system catalog — a THIRD source of profiles,
// alongside "New profile" (blank) and Borrow-a-Look (from a URL).
import DesignSystemCatalog from "../components/Themes/DesignSystemCatalog";

interface ThemeProfile {
  id: string;
  name: string;
  theme: ProjectTheme;
  chrome: BusinessChrome;
  blocks: NamedBlock[] | null;
  updatedat: string;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

// [SCOPE THEME-STUDIO / P1] BEGIN — ThemeStudioPage (profiles gallery + builder shell)
export default function ThemeStudioPage() {
  const { user } = useAuth();
  const isAdmin = user?.usertype === "ADMIN";

  const [profiles, setProfiles] = useState<ThemeProfile[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Builder edit state (seeded from the selected profile).
  const [editTheme, setEditTheme] = useState<ProjectTheme>(WXKANBAN_DEFAULT_THEME);
  const [editChrome, setEditChrome] = useState<BusinessChrome>(DEFAULT_BUSINESS_CHROME);
  const [editBlocks, setEditBlocks] = useState<NamedBlock[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  // [SCOPE 116 / T007] Which surface the page is showing. A page-level switch rather than a tab
  // inside ThemeStudio, because that component is scoped to ONE profile and the catalog is a
  // browse-and-pick surface that belongs to none — nesting it there would have meant selecting
  // a profile before you could look for one.
  const [view, setView] = useState<"profiles" | "catalog">("profiles");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/themes/templates", { credentials: "include", headers: authHeaders() });
      const data = (await res.json()) as { templates?: ThemeProfile[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load theme profiles");
      setProfiles(data.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load theme profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProfile() {
    const name = window.prompt("Name this theme profile:", "New theme")?.trim();
    if (!name) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/themes/templates", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ name, theme: WXKANBAN_DEFAULT_THEME, chrome: DEFAULT_BUSINESS_CHROME, blocks: [] }),
      });
      const data = (await res.json()) as { template?: { id: string }; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Create failed");
      await load();
      if (data.template?.id) setSelectedId(data.template.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setBusy(false);
    }
  }

  async function renameProfile(p: ThemeProfile) {
    const name = window.prompt("Rename profile:", p.name)?.trim();
    if (!name || name === p.name) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/themes/templates/${p.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ name }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Rename failed");
      }
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function deleteProfile(p: ThemeProfile) {
    if (!window.confirm(`Delete theme profile "${p.name}"? This cannot be undone.`)) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/themes/templates/${p.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Delete failed");
      }
      if (selectedId === p.id) setSelectedId(null);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  const selected = profiles.find((p) => p.id === selectedId) ?? null;

  // Seed the builder when the selected profile changes.
  useEffect(() => {
    if (!selected) return;
    setEditTheme(selected.theme ?? WXKANBAN_DEFAULT_THEME);
    setEditChrome(selected.chrome ?? DEFAULT_BUSINESS_CHROME);
    setEditBlocks(selected.blocks ?? []);
    setDirty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  async function saveProfile() {
    if (!selected) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/templates/${selected.id}`, {
        method: "PUT",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ theme: editTheme, chrome: editChrome, blocks: editBlocks }),
      });
      if (!res.ok) {
        const d = (await res.json()) as { error?: string };
        throw new Error(d.error ?? "Save failed");
      }
      setDirty(false);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  function selectProfile(id: string) {
    if (dirty && !window.confirm("Discard unsaved changes to the current profile?")) return;
    setSelectedId(id);
  }

  // [SCOPE 116 / T007] After picking a curated system the server has already created the
  // profile, so reload the gallery, select the new row and drop the user straight into the
  // builder on THEIR copy. Landing back on the catalog would leave them wondering whether it
  // worked; landing in the editor makes the copy-not-link semantics obvious.
  async function handlePicked(profileId: string) {
    setView("profiles");
    await load();
    setSelectedId(profileId);
    setDirty(false);
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">Theme Studio</h1>
            <p className="text-sm text-muted-foreground">
              Build and switch between your company&apos;s theme profiles. Projects pick a profile from their Theme tab.
            </p>
          </div>
          <Button type="button" onClick={() => void createProfile()} disabled={busy}>
            + New profile
          </Button>
        </div>

        {/* [SCOPE 116 / T007] Profiles vs Catalog. Two sources for the same gallery: build your
            own, or start from one of the 50 curated design systems. */}
        <div className="mb-4 flex overflow-hidden rounded-md border border-input w-fit">
          {([
            ["profiles", "My profiles"],
            ["catalog", "Catalog"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setView(key)}
              className={cn(
                "px-4 py-1.5 text-sm",
                view === key ? "bg-accent text-accent-foreground font-medium" : "hover:bg-accent/50",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {error && <p className="mb-3 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}

        {view === "catalog" ? (
          <DesignSystemCatalog onPicked={(id) => void handlePicked(id)} />
        ) : (
        <div className="grid gap-4 md:grid-cols-[280px_1fr]">
          {/* Left rail — profile dropdown + presets (moved from the Look & Chrome tab) */}
          <div className="space-y-4">
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Profile</p>
              <select
                value={selectedId ?? ""}
                onChange={(e) => selectProfile(e.target.value)}
                disabled={loading}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="" disabled>
                  {loading ? "Loading…" : profiles.length ? "Select a profile…" : "No profiles yet"}
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={() => void createProfile()} disabled={busy}>
                  + New
                </Button>
                {isAdmin && selected && (
                  <>
                    <button
                      type="button"
                      onClick={() => void renameProfile(selected)}
                      className="rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteProfile(selected)}
                      className="rounded-md border border-input px-2 py-1 text-xs text-destructive hover:bg-accent"
                    >
                      Delete
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Presets</p>
              {!selected ? (
                <p className="text-xs text-muted-foreground">Select a profile to apply a preset.</p>
              ) : (
                <div className="grid grid-cols-2 gap-2">
                  {presetsForAppType("web").map((p: ThemePreset) => {
                    const sel = editTheme.sourceRef === p.key;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => { setEditTheme(p.theme); setDirty(true); }}
                        className={cn(
                          "rounded-lg border p-2 text-left transition-colors",
                          sel ? "border-primary ring-2 ring-ring" : "border-border hover:bg-accent",
                        )}
                      >
                        <div className="mb-1 flex gap-1">
                          {(["primary", "secondary", "accent", "muted"] as const).map((tk) => (
                            <span
                              key={tk}
                              className="h-4 w-4 rounded-full border border-border"
                              style={{ backgroundColor: hslTripletToHex(p.theme.light[tk]) }}
                            />
                          ))}
                        </div>
                        <p className="text-xs font-medium">{p.name}</p>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Builder area */}
          <div className="rounded-lg border border-border p-4">
            {!selected ? (
              <p className="text-sm text-muted-foreground">Select a profile on the left, or create a new one, to edit it.</p>
            ) : (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-semibold text-foreground">{selected.name}</h2>
                    {dirty && <span className="text-xs text-muted-foreground">• unsaved</span>}
                  </div>
                  <Button type="button" onClick={() => void saveProfile()} disabled={saving || !dirty}>
                    {saving ? "Saving…" : "Save profile"}
                  </Button>
                </div>

                <ThemeStudio
                  appType="web"
                  value={editTheme}
                  onChange={(t) => { setEditTheme(t); setDirty(true); }}
                  chrome={editChrome}
                  onChromeChange={(c) => { setEditChrome(c); setDirty(true); }}
                  blocks={editBlocks}
                  isAdmin={isAdmin}
                  showPresets={false}
                  layoutSlot={
                    <HeaderFooterDesigner
                      theme={editTheme}
                      chrome={editChrome}
                      seedKey={selectedId ?? undefined}
                      onChange={(patch) => {
                        setEditChrome((c) => ({ ...c, ...patch }));
                        setDirty(true);
                      }}
                    />
                  }
                />
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </AppShell>
  );
}
// [SCOPE THEME-STUDIO / P1] END
