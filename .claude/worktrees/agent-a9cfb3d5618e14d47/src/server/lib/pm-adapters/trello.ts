import { PMAdapter, PMTask } from "./base.js";
import { createAPIClient } from "../apiClient.js";
import { createLogger } from "../logger.js";

const logger = createLogger("trello-adapter");

interface TrelloCard {
  id: string;
  name: string;
  desc: string;
  labels: Array<{ name: string; color: string }>;
  dueDate?: string;
  due?: string;
  idList: string;
  idMembers: string[];
  members?: Array<{ fullName: string; email: string }>;
  url: string;
  dateLastActivity: string;
}

/**
 * Trello PM adapter
 * Fetches tasks (cards) from Trello using REST API
 */
export class TrelloAdapter extends PMAdapter {
  private client: ReturnType<typeof createAPIClient>;
  private apiKey: string;

  constructor(
    accessToken: string,
    apiKey: string = process.env.TRELLO_API_KEY || "",
  ) {
    super(accessToken);
    this.apiKey = apiKey;
    this.client = createAPIClient("https://api.trello.com/1", undefined, {
      maxRetries: 3,
      delayMs: 1000,
    });
  }

  /**
   * Fetch all cards (tasks) from user's boards
   */
  async getTasks(userId: string): Promise<PMTask[]> {
    try {
      logger.info({ userId }, "Fetching tasks from Trello");

      // First get user's boards
      const boardsResponse = await this.client.get<any[]>(
        "/members/me/boards",
        {
          params: {
            key: this.apiKey,
            token: this.accessToken,
          },
        },
      );

      if (!Array.isArray(boardsResponse)) {
        return [];
      }

      const tasks: PMTask[] = [];

      // Fetch cards from each board
      for (const board of boardsResponse) {
        try {
          const cardsResponse = await this.client.get<TrelloCard[]>(
            `/boards/${board.id}/cards`,
            {
              params: {
                key: this.apiKey,
                token: this.accessToken,
                members: "open",
              },
            },
          );

          if (Array.isArray(cardsResponse)) {
            tasks.push(
              ...cardsResponse.map((card) =>
                this.mapTrelloCardToTask(card, board.name),
              ),
            );
          }
        } catch (error) {
          logger.warn(
            {
              boardId: board.id,
              error: error instanceof Error ? error.message : "Unknown error",
            },
            "Failed to fetch cards from board",
          );
        }
      }

      return tasks;
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch tasks from Trello",
      );
      throw new Error("Failed to fetch tasks from Trello");
    }
  }

  /**
   * Get single card by ID
   */
  async getTask(taskId: string): Promise<PMTask | null> {
    try {
      logger.debug({ taskId }, "Fetching task from Trello");

      const response = await this.client.get<TrelloCard>(`/cards/${taskId}`, {
        params: {
          key: this.apiKey,
          token: this.accessToken,
          members: "open",
        },
      });

      return this.mapTrelloCardToTask(response, "Unknown Board");
    } catch (error) {
      logger.warn(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Card not found in Trello",
      );
      return null;
    }
  }

  /**
   * Update card
   */
  async updateTask(taskId: string, updates: Partial<PMTask>): Promise<void> {
    try {
      logger.info({ taskId, updates }, "Updating task in Trello");

      const payload: Record<string, any> = {};

      // Map wxKanban fields to Trello fields
      if (updates.title) {
        payload.name = updates.title;
      }
      if (updates.description) {
        payload.desc = updates.description;
      }
      if (updates.dueDate) {
        payload.due = updates.dueDate.toISOString();
      }

      // Note: Trello doesn't have native priority or status fields
      // Status would need to be managed via list membership
      if (updates.status) {
        logger.debug(
          { taskId },
          "Status updates on Trello would require list management",
        );
      }

      await this.client.put(`/cards/${taskId}`, payload, {
        params: {
          key: this.apiKey,
          token: this.accessToken,
        },
      });

      logger.info({ taskId }, "Task updated successfully in Trello");
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to update task in Trello",
      );
      throw new Error(
        `Failed to update task in Trello: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Add comment to card
   */
  async addComment(taskId: string, comment: string): Promise<void> {
    try {
      logger.info({ taskId }, "Adding comment to Trello card");

      await this.client.post(
        `/cards/${taskId}/actions/comments`,
        { text: comment },
        {
          params: {
            key: this.apiKey,
            token: this.accessToken,
          },
        },
      );

      logger.info({ taskId }, "Comment added to Trello card");
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add comment to Trello card",
      );
      throw new Error("Failed to add comment to Trello card");
    }
  }

  /**
   * Validate token by making test API call
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.client.get("/members/me", {
        params: {
          key: this.apiKey,
          token: this.accessToken,
        },
      });
      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Trello token validation failed",
      );
      return false;
    }
  }

  /**
   * Map Trello card to wxKanban PMTask format
   */
  private mapTrelloCardToTask(card: TrelloCard, _boardName: string): PMTask {
    // Determine status from list (would need list name mapping)
    // For now, assume list position indicates status
    let status: "open" | "in_progress" | "completed" | "cancelled" = "open";
    if (card.idList.includes("done") || card.idList.includes("completed")) {
      status = "completed";
    } else if (
      card.idList.includes("progress") ||
      card.idList.includes("active")
    ) {
      status = "in_progress";
    }

    // Extract priority from labels if available
    let priority: "low" | "medium" | "high" | "critical" = "medium";
    for (const label of card.labels) {
      const labelName = label.name.toLowerCase();
      if (labelName.includes("critical") || labelName.includes("blocker")) {
        priority = "critical";
        break;
      } else if (labelName.includes("high")) {
        priority = "high";
      } else if (labelName.includes("low")) {
        priority = "low";
      }
    }

    const pmTask: PMTask = {
      externalId: card.id,
      title: card.name,
      description: card.desc,
      priority,
      status,
      dueDate: card.due
        ? new Date(card.due)
        : card.dueDate
          ? new Date(card.dueDate)
          : undefined,
      assignee: card.members?.[0]?.fullName,
      assigneeEmail: card.members?.[0]?.email,
      labels: card.labels.map((l) => l.name),
      url: card.url,
      updatedAt: new Date(card.dateLastActivity),
      syncChecksum: "",
    };

    // Generate checksum after mapping all fields
    pmTask.syncChecksum = this.generateChecksum(pmTask);

    return pmTask;
  }
}
