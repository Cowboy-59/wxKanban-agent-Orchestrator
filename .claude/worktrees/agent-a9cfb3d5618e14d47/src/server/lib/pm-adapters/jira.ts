/**
 * Jira OAuth 2.0 Adapter
 * Implements PM system integration for Atlassian Jira
 */

import {
  BasePMAdapter,
  PMConfig,
  OAuthTokens,
  PMTask,
  PMProject,
} from "./base.js";
import { createLogger } from "../logger.js";

const logger = createLogger("jira-adapter");

export interface JiraConfig extends PMConfig {
  cloudId?: string; // Jira Cloud ID for API calls
}

export class JiraAdapter extends BasePMAdapter {
  private readonly authBaseUrl = "https://auth.atlassian.com";
  private readonly apiBaseUrl = "https://api.atlassian.com";
  private cloudId: string | null = null;

  constructor(config: JiraConfig) {
    super(config);
    this.cloudId = config.cloudId || null;
  }

  getSystemName(): string {
    return "jira";
  }

  /**
   * Generate OAuth authorization URL for Jira
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      audience: "api.atlassian.com",
      client_id: this.config.clientId,
      scope: this.config.scopes.join(" "),
      redirect_uri: this.config.redirectUri,
      state: state,
      response_type: "code",
      prompt: "consent",
    });

    const url = `${this.authBaseUrl}/authorize?${params.toString()}`;
    logger.debug({ state }, "Generated Jira authorization URL");
    return url;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCode(code: string): Promise<OAuthTokens> {
    logger.info("Exchanging Jira authorization code for tokens");

    try {
      const response = await fetch(`${this.authBaseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "authorization_code",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          code: code,
          redirect_uri: this.config.redirectUri,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, "Jira token exchange failed");
        throw new Error(`Jira OAuth token exchange failed: ${response.status} ${error}`);
      }

      const data = await response.json();

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
      };

      logger.info("Successfully exchanged Jira authorization code for tokens");
      return tokens;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to exchange Jira authorization code"
      );
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    logger.info("Refreshing Jira access token");

    try {
      const response = await fetch(`${this.authBaseUrl}/oauth/token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, "Jira token refresh failed");
        throw new Error(`Jira token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken, // Use new refresh token if provided
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
      };

      logger.info("Successfully refreshed Jira access token");
      return tokens;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to refresh Jira token"
      );
      throw error;
    }
  }

  /**
   * Discover Jira Cloud ID for the authenticated user
   */
  async discoverCloudId(accessToken: string): Promise<string> {
    if (this.cloudId) {
      return this.cloudId;
    }

    logger.info("Discovering Jira Cloud ID");

    try {
      const response = await fetch(`${this.apiBaseUrl}/oauth/token/accessible-resources`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to discover Jira Cloud ID: ${response.status}`);
      }

      const resources = await response.json();

      if (!Array.isArray(resources) || resources.length === 0) {
        throw new Error("No Jira Cloud instances found for user");
      }

      // Use first available Jira Cloud instance
      const jiraResource = resources.find(
        (r: { scopes: string[] }) =>
          r.scopes.includes("read:jira-work") || r.scopes.includes("write:jira-work")
      );

      if (!jiraResource) {
        throw new Error("No Jira Cloud instance with required scopes found");
      }

      this.cloudId = jiraResource.id;
      logger.info({ cloudId: this.cloudId }, "Discovered Jira Cloud ID");
      if (!this.cloudId) {
        throw new Error("Failed to get Jira Cloud ID from resource");
      }
      return this.cloudId;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to discover Jira Cloud ID"
      );
      throw error;
    }
  }

  /**
   * Fetch tasks assigned to the authenticated user using JQL
   */
  async fetchTasks(
    accessToken: string,
    options?: {
      projectId?: string;
      since?: Date;
      limit?: number;
    }
  ): Promise<PMTask[]> {
    logger.info("Fetching Jira tasks");

    try {
      const cloudId = await this.discoverCloudId(accessToken);
      const limit = options?.limit || 50;

      // Build JQL query
      let jql = "assignee = currentUser()";
      if (options?.projectId) {
        jql += ` AND project = ${options.projectId}`;
      }
      if (options?.since) {
        const sinceStr = options.since.toISOString().split("T")[0];
        jql += ` AND updated >= ${sinceStr}`;
      }
      jql += " ORDER BY updated DESC";

      const response = await fetch(
        `${this.apiBaseUrl}/ex/jira/${cloudId}/rest/api/3/search?${new URLSearchParams({
          jql: jql,
          maxResults: limit.toString(),
          fields: "summary,description,status,priority,dueDate,assignee,updated",
        })}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, "Failed to fetch Jira tasks");
        throw new Error(`Failed to fetch Jira tasks: ${response.status}`);
      }

      const data = await response.json();

      if (!data.issues || !Array.isArray(data.issues)) {
        logger.warn("No Jira tasks found");
        return [];
      }

      const tasks: PMTask[] = data.issues.map((issue: {
        key: string;
        fields: {
          summary: string;
          description?: any;
          status: { name: string };
          priority?: { name: string };
          dueDate?: string;
          assignee?: { displayName: string };
          updated: string;
        };
      }) => ({
        externalId: issue.key,
        title: issue.fields.summary,
        description: this.extractDescription(issue.fields.description),
        status: this.mapJiraStatus(issue.fields.status.name),
        priority: issue.fields.priority?.name,
        dueDate: issue.fields.dueDate ? new Date(issue.fields.dueDate) : undefined,
        assignee: issue.fields.assignee?.displayName,
        url: `https://api.atlassian.com/ex/jira/${cloudId}/browse/${issue.key}`,
        updatedAt: new Date(issue.fields.updated),
      }));

      logger.info({ count: tasks.length }, "Successfully fetched Jira tasks");
      return tasks;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch Jira tasks"
      );
      throw error;
    }
  }

  /**
   * Fetch projects the user has access to
   */
  async fetchProjects(accessToken: string): Promise<PMProject[]> {
    logger.info("Fetching Jira projects");

    try {
      const cloudId = await this.discoverCloudId(accessToken);

      const response = await fetch(
        `${this.apiBaseUrl}/ex/jira/${cloudId}/rest/api/3/project`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch Jira projects: ${response.status}`);
      }

      const projects = await response.json();

      const mappedProjects: PMProject[] = projects.map((project: {
        id: string;
        key: string;
        name: string;
        self: string;
      }) => ({
        externalId: project.id,
        name: project.name,
        key: project.key,
        url: project.self,
      }));

      logger.info({ count: mappedProjects.length }, "Successfully fetched Jira projects");
      return mappedProjects;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch Jira projects"
      );
      throw error;
    }
  }

  /**
   * Update task status in Jira
   */
  async updateTaskStatus(
    accessToken: string,
    externalTaskId: string,
    status: string
  ): Promise<void> {
    logger.info({ taskId: externalTaskId, status }, "Updating Jira task status");

    try {
      const cloudId = await this.discoverCloudId(accessToken);

      // Map wxKanban status to Jira transition ID
      // Note: This is simplified - in production, you'd fetch available transitions
      const transitionId = this.mapStatusToTransition(status);

      const response = await fetch(
        `${this.apiBaseUrl}/ex/jira/${cloudId}/rest/api/3/issue/${externalTaskId}/transitions`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            transition: {
              id: transitionId,
            },
          }),
        }
      );

      if (!response.ok) {
        const error = await response.text();
        logger.error({ status: response.status, error }, "Failed to update Jira task status");
        throw new Error(`Failed to update Jira task status: ${response.status}`);
      }

      logger.info({ taskId: externalTaskId }, "Successfully updated Jira task status");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error", taskId: externalTaskId },
        "Failed to update Jira task status"
      );
      throw error;
    }
  }

  /**
   * Validate that the access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Try to discover cloud ID - this validates the token
      await this.discoverCloudId(accessToken);
      return true;
    } catch (error) {
      logger.warn("Jira token validation failed");
      return false;
    }
  }

  /**
   * Extract plain text from Jira's Atlassian Document Format (ADF)
   */
  private extractDescription(description: any): string | undefined {
    if (!description) return undefined;

    // If it's already a string, return it
    if (typeof description === "string") {
      return description;
    }

    // Handle ADF format
    if (description.type === "doc" && Array.isArray(description.content)) {
      return this.extractTextFromADF(description.content);
    }

    return undefined;
  }

  /**
   * Recursively extract text from ADF content
   */
  private extractTextFromADF(content: any[]): string {
    let text = "";

    for (const node of content) {
      if (node.text) {
        text += node.text;
      }
      if (node.content && Array.isArray(node.content)) {
        text += this.extractTextFromADF(node.content);
      }
      if (node.type === "hardBreak") {
        text += "\n";
      }
    }

    return text.trim();
  }

  /**
   * Map Jira status to wxKanban status
   */
  private mapJiraStatus(jiraStatus: string): string {
    const statusMap: Record<string, string> = {
      "To Do": "open",
      "Backlog": "open",
      "In Progress": "in_progress",
      "In Review": "in_progress",
      "Done": "completed",
      "Closed": "completed",
      "Resolved": "completed",
      "Canceled": "orphaned",
    };

    return statusMap[jiraStatus] || "open";
  }

  /**
   * Map wxKanban status to Jira transition ID
   * Note: In production, fetch available transitions from Jira API
   */
  private mapStatusToTransition(status: string): string {
    const transitionMap: Record<string, string> = {
      "open": "11", // To Do
      "in_progress": "21", // In Progress
      "completed": "31", // Done
    };

    return transitionMap[status] || "11";
  }
}

/**
 * Factory function to create Jira adapter with environment config
 */
export function createJiraAdapter(): JiraAdapter {
  const clientId = process.env.JIRA_CLIENT_ID;
  const clientSecret = process.env.JIRA_CLIENT_SECRET;
  const redirectUri = process.env.JIRA_REDIRECT_URI || `${process.env.CLIENT_URL}/oauth/callback/jira`;

  if (!clientId || !clientSecret) {
    throw new Error("JIRA_CLIENT_ID and JIRA_CLIENT_SECRET must be set in environment");
  }

  return new JiraAdapter({
    clientId,
    clientSecret,
    redirectUri,
    baseUrl: "https://api.atlassian.com",
    scopes: [
      "read:jira-work",
      "read:jira-user",
      "write:jira-work",
      "offline_access",
    ],
  });
}
