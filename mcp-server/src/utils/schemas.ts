import { z } from 'zod';

// Event types
export const ProjectEventTypeSchema = z.enum([
  'meeting_notes',
  'chat_thread',
  'commit',
  'ticket_update',
  'manual_note',
  'spec_created',
  'task_created',
  'task_completed',
  'document_updated',
]);

// Task status and priority
export const TaskStatusSchema = z.enum(['todo', 'in_progress', 'blocked', 'done']);
export const TaskPrioritySchema = z.enum(['low', 'medium', 'high', 'critical']);

// User role
export const UserRoleSchema = z.enum(['read_only', 'editor', 'admin']);

// Capture Event Input
export const CaptureEventInputSchema = z.object({
  projectId: z.string().uuid(),
  type: ProjectEventTypeSchema,
  source: z.string().min(1).max(50),
  actor: z.string().min(1).max(255),
  rawContent: z.string().min(1),
  normalizedContent: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

// Capture Event Result
export const CaptureEventResultSchema = z.object({
  event: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    type: ProjectEventTypeSchema,
    source: z.string(),
    actor: z.string(),
    rawContent: z.string(),
    normalizedContent: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
    createdAt: z.string().datetime(),
  }),
});

// Upsert Document Input
export const UpsertDocumentInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(500),
  bodyMarkdown: z.string().min(1),
  sourceEventId: z.string().uuid().optional(),
  taskIds: z.array(z.string().uuid()).optional(),
  tags: z.array(z.string().max(100)).optional(),
  documentId: z.string().uuid().optional(),
});

// Upsert Document Result
export const UpsertDocumentResultSchema = z.object({
  document: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    bodyMarkdown: z.string(),
    sourceEventId: z.string().uuid().nullable(),
    taskIds: z.array(z.string().uuid()),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
  created: z.boolean(),
});

// Create Task Input
export const CreateTaskInputSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(1).max(255),
  descriptionMarkdown: z.string().min(1),
  status: TaskStatusSchema.optional(),
  priority: TaskPrioritySchema.optional(),
  dueDate: z.string().datetime().optional(),
  sourceEventId: z.string().uuid().optional(),
  documentIds: z.array(z.string().uuid()).optional(),
  assignee: z.string().max(255).optional(),
});

// Create Task Result
export const CreateTaskResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
});

// Update Task Status Input
export const UpdateTaskStatusInputSchema = z.object({
  taskId: z.string().uuid(),
  status: TaskStatusSchema,
});

// Update Task Status Result
export const UpdateTaskStatusResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  }),
});

// Link Doc to Task Input
export const LinkDocToTaskInputSchema = z.object({
  taskId: z.string().uuid(),
  documentId: z.string().uuid(),
});

// Link Doc to Task Result
export const LinkDocToTaskResultSchema = z.object({
  task: z.object({
    id: z.string().uuid(),
    title: z.string(),
    documentIds: z.array(z.string().uuid()),
  }),
  document: z.object({
    id: z.string().uuid(),
    title: z.string(),
    taskIds: z.array(z.string().uuid()),
  }),
});

// List Open Items Input
export const ListOpenItemsInputSchema = z.object({
  projectId: z.string().uuid(),
  maxItems: z.number().int().min(1).max(100).optional(),
});

// List Open Items Result
export const ListOpenItemsResultSchema = z.object({
  tasks: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    descriptionMarkdown: z.string(),
    status: TaskStatusSchema,
    priority: TaskPrioritySchema,
    dueDate: z.string().datetime().nullable(),
    sourceEventId: z.string().uuid().nullable(),
    documentIds: z.array(z.string().uuid()),
    assignee: z.string().nullable(),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })),
  documents: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    title: z.string(),
    bodyMarkdown: z.string(),
    sourceEventId: z.string().uuid().nullable(),
    taskIds: z.array(z.string().uuid()),
    tags: z.array(z.string()),
    createdAt: z.string().datetime(),
    updatedAt: z.string().datetime(),
  })),
  events: z.array(z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    type: ProjectEventTypeSchema,
    source: z.string(),
    actor: z.string(),
    rawContent: z.string(),
    normalizedContent: z.string().nullable(),
    metadata: z.record(z.unknown()).nullable(),
    createdAt: z.string().datetime(),
  })),
});

// Spec Task Definition
export const SpecTaskSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().min(1),
  priority: TaskPrioritySchema,
  status: TaskStatusSchema.default('todo'),
});

// Create Specs Input
export const CreateSpecsInputSchema = z.object({
  projectId: z.string().uuid(),
  specNumber: z.string().min(1).max(10),
  featureName: z.string().min(1).max(255),
  scopeContent: z.string().min(1),
  phase: z.enum(['scoping', 'design', 'implementation', 'qa', 'human_testing', 'beta', 'released']).default('scoping'),
  priority: z.enum(['low', 'medium', 'high', 'critical']).default('medium'),
  tasks: z.array(SpecTaskSchema).optional(),
  generateLifecycle: z.boolean().default(true),
});

// Create Specs Result
export const CreateSpecsResultSchema = z.object({
  success: z.boolean().default(true),
  blocked: z.boolean().default(false),
  message: z.string().optional(),
  blockingIssues: z.array(z.string()).default([]),
  preflight: z.object({
    success: z.boolean(),
    specNumber: z.string(),
    filePath: z.string(),
    status: z.enum(['valid', 'invalid', 'error']),
    isValid: z.boolean(),
    score: z.number().min(0).max(100),
    placeholdersFound: z.array(z.string()),
    blockingIssues: z.array(z.string()),
    minimumCriteriaStatus: z.object({
      businessProblem: z.boolean(),
      primaryActor: z.boolean(),
      secondaryActors: z.boolean(),
      measurableSuccessMetrics: z.boolean(),
      scopeBoundary: z.boolean(),
      outOfScope: z.boolean(),
      noPlaceholders: z.boolean(),
    }),
    message: z.string(),
  }).nullable().optional(),
  spec: z.object({
    id: z.string().uuid(),
    projectId: z.string().uuid(),
    specNumber: z.string(),
    title: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  }).nullable(),
  documents: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    type: z.enum(['spec', 'plan', 'tasks', 'quickstart', 'lifecycle']),
  })),
  tasks: z.array(z.object({
    id: z.string().uuid(),
    title: z.string(),
    status: TaskStatusSchema,
  })),
  lifecycleGenerated: z.boolean(),
  projectLifecycleUpdated: z.boolean(),
  events: z.array(z.object({
    id: z.string().uuid(),
    type: z.string(),
  })),
});

// Check for Updates Input
export const CheckForUpdatesInputSchema = z.object({
  force: z.boolean().default(false),
});

// Check for Updates Result
export const CheckForUpdatesResultSchema = z.object({
  currentVersion: z.string(),
  latestVersion: z.string().nullable(),
  updateAvailable: z.boolean(),
  releaseInfo: z.object({
    version: z.string(),
    tagName: z.string(),
    publishedAt: z.string(),
    htmlUrl: z.string(),
    tarballUrl: z.string(),
    body: z.string(),
    prerelease: z.boolean(),
    draft: z.boolean(),
  }).nullable(),
  lastChecked: z.string().datetime().nullable(),
  error: z.string().optional(),
});

// Upgrade MCP Input
export const UpgradeMcpInputSchema = z.object({
  version: z.string().optional(),
  dryRun: z.boolean().default(false),
});

// Upgrade MCP Result
export const UpgradeMcpResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  previousVersion: z.string().optional(),
  newVersion: z.string().optional(),
});

// Git Init Repo Input
export const GitInitRepoInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  remoteUrl: z.string().url().optional().describe('Remote repository URL (optional)'),
  commitMessage: z.string().max(255).optional().describe('Custom commit message (optional)'),
  pushToRemote: z.boolean().default(false).describe('Push to remote after initialization (optional)'),
});

// Git Init Repo Result
export const GitInitRepoResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  projectPath: z.string(),
  commitMessage: z.string(),
  alreadyInitialized: z.boolean().optional(),
  remoteAdded: z.boolean(),
  remoteUrl: z.string().nullable(),
  pushed: z.boolean(),
});

// Git Commit Input
export const GitCommitInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  message: z.string().max(255).optional().describe('Custom commit message (optional)'),
  skipChangelog: z.boolean().default(false).describe('Skip changelog update (optional)'),
});

// Git Commit Result
export const GitCommitResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  commitHash: z.string().optional(),
  filesCommitted: z.number(),
  changelogUpdated: z.boolean(),
});

// Git Push Input
export const GitPushInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  remote: z.string().default('origin').describe('Remote name (optional)'),
  branch: z.string().optional().describe('Branch name (optional)'),
  force: z.boolean().default(false).describe('Force push (optional)'),
});

// Git Push Result
export const GitPushResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  remote: z.string(),
  branch: z.string(),
  commitsPushed: z.number().optional(),
});

// Git Merge Input
export const GitMergeInputSchema = z.object({
  projectPath: z.string().min(1).max(500).describe('Path to the project directory'),
  sourceBranch: z.string().describe('Source branch to merge from'),
  targetBranch: z.string().default('main').describe('Target branch to merge into (optional)'),
  createNewBranch: z.boolean().default(true).describe('Create a new working branch after merge (optional)'),
  newBranchName: z.string().optional().describe('Name for the new branch (optional)'),
});

// Git Merge Result
export const GitMergeResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  mergedBranch: z.string(),
  targetBranch: z.string(),
  newBranchCreated: z.boolean(),
  newBranchName: z.string().optional(),
});

// Project Kit Status Input
export const GetKitStatusInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Project Kit Status Result
export const GetKitStatusResultSchema = z.object({
  status: z.enum(['not_generated', 'generating', 'ready', 'failed']),
  primaryAI: z.string().nullable(),
  kitVersion: z.string().nullable(),
  downloadUrl: z.string().nullable(),
  generatedAt: z.string().datetime().nullable(),
  downloadCount: z.number().int().nullable(),
});

// Download Kit Input
export const DownloadKitInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Download Kit Result
export const DownloadKitResultSchema = z.object({
  success: z.boolean(),
  downloadUrl: z.string(),
  filename: z.string(),
  expiresAt: z.string().datetime().optional(),
});

// Regenerate Kit Input
export const RegenerateKitInputSchema = z.object({
  projectId: z.string().uuid(),
});

// Regenerate Kit Result
export const RegenerateKitResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  status: z.enum(['generating', 'ready', 'failed']),
  kitVersion: z.string(),
});

// Import Project Input
export const ImportProjectInputSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(1000).optional(),
  primaryAI: z.enum(['claude-code', 'blackboxai', 'cursor', 'copilot', 'generic']).default('generic'),
  localDirectoryPath: z.string().max(500).optional(),
  generateKit: z.boolean().default(true),
  phaseAssignments: z.record(z.string()).optional(),
  companyId: z.string().uuid(),
});

// Import Project Result
export const ImportProjectResultSchema = z.object({
  project: z.object({
    id: z.string().uuid(),
    name: z.string(),
    status: z.string(),
    createdAt: z.string().datetime(),
  }),
  kit: z.object({
    status: z.string(),
    downloadUrl: z.string().optional(),
    primaryAI: z.string(),
  }).optional(),
  scaffolding: z.string(),
});

// Create API Token Input
export const CreateApiTokenInputSchema = z.object({
  label: z.string().max(100).optional(),
  companyId: z.string().uuid().optional(),
});

// Create API Token Result
export const CreateApiTokenResultSchema = z.object({
  token: z.string(),
  tokenPrefix: z.string(),
  label: z.string().nullable(),
  createdAt: z.string().datetime(),
  message: z.string(),
});

// List API Tokens Input
export const ListApiTokensInputSchema = z.object({});

// List API Tokens Result
export const ListApiTokensResultSchema = z.object({
  tokens: z.array(z.object({
    id: z.string().uuid(),
    tokenPrefix: z.string(),
    label: z.string().nullable(),
    createdAt: z.string().datetime(),
    revokedAt: z.string().datetime().nullable(),
  })),
  count: z.number().int(),
});

// Revoke API Token Input
export const RevokeApiTokenInputSchema = z.object({
  tokenId: z.string().uuid(),
});

// Revoke API Token Result
export const RevokeApiTokenResultSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  revokedAt: z.string().datetime(),
});

// wxAI Implement Input
export const ImplementInputSchema = z.object({
  specNumber: z.string().min(1).max(10).describe('Spec number to implement (e.g., "017")'),
  scopeCheck: z.boolean().default(true).describe('Run scope-first gate verification'),
  force: z.boolean().default(false).describe('DEPRECATED: Force overrides are blocked. Escalation is logged but command is still rejected. Resolve prerequisites instead.'),
  reason: z.string().optional().describe('Reason for escalation request (logged for admin review, does NOT bypass enforcement)'),
});

// Spec 024: Submit Proposal Input (AI Agent proposal submission)
export const SubmitProposalInputSchema = z.object({
  title: z.string().min(1).max(255).describe('Proposal title'),
  description: z.string().optional().describe('Proposal description'),
  priority: z.enum(['low', 'medium', 'high']).default('medium').describe('Proposal priority'),
  estimatedEffort: z.string().max(100).optional().describe('Estimated effort (e.g., "2 weeks")'),
  projectId: z.string().uuid().describe('Company project context UUID'),
  source: z.string().max(255).optional().describe('Source identifier (defaults to "AI Agent")'),
});

// wxAI Analyze Input
export const AnalyzeInputSchema = z.object({
  specNumber: z.string().min(1).max(10).describe('Spec number to analyze (e.g., "017")'),
  includeConstitution: z.boolean().default(true).describe('Include constitution alignment check'),
  maxFindings: z.number().int().min(1).max(100).default(50).describe('Maximum findings to report'),
});

// wxAI Session Start Input
export const SessionStartInputSchema = z.object({
  scopeNumber: z.string().min(1).max(10).optional().describe('Active scope number (optional)'),
  skipVersionCheck: z.boolean().default(false).describe('Skip governance version check'),
  skipTodoScan: z.boolean().default(false).describe('Skip unlinked TODO scan'),
});

// Build Scope Input
export const BuildScopeInputSchema = z.object({
  featureDescription: z.string().min(1).max(1000).describe('High-level description of the feature'),
  quick: z.boolean().default(false).describe('Explicit opt-in to create a draft immediately, even if quality fields are missing'),
  templateOnly: z.boolean().default(false).describe('Create from the legacy template only when quick mode is explicitly enabled'),
  editSpecNumber: z.string().min(1).max(10).optional().describe('Edit existing scope file instead of creating new'),
  primaryActor: z.string().max(255).optional().describe('Primary user actor for the scope'),
  secondaryActors: z.array(z.string().max(255)).optional().describe('Secondary actors or stakeholder groups affected by the scope'),
  businessProblem: z.string().max(2000).optional().describe('Business problem this solves'),
  successMetrics: z.array(z.string()).optional().describe('List of success metrics'),
  scopeBoundary: z.string().max(2000).optional().describe('What is explicitly in scope for this effort'),
  outOfScope: z.string().max(2000).optional().describe('What is explicitly out of scope for this effort'),
  integrationContext: z.string().max(2000).optional().describe('Existing workflows, systems, or documents this scope must align with'),
  constraintsAndRisks: z.string().max(2000).optional().describe('Known constraints, assumptions, or delivery risks that should be reviewed'),
});

// Build Scope Result
export const BuildScopeResultSchema = z.object({
  success: z.boolean(),
  mode: z.enum(['guided', 'quick']),
  specNumber: z.string(),
  shortName: z.string(),
  filePath: z.string().optional(),
  checklistPath: z.string().optional(),
  scopeContent: z.string().optional(),
  sectionsCreated: z.array(z.string()),
  status: z.enum(['draft_interview', 'ready_for_write', 'created', 'updated', 'template_only']),
  questions: z.array(z.object({
    field: z.string(),
    question: z.string(),
  })).default([]),
  qualityScore: z.number().min(0).max(100),
  blockingIssues: z.array(z.string()).default([]),
  canProceedToCreateSpecs: z.boolean(),
  message: z.string(),
  nextSteps: z.array(z.string()),
});

// Validate Scope Input
export const ValidateScopeInputSchema = z.object({
  specNumber: z.string().min(1).max(10).optional().describe('Spec number to validate (e.g., "017")'),
  filePath: z.string().optional().describe('Path to scope file (alternative to specNumber)'),
  projectId: z.string().uuid().optional().describe('Project ID'),
});

// Validate Scope Result
export const ValidateScopeResultSchema = z.object({
  success: z.boolean(),
  specNumber: z.string().optional(),
  filePath: z.string().optional(),
  status: z.enum(['valid', 'invalid', 'error']),
  score: z.number().min(0).max(100),
  checks: z.object({
    hasOverview: z.boolean(),
    hasBusinessProblem: z.boolean(),
    hasActors: z.boolean(),
    hasSuccessMetrics: z.boolean(),
    hasScopeBoundary: z.boolean(),
    hasOutOfScope: z.boolean(),
    hasOpenQuestions: z.boolean(),
  }),
  placeholdersFound: z.array(z.string()),
  blockingIssues: z.array(z.string()),
  minimumCriteriaStatus: z.object({
    businessProblem: z.boolean(),
    primaryActor: z.boolean(),
    secondaryActors: z.boolean(),
    measurableSuccessMetrics: z.boolean(),
    scopeBoundary: z.boolean(),
    outOfScope: z.boolean(),
    noPlaceholders: z.boolean(),
  }),
  missingSections: z.array(z.string()),
  warnings: z.array(z.string()),
  errors: z.array(z.string()),
  suggestions: z.array(z.string()),
  message: z.string(),
});

// Export types
export type CaptureEventInput = z.infer<typeof CaptureEventInputSchema>;
export type UpsertDocumentInput = z.infer<typeof UpsertDocumentInputSchema>;
export type CreateTaskInput = z.infer<typeof CreateTaskInputSchema>;
export type UpdateTaskStatusInput = z.infer<typeof UpdateTaskStatusInputSchema>;
export type LinkDocToTaskInput = z.infer<typeof LinkDocToTaskInputSchema>;
export type ListOpenItemsInput = z.infer<typeof ListOpenItemsInputSchema>;
export type CreateSpecsInput = z.infer<typeof CreateSpecsInputSchema>;
export type SpecTask = z.infer<typeof SpecTaskSchema>;
export type CheckForUpdatesInput = z.infer<typeof CheckForUpdatesInputSchema>;
export type UpgradeMcpInput = z.infer<typeof UpgradeMcpInputSchema>;
export type GitInitRepoInput = z.infer<typeof GitInitRepoInputSchema>;
export type GitCommitInput = z.infer<typeof GitCommitInputSchema>;
export type GitPushInput = z.infer<typeof GitPushInputSchema>;
export type GitMergeInput = z.infer<typeof GitMergeInputSchema>;
export type GetKitStatusInput = z.infer<typeof GetKitStatusInputSchema>;
export type DownloadKitInput = z.infer<typeof DownloadKitInputSchema>;
export type RegenerateKitInput = z.infer<typeof RegenerateKitInputSchema>;
export type ImportProjectInput = z.infer<typeof ImportProjectInputSchema>;
export type CreateApiTokenInput = z.infer<typeof CreateApiTokenInputSchema>;
export type ListApiTokensInput = z.infer<typeof ListApiTokensInputSchema>;
export type RevokeApiTokenInput = z.infer<typeof RevokeApiTokenInputSchema>;
export type ImplementInput = z.infer<typeof ImplementInputSchema>;
export type AnalyzeInput = z.infer<typeof AnalyzeInputSchema>;
export type SessionStartInput = z.infer<typeof SessionStartInputSchema>;
export type BuildScopeInput = z.infer<typeof BuildScopeInputSchema>;
export type BuildScopeResult = z.infer<typeof BuildScopeResultSchema>;
export type ValidateScopeInput = z.infer<typeof ValidateScopeInputSchema>;
export type ValidateScopeResult = z.infer<typeof ValidateScopeResultSchema>;
