"use strict";
// Spec 030 FR-004 — DB resolver for "what Lifecycle Phase is this project
// currently in?". Owns the active-phase query + the no-active-phase fallback
// + the project-not-found error. The only code path in the kit that converts
// a stored projectphases.phasename value into a LifecycleStage. Both adapters
// import this helper; neither queries projectphases directly.
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProjectNotFoundError = void 0;
exports.resolveCurrentPhase = resolveCurrentPhase;
const lifecycle_1 = require("../schemas/lifecycle");
// Statuses on projectphases that indicate "this phase is currently active".
// Mirrors the legacy mcp-server/src/utils/stage-enforcement.ts list.
const ACTIVE_PHASE_STATUSES = ["in_progress", "reopened"];
class ProjectNotFoundError extends Error {
    constructor(projectId) {
        super(`Project '${projectId}' not found in companyprojects.`);
        this.name = "ProjectNotFoundError";
    }
}
exports.ProjectNotFoundError = ProjectNotFoundError;
async function resolveCurrentPhase(db, projectId) {
    const activeResult = await db.query(`SELECT phasename
       FROM projectphases
      WHERE projectid = $1
        AND status = ANY($2::text[])
      LIMIT 1`, [projectId, ACTIVE_PHASE_STATUSES]);
    if (activeResult.rows.length > 0) {
        const phasename = activeResult.rows[0].phasename;
        // String values are byte-identical between DB and enum after spec 030
        // Path A correction — direct cast is safe; unrecognized values fall
        // through to the default branch.
        const stage = Object.values(lifecycle_1.LifecycleStage).includes(phasename)
            ? phasename
            : null;
        if (stage !== null)
            return stage;
        // Stored phasename does not match any LifecycleStage value — should not
        // happen after Path A is applied. Treat as "active phase unrecognized"
        // and fall through to the Design default rather than throwing; auditfences
        // / dbpush should surface the data inconsistency separately.
    }
    // No active phase row. Verify the project exists before defaulting.
    const projectResult = await db.query(`SELECT id FROM companyprojects WHERE id = $1 LIMIT 1`, [projectId]);
    if (projectResult.rows.length === 0) {
        throw new ProjectNotFoundError(projectId);
    }
    // Project exists, no active phase — kit-wide default for fresh projects.
    return lifecycle_1.LifecycleStage.Design;
}
//# sourceMappingURL=resolve-current-phase.js.map