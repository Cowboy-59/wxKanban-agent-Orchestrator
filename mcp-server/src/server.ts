import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {

  CallToolRequestSchema,
  ListToolsRequestSchema,
  McpError,
  ErrorCode,
} from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { db } from './db/connection.js';
import { events, projectdocuments, projecttasks, projectspecifications } from './db/schema.js';
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs';
import { basename, dirname, join, resolve } from 'path';

import { eq, and, desc, sql } from 'drizzle-orm';
import { AuthContext, createAuthError } from './auth/auth-context.js';
import { checkPermission } from './auth/role-checker.js';
import logger from './utils/logger.js';
import {
  CaptureEventInputSchema,
  UpsertDocumentInputSchema,
  CreateTaskInputSchema,
  UpdateTaskStatusInputSchema,
  LinkDocToTaskInputSchema,
  ListOpenItemsInputSchema,
  CreateSpecsInputSchema,
  CheckForUpdatesInputSchema,
  UpgradeMcpInputSchema,
  GetKitStatusInputSchema,
  DownloadKitInputSchema,
  RegenerateKitInputSchema,
  ImportProjectInputSchema,
  CreateApiTokenInputSchema,
  ListApiTokensInputSchema,
  RevokeApiTokenInputSchema,
  ImplementInputSchema,
  AnalyzeInputSchema,
  SessionStartInputSchema,
  BuildScopeInputSchema,
  ValidateScopeInputSchema,
} from './utils/schemas.js';
import {
  checkForUpdates,
  installUpdate,
  autoCheckOnStartup,
} from './utils/github-updater.js';

import {
  generateSpecLifecycleJson,
  generateProjectLifecycleMarkdown,
  pushLifecycleToDb,
  getAllSpecsForLifecycle,
} from './utils/lifecycle-generator.js';

import {
  getKitStatus,
  generateDownloadUrl,
  regenerateKit,
  importProject,
  createApiToken,
  listApiTokens,
  revokeApiToken,
  buildScope,
  createSpecsPreflight,
  validateScope,
} from './utils/project-kit.js';

import config from './config.js';
import { resolveProjectContext } from './utils/project-context.js';
import { getMcpHealthState } from './utils/mcp-health.js';
import { MCP_HELP_TEXT, type HelpMode, renderHelpText } from './utils/help-context.js';

// Initialize MCP Server
const server = new Server(
  {
    name: 'mcp-project-hub',
    version: '0.1.0',
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

// Helper to extract auth from request context
function extractAuth(extra: Record<string, unknown> | undefined): AuthContext {
  // In stdio mode, auth comes from environment or request metadata
  // In HTTP mode, it comes from headers
  
  const apiKey = (extra?.apiKey as string) || config.apiKey;
  const role = (extra?.role as AuthContext['role']) || 'editor';
  const userId = extra?.userId as string | undefined;
  const source = (extra?.source as string) || 'unknown';
  
  return {
    apiKey,
    role,
    userId,
    source,
  };
}

// Validate API key
function validateApiKey(auth: AuthContext): void {
  if (auth.apiKey !== config.apiKey) {
    throw createAuthError('Invalid API key', 'INVALID_KEY');
  }
}

const PROJECT_SCOPED_TOOLS = new Set([
  'project.capture_event',
  'project.upsert_document',
  'project.create_task',
  'project.list_open_items',
  'project.create_specs',
  'project.kit_status',
  'project.download_kit',
  'project.regenerate_kit',
  'project.validatescope',
]);

function resolveWorkspaceRoot(): string {
  const cwd = resolve(process.cwd());
  if (existsSync(join(cwd, 'specs'))) {
    return cwd;
  }

  if (basename(cwd).toLowerCase() === 'mcp-server') {
    const parent = dirname(cwd);
    if (existsSync(join(parent, 'specs'))) {
      return parent;
    }
  }

  return cwd;
}

function toSpecFolderName(specNumber: string, featureName: string, workspaceRoot: string): string {
  const projectScopeDir = join(workspaceRoot, 'specs', 'Project-Scope');
  if (existsSync(projectScopeDir)) {
    try {
      const scopeFiles = readdirSync(projectScopeDir);
      const matched = scopeFiles.find((name) => name.startsWith(`${specNumber}-`) && name.endsWith('.md'));
      if (matched) {
        const slug = matched.replace(/^\d{3}-/, '').replace(/\.md$/i, '');
        if (slug) {
          return `${specNumber}-${slug}`;
        }
      }
    } catch {
      // Fall back to feature-name based slug if scope lookup fails.
    }
  }

  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'of', 'for', 'to', 'with']);
  const normalized = featureName
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((token) => token && !stopWords.has(token))
    .slice(0, 5)
    .join('-') || 'feature';

  return `${specNumber}-${normalized}`;
}

function createTasksMarkdown(taskDefinitions: Array<{
  title: string;
  description?: string;
  status?: string;
  priority?: string;
}>): string {
  const lines = ['# Tasks', ''];

  if (taskDefinitions.length === 0) {
    lines.push('- [ ] T001 Define initial implementation tasks');
    lines.push('');
    lines.push('> No tasks were provided during create_specs. Add detailed tasks before implementation.');
    return lines.join('\n');
  }

  taskDefinitions.forEach((task, index) => {
    const taskId = `T${String(index + 1).padStart(3, '0')}`;
    const priority = task.priority ? ` [${task.priority}]` : '';
    const description = task.description ? ` - ${task.description}` : '';
    lines.push(`- [ ] ${taskId}${priority} ${task.title}${description}`);
  });

  return lines.join('\n');
}

function writeSpecArtifacts(input: {
  specNumber: string;
  featureName: string;
  scopeContent: string;
  planContent: string;
  lifecycleContent: string;
  taskDefinitions: Array<{
    title: string;
    description?: string;
    status?: string;
    priority?: string;
  }>;
}): string[] {
  const workspaceRoot = resolveWorkspaceRoot();
  const folderName = toSpecFolderName(input.specNumber, input.featureName, workspaceRoot);
  const specDir = join(workspaceRoot, 'specs', folderName);

  mkdirSync(specDir, { recursive: true });

  const specPath = join(specDir, 'spec.md');
  const planPath = join(specDir, 'plan.md');
  const lifecyclePath = join(specDir, 'lifecycle.json');
  const tasksPath = join(specDir, 'tasks.md');

  writeFileSync(specPath, input.scopeContent, 'utf8');
  writeFileSync(planPath, input.planContent, 'utf8');
  writeFileSync(lifecyclePath, input.lifecycleContent, 'utf8');
  writeFileSync(tasksPath, createTasksMarkdown(input.taskDefinitions), 'utf8');

  return [
    `specs/${folderName}/spec.md`,
    `specs/${folderName}/plan.md`,
    `specs/${folderName}/lifecycle.json`,
    `specs/${folderName}/tasks.md`,
  ];
}

function resolveSpecArtifactsDir(specNumber: string): string | null {
  const workspaceRoot = resolveWorkspaceRoot();
  const specsRoot = join(workspaceRoot, 'specs');
  if (!existsSync(specsRoot)) {
    return null;
  }

  const candidates = readdirSync(specsRoot)
    .filter((name) => name.startsWith(`${specNumber}-`))
    .map((name) => join(specsRoot, name))
    .filter((absolute) => {
      try {
        return statSync(absolute).isDirectory() && existsSync(join(absolute, 'spec.md'));
      } catch {
        return false;
      }
    })
    .sort();

  return candidates[0] ?? null;
}

function analyzeSpecArtifacts(specNumber: string, maxFindings: number): {
  analysis: {
    totalRequirements: number;
    totalTasks: number;
    coverage: string;
    ambiguityCount: number;
    duplicationCount: number;
    criticalIssues: number;
  };
  findings: Array<{ severity: 'critical' | 'warning'; category: string; message: string; file?: string }>;
  artifacts: {
    specPath?: string;
    planPath?: string;
    tasksPath?: string;
  };
} {
  const findings: Array<{ severity: 'critical' | 'warning'; category: string; message: string; file?: string }> = [];
  const dir = resolveSpecArtifactsDir(specNumber);

  if (!dir) {
    findings.push({
      severity: 'critical',
      category: 'artifacts',
      message: `No spec artifacts directory found for spec ${specNumber}. Expected specs/${specNumber}-*/ with spec.md.`,
    });

    return {
      analysis: {
        totalRequirements: 0,
        totalTasks: 0,
        coverage: '0%',
        ambiguityCount: 0,
        duplicationCount: 0,
        criticalIssues: 1,
      },
      findings: findings.slice(0, maxFindings),
      artifacts: {},
    };
  }

  const specPath = join(dir, 'spec.md');
  const planPath = join(dir, 'plan.md');
  const tasksPath = join(dir, 'tasks.md');

  const specContent = existsSync(specPath) ? readFileSync(specPath, 'utf8') : '';
  const planContent = existsSync(planPath) ? readFileSync(planPath, 'utf8') : '';
  const tasksContent = existsSync(tasksPath) ? readFileSync(tasksPath, 'utf8') : '';

  if (!specContent) {
    findings.push({ severity: 'critical', category: 'artifacts', message: 'Missing or empty spec.md', file: specPath });
  }
  if (!planContent) {
    findings.push({ severity: 'warning', category: 'artifacts', message: 'Missing or empty plan.md', file: planPath });
  }
  if (!tasksContent) {
    findings.push({ severity: 'critical', category: 'artifacts', message: 'Missing or empty tasks.md', file: tasksPath });
  }

  const requirementIdMatches = [...specContent.matchAll(/\bFR-(\d{3})\b/g)].map((match) => `FR-${match[1]}`);
  const uniqueRequirementIds = new Set(requirementIdMatches);
  const totalRequirements = uniqueRequirementIds.size;

  const taskIdMatches = [...tasksContent.matchAll(/^- \[[ xX]\]\s+(T\d+[a-z]?)/gim)].map((match) => match[1].toUpperCase());
  const uniqueTaskIds = new Set(taskIdMatches);
  const totalTasks = uniqueTaskIds.size;

  if (totalRequirements === 0 && specContent) {
    findings.push({ severity: 'critical', category: 'requirements', message: 'No FR-* requirements found in spec.md', file: specPath });
  }
  if (totalTasks === 0 && tasksContent) {
    findings.push({ severity: 'critical', category: 'tasks', message: 'No task checklist entries found in tasks.md', file: tasksPath });
  }

  const duplicateRequirementCount = requirementIdMatches.length - uniqueRequirementIds.size;
  const duplicateTaskCount = taskIdMatches.length - uniqueTaskIds.size;
  const duplicationCount = Math.max(0, duplicateRequirementCount) + Math.max(0, duplicateTaskCount);
  if (duplicateRequirementCount > 0) {
    findings.push({ severity: 'warning', category: 'duplication', message: `Duplicate FR IDs detected (${duplicateRequirementCount})`, file: specPath });
  }
  if (duplicateTaskCount > 0) {
    findings.push({ severity: 'warning', category: 'duplication', message: `Duplicate task IDs detected (${duplicateTaskCount})`, file: tasksPath });
  }

  const ambiguityRegex = /\b(TBD|TODO|placeholder|needs clarification)\b/gi;
  const ambiguityCount = (
    (specContent.match(ambiguityRegex)?.length ?? 0) +
    (planContent.match(ambiguityRegex)?.length ?? 0) +
    (tasksContent.match(ambiguityRegex)?.length ?? 0)
  );
  if (ambiguityCount > 0) {
    findings.push({ severity: 'warning', category: 'quality', message: `Ambiguous markers found (${ambiguityCount}) across artifacts` });
  }

  const coverageValue = totalRequirements > 0
    ? Math.min(100, Math.round((totalTasks / totalRequirements) * 100))
    : 0;
  const coverage = `${coverageValue}%`;

  return {
    analysis: {
      totalRequirements,
      totalTasks,
      coverage,
      ambiguityCount,
      duplicationCount,
      criticalIssues: findings.filter((f) => f.severity === 'critical').length,
    },
    findings: findings.slice(0, maxFindings),
    artifacts: {
      specPath,
      planPath,
      tasksPath,
    },
  };
}

type ParsedImplementationTask = {
  taskId: string;
  name: string;
  description: string;
  status: 'todo' | 'in_progress' | 'blocked' | 'done';
  priority: 'low' | 'medium' | 'high' | 'critical';
};

function parseTasksMarkdown(tasksContent: string): ParsedImplementationTask[] {
  const tasks: ParsedImplementationTask[] = [];
  const lines = tasksContent.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^- \[([ xX])\]\s+(T\d+[a-z]?)\s*(.*)$/i);
    if (!match) {
      continue;
    }

    const checked = match[1].toLowerCase() === 'x';
    const taskId = match[2].toUpperCase();
    const remainder = (match[3] || '').trim();

    let priority: ParsedImplementationTask['priority'] = 'medium';
    let normalized = remainder;
    const priorityMatch = normalized.match(/^\[(low|medium|high|critical)\]\s*/i);
    if (priorityMatch) {
      priority = priorityMatch[1].toLowerCase() as ParsedImplementationTask['priority'];
      normalized = normalized.slice(priorityMatch[0].length).trim();
    }

    const [namePart, descriptionPart] = normalized.split(/\s+-\s+/, 2);
    const title = (namePart || 'Untitled task').trim();

    tasks.push({
      taskId,
      name: `${taskId} ${title}`.trim(),
      description: (descriptionPart || '').trim(),
      status: checked ? 'done' : 'todo',
      priority,
    });
  }

  return tasks;
}

function withResolvedProjectId(
  toolName: string,
  args: Record<string, unknown> | undefined
): { resolvedArgs: Record<string, unknown> | undefined; resolutionSource: 'args' | 'env' | 'file' | 'none' } {
  if (!PROJECT_SCOPED_TOOLS.has(toolName)) {
    return { resolvedArgs: args, resolutionSource: 'none' };
  }

  const context = resolveProjectContext(args);
  if (context.projectId && (!args || !args.projectId)) {
    return {
      resolvedArgs: {
        ...(args || {}),
        projectId: context.projectId,
      },
      resolutionSource: context.source,
    };
  }

  return { resolvedArgs: args, resolutionSource: context.source };
}

function resolveHelpMode(args: Record<string, unknown> | undefined): HelpMode {
  if (!args) {
    return 'all';
  }

  const directMode = args.mode;
  if (directMode === 'all' || directMode === 'git' || directMode === 'docs') {
    return directMode;
  }

  const possibleTokens: string[] = [];
  const appendToken = (value: unknown): void => {
    if (typeof value === 'string') {
      possibleTokens.push(value.toLowerCase());
    }
  };

  appendToken(args.flag);
  appendToken(args.flags);
  appendToken(args.filter);
  appendToken(args.command);

  if (Array.isArray(args.flags)) {
    for (const entry of args.flags) {
      appendToken(entry);
    }
  }

  if (possibleTokens.some((token) => token.includes('--git') || token === 'git')) {
    return 'git';
  }

  if (possibleTokens.some((token) => token.includes('--docs') || token === 'docs')) {
    return 'docs';
  }

  return 'all';
}

function summarizeToolArgs(args: Record<string, unknown> | undefined): Record<string, unknown> {
  if (!args) {
    return {};
  }

  if (config.mcpLogPayloads) {
    return args;
  }

  return {
    keys: Object.keys(args),
  };
}

// Tool: project.capture_event
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: rawArgs } = request.params;
  const auth = extractAuth(request.params._meta as Record<string, unknown> | undefined);
  const requestMeta = request.params._meta as Record<string, unknown> | undefined;
  const requestId = typeof requestMeta?.requestId === 'string' ? requestMeta.requestId : undefined;
  const startedAt = Date.now();
  let didFail = false;
  const { resolvedArgs: args, resolutionSource } = withResolvedProjectId(
    name,
    rawArgs as Record<string, unknown> | undefined
  );

  logger.info('tool.call.start', {
    requestId,
    tool: name,
    resolutionSource,
    args: summarizeToolArgs(args),
  });
  
  try {
    // Validate auth
    validateApiKey(auth);
    checkPermission(name, auth);
    
    logger.audit('tool_call', name, auth.userId, args?.projectId as string || 'unknown', {
      requestId,
      args: summarizeToolArgs(args),
      resolutionSource,
    });
    
    switch (name) {
      case 'project.capture_event': {
        const input = CaptureEventInputSchema.parse(args);

        if (input.type === 'chat_thread') {
          logger.info('chat.capture_event', {
            requestId,
            projectId: input.projectId,
            actor: input.actor,
            source: input.source,
            metadataKeys: input.metadata ? Object.keys(input.metadata) : [],
            rawContentLength: input.rawContent.length,
            normalizedContentLength: input.normalizedContent?.length || 0,
            rawContent: config.mcpLogRawChat ? input.rawContent : '[redacted]',
            normalizedContent: config.mcpLogRawChat ? input.normalizedContent : '[redacted]',
          });
        }
        
        if (resolutionSource !== 'args') {
          logger.warn('project.capture_event using resolved project context (not explicit args)', {
            projectId: input.projectId,
            resolutionSource,
            actor: input.actor,
            source: input.source,
          });
        }
        
        const [event] = await db.insert(events).values({
          projectId: input.projectId,
          type: input.type,
          source: input.source,
          actor: input.actor,
          rawContent: input.rawContent,
          normalizedContent: input.normalizedContent || null,
          metadata: input.metadata || null,
        }).returning();
        
        logger.info('Event captured', { eventId: event.id, projectId: event.projectId });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                event: {
                  id: event.id,
                  projectId: event.projectId,
                  type: event.type,
                  source: event.source,
                  actor: event.actor,
                  rawContent: event.rawContent,
                  normalizedContent: event.normalizedContent,
                  metadata: event.metadata,
                  createdAt: event.createdAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      
      case 'project.upsert_document': {
        const input = UpsertDocumentInputSchema.parse(args);

        const derivedDocType = input.title
          .trim()
          .replace(/\.md$/i, '')
          .trim()
          .toLowerCase() || 'document';
        
        let document;
        let created = false;
        
        if (input.documentId) {
          // Update existing
          const [updated] = await db.update(projectdocuments)
            .set({
              title: input.title,
              content: input.bodyMarkdown,
              doctype: derivedDocType,
              sourceEventId: input.sourceEventId || null,
              taskIds: input.taskIds || [],
              tags: input.tags || [],
              updatedAt: new Date(),
            })
            .where(and(
              eq(projectdocuments.id, input.documentId),
              eq(projectdocuments.projectId, input.projectId)
            ))
            .returning();
          
          if (!updated) {
            throw new McpError(ErrorCode.InvalidRequest, 'Document not found');
          }
          
          document = updated;
          created = false;
        } else {
          // Create new
          const [inserted] = await db.insert(projectdocuments).values({
            projectId: input.projectId,
            title: input.title,
            content: input.bodyMarkdown,
            doctype: derivedDocType,
            sourceEventId: input.sourceEventId || null,
            taskIds: input.taskIds || [],
            tags: input.tags || [],
          }).returning();
          
          document = inserted;
          created = true;
        }
        
        logger.info('Document upserted', { 
          documentId: document.id, 
          projectId: document.projectId,
          created 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                document: {
                  id: document.id,
                  projectId: document.projectId,
                  title: document.title,
                  bodyMarkdown: document.content,
                  sourceEventId: document.sourceEventId,
                  taskIds: document.taskIds || [],
                  tags: document.tags || [],
                  createdAt: document.createdAt.toISOString(),
                  updatedAt: document.updatedAt.toISOString(),
                },
                created,
              }),
            },
          ],
        };
      }
      
      case 'project.create_task': {
        const input = CreateTaskInputSchema.parse(args);
        
        const [task] = await db.insert(projecttasks).values({
          projectId: input.projectId,
          name: input.title,
          description: input.descriptionMarkdown,
          status: input.status || 'todo',
          priority: input.priority || 'medium',
          dueDate: input.dueDate ? new Date(input.dueDate) : null,
          sourceEventId: input.sourceEventId || null,
          documentIds: input.documentIds || [],
          assignee: input.assignee || null,
        }).returning();
        
        logger.info('Task created', { taskId: task.id, projectId: task.projectId });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task: {
                  id: task.id,
                  projectId: task.projectId,
                  title: task.name,
                  descriptionMarkdown: task.description || '',
                  status: task.status,
                  priority: task.priority,
                  dueDate: task.dueDate?.toISOString() || null,
                  sourceEventId: task.sourceEventId,
                  documentIds: task.documentIds || [],
                  assignee: task.assignee,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      
      case 'project.update_task_status': {
        const input = UpdateTaskStatusInputSchema.parse(args);
        
        const [task] = await db.update(projecttasks)
          .set({
            status: input.status,
            updatedAt: new Date(),
          })
          .where(eq(projecttasks.id, input.taskId))
          .returning();
        
        if (!task) {
          throw new McpError(ErrorCode.InvalidRequest, 'Task not found');
        }
        
        logger.info('Task status updated', { 
          taskId: task.id, 
          projectId: task.projectId,
          newStatus: input.status 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task: {
                  id: task.id,
                  projectId: task.projectId,
                  title: task.name,
                  descriptionMarkdown: task.description || '',
                  status: task.status,
                  priority: task.priority,
                  dueDate: task.dueDate?.toISOString() || null,
                  sourceEventId: task.sourceEventId,
                  documentIds: task.documentIds || [],
                  assignee: task.assignee,
                  createdAt: task.createdAt.toISOString(),
                  updatedAt: task.updatedAt.toISOString(),
                },
              }),
            },
          ],
        };
      }
      
      case 'project.link_doc_to_task': {
        const input = LinkDocToTaskInputSchema.parse(args);
        
        // Get current task
        const [task] = await db.select()
          .from(projecttasks)
          .where(eq(projecttasks.id, input.taskId))
          .limit(1);
        
        if (!task) {
          throw new McpError(ErrorCode.InvalidRequest, 'Task not found');
        }
        
        // Get current document
        const [document] = await db.select()
          .from(projectdocuments)
          .where(eq(projectdocuments.id, input.documentId))
          .limit(1);
        
        if (!document) {
          throw new McpError(ErrorCode.InvalidRequest, 'Document not found');
        }
        
        // Update task with document link
        const taskDocIds = Array.isArray(task.documentIds) ? task.documentIds : [];
        const updatedTaskIds = [...new Set([...taskDocIds, input.documentId])];

        const [updatedTask] = await db.update(projecttasks)
          .set({
            documentIds: updatedTaskIds,
            updatedAt: new Date(),
          })
          .where(eq(projecttasks.id, input.taskId))
          .returning();
        
        // Update document with task link
        const docTaskIds = Array.isArray(document.taskIds) ? document.taskIds : [];
        const updatedDocTaskIds = [...new Set([...docTaskIds, input.taskId])];

        const [updatedDocument] = await db.update(projectdocuments)
          .set({
            taskIds: updatedDocTaskIds,
            updatedAt: new Date(),
          })
          .where(eq(projectdocuments.id, input.documentId))
          .returning();
        
        logger.info('Linked doc to task', { 
          taskId: task.id, 
          documentId: document.id 
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                task: {
                  id: updatedTask.id,
                  title: updatedTask.name,
                  documentIds: updatedTask.documentIds || [],
                },
                document: {
                  id: updatedDocument.id,
                  title: updatedDocument.title,
                  taskIds: updatedDocument.taskIds || [],
                },
              }),
            },
          ],
        };
      }
      
      case 'project.list_open_items': {
        const input = ListOpenItemsInputSchema.parse(args);
        const maxItems = input.maxItems || 50;
        
        // Get open tasks
        const tasks = await db.select()
          .from(projecttasks)
          .where(and(
            eq(projecttasks.projectId, input.projectId),
            sql`${projecttasks.status} != 'done'`
          ))
          .orderBy(desc(projecttasks.createdAt))
          .limit(maxItems);
        
        // Get recent documents
        const documents = await db.select()
          .from(projectdocuments)
          .where(eq(projectdocuments.projectId, input.projectId))
          .orderBy(desc(projectdocuments.updatedAt))
          .limit(maxItems);
        
        // Get recent events
        const recentEvents = await db.select()
          .from(events)
          .where(eq(events.projectId, input.projectId))
          .orderBy(desc(events.createdAt))
          .limit(maxItems);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                tasks: tasks.map(t => ({
                  id: t.id,
                  projectId: t.projectId,
                  title: t.name,
                  descriptionMarkdown: t.description || '',
                  status: t.status,
                  priority: t.priority,
                  dueDate: t.dueDate?.toISOString() || null,
                  sourceEventId: t.sourceEventId,
                  documentIds: t.documentIds || [],
                  assignee: t.assignee,
                  createdAt: t.createdAt.toISOString(),
                  updatedAt: t.updatedAt.toISOString(),
                })),
                documents: documents.map(d => ({
                  id: d.id,
                  projectId: d.projectId,
                  title: d.title,
                  bodyMarkdown: d.content,
                  sourceEventId: d.sourceEventId,
                  taskIds: d.taskIds || [],
                  tags: d.tags || [],
                  createdAt: d.createdAt.toISOString(),
                  updatedAt: d.updatedAt.toISOString(),
                })),
                events: recentEvents.map(e => ({
                  id: e.id,
                  projectId: e.projectId,
                  type: e.type,
                  source: e.source,
                  actor: e.actor,
                  rawContent: e.rawContent,
                  normalizedContent: e.normalizedContent,
                  metadata: e.metadata,
                  createdAt: e.createdAt.toISOString(),
                })),
              }),
            },
          ],
        };
      }
      
      case 'project.check_for_updates': {
        const input = CheckForUpdatesInputSchema.parse(args);
        
        const status = await checkForUpdates(input.force);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                currentVersion: status.currentVersion,
                latestVersion: status.latestVersion,
                updateAvailable: status.updateAvailable,
                releaseInfo: status.releaseInfo ? {
                  version: status.releaseInfo.version,
                  tagName: status.releaseInfo.tagName,
                  publishedAt: status.releaseInfo.publishedAt,
                  htmlUrl: status.releaseInfo.htmlUrl,
                  tarballUrl: status.releaseInfo.tarballUrl,
                  body: status.releaseInfo.body,
                  prerelease: status.releaseInfo.prerelease,
                  draft: status.releaseInfo.draft,
                } : null,
                lastChecked: status.lastChecked?.toISOString() || null,
                error: status.error,
              }),
            },
          ],
        };
      }
      
      case 'project.upgrade_mcp': {
        const input = UpgradeMcpInputSchema.parse(args);
        
        if (input.dryRun) {
          // Just check without installing
          const status = await checkForUpdates(true);
          
          if (!status.updateAvailable || !status.releaseInfo) {
            return {
              content: [
                {
                  type: 'text',
                  text: JSON.stringify({
                    success: true,
                    message: 'No update available or already on latest version',
                    previousVersion: status.currentVersion,
                    newVersion: status.latestVersion,
                  }),
                },
              ],
            };
          }
          
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: true,
                  message: `Would upgrade from ${status.currentVersion} to ${status.releaseInfo.version} (dry run)`,
                  previousVersion: status.currentVersion,
                  newVersion: status.releaseInfo.version,
                }),
              },
            ],
          };
        }
        
        // Get latest release info
        const status = await checkForUpdates(true);
        
        if (!status.updateAvailable || !status.releaseInfo) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  message: 'No update available or already on latest version',
                }),
              },
            ],
          };
        }
        
        // Install the update
        const result = await installUpdate(status.releaseInfo);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: result.success,
                message: result.message,
                previousVersion: status.currentVersion,
                newVersion: status.releaseInfo.version,
              }),
            },
          ],
        };
      }
      
      case 'project.create_specs': {

        const input = CreateSpecsInputSchema.parse(args);
        const preflight = createSpecsPreflight(input.scopeContent);

        if (!preflight.isValid) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  success: false,
                  blocked: true,
                  message: `create_specs blocked for scope ${input.specNumber}. Resolve the scope quality issues first.`,
                  blockingIssues: preflight.blockingIssues,
                  preflight,
                  spec: null,
                  documents: [],
                  tasks: [],
                  lifecycleGenerated: false,
                  projectLifecycleUpdated: false,
                  artifactFiles: [],
                  events: [],
                }),
              },
            ],
          };
        }

        const results = {
          success: true,
          blocked: false,
          message: `create_specs completed for scope ${input.specNumber}.`,
          blockingIssues: [] as string[],
          preflight,
          spec: null as any,
          documents: [] as any[],
          tasks: [] as any[],
          lifecycleGenerated: false,
          projectLifecycleUpdated: false,
          artifactFiles: [] as string[],
          events: [] as any[],
        };
        
        // Phase 0: Capture spec_pipeline_started event
        const [startEvent] = await db.insert(events).values({
          projectId: input.projectId,
          type: 'spec_created',
          source: 'mcp-server',
          actor: 'create_specs',
          rawContent: `Starting createSpecs pipeline for ${input.specNumber} - ${input.featureName}`,
          metadata: { specNumber: input.specNumber, phase: input.phase },
        }).returning();
        results.events.push({ id: startEvent.id, type: 'spec_pipeline_started' });
        
        // Create spec in projectspecifications table
        const [spec] = await db.insert(projectspecifications).values({
          projectId: input.projectId,
          specNumber: input.specNumber,
          title: input.featureName,
          content: input.scopeContent,
          status: input.phase === 'scoping' ? 'draft' : 
                  input.phase === 'design' ? 'planned' :
                  input.phase === 'implementation' ? 'implementing' :
                  input.phase === 'qa' ? 'qa' :
                  input.phase === 'human_testing' ? 'human_testing' :
                  input.phase === 'beta' ? 'beta' :
                  input.phase === 'released' ? 'released' : 'draft',
        }).returning();

        results.spec = {
          id: spec.id,
          projectId: spec.projectId,
          specNumber: spec.specNumber,
          title: spec.title,
          status: spec.status,
          createdAt: spec.createdAt.toISOString(),
        };
        
        // Create spec document
        const [specDoc] = await db.insert(projectdocuments).values({
          projectId: input.projectId,
          title: `Spec ${input.specNumber}: ${input.featureName}`,
          content: input.scopeContent,
          doctype: 'specs',
          sourceEventId: startEvent.id,
          tags: ['spec', input.specNumber, input.phase],
        }).returning();
        results.documents.push({
          id: specDoc.id,
          title: specDoc.title,
          type: 'spec',
        });
        
        // Create plan document
        const planContent = `# Implementation Plan: ${input.featureName}\n\n## Overview\nSpec ${input.specNumber} implementation plan.\n\n## Phases\n1. Design\n2. Implementation\n3. QA Testing\n4. Human Testing\n5. Beta Release\n6. Released\n\n## Tasks\nSee generated tasks below.`;

        const [planDoc] = await db.insert(projectdocuments).values({
          projectId: input.projectId,
          title: `Plan: ${input.featureName}`,
          content: planContent,
          doctype: 'specs',
          sourceEventId: startEvent.id,
          tags: ['plan', input.specNumber],
        }).returning();
        results.documents.push({
          id: planDoc.id,
          title: planDoc.title,
          type: 'plan',
        });
        
        // Create tasks from spec
        const taskDefinitions = input.tasks || [];
        const createdTasks = [];
        for (const taskDef of taskDefinitions) {
          const [task] = await db.insert(projecttasks).values({
            projectId: input.projectId,
            name: taskDef.title,
            description: taskDef.description,
            status: taskDef.status || 'todo',
            priority: taskDef.priority,
            sourceEventId: startEvent.id,
            specId: spec.id,
            documentIds: [specDoc.id],
          }).returning();
          
          createdTasks.push(task);
          results.tasks.push({
            id: task.id,
            title: task.name,
            status: task.status,
          });
          
          // Link task to spec document
          const currentTaskIds = Array.isArray(specDoc.taskIds) ? specDoc.taskIds : [];
          await db.update(projectdocuments)
            .set({
              taskIds: [...new Set([...currentTaskIds, task.id])],
              updatedAt: new Date(),
            })
            .where(eq(projectdocuments.id, specDoc.id));
        }
        
        // Generate lifecycle if requested
        if (input.generateLifecycle) {
          const currentPhaseNum = input.phase === 'scoping' ? 0 :
                                  input.phase === 'design' ? 1 :
                                  input.phase === 'implementation' ? 2 :
                                  input.phase === 'qa' ? 3 :
                                  input.phase === 'human_testing' ? 4 :
                                  input.phase === 'beta' ? 5 :
                                  input.phase === 'released' ? 6 : 0;
          
          const progress = createdTasks.length > 0 
            ? Math.round((createdTasks.filter(t => t.status === 'done').length / createdTasks.length) * 100)
            : 0;
          
          // Generate lifecycle.json content
          const lifecycleData = generateSpecLifecycleJson(
            input.specNumber,
            input.featureName,
            currentPhaseNum,
            progress
          );
          
          // Create lifecycle document
          const lifecycleContent = JSON.stringify(lifecycleData, null, 2);

          const [lifecycleDoc] = await db.insert(projectdocuments).values({
            projectId: input.projectId,
            title: `Lifecycle: ${input.featureName}`,
            content: lifecycleContent,
            doctype: 'lifecycle',
            sourceEventId: startEvent.id,
            tags: ['lifecycle', input.specNumber],
          }).returning();
          results.documents.push({
            id: lifecycleDoc.id,
            title: lifecycleDoc.title,
            type: 'lifecycle',
          });
          
          // Generate and push project lifecycle
          const allSpecs = await getAllSpecsForLifecycle(input.projectId);
          // Add the new spec to the list
          allSpecs.push({
            specNumber: input.specNumber,
            featureName: input.featureName,
            currentPhase: currentPhaseNum,
            status: lifecycleData.status,
            progress,
          });
          
          const projectLifecycleContent = generateProjectLifecycleMarkdown(allSpecs);
          const lifecycleResult = await pushLifecycleToDb(
            input.projectId,
            projectLifecycleContent,
            'wxKanban Platform Development Lifecycle — Aggregated View',
            'specs/projectlifecycle.md'
          );
          
          results.lifecycleGenerated = true;
          results.projectLifecycleUpdated = lifecycleResult.created || !lifecycleResult.created;

          results.artifactFiles = writeSpecArtifacts({
            specNumber: input.specNumber,
            featureName: input.featureName,
            scopeContent: input.scopeContent,
            planContent,
            lifecycleContent,
            taskDefinitions: taskDefinitions,
          });
        }
        
        // Capture completion event
        const [completeEvent] = await db.insert(events).values({
          projectId: input.projectId,
          type: 'spec_created',
          source: 'mcp-server',
          actor: 'create_specs',
          rawContent: `createSpecs pipeline complete for ${input.specNumber} — ${results.tasks.length} tasks created`,
          metadata: { 
            specNumber: input.specNumber, 
            taskCount: results.tasks.length,
            documentCount: results.documents.length,
          },
        }).returning();
        results.events.push({ id: completeEvent.id, type: 'spec_pipeline_complete' });
        
        logger.info('createSpecs pipeline complete', {
          specNumber: input.specNumber,
          specId: spec.id,
          taskCount: results.tasks.length,
          documentCount: results.documents.length,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(results),
            },
          ],
        };
      }
      
      case 'project.kit_status': {
        const input = GetKitStatusInputSchema.parse(args);
        const kitInfo = await getKitStatus(input.projectId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projectId: input.projectId,
                status: kitInfo.status,
                primaryAI: kitInfo.primaryAI,
                kitVersion: kitInfo.kitVersion,
                downloadUrl: kitInfo.downloadUrl,
                generatedAt: kitInfo.generatedAt,
                downloadCount: kitInfo.downloadCount,
              }),
            },
          ],
        };
      }
      
      case 'project.download_kit': {
        const input = DownloadKitInputSchema.parse(args);
        const downloadUrl = generateDownloadUrl(input.projectId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                projectId: input.projectId,
                downloadUrl,
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(), // 24 hours
              }),
            },
          ],
        };
      }
      
      case 'project.regenerate_kit': {
        const input = RegenerateKitInputSchema.parse(args);
        const result = await regenerateKit(input.projectId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.import_project': {
        const input = ImportProjectInputSchema.parse(args);
        const normalizedPhaseAssignments = input.phaseAssignments
          ? Object.fromEntries(
              Object.entries(input.phaseAssignments).map(([k, v]) => [String(k), String(v)])
            )
          : undefined;
        const result = await importProject({
          name: input.name,
          description: input.description,
          primaryAI: input.primaryAI,
          localDirectoryPath: input.localDirectoryPath,
          generateKit: input.generateKit,
          phaseAssignments: normalizedPhaseAssignments,
          createdById: auth.userId || 'unknown',
          companyId: input.companyId,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.create_api_token': {
        const input = CreateApiTokenInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required for token creation');
        }
        
        // Get companyId from input or auth context
        const companyId = input.companyId || (auth as any).companyId || 'default-company';
        
        const result = await createApiToken(
          auth.userId,
          companyId,
          input.label
        );
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                token: result.token,
                tokenPrefix: result.record.tokenprefix,
                label: result.record.label,
                createdAt: result.record.createdat.toISOString(),
                message: 'Store this token securely - it will not be shown again',
              }),
            },
          ],
        };
      }
      
      case 'project.list_api_tokens': {
        // Validate input schema (even if empty)
        ListApiTokensInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required');
        }
        
        const tokens = await listApiTokens(auth.userId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                tokens: tokens.map(t => ({
                  id: t.id,
                  tokenPrefix: t.tokenPrefix,
                  label: t.label,
                  createdAt: t.createdAt,
                  revokedAt: t.revokedAt,
                })),
                count: tokens.length,
              }),
            },
          ],
        };
      }
      
      case 'project.revoke_api_token': {
        const input = RevokeApiTokenInputSchema.parse(args);
        
        if (!auth.userId) {
          throw new McpError(ErrorCode.InvalidRequest, 'User ID required');
        }
        
        const revoked = await revokeApiToken(input.tokenId, auth.userId);
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: revoked,
                message: revoked ? 'Token revoked successfully' : 'Token not found or already revoked',
              }),
            },
          ],
        };
      }
      
      case 'project.mcp_health': {
        const health = getMcpHealthState();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                service: 'mcp-project-hub',
                version: '0.1.0',
                status: health.status,
                dbConnected: health.dbConnected,
                startupTime: health.startupTime,
                projectContext: health.projectContext,
                project: health.project,
                lastUpdated: health.lastUpdated,
              }),
            },
          ],
        };
      }

      case 'project.help': {
        const mode = resolveHelpMode(args);
        return {
          content: [
            {
              type: 'text',
              text: mode === 'all' ? MCP_HELP_TEXT : renderHelpText(mode),
            },
          ],
        };
      }
      
      case 'project.implement': {
        const input = ImplementInputSchema.parse(args);
        const artifactDir = resolveSpecArtifactsDir(input.specNumber);
        const tasksPath = artifactDir ? join(artifactDir, 'tasks.md') : null;

        const contextProject = resolveProjectContext(undefined);
        const specCandidates = contextProject.projectId
          ? await db.select().from(projectspecifications)
              .where(and(
                eq(projectspecifications.specNumber, input.specNumber),
                eq(projectspecifications.projectId, contextProject.projectId)
              ))
              .orderBy(desc(projectspecifications.createdAt))
              .limit(1)
          : await db.select().from(projectspecifications)
              .where(eq(projectspecifications.specNumber, input.specNumber))
              .orderBy(desc(projectspecifications.createdAt))
              .limit(1);

        const specRecord = specCandidates[0];
        const blockers: string[] = [];
        const warnings: string[] = [];

        if (!artifactDir) {
          blockers.push(`Spec artifact directory not found for ${input.specNumber} under specs/.`);
        }
        if (!specRecord) {
          blockers.push(`No projectspecifications record found for spec ${input.specNumber}.`);
        }

        let parsedTasks: ParsedImplementationTask[] = [];
        if (tasksPath && existsSync(tasksPath)) {
          parsedTasks = parseTasksMarkdown(readFileSync(tasksPath, 'utf8'));
        }

        if (input.scopeCheck && parsedTasks.length === 0) {
          blockers.push('Scope-first gate failed: tasks.md has no actionable task checklist entries.');
        }

        if (blockers.length > 0 && !input.force) {
          throw new McpError(
            ErrorCode.InvalidRequest,
            `Implementation blocked for spec ${input.specNumber}: ${blockers.join(' ')}`
          );
        }

        if (blockers.length > 0 && input.force) {
          warnings.push(...blockers.map((b) => `FORCED: ${b}`));
        }

        if (!specRecord) {
          throw new McpError(ErrorCode.InvalidRequest, `Cannot implement spec ${input.specNumber} without a spec record.`);
        }

        const [startEvent] = await db.insert(events).values({
          projectId: specRecord.projectId,
          type: 'task_created',
          source: 'mcp-server',
          actor: 'implement',
          rawContent: `Starting implementation for spec ${input.specNumber}`,
          metadata: {
            specId: specRecord.id,
            specNumber: input.specNumber,
            scopeCheck: input.scopeCheck,
            force: input.force,
            reason: input.reason,
          },
        }).returning();

        const existingTasks = await db.select().from(projecttasks).where(and(
          eq(projecttasks.projectId, specRecord.projectId),
          eq(projecttasks.specId, specRecord.id)
        ));
        const existingByName = new Map(existingTasks.map((t) => [t.name, t]));

        let createdTasks = 0;
        let updatedTasks = 0;
        const synchronizedTaskIds: string[] = [];

        for (const task of parsedTasks) {
          const existing = existingByName.get(task.name);
          if (existing) {
            await db.update(projecttasks)
              .set({
                description: task.description || existing.description,
                status: task.status,
                priority: task.priority,
                sourceEventId: startEvent.id,
                updatedAt: new Date(),
              })
              .where(eq(projecttasks.id, existing.id));
            updatedTasks += 1;
            synchronizedTaskIds.push(existing.id);
          } else {
            const [inserted] = await db.insert(projecttasks).values({
              projectId: specRecord.projectId,
              specId: specRecord.id,
              name: task.name,
              description: task.description || null,
              status: task.status,
              priority: task.priority,
              sourceEventId: startEvent.id,
            }).returning();
            createdTasks += 1;
            synchronizedTaskIds.push(inserted.id);
          }
        }

        await db.update(projectspecifications)
          .set({
            status: 'implementing',
            updatedAt: new Date(),
          })
          .where(eq(projectspecifications.id, specRecord.id));

        const lifecycleDocs = await db.select().from(projectdocuments).where(and(
          eq(projectdocuments.projectId, specRecord.projectId),
          eq(projectdocuments.doctype, 'lifecycle')
        ));

        const lifecycleDoc = lifecycleDocs.find((doc) => doc.tags && JSON.stringify(doc.tags).includes(input.specNumber));
        if (lifecycleDoc) {
          try {
            const parsed = JSON.parse(lifecycleDoc.content) as Record<string, unknown>;
            parsed.currentPhase = 2;
            parsed.status = 'implementing';
            parsed.updatedAt = new Date().toISOString();
            await db.update(projectdocuments)
              .set({
                content: JSON.stringify(parsed, null, 2),
                updatedAt: new Date(),
              })
              .where(eq(projectdocuments.id, lifecycleDoc.id));
          } catch {
            warnings.push('Lifecycle JSON could not be parsed; skipped lifecycle document phase update.');
          }
        }

        const completedCount = parsedTasks.filter((t) => t.status === 'done').length;
        const progress = parsedTasks.length > 0 ? Math.round((completedCount / parsedTasks.length) * 100) : 0;
        const allSpecs = await getAllSpecsForLifecycle(specRecord.projectId);
        const mergedSpecs = allSpecs.filter((s) => s.specNumber !== input.specNumber);
        mergedSpecs.push({
          specNumber: input.specNumber,
          featureName: specRecord.title,
          currentPhase: 2,
          status: 'implementing',
          progress,
        });

        const projectLifecycleContent = generateProjectLifecycleMarkdown(mergedSpecs);
        await pushLifecycleToDb(
          specRecord.projectId,
          projectLifecycleContent,
          'wxKanban Platform Development Lifecycle — Aggregated View',
          'specs/projectlifecycle.md'
        );

        const [completeEvent] = await db.insert(events).values({
          projectId: specRecord.projectId,
          type: 'task_completed',
          source: 'mcp-server',
          actor: 'implement',
          rawContent: `Implementation sync complete for spec ${input.specNumber}`,
          metadata: {
            specId: specRecord.id,
            specNumber: input.specNumber,
            createdTasks,
            updatedTasks,
            parsedTaskCount: parsedTasks.length,
            progress,
          },
        }).returning();

        logger.info('wxAI-implement completed', {
          specNumber: input.specNumber,
          projectId: specRecord.projectId,
          createdTasks,
          updatedTasks,
          parsedTaskCount: parsedTasks.length,
          progress,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `wxAI-implement completed for spec ${input.specNumber}`,
                specNumber: input.specNumber,
                specId: specRecord.id,
                projectId: specRecord.projectId,
                scopeCheck: input.scopeCheck,
                force: input.force,
                reason: input.reason,
                phases: [
                  'Phase 0: Scope-First Gate',
                  'Phase 1: Setup & Prerequisites',
                  'Phase 2: Implementation (Task Sync)',
                  'Phase 3: Task Push (MANDATORY)',
                  'Phase 4: Lifecycle Update',
                  'Phase 5: Completion Validation',
                ],
                status: 'implementing',
                taskSync: {
                  parsedTaskCount: parsedTasks.length,
                  createdTasks,
                  updatedTasks,
                  synchronizedTaskIds,
                  tasksPath,
                },
                lifecycle: {
                  currentPhase: 2,
                  status: 'implementing',
                  progress,
                },
                events: {
                  startEventId: startEvent.id,
                  completeEventId: completeEvent.id,
                },
                warnings,
              }),
            },
          ],
        };
      }
      
      case 'project.analyze': {
        const input = AnalyzeInputSchema.parse(args);

        const analyzed = analyzeSpecArtifacts(input.specNumber, input.maxFindings);

        logger.info('wxAI-analyze started', { 
          specNumber: input.specNumber,
          includeConstitution: input.includeConstitution,
          maxFindings: input.maxFindings,
          totalRequirements: analyzed.analysis.totalRequirements,
          totalTasks: analyzed.analysis.totalTasks,
          criticalIssues: analyzed.analysis.criticalIssues,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: `wxAI-analyze completed for spec ${input.specNumber}`,
                specNumber: input.specNumber,
                includeConstitution: input.includeConstitution,
                maxFindings: input.maxFindings,
                analysis: analyzed.analysis,
                findings: analyzed.findings,
                artifacts: analyzed.artifacts,
              }),
            },
          ],
        };
      }
      
      case 'project.session_start': {
        const input = SessionStartInputSchema.parse(args);
        
        // This is a placeholder - in real implementation, this would:
        // 1. Detect project type (SOURCE vs CONSUMER)
        // 2. Check governance version
        // 3. Scan for unlinked TODOs
        // 4. Load active scope context
        // 5. Display session summary
        
        logger.info('wxAI-session-start executed', { 
          scopeNumber: input.scopeNumber,
          skipVersionCheck: input.skipVersionCheck,
          skipTodoScan: input.skipTodoScan
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                success: true,
                message: 'wxAI-session-start completed',
                projectType: 'CONSUMER', // or 'SOURCE' if .wxkanban-origin exists
                scopeNumber: input.scopeNumber,
                governance: {
                  version: '1.2.0',
                  upToDate: true,
                  skipped: input.skipVersionCheck,
                },
                todos: {
                  scanned: !input.skipTodoScan,
                  unlinkedCount: 0,
                },
                sessionReady: true,
                note: 'This is a placeholder implementation. Full wxAI-session-start logic will perform complete session initialization.',
              }),
            },
          ],
        };
      }
      
      case 'project.buildscope': {
        const input = BuildScopeInputSchema.parse(args);
        
        // Use project-kit buildScope function
        const result = await buildScope({
          featureDescription: input.featureDescription,
          quick: input.quick,
          templateOnly: input.templateOnly,
          editSpecNumber: input.editSpecNumber,
          primaryActor: input.primaryActor,
          secondaryActors: input.secondaryActors,
          businessProblem: input.businessProblem,
          successMetrics: input.successMetrics,
          scopeBoundary: input.scopeBoundary,
          outOfScope: input.outOfScope,
          integrationContext: input.integrationContext,
          constraintsAndRisks: input.constraintsAndRisks,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      case 'project.validatescope': {
        const input = ValidateScopeInputSchema.parse(args);
        
        // Use project-kit validateScope function
        const result = await validateScope({
          specNumber: input.specNumber,
          filePath: input.filePath,
          projectId: input.projectId,
        });
        
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
            },
          ],
        };
      }
      
      default:
        throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${name}`);

    }
  } catch (error) {
    didFail = true;
    if (error instanceof z.ZodError) {
      logger.error('Validation error', error, { tool: name, args });
      throw new McpError(
        ErrorCode.InvalidParams,
        `Validation error: ${error.issues
          .map((e) => `${e.path.join('.')}: ${e.message}`)
          .join(', ')}`
      );
    }
    
    if (error instanceof McpError) {
      throw error;
    }
    
    logger.error('Tool execution error', error as Error, { tool: name, args });
    throw new McpError(
      ErrorCode.InternalError,
      `Error executing tool ${name}: ${(error as Error).message}`
    );
  } finally {
    if (!didFail) {
      logger.info('tool.call.success', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
      });
    } else {
      logger.warn('tool.call.failed', {
        requestId,
        tool: name,
        durationMs: Date.now() - startedAt,
      });
    }
  }
});

// List available tools
server.setRequestHandler(ListToolsRequestSchema, async () => {
  return {
    tools: [
      {
        name: 'project.capture_event',
        description: 'Capture a project event (chat, commit, meeting notes, etc.)',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            type: { 
              type: 'string', 
              enum: ['meeting_notes', 'chat_thread', 'commit', 'ticket_update', 'manual_note', 'spec_created', 'task_created', 'task_completed', 'document_updated'],
              description: 'Event type' 
            },
            source: { type: 'string', description: 'Event source (e.g., vscode, cli, github)' },
            actor: { type: 'string', description: 'User or system that triggered the event' },
            rawContent: { type: 'string', description: 'Raw event content' },
            normalizedContent: { type: 'string', description: 'Normalized/processed content (optional)' },
            metadata: { type: 'object', description: 'Additional metadata (optional)' },
          },
          required: ['projectId', 'type', 'source', 'actor', 'rawContent'],
        },
      },
      {
        name: 'project.upsert_document',
        description: 'Create or update a project document',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            title: { type: 'string', description: 'Document title' },
            bodyMarkdown: { type: 'string', description: 'Document content in Markdown' },
            sourceEventId: { type: 'string', format: 'uuid', description: 'Source event ID (optional)' },
            taskIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Linked task IDs (optional)' },
            tags: { type: 'array', items: { type: 'string' }, description: 'Document tags (optional)' },
            documentId: { type: 'string', format: 'uuid', description: 'Existing document ID to update (optional)' },
          },
          required: ['projectId', 'title', 'bodyMarkdown'],
        },
      },
      {
        name: 'project.create_task',
        description: 'Create a new project task',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            title: { type: 'string', description: 'Task title' },
            descriptionMarkdown: { type: 'string', description: 'Task description in Markdown' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], description: 'Task status (default: todo)' },
            priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority (default: medium)' },
            dueDate: { type: 'string', format: 'date-time', description: 'Due date ISO string (optional)' },
            sourceEventId: { type: 'string', format: 'uuid', description: 'Source event ID (optional)' },
            documentIds: { type: 'array', items: { type: 'string', format: 'uuid' }, description: 'Linked document IDs (optional)' },
            assignee: { type: 'string', description: 'Task assignee (optional)' },
          },
          required: ['projectId', 'title', 'descriptionMarkdown'],
        },
      },
      {
        name: 'project.update_task_status',
        description: 'Update the status of an existing task',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task ID' },
            status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], description: 'New status' },
          },
          required: ['taskId', 'status'],
        },
      },
      {
        name: 'project.link_doc_to_task',
        description: 'Link a document to a task (bidirectional)',
        inputSchema: {
          type: 'object',
          properties: {
            taskId: { type: 'string', format: 'uuid', description: 'Task ID' },
            documentId: { type: 'string', format: 'uuid', description: 'Document ID' },
          },
          required: ['taskId', 'documentId'],
        },
      },
      {
        name: 'project.list_open_items',
        description: 'List open tasks, recent documents, and events for a project',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            maxItems: { type: 'number', description: 'Maximum items per category (default: 50, max: 100)' },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.create_specs',
        description: 'Execute the complete wxKanban spec workflow with a strict scope-quality preflight. Blocks placeholder-heavy scopes before any spec artifacts are created.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { type: 'string', format: 'uuid', description: 'Project ID' },
            specNumber: { type: 'string', minLength: 1, maxLength: 10, description: 'Spec number (e.g., "017")' },
            featureName: { type: 'string', minLength: 1, maxLength: 255, description: 'Feature name' },
            scopeContent: { type: 'string', minLength: 1, description: 'Scope document content in Markdown' },
            phase: { 
              type: 'string', 
              enum: ['scoping', 'design', 'implementation', 'qa', 'human_testing', 'beta', 'released'],
              default: 'scoping',
              description: 'Current lifecycle phase' 
            },
            priority: { 
              type: 'string', 
              enum: ['low', 'medium', 'high', 'critical'],
              default: 'medium',
              description: 'Spec priority' 
            },
            tasks: {
              type: 'array',
              description: 'Tasks to create from the spec',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string', minLength: 1, maxLength: 255, description: 'Task title' },
                  description: { type: 'string', minLength: 1, description: 'Task description' },
                  priority: { type: 'string', enum: ['low', 'medium', 'high', 'critical'], description: 'Task priority' },
                  status: { type: 'string', enum: ['todo', 'in_progress', 'blocked', 'done'], default: 'todo', description: 'Task status' },
                },
                required: ['title', 'description', 'priority'],
              },
            },
            generateLifecycle: { 
              type: 'boolean', 
              default: true, 
              description: 'Generate lifecycle.json and update projectlifecycle.md' 
            },
          },
          required: ['projectId', 'specNumber', 'featureName', 'scopeContent'],
        },
      },
      {
        name: 'project.check_for_updates',
        description: 'Check for MCP server updates from GitHub releases. Auto-checks on startup with 24-hour throttling.',
        inputSchema: {
          type: 'object',
          properties: {
            force: { 
              type: 'boolean', 
              default: false, 
              description: 'Force check even if recently checked' 
            },
          },
        },
      },
      {
        name: 'project.upgrade_mcp',
        description: 'Download and install the latest MCP server version from GitHub releases. Backs up current installation before upgrading.',
        inputSchema: {
          type: 'object',
          properties: {
            version: { 
              type: 'string', 
              description: 'Specific version to install (optional, defaults to latest)' 
            },
            dryRun: { 
              type: 'boolean', 
              description: 'Check what would be installed without actually upgrading' 
            },
          },
        },
      },
      {
        name: 'project.kit_status',
        description: 'Get the current status of a project kit including generation state, download URL, and metadata.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.download_kit',
        description: 'Generate a time-limited download URL for a project kit.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.regenerate_kit',
        description: 'Trigger regeneration of a project kit. This updates the kit with the latest project state.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
          required: ['projectId'],
        },
      },
      {
        name: 'project.import_project',
        description: 'Import an existing project into wxKanban. Creates project record and optionally generates a kit.',
        inputSchema: {
          type: 'object',
          properties: {
            name: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 255, 
              description: 'Project name' 
            },
            description: { 
              type: 'string', 
              description: 'Project description (optional)' 
            },
            primaryAI: { 
              type: 'string', 
              enum: ['cursor', 'claude-code', 'blackboxai', 'copilot', 'generic'],
              description: 'Primary AI assistant for the project' 
            },
            localDirectoryPath: { 
              type: 'string', 
              description: 'Local directory path (optional)' 
            },
            generateKit: { 
              type: 'boolean', 
              default: true, 
              description: 'Generate kit after import' 
            },
            phaseAssignments: { 
              type: 'object', 
              description: 'Phase assignments mapping (optional)' 
            },
            companyId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Company ID' 
            },
          },
          required: ['name', 'primaryAI', 'companyId'],
        },
      },
      {
        name: 'project.create_api_token',
        description: 'Create a new API token for programmatic access. Returns the token once - store it securely.',
        inputSchema: {
          type: 'object',
          properties: {
            companyId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Company ID' 
            },
            label: { 
              type: 'string', 
              description: 'Token label for identification (optional)' 
            },
          },
          required: ['companyId'],
        },
      },
      {
        name: 'project.list_api_tokens',
        description: 'List all active API tokens for the authenticated user.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'project.revoke_api_token',
        description: 'Revoke an API token by ID. Revoked tokens cannot be used for authentication.',
        inputSchema: {
          type: 'object',
          properties: {
            tokenId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Token ID to revoke' 
            },
          },
          required: ['tokenId'],
        },
      },
      {
        name: 'project.mcp_health',
        description: 'Return MCP server health status, DB connectivity, and startup project context.',
        inputSchema: {
          type: 'object',
          properties: {},
        },
      },
      {
        name: 'project.help',
        description: 'Display help information about all available MCP tools and their usage. Supports modes: help --all, help --git, help --docs.',
        inputSchema: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['all', 'git', 'docs'],
              description: 'Help view mode. Equivalent to help --all, help --git, help --docs.',
            },
            flags: {
              oneOf: [
                { type: 'string' },
                { type: 'array', items: { type: 'string' } },
              ],
              description: 'Optional CLI-style flags, such as --all, --git, or --docs.',
            },
          },
        },
      },
      {
        name: 'project.implement',
        description: 'Execute wxAI-implement: Run implementation plan from tasks.md with scope-first enforcement, checklist validation, and mandatory task push to database.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Spec number to implement (e.g., "017")' 
            },
            scopeCheck: { 
              type: 'boolean', 
              default: true, 
              description: 'Run scope-first gate verification' 
            },
            force: { 
              type: 'boolean', 
              default: false, 
              description: 'Force implementation even if scope check fails' 
            },
            reason: { 
              type: 'string', 
              description: 'Reason for force override (required if force=true)' 
            },
          },
          required: ['specNumber'],
        },
      },
      {
        name: 'project.analyze',
        description: 'Execute wxAI-analyze: Perform non-destructive cross-artifact consistency and quality analysis across spec.md, plan.md, and tasks.md.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Spec number to analyze (e.g., "017")' 
            },
            includeConstitution: { 
              type: 'boolean', 
              default: true, 
              description: 'Include constitution alignment check' 
            },
            maxFindings: { 
              type: 'number', 
              minimum: 1, 
              maximum: 100, 
              default: 50, 
              description: 'Maximum findings to report' 
            },
          },
          required: ['specNumber'],
        },
      },
      {
        name: 'project.session_start',
        description: 'Execute wxAI-session-start: Initialize AI session with governance version check, unlinked TODO scan, and scope context loading.',
        inputSchema: {
          type: 'object',
          properties: {
            scopeNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Active scope number (optional)' 
            },
            skipVersionCheck: { 
              type: 'boolean', 
              default: false, 
              description: 'Skip governance version check' 
            },
            skipTodoScan: { 
              type: 'boolean', 
              default: false, 
              description: 'Skip unlinked TODO scan' 
            },
          },
        },
      },
      {
        name: 'project.buildscope',
        description: 'Guided-first scope drafting. Asks clarification questions by default and only writes a draft when required scope details are provided, unless quick mode is explicitly enabled.',
        inputSchema: {
          type: 'object',
          properties: {
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
            featureDescription: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 1000, 
              description: 'High-level description of the feature' 
            },
            quick: { 
              type: 'boolean', 
              default: false, 
              description: 'Explicit opt-in to create a draft immediately, even if scope-quality fields are missing' 
            },
            templateOnly: { 
              type: 'boolean', 
              default: false, 
              description: 'Use the legacy template only when quick mode is enabled' 
            },
            editSpecNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Edit existing scope file instead of creating new' 
            },
            primaryActor: { 
              type: 'string', 
              maxLength: 255, 
              description: 'Primary user actor for the scope' 
            },
            secondaryActors: {
              type: 'array',
              items: { type: 'string', maxLength: 255 },
              description: 'Secondary actors or stakeholder groups affected by the scope'
            },
            businessProblem: { 
              type: 'string', 
              maxLength: 2000, 
              description: 'Business problem this solves' 
            },
            successMetrics: { 
              type: 'array', 
              items: { type: 'string' },
              description: 'List of measurable success metrics (3+ required to pass quality gates)' 
            },
            scopeBoundary: {
              type: 'string',
              maxLength: 2000,
              description: 'What is explicitly in scope for this effort'
            },
            outOfScope: {
              type: 'string',
              maxLength: 2000,
              description: 'What is explicitly out of scope for this effort'
            },
            integrationContext: {
              type: 'string',
              maxLength: 2000,
              description: 'Existing workflows, systems, or documents this scope must align with'
            },
            constraintsAndRisks: {
              type: 'string',
              maxLength: 2000,
              description: 'Known constraints, assumptions, or delivery risks that should be reviewed'
            },
          },
          required: ['projectId', 'featureDescription'],
        },
      },
      {
        name: 'project.validatescope',
        description: 'Validate a scope document for completeness, placeholder markers, and minimum quality gates required before create_specs can run.',
        inputSchema: {
          type: 'object',
          properties: {
            specNumber: { 
              type: 'string', 
              minLength: 1, 
              maxLength: 10, 
              description: 'Spec number to validate (e.g., "017")' 
            },
            filePath: { 
              type: 'string', 
              description: 'Path to scope file (alternative to specNumber)' 
            },
            projectId: { 
              type: 'string', 
              format: 'uuid', 
              description: 'Project ID' 
            },
          },
        },
      },
    ],
  };
});

// Auto-check for updates on startup (non-blocking)
autoCheckOnStartup().catch(() => {
  // Non-critical, ignore errors
});



export default server;
