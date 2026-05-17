import { LifecycleStage } from "../schemas/lifecycle";
export declare enum Capability {
    BuildScope = "BuildScope",
    CreateSpecs = "CreateSpecs",
    ImplementTask = "ImplementTask",
    CreateTestTasks = "CreateTestTasks",
    RunQa = "RunQa",
    RunHuman = "RunHuman",
    PrepareRelease = "PrepareRelease",
    FinalizeRelease = "FinalizeRelease",
    DbPush = "DbPush",
    PipelineAgent = "PipelineAgent",
    AuditFences = "AuditFences",
    KitStatus = "KitStatus"
}
export interface CapabilityGate {
    allowedPhases: LifecycleStage[] | "all";
    requiresVerifiedSpec: boolean;
    allowsEscalation: false;
}
export declare const gateTable: Readonly<Record<Capability, CapabilityGate>>;
//# sourceMappingURL=capabilities.d.ts.map