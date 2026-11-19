/**
 * Base PM Adapter Interface
 * All PM system adapters must implement this interface
 */

import { createHash } from "crypto";

export interface PMConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  baseUrl: string;
  scopes: string[];
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scope?: string;
}

export interface PMTask {
  externalId: string;
  title: string;
  description?: string;
  status: string;
  priority?: "low" | "medium" | "high" | "critical";
  dueDate?: Date;
  assignee?: string;
  assigneeEmail?: string;
  labels?: string[];
  url?: string;
  updatedAt: Date;
  syncChecksum?: string;
}

export interface PMProject {
  externalId: string;
  name: string;
  key?: string;
  url?: string;
}

export abstract class BasePMAdapter {
  protected config: PMConfig;

  constructor(config: PMConfig) {
    this.config = config;
  }

  /**
   * Generate OAuth authorization URL
   */
  abstract getAuthorizationUrl(state: string): string;

  /**
   * Exchange authorization code for access tokens
   */
  abstract exchangeCode(code: string): Promise<OAuthTokens>;

  /**
   * Refresh access token using refresh token
   */
  abstract refreshToken(refreshToken: string): Promise<OAuthTokens>;

  /**
   * Fetch tasks assigned to the authenticated user
   */
  abstract fetchTasks(accessToken: string, options?: {
    projectId?: string;
    since?: Date;
    limit?: number;
  }): Promise<PMTask[]>;

  /**
   * Fetch projects the user has access to
   */
  abstract fetchProjects(accessToken: string): Promise<PMProject[]>;

  /**
   * Update task status in the external PM system
   */
  abstract updateTaskStatus(
    accessToken: string,
    externalTaskId: string,
    status: string
  ): Promise<void>;

  /**
   * Validate that the access token is still valid
   */
  abstract validateToken(accessToken: string): Promise<boolean>;

  /**
   * Get the PM system name
   */
  abstract getSystemName(): string;
}

/**
 * Legacy PM adapter base used by older adapters (Asana/Trello).
 * Kept for backward compatibility with existing adapter implementations.
 */
export abstract class PMAdapter {
  protected accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  abstract getTasks(userId: string): Promise<PMTask[]>;
  abstract getTask(taskId: string): Promise<PMTask | null>;
  abstract updateTask(taskId: string, updates: Partial<PMTask>): Promise<void>;
  abstract addComment(taskId: string, comment: string): Promise<void>;
  abstract validateToken(): Promise<boolean>;

  protected mapPriority(value: string): "low" | "medium" | "high" | "critical" {
    const normalized = value.toLowerCase();
    if (normalized.includes("critical") || normalized.includes("blocker")) {
      return "critical";
    }
    if (normalized.includes("high")) {
      return "high";
    }
    if (normalized.includes("low")) {
      return "low";
    }
    return "medium";
  }

  protected generateChecksum(task: PMTask): string {
    const payload = JSON.stringify({
      externalId: task.externalId,
      title: task.title,
      description: task.description ?? "",
      status: task.status,
      priority: task.priority ?? "",
      dueDate: task.dueDate?.toISOString() ?? "",
      assignee: task.assignee ?? "",
      assigneeEmail: task.assigneeEmail ?? "",
      labels: task.labels ?? [],
      url: task.url ?? "",
    });

    return createHash("sha256").update(payload).digest("hex");
  }
}
