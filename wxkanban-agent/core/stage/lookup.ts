// SCOPE-123 FR-001 — find the scope a command names.
//
// Commands name a scope by number ("123", "0123", "017") or by id. Numbers are matched numerically
// as well as textually, the way `project.cockpit_summary` already matches them, because the same
// scope is written "017" by one surface and "17" by another. When several rows share a number the
// newest wins, matching `project.implement`.

import { StageQueryClient } from './store';
import { ScopeRecord } from './advance';

export interface ScopeRef {
	specId?: string;
	specNumber?: string;
}

// [SCOPE 123 / T001] BEGIN — findScopeByRef: resolve a named scope within one project
export async function findScopeByRef(
	db: StageQueryClient,
	projectId: string,
	ref: ScopeRef,
): Promise<ScopeRecord | null> {
	if (!ref.specId && !ref.specNumber) return null;
	const result = ref.specId
		? await db.query<{ id: string; projectid: string; specnumber: string; title: string; status: string }>(
				`SELECT id, projectid, specnumber, title, status
				   FROM projectspecifications
				  WHERE projectid = $1 AND id = $2
				  LIMIT 1`,
				[projectId, ref.specId],
			)
		: await db.query<{ id: string; projectid: string; specnumber: string; title: string; status: string }>(
				`SELECT id, projectid, specnumber, title, status
				   FROM projectspecifications
				  WHERE projectid = $1
				    AND (specnumber = $2
				         -- CASE, not AND: Postgres does not promise AND's evaluation order, so a
				         -- bare AND could cast a non-numeric specnumber and fail the whole query.
				         OR CASE WHEN specnumber ~ '^[0-9]+$' AND $2::text ~ '^[0-9]+$'
				                 THEN specnumber::bigint = $2::text::bigint
				                 ELSE false END)
				  ORDER BY createdat DESC
				  LIMIT 1`,
				[projectId, ref.specNumber],
			);
	const row = result.rows[0];
	return row
		? {
				id: row.id,
				projectId: row.projectid,
				specNumber: row.specnumber,
				title: row.title,
				status: row.status,
			}
		: null;
}
// [SCOPE 123 / T001] END

// [SCOPE 123 / T001] BEGIN — scopeRefFromArgs: the scope a tool call names, if any
//
// Every scope-bearing MCP tool names its scope with one of these keys. `editSpecNumber` is
// buildscope's amend form; buildscope is scope-creating and never gated, but reading it keeps the
// lookup honest for any future scoped caller.
export function scopeRefFromArgs(args: Record<string, unknown> | undefined): ScopeRef | null {
	if (!args) return null;
	const str = (v: unknown): string | undefined =>
		typeof v === 'string' && v.trim() !== '' ? v.trim() : undefined;
	const specId = str(args['specId']) ?? str(args['specid']);
	const specNumber =
		str(args['specNumber']) ?? str(args['specnumber']) ?? str(args['scopeNumber']) ?? str(args['editSpecNumber']);
	if (!specId && !specNumber) return null;
	return { specId, specNumber };
}
// [SCOPE 123 / T001] END
