// The project owner's Change Impact mode (SCOPE-137 Amendment A, FR-007a).
//
// The owner, or a company administrator, sets impactMode in the wxKanban app. Each change is an
// `impact_mode_set` row in the events table, written by the app only: capture_event does not
// accept the type, so a kit token can never set it. The newest valid row is the project's mode.

// [SCOPE 137 / T019] BEGIN — The owner-set impactMode, read from impact_mode_set events (FR-007a)
export const IMPACT_MODES = ['notify', 'boundaries', 'always'] as const;
export type ImpactMode = (typeof IMPACT_MODES)[number];
export const IMPACT_MODE_EVENT_TYPE = 'impact_mode_set';

export interface OwnerImpactMode {
  mode: ImpactMode;
  previous: ImpactMode | null;
  setBy: string;
  setAt: string;
}

export interface ImpactModeEventRow {
  actor: string;
  metadata: unknown;
  createdAt: Date | string;
}

const isMode = (v: unknown): v is ImpactMode => typeof v === 'string' && (IMPACT_MODES as readonly string[]).includes(v);

/** The newest row that names a valid mode, or null when the owner never set one. */
export function latestImpactMode(rows: ImpactModeEventRow[]): OwnerImpactMode | null {
  const sorted = [...rows].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  for (const row of sorted) {
    const m = (row.metadata ?? {}) as Record<string, unknown>;
    if (!isMode(m.mode)) continue;
    return {
      mode: m.mode,
      previous: isMode(m.previous) ? m.previous : null,
      setBy: typeof m.setByName === 'string' && m.setByName ? m.setByName : row.actor,
      setAt: new Date(row.createdAt).toISOString(),
    };
  }
  return null;
}
// [SCOPE 137 / T019] END
