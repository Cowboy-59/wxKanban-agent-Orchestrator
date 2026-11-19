// SCOPE-106 / T014 — Theme Template gallery UI. Lists this company's named look+chrome
// templates, lets any member save the current look+chrome as a template, apply one
// (loads it into the working Studio state), and lets an admin rename/delete entries.
// SCOPE-106 (T019): also import a pre-built template (.json) into the gallery and export
// any template to a portable .wxtheme.json file (round-trip / share a house style).
import { useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { hslTripletToHex, type ProjectTheme } from "../../../shared/theme-tokens";
import type { BusinessChrome } from "../../../shared/theme-template";
import type { NamedBlock } from "../../../shared/block-model";

interface ThemeTemplate {
  id: string;
  name: string;
  theme: ProjectTheme;
  chrome: BusinessChrome;
}

function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}

export interface TemplateGalleryProps {
  theme: ProjectTheme;
  chrome: BusinessChrome;
  blocks?: NamedBlock[];
  isAdmin?: boolean;
  onApply: (theme: ProjectTheme, chrome: BusinessChrome) => void;
}

// [SCOPE 106 / T014] BEGIN — TemplateGallery — company look+chrome templates (save/import/export/apply/curate)
export default function TemplateGallery({ theme, chrome, blocks, isAdmin, onApply }: TemplateGalleryProps) {
  const [templates, setTemplates] = useState<ThemeTemplate[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load(): Promise<void> {
    try {
      const res = await fetch("/api/themes/templates", { credentials: "include", headers: authHeaders() });
      const data = (await res.json()) as { templates?: ThemeTemplate[]; error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to load templates");
      setTemplates(data.templates ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load templates");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function saveTemplate(payload: { name: string; theme: unknown; chrome: unknown; blocks?: unknown }): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/themes/templates", {
        method: "POST",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify(payload),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Failed to save template");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to save template");
      throw e;
    } finally {
      setBusy(false);
    }
  }

  async function save(): Promise<void> {
    if (!name.trim()) return;
    try {
      await saveTemplate({ name: name.trim(), theme, chrome, blocks });
      setName("");
    } catch {
      /* error already surfaced */
    }
  }

  // SCOPE-106 T019 — export a template to a portable file (the import format).
  function exportTemplate(t: ThemeTemplate): void {
    const payload = { name: t.name, theme: t.theme, chrome: t.chrome };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${t.name.replace(/[^a-z0-9-_]+/gi, "-") || "template"}.wxtheme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // SCOPE-106 T019 — import a pre-built { name?, theme, chrome } template into the gallery.
  async function importFromFile(file: File): Promise<void> {
    setError(null);
    try {
      const parsed = JSON.parse(await file.text()) as {
        name?: string;
        theme?: unknown;
        chrome?: unknown;
      };
      if (!parsed.theme || !parsed.chrome) {
        throw new Error("That file doesn't contain a theme and chrome.");
      }
      let importName = parsed.name?.trim() ?? "";
      if (!importName) {
        importName = (window.prompt("Name for the imported template") ?? "").trim();
        if (!importName) throw new Error("Import cancelled — a name is required.");
      }
      await saveTemplate({ name: importName, theme: parsed.theme, chrome: parsed.chrome });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Import failed (not a valid template file).");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function rename(id: string, current: string): Promise<void> {
    const next = window.prompt("Rename template", current);
    if (!next || !next.trim() || next.trim() === current) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/templates/${id}`, {
        method: "PATCH",
        credentials: "include",
        headers: authHeaders(),
        body: JSON.stringify({ name: next.trim() }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Rename failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Rename failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string): Promise<void> {
    if (!window.confirm("Delete this template?")) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/themes/templates/${id}`, {
        method: "DELETE",
        credentials: "include",
        headers: authHeaders(),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? "Delete failed");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Save current look + chrome as…"
          className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
        <Button type="button" disabled={busy || !name.trim()} onClick={() => void save()}>
          Save template
        </Button>
        <Button type="button" variant="outline" disabled={busy} onClick={() => fileRef.current?.click()}>
          Import
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importFromFile(f);
          }}
        />
      </div>

      {templates.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No saved templates yet — Save the current look, or Import a template file to use one.
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-md border border-border">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-2 p-2">
              <button
                type="button"
                onClick={() => onApply(t.theme, t.chrome)}
                className="flex flex-1 items-center gap-2 text-left"
                title="Apply this template"
              >
                <span className="flex gap-1">
                  {(["primary", "secondary", "accent", "background"] as const).map((tk) => (
                    <span
                      key={tk}
                      className="h-4 w-4 rounded-full border border-border"
                      style={{ backgroundColor: hslTripletToHex(t.theme.light[tk]) }}
                    />
                  ))}
                </span>
                <span className="text-sm font-medium">{t.name}</span>
              </button>
              <span className="flex shrink-0 gap-1">
                <button
                  type="button"
                  onClick={() => exportTemplate(t)}
                  className="rounded border border-input px-2 py-1 text-xs hover:bg-accent"
                  title="Export to a .wxtheme.json file"
                >
                  Export
                </button>
                {isAdmin && (
                  <>
                    <button
                      type="button"
                      onClick={() => void rename(t.id, t.name)}
                      className="rounded border border-input px-2 py-1 text-xs hover:bg-accent"
                    >
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => void remove(t.id)}
                      className="rounded border border-input px-2 py-1 text-xs text-destructive hover:bg-accent"
                    >
                      Delete
                    </button>
                  </>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
// [SCOPE 106 / T014] END
