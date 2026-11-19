// WCAG contrast badges (FR-008) — surfaces the critical contrast pairs
// (foreground/background, primary-foreground/primary) for both light and dark with
// a live pass/fail badge. A failing manual choice is flagged, not silently accepted.
import { cn } from "../../lib/utils";
import { tokenSetContrast, type ProjectTheme, type ContrastResult } from "../../../shared/theme-tokens";

// [SCOPE 062 / T009] BEGIN — WCAG contrast badges wired into pickers + preset/derived se…
function Row({ mode, results }: { mode: string; results: ContrastResult[] }) {
// [SCOPE 062 / T009] END
  return (
    <div className="space-y-1">
      <p className="text-xs font-medium text-muted-foreground">{mode}</p>
      {results.map((r) => (
        <div key={r.pair} className="flex items-center justify-between gap-2 text-xs">
          <span className="text-muted-foreground">{r.pair}</span>
          <span className="flex items-center gap-2">
            <span className="tabular-nums">{r.ratio.toFixed(2)}:1</span>
            <span
              className={cn(
                "rounded-full px-2 py-0.5 font-medium",
                r.passesAA
                  ? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300"
                  : "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
              )}
            >
              {r.passesAA ? "AA ✓" : "fails AA"}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

// [SCOPE 062 / T009] BEGIN — WCAG contrast badges wired into pickers + preset/derived se…
export default function ContrastBadges({ theme }: { theme: ProjectTheme }) {
// [SCOPE 062 / T009] END
  const light = tokenSetContrast(theme.light);
  const dark = tokenSetContrast(theme.dark);
  const allPass = [...light, ...dark].every((r) => r.passesAA);
  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Accessibility</span>
        <span className={cn("text-xs font-medium", allPass ? "text-green-600" : "text-red-600")}>
          {allPass ? "WCAG AA" : "below AA"}
        </span>
      </div>
      <Row mode="Light" results={light} />
      <Row mode="Dark" results={dark} />
    </div>
  );
}
