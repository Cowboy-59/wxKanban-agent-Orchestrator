// SCOPE-114 / SPEC-116 T005 — the Catalog browse surface.
//
// Fifty coherent design systems, filterable by mode, character tag and free text. Filtering runs
// client-side against the single fetched list rather than re-querying per keystroke: the whole
// catalog is 50 rows and about 100 KB, so it arrives once and every subsequent interaction is
// instant. A debounced round trip per character would be slower AND more code.
//
// The tag chips show counts from the UNFILTERED set, so they do not vanish as the user narrows.
// A filter UI whose own options disappear when used is disorienting — you lose the map of where
// else you could go.

import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { cn } from "../../lib/utils";
import DesignSystemCard, { type DesignSystemSummary } from "./DesignSystemCard";
import DesignSystemShowcaseDialog from "./DesignSystemShowcaseDialog";
import UseDesignSystemDialog from "./UseDesignSystemDialog";

// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
function authHeaders(): Record<string, string> {
  const token = localStorage.getItem("wxkanban_token");
  return { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) };
}
// [SCOPE 116 / T004] END

type ModeFilter = "all" | "light" | "dark";

interface Props {
  /**
   * `"profile"` (default) — the Theme Studio flow. Picking names a copy and adds it to the
   * company's profile gallery, from where it can be applied to many projects.
   *
   * `"project"` — SCOPE-114 Amendment A, used by the project Theme tab. Applying writes the
   * look straight onto THIS project and app type and adds nothing to the company gallery, so
   * the naming dialog is skipped: there is no profile to name.
   */
  variant?: "profile" | "project";
  /** Called with the new profile id after a successful pick. Used by `variant="profile"`. */
  onPicked?: (profileId: string, profileName: string) => void;
  /** Applies a catalog entry directly to the project. Used by `variant="project"`. */
  onApply?: (system: DesignSystemSummary) => Promise<void>;
  /** Slug currently applied, so the live look is marked in the grid. */
  appliedSlug?: string | null;
}

// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
export default function DesignSystemCatalog({
  variant = "profile",
  onPicked,
  onApply,
  appliedSlug,
}: Props) {
// [SCOPE 116 / T004] END
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [tagCounts, setTagCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  /** Fatal: the catalog could not be fetched, so there is nothing to show. */
  const [error, setError] = useState<string | null>(null);
  /** Non-fatal: an apply failed. Shown ABOVE the grid so the user can simply try another —
   *  routing it through `error` would blank the whole catalog over a recoverable click. */
  const [actionError, setActionError] = useState<string | null>(null);

  const [mode, setMode] = useState<ModeFilter>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const [previewing, setPreviewing] = useState<DesignSystemSummary | null>(null);
  const [picking, setPicking] = useState<DesignSystemSummary | null>(null);
  /** Slug currently being applied in "project" mode, so its card can show progress. */
  const [applying, setApplying] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/design-systems", { headers: authHeaders() });
        if (!res.ok) throw new Error(`Failed to load the catalog (${res.status})`);
        const body = (await res.json()) as {
          systems: DesignSystemSummary[];
          tagCounts: Record<string, number>;
        };
        if (cancelled) return;
        setSystems(body.systems);
        setTagCounts(body.tagCounts ?? {});
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to load the catalog");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return systems.filter((s) => {
      if (mode !== "all" && s.nativemode !== mode) return false;
      if (tag && !s.tags.includes(tag)) return false;
      if (q && !`${s.name} ${s.description}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [systems, mode, tag, query]);

  // Character tags only — the first tag on every entry is the mode, which the mode buttons
  // already cover, so showing it as a chip too would be a second control for one filter.
  const characterTags = useMemo(
    () =>
      Object.entries(tagCounts)
        .filter(([t]) => t !== "light" && t !== "dark")
        .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])),
    [tagCounts],
  );

  // SCOPE-114 Amendment A — apply straight to the project, no profile, no naming step.
  // Errors surface inline rather than throwing into the card, because there is no dialog
  // here to catch them and a silent no-op would look like the click never registered.
  const applyDirect = useCallback(
    (system: DesignSystemSummary): void => {
      if (!onApply) return;
      setApplying(system.slug);
      setActionError(null);
      void onApply(system)
        .catch((err: unknown) =>
          setActionError(err instanceof Error ? err.message : "Could not apply that design system."),
        )
        .finally(() => setApplying(null));
    },
    [onApply],
  );

  const pick = useCallback(
    async (system: DesignSystemSummary, name: string): Promise<void> => {
      const res = await fetch("/api/themes/templates", {
        method: "POST",
        headers: authHeaders(),
        body: JSON.stringify({ name, designsystemslug: system.slug }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        template?: { id: string; name: string };
        error?: string;
      };
      if (!res.ok) throw new Error(body.error ?? `Could not create the profile (${res.status})`);
      if (!body.template) throw new Error("The server did not return the new profile.");
      setPicking(null);
      onPicked?.(body.template.id, body.template.name);
    },
    [onPicked],
  );

  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading the design system catalog…</p>;
  }
  if (error) {
    return (
      <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {actionError && (
        <p className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {actionError}
        </p>
      )}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-md border border-input">
            {(["all", "light", "dark"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                className={cn(
                  "px-3 py-1.5 text-xs capitalize",
                  mode === m ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
                )}
              >
                {m}
              </button>
            ))}
          </div>
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by look — “warm”, “monochrome”, “electric”…"
            className="max-w-xs"
          />
          <span className="text-xs text-muted-foreground">
            {visible.length} of {systems.length}
          </span>
          {(mode !== "all" || tag || query) && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => { setMode("all"); setTag(null); setQuery(""); }}
            >
              Clear
            </Button>
          )}
        </div>

        <div className="flex flex-wrap gap-1.5">
          {characterTags.map(([t, n]) => (
            <button
              key={t}
              type="button"
              onClick={() => setTag(tag === t ? null : t)}
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] transition-colors",
                tag === t
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input text-muted-foreground hover:bg-accent",
              )}
            >
              {t} <span className="opacity-60">{n}</span>
            </button>
          ))}
        </div>
      </div>

      {visible.length === 0 ? (
        <p className="rounded-md border border-border px-3 py-6 text-center text-sm text-muted-foreground">
          No system matches those filters.
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((s) => (
            <DesignSystemCard
              key={s.slug}
              system={s}
              onPreview={setPreviewing}
              // In "project" mode there is no profile to name, so Use applies immediately
              // rather than opening the naming dialog.
              onUse={variant === "project" ? applyDirect : setPicking}
              actionLabel={variant === "project" ? "Apply to this project" : undefined}
              applied={appliedSlug === s.slug}
              busy={applying === s.slug}
            />
          ))}
        </div>
      )}

      <DesignSystemShowcaseDialog system={previewing} onClose={() => setPreviewing(null)} />
      {variant === "profile" && (
      <UseDesignSystemDialog
        system={picking}
        onClose={() => setPicking(null)}
        onConfirm={pick}
      />
      )}
    </div>
  );
}
