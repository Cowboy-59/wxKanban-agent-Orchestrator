// Lifecycle schemas
export enum LifecycleStage {
	Design = 'Design',
	Implementation = 'Implementation',
	QATesting = 'QA Testing',
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

export const CrossCuttingCommands: readonly string[] = ['dbpush', 'pipeline-agent'] as const;
