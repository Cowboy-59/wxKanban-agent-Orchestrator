import type { SpecVerification } from "./policy";
export interface SpecVerificationQueryClient {
    query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{
        rows: T[];
    }>;
}
export declare function resolveSpecVerification(db: SpecVerificationQueryClient, projectId: string): Promise<SpecVerification>;
//# sourceMappingURL=resolve-spec-verification.d.ts.map