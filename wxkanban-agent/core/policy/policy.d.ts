import { LifecycleStage } from "../schemas/lifecycle";
import { Capability } from "./capabilities";
export interface SpecVerification {
    specExists: boolean;
    tasksExist: boolean;
    documentsExist: boolean;
    specStatus?: string;
}
export interface ForceOverride {
    force: boolean;
    reason: string;
}
export interface Decision {
    allowed: boolean;
    reason?: string;
    capability: Capability;
    currentPhase: LifecycleStage;
    requiresSpecCheck: boolean;
    overrideUsed: boolean;
}
export interface EvaluateInput {
    capability: Capability;
    currentPhase: LifecycleStage;
    commandDisplayName: string;
    verification?: SpecVerification;
    override?: ForceOverride;
}
export declare const VALID_IMPLEMENTATION_STATUSES: readonly ["tasks_generated", "in_progress", "ready_for_implementation", "planned"];
export declare function evaluate(input: EvaluateInput): Decision;
export declare function formatEscalationMessage(command: string, reason: string, missing: string[]): string;
export declare function formatBlockMessage(command: string, details: string): string;
//# sourceMappingURL=policy.d.ts.map