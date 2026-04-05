// Lifecycle schemas
export enum LifecycleStage {
	Design = 'Design',
	Implementation = 'Implementation',
	QATesting = 'QA testing',
	HumanTesting = 'Human Testing',
	Beta = 'Beta',
	Release = 'Release',
}

export const AllowedCommandsByStage: Record<LifecycleStage, string[]> = {
	[LifecycleStage.Design]: ['buildscope', 'createspecs'],
	[LifecycleStage.Implementation]: ['implement', 'createtesttasks'],
	[LifecycleStage.QATesting]: ['runqa'],
	[LifecycleStage.HumanTesting]: ['runhuman'],
	[LifecycleStage.Beta]: ['prepareRelease'],
	[LifecycleStage.Release]: ['finalizeRelease'],
};
