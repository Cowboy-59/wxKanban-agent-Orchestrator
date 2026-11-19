// Lifecycle schemas
// Storage strings match projectphases.phasename byte-for-byte (spec 030 Path A
// — corrected from 'QA Testing'/'Human Testing' which never matched DB).
// Domain names live in CONTEXT.md.
export enum LifecycleStage {
	Design = 'Design',
	Implementation = 'Implementation',
	QATesting = 'QA',
	HumanTesting = 'HumanTesting',
	Beta = 'Beta',
	Release = 'Release',
}

// Spec 030 FR-007 — AllowedCommandsByStage and CrossCuttingCommands exports
// removed. Their replacement is the canonical gateTable in core/policy/capabilities.ts;
// CLI/MCP consumers reach the data via cli-adapter.getAllowedCommandsForStage().

// Spec 030 FR-011 — canonical phase ordering, single source of truth.
// Both transitions.ts (forward-only phase advancement) and any future
// adapter that needs to know phase order import from here.
export const STAGE_ORDER: readonly LifecycleStage[] = [
	LifecycleStage.Design,
	LifecycleStage.Implementation,
	LifecycleStage.QATesting,
	LifecycleStage.HumanTesting,
	LifecycleStage.Beta,
	LifecycleStage.Release,
] as const;
