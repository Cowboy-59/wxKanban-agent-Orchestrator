// Command policy engine
import { LifecycleStage, AllowedCommandsByStage } from '../schemas/lifecycle';

export class CommandPolicyEngine {
	static evaluate(stage: LifecycleStage, command: string): boolean {
		const allowed = AllowedCommandsByStage[stage] || [];
		return allowed.includes(command);
	}
}
