"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.STAGE_ORDER = exports.LifecycleStage = void 0;
// Lifecycle schemas
// Storage strings match projectphases.phasename byte-for-byte (spec 030 Path A
// — corrected from 'QA Testing'/'Human Testing' which never matched DB).
// Domain names live in CONTEXT.md.
var LifecycleStage;
(function (LifecycleStage) {
    LifecycleStage["Design"] = "Design";
    LifecycleStage["Implementation"] = "Implementation";
    LifecycleStage["QATesting"] = "QA";
    LifecycleStage["HumanTesting"] = "HumanTesting";
    LifecycleStage["Beta"] = "Beta";
    LifecycleStage["Release"] = "Release";
})(LifecycleStage || (exports.LifecycleStage = LifecycleStage = {}));
// Spec 030 FR-007 — AllowedCommandsByStage and CrossCuttingCommands exports
// removed. Their replacement is the canonical gateTable in core/policy/capabilities.ts;
// CLI/MCP consumers reach the data via cli-adapter.getAllowedCommandsForStage().
// Spec 030 FR-011 — canonical phase ordering, single source of truth.
// Both transitions.ts (forward-only phase advancement) and any future
// adapter that needs to know phase order import from here.
exports.STAGE_ORDER = [
    LifecycleStage.Design,
    LifecycleStage.Implementation,
    LifecycleStage.QATesting,
    LifecycleStage.HumanTesting,
    LifecycleStage.Beta,
    LifecycleStage.Release,
];
//# sourceMappingURL=lifecycle.js.map