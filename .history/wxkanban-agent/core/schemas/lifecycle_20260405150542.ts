// Lifecycle schemas
export enum LifecycleStage {
	Idea = 'idea',
	Scoped = 'scoped',
	Specified = 'specified',
	TestTasksReady = 'test_tasks_ready',
	Implemented = 'implemented',
	HandoffReady = 'handoff_ready',
}

export const AllowedCommandsByStage: Record<LifecycleStage, string[]> = {
	[LifecycleStage.Idea]: ['buildscope'],
	[LifecycleStage.Scoped]: ['createspecs'],
	[LifecycleStage.Specified]: ['createtesttasks'],
	[LifecycleStage.TestTasksReady]: ['implement'],
	[LifecycleStage.Implemented]: ['createhandoff'],
	[LifecycleStage.HandoffReady]: [],
};
