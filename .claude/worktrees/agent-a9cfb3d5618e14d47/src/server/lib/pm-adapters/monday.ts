/**
 * Monday.com OAuth 2.0 Adapter
 * Implements PM system integration for Monday.com
 */

import {
  BasePMAdapter,
  PMConfig,
  OAuthTokens,
  PMTask,
  PMProject,
} from "./base.js";
import { createLogger } from "../logger.js";

const logger = createLogger("monday-adapter");

export interface MondayConfig extends PMConfig {
  apiVersion?: string;
}

export class MondayAdapter extends BasePMAdapter {
  private readonly authBaseUrl = "https://auth.monday.com";
  private readonly apiBaseUrl = "https://api.monday.com";
  private readonly apiVersion: string;

  constructor(config: MondayConfig) {
    super(config);
    this.apiVersion = config.apiVersion || "2024-01";
  }

  getSystemName(): string {
    return "monday";
  }

  /**
   * Generate OAuth authorization URL for Monday.com
   */
  getAuthorizationUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      state: state,
      response_type: "code",
    });

    // Monday.com uses space-separated scopes
    const scopeString = this.config.scopes.join(" ");
    params.append("scope", scopeString);

    const url = `${this.authBaseUrl}/oauth2/authorize?${params.toString()}`;
    logger.debug({ state }, "Generated Monday.com authorization URL");
    return url;
  }

  /**
   * Exchange authorization code for access tokens
   */
  async exchangeCode(code: string): Promise<OAuthTokens> {
    logger.info("Exchanging Monday.com authorization code for tokens");

    try {
      const response = await fetch(`${this.authBaseUrl}/oauth2/token`, {
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
        logger.error({ status: response.status, error }, "Monday.com token exchange failed");
        throw new Error(`Monday.com OAuth token exchange failed: ${response.status} ${error}`);
      }

      const data = await response.json();

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
      };

      logger.info("Successfully exchanged Monday.com authorization code for tokens");
      return tokens;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to exchange Monday.com authorization code"
      );
      throw error;
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    logger.info("Refreshing Monday.com access token");

    try {
      const response = await fetch(`${this.authBaseUrl}/oauth2/token`, {
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
        logger.error({ status: response.status, error }, "Monday.com token refresh failed");
        throw new Error(`Monday.com token refresh failed: ${response.status}`);
      }

      const data = await response.json();

      const tokens: OAuthTokens = {
        accessToken: data.access_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt: new Date(Date.now() + data.expires_in * 1000),
        scope: data.scope,
      };

      logger.info("Successfully refreshed Monday.com access token");
      return tokens;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to refresh Monday.com token"
      );
      throw error;
    }
  }

  /**
   * Execute GraphQL query against Monday.com API
   */
  private async executeQuery<T>(
    accessToken: string,
    query: string,
    variables?: Record<string, unknown>
  ): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}/v2`, {
      method: "POST",
      headers: {
        Authorization: accessToken, // Monday.com uses token directly without "Bearer"
        "Content-Type": "application/json",
        "API-Version": this.apiVersion,
      },
      body: JSON.stringify({
        query,
        variables,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Monday.com API error: ${response.status} ${error}`);
    }

    const result = await response.json();

    if (result.errors && result.errors.length > 0) {
      const errorMessage = result.errors.map((e: { message: string }) => e.message).join(", ");
      throw new Error(`Monday.com GraphQL error: ${errorMessage}`);
    }

    return result.data as T;
  }

  /**
   * Fetch tasks (items) assigned to the authenticated user
   */
  async fetchTasks(
    accessToken: string,
    options?: {
      projectId?: string; // Board ID in Monday.com
      since?: Date;
      limit?: number;
    }
  ): Promise<PMTask[]> {
    logger.info("Fetching Monday.com tasks");

    try {
      const limit = options?.limit || 50;

      // Build GraphQL query to get items assigned to user
      // Monday.com uses "items" instead of "tasks"
      const query = `
        query GetMyItems($limit: Int) {
          me {
            id
            name
          }
          boards(limit: 100) {
            id
            name
            items_page(limit: $limit) {
              items {
                id
                name
                state
                updated_at
                column_values {
                  id
                  text
                  type
                }
                board {
                  id
                  name
                }
              }
            }
          }
        }
      `;

      const data = await this.executeQuery<{
        me: { id: string; name: string };
        boards: Array<{
          id: string;
          name: string;
          items_page: {
            items: Array<{
              id: string;
              name: string;
              state: string;
              updated_at: string;
              column_values: Array<{
                id: string;
                text: string;
                type: string;
              }>;
              board: {
                id: string;
                name: string;
              };
            }>;
          };
        }>;
      }>(accessToken, query, { limit });

      const tasks: PMTask[] = [];

      // Flatten items from all boards
      for (const board of data.boards) {
        // Filter by project if specified
        if (options?.projectId && board.id !== options.projectId) {
          continue;
        }

        for (const item of board.items_page.items) {
          // Filter by update date if specified
          if (options?.since) {
            const updatedAt = new Date(item.updated_at);
            if (updatedAt < options.since) {
              continue;
            }
          }

          // Extract priority and due date from column values
          const priority = this.extractPriority(item.column_values);
          const dueDate = this.extractDueDate(item.column_values);
          const status = this.mapMondayStatus(item.state);

          tasks.push({
            externalId: item.id,
            title: item.name,
            description: `Board: ${item.board.name}`,
            status: status,
            priority: priority,
            dueDate: dueDate,
            assignee: data.me.name,
            url: `https://monday.com/boards/${board.id}/pulses/${item.id}`,
            updatedAt: new Date(item.updated_at),
          });
        }
      }

      logger.info({ count: tasks.length }, "Successfully fetched Monday.com tasks");
      return tasks;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch Monday.com tasks"
      );
      throw error;
    }
  }

  /**
   * Fetch projects (boards) the user has access to
   */
  async fetchProjects(accessToken: string): Promise<PMProject[]> {
    logger.info("Fetching Monday.com boards");

    try {
      const query = `
        query GetBoards {
          boards(limit: 100) {
            id
            name
            type
          }
        }
      `;

      const data = await this.executeQuery<{
        boards: Array<{
          id: string;
          name: string;
          type: string;
        }>;
      }>(accessToken, query);

      const projects: PMProject[] = data.boards.map((board) => ({
        externalId: board.id,
        name: board.name,
        key: board.type,
        url: `https://monday.com/boards/${board.id}`,
      }));

      logger.info({ count: projects.length }, "Successfully fetched Monday.com boards");
      return projects;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch Monday.com boards"
      );
      throw error;
    }
  }

  /**
   * Update task (item) status in Monday.com
   */
  async updateTaskStatus(
    accessToken: string,
    externalTaskId: string,
    status: string
  ): Promise<void> {
    logger.info({ taskId: externalTaskId, status }, "Updating Monday.com item status");

    try {
      // Monday.com uses column values to update status
      // We need to find the status column and update it
      const query = `
        mutation ChangeItemStatus($itemId: ID!, $columnId: String!, $value: String!) {
          change_column_value(
            item_id: $itemId,
            column_id: $columnId,
            value: $value
          ) {
            id
          }
        }
      `;

      // Map wxKanban status to Monday.com status label
      const statusLabel = this.mapStatusToMondayLabel(status);

      // Note: In production, you'd need to discover the status column ID
      // This is a simplified implementation
      await this.executeQuery(
        accessToken,
        query,
        {
          itemId: externalTaskId,
          columnId: "status", // Default status column ID
          value: JSON.stringify({ label: statusLabel }),
        }
      );

      logger.info({ taskId: externalTaskId }, "Successfully updated Monday.com item status");
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error", taskId: externalTaskId },
        "Failed to update Monday.com item status"
      );
      throw error;
    }
  }

  /**
   * Validate that the access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Try to fetch current user - this validates the token
      const query = `
        query {
          me {
            id
            name
          }
        }
      `;

      await this.executeQuery(accessToken, query);
      return true;
    } catch (error) {
      logger.warn("Monday.com token validation failed");
      return false;
    }
  }

  /**
   * Extract priority from column values
   */
  private extractPriority(
    columnValues: Array<{ id: string; text: string; type: string }>
  ): "low" | "medium" | "high" | "critical" | undefined {
    const priorityColumn = columnValues.find(
      (col) => col.id.toLowerCase().includes("priority") || col.type === "priority"
    );
    if (!priorityColumn?.text) {
      return undefined;
    }

    const normalized = priorityColumn.text.toLowerCase();
    if (normalized.includes("critical") || normalized.includes("urgent") || normalized.includes("blocker")) {
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

  /**
   * Extract due date from column values
   */
  private extractDueDate(
    columnValues: Array<{ id: string; text: string; type: string }>
  ): Date | undefined {
    const dateColumn = columnValues.find(
      (col) => col.id.toLowerCase().includes("date") || col.id.toLowerCase().includes("due")
    );
    if (dateColumn?.text) {
      const parsed = new Date(dateColumn.text);
      if (!isNaN(parsed.getTime())) {
        return parsed;
      }
    }
    return undefined;
  }

  /**
   * Map Monday.com state to wxKanban status
   */
  private mapMondayStatus(state: string): string {
    const statusMap: Record<string, string> = {
      "active": "in_progress",
      "archived": "completed",
      "deleted": "orphaned",
    };

    return statusMap[state] || "open";
  }

  /**
   * Map wxKanban status to Monday.com status label
   */
  private mapStatusToMondayLabel(status: string): string {
    const labelMap: Record<string, string> = {
      "open": "Working on it",
      "in_progress": "Working on it",
      "completed": "Done",
      "orphaned": "Stuck",
    };

    return labelMap[status] || "Working on it";
  }
}

/**
 * Factory function to create Monday.com adapter with environment config
 */
export function createMondayAdapter(): MondayAdapter {
  const clientId = process.env.MONDAY_CLIENT_ID;
  const clientSecret = process.env.MONDAY_CLIENT_SECRET;
  const redirectUri = process.env.MONDAY_REDIRECT_URI || `${process.env.CLIENT_URL}/oauth/callback/monday`;

  if (!clientId || !clientSecret) {
    throw new Error("MONDAY_CLIENT_ID and MONDAY_CLIENT_SECRET must be set in environment");
  }

  return new MondayAdapter({
    clientId,
    clientSecret,
    redirectUri,
    baseUrl: "https://api.monday.com",
    scopes: [
      "me:read",
      "boards:read",
      "boards:write",
      "users:read",
      "account:read",
    ],
  });
}
