import { PhaseQueryClient } from "../resolve-current-phase";
import { SpecVerificationQueryClient } from "../resolve-spec-verification";
export interface StageEnforcementResult {
    allowed: boolean;
    currentStage: string | null;
    requestedTool: string;
    reason?: string;
}
export interface McpDbClient extends PhaseQueryClient, SpecVerificationQueryClient {
}
export declare function enforceTool(db: McpDbClient, projectId: string, toolName: string): Promise<StageEnforcementResult>;
//# sourceMappingURL=mcp-adapter.d.ts.map