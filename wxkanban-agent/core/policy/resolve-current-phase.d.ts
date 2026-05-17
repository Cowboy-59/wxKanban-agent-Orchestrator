import { LifecycleStage } from "../schemas/lifecycle";
export interface PhaseQueryClient {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{
        rows: T[];
    }>;
}
export declare class ProjectNotFoundError extends Error {
    constructor(projectId: string);
}
export declare function resolveCurrentPhase(db: PhaseQueryClient, projectId: string): Promise<LifecycleStage>;
//# sourceMappingURL=resolve-current-phase.d.ts.map