// SCOPE-114 / SPEC-116 T004 — one curated design system, as a browse card.
//
// The swatches are drawn from the MAPPED 19-token theme rather than the rich source ramp,
// deliberately: that mapped set is what a project actually inherits when this system is picked,
// so the card shows the customer what they will really get instead of a prettier upstream
// palette they will never see.
//
// Both modes are shown side by side, each labelled native or approximated. That honesty is the
// point — 40 of the 50 systems define only a light mode and 10 only a dark one, so exactly one
// of the two rows on every card is machine-derived. Hiding that would let someone pick a look
// on the strength of a dark mode no designer ever drew.

import { Button } from "../ui/Button";
import { cn } from "../../lib/utils";
import type { ProjectTheme, ThemeTokenSet } from "../../../shared/theme-tokens";

/** A catalog entry as the list endpoint returns it — no `sourcebrand`, no `showcasehtml`. */
export interface DesignSystemSummary {
  id: string;
  slug: string;
  name: string;
  description: string;
  nativemode: "light" | "dark";
  tags: string[];
  theme: ProjectTheme;
  synthesizedmode: "light" | "dark" | "none";
  fontstack: string;
  fontimporturl: string | null;
  sortorder: number;
}

/** The tokens shown as swatches, in the order a viewer reads a design: ground, ink, brand. */
const SWATCH_KEYS: ReadonlyArray<keyof ThemeTokenSet> = [
  "background",
  "foreground",
  "primary",
  "accent",
  "secondary",
  "border",
  "destructive",
];

interface Props {
  system: DesignSystemSummary;
  onPreview: (system: DesignSystemSummary) => void;
  onUse: (system: DesignSystemSummary) => void;
  busy?: boolean;
  /** Overrides the primary action label — the project Theme tab applies rather than picks. */
  actionLabel?: string;
  /** True when this system is the one currently applied, so the live look is obvious. */
  applied?: boolean;
}

// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
export default function DesignSystemCard({ system, onPreview, onUse, busy, actionLabel, applied }: Props) {
// [SCOPE 116 / T004] END
  const radius = system.theme.radius;
  // The primary typeface, for the "what will my product look like" glance. The stack is already
  // redacted and substituted at ingest, so this is a family that can genuinely load.
  const primaryFont = system.fontstack.split(",")[0]?.replace(/["']/g, "").trim() ?? "";

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-sm font-semibold leading-tight text-foreground">{system.name}</h3>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide",
            system.nativemode === "dark"
              ? "bg-foreground/10 text-foreground"
              : "bg-muted text-muted-foreground",
          )}
        >
          {system.nativemode}
        </span>
      </div>

      <div className="mb-3 flex flex-wrap gap-1">
        {system.tags.slice(1).map((tag) => (
          <span
            key={tag}
            className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
          >
            {tag}
          </span>
        ))}
      </div>

      <p className="mb-3 line-clamp-3 text-xs text-muted-foreground">{system.description}</p>

      <ModeRow label="Light" set={system.theme.light} approximated={system.synthesizedmode === "light"} />
      <ModeRow label="Dark" set={system.theme.dark} approximated={system.synthesizedmode === "dark"} />

      <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
        <span className="truncate" title={system.fontstack}>
          {primaryFont || "system"}
        </span>
        <span className="shrink-0">radius {radius}</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => onPreview(system)}>
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant={applied ? "outline" : "default"}
          onClick={() => onUse(system)}
          disabled={busy}
        >
          {busy ? "Applying…" : applied ? "Applied" : (actionLabel ?? "Use this system")}
        </Button>
        {/* Straight to the full showcase page, no modal in the way. Same sandboxed document —
            the route sends `Content-Security-Policy: sandbox allow-scripts`, so opening it as a
            top-level page is as isolated as the framed preview. */}
        <a
          href={`/api/design-systems/${encodeURIComponent(system.slug)}/showcase`}
          target="_blank"
          rel="noreferrer noopener"
          className="ml-auto text-xs font-medium text-primary underline underline-offset-2 hover:no-underline"
          title={`Open the full ${system.name} showcase in a new tab`}
        >
          Full page ↗
        </a>
      </div>
    </div>
  );
}

/**
 * One mode's swatch strip.
 *
 * The approximated marker sits on the row it applies to rather than on the card as a whole,
 * because only ever ONE of the two rows is derived — a card-level badge could not say which,
 * which is the only thing the viewer needs to know.
 */
// [SCOPE 116 / T004] BEGIN — DesignSystemCard component
function ModeRow({
  label,
  set,
  approximated,
}: {
// [SCOPE 116 / T004] END
  label: string;
  set: ThemeTokenSet;
  approximated: boolean;
}) {
  return (
    <div className="mb-2">
      <div className="mb-1 flex items-center gap-1.5 text-[10px] uppercase tracking-wide">
        <span className="text-muted-foreground">{label}</span>
        {approximated ? (
          <span className="text-amber-600 dark:text-amber-500" title="Derived from the other mode — verified for AA contrast, but no designer drew it. Tune it after picking.">
            approximated
          </span>
        ) : (
          <span className="text-emerald-600 dark:text-emerald-500">native</span>
        )}
      </div>
      <div className="flex overflow-hidden rounded border border-border">
        {SWATCH_KEYS.map((key) => (
          <span
            key={key}
            className="h-7 flex-1"
            style={{ backgroundColor: `hsl(${set[key]})` }}
            title={`${String(key)}: ${set[key]}`}
          />
        ))}
      </div>
    </div>
  );
}
