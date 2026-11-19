// [SCOPE 100 / T004] BEGIN — Per-locale staleness derived from updatedat (FR-008)
// The Translate action is explicit, so a locale can fall behind English. That state is
// already encoded by marketingassets.updatedat — a locale row older than the en-US row
// was translated from text that has since changed. No flag column, no migration.

export type LocaleState = "current" | "stale" | "untranslated";

/** Classify one locale against the English source row's timestamp. */
export function localeState(
  sourceUpdatedAt: Date,
  row: { updatedat: Date } | undefined,
): LocaleState {
  if (!row) return "untranslated";
  return row.updatedat.getTime() < sourceUpdatedAt.getTime() ? "stale" : "current";
}

/** True when any locale needs re-translating — drives the Translate button badge. */
export function anyStale(states: Record<string, LocaleState>): boolean {
  return Object.values(states).some((s) => s !== "current");
}
// [SCOPE 100 / T004] END
