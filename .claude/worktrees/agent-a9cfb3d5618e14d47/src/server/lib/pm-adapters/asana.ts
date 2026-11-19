import { PMAdapter, PMTask } from "./base.js";
import { createAPIClient } from "../apiClient.js";
import { createLogger } from "../logger.js";

const logger = createLogger("asana-adapter");

interface AsanaTask {
  gid: string;
  name: string;
  notes?: string;
  priority?: "high" | "medium" | "low" | null;
  completed: boolean;
  due_on?: string;
  assignee?: { name: string; email: string };
  custom_fields?: Array<{
    name: string;
    text_value?: string;
    enum_value?: { name: string };
  }>;
  permalink_url: string;
  modified_at: string;
}

/**
 * Asana PM adapter
 * Fetches tasks from Asana using REST API
 */
export class AsanaAdapter extends PMAdapter {
  private client: ReturnType<typeof createAPIClient>;

  constructor(accessToken: string) {
    super(accessToken);
    this.client = createAPIClient(
      "https://app.asana.com/api/1.0",
      accessToken,
      {
        maxRetries: 3,
        delayMs: 1000,
      },
    );
  }

  /**
   * Fetch all tasks assigned to current user
   */
  async getTasks(userId: string): Promise<PMTask[]> {
    try {
      logger.info({ userId }, "Fetching tasks from Asana");

      // Fetch tasks assigned to current user
      const response = await this.client.get<{ data: AsanaTask[] }>(
        "/tasks/me/tasks",
        {
          params: {
            opt_fields:
              "gid,name,notes,priority,completed,due_on,assignee,custom_fields,permalink_url,modified_at",
            limit: 100,
          },
        },
      );

      if (!response.data) {
        return [];
      }

      return response.data.map((task) => this.mapAsanaTaskToTask(task));
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Failed to fetch tasks from Asana",
      );
      throw new Error("Failed to fetch tasks from Asana");
    }
  }

  /**
   * Get single task by ID (gid)
   */
  async getTask(taskId: string): Promise<PMTask | null> {
    try {
      logger.debug({ taskId }, "Fetching task from Asana");

      const response = await this.client.get<{ data: AsanaTask }>(
        `/tasks/${taskId}`,
        {
          params: {
            opt_fields:
              "gid,name,notes,priority,completed,due_on,assignee,custom_fields,permalink_url,modified_at",
          },
        },
      );

      return this.mapAsanaTaskToTask(response.data);
    } catch (error) {
      logger.warn(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Task not found in Asana",
      );
      return null;
    }
  }

  /**
   * Update task
   */
  async updateTask(taskId: string, updates: Partial<PMTask>): Promise<void> {
    try {
      logger.info({ taskId, updates }, "Updating task in Asana");

      const payload: Record<string, any> = {
        data: {},
      };

      // Map wxKanban fields to Asana fields
      if (updates.title) {
        payload.data.name = updates.title;
      }
      if (updates.description) {
        payload.data.notes = updates.description;
      }
      if (updates.priority) {
        payload.data.priority = this.mapPriorityToAsana(updates.priority);
      }
      if (updates.status) {
        // In Asana, tasks are marked complete/incomplete
        payload.data.completed = updates.status === "completed";
      }
      if (updates.dueDate) {
        payload.data.due_on = updates.dueDate.toISOString().split("T")[0];
      }

      await this.client.put(`/tasks/${taskId}`, payload);

      logger.info({ taskId }, "Task updated successfully in Asana");
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to update task in Asana",
      );
      throw new Error(
        `Failed to update task in Asana: ${error instanceof Error ? error.message : "Unknown error"}`,
      );
    }
  }

  /**
   * Add comment to task
   */
  async addComment(taskId: string, comment: string): Promise<void> {
    try {
      logger.info({ taskId }, "Adding story (comment) to Asana task");

      await this.client.post(`/tasks/${taskId}/stories`, {
        data: {
          text: comment,
        },
      });

      logger.info({ taskId }, "Story added to Asana task");
    } catch (error) {
      logger.error(
        {
          taskId,
          error: error instanceof Error ? error.message : "Unknown error",
        },
        "Failed to add story to Asana task",
      );
      throw new Error("Failed to add comment to Asana task");
    }
  }

  /**
   * Validate token by making test API call
   */
  async validateToken(): Promise<boolean> {
    try {
      await this.client.get("/users/me");
      return true;
    } catch (error) {
      logger.warn(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Asana token validation failed",
      );
      return false;
    }
  }

  /**
   * Map Asana task to wxKanban PMTask format
   */
  private mapAsanaTaskToTask(task: AsanaTask): PMTask {
    const pmTask: PMTask = {
      externalId: task.gid,
      title: task.name,
      description: task.notes,
      priority: this.mapPriority(task.priority || "medium"),
      status: task.completed ? "completed" : "open",
      dueDate: task.due_on ? new Date(task.due_on) : undefined,
      assignee: task.assignee?.name,
      assigneeEmail: task.assignee?.email,
      url: task.permalink_url,
      updatedAt: new Date(task.modified_at),
      syncChecksum: "",
    };

    // Generate checksum after mapping all fields
    pmTask.syncChecksum = this.generateChecksum(pmTask);

    return pmTask;
  }

  /**
   * Map wxKanban priority to Asana priority format
   */
  private mapPriorityToAsana(
    priority: "low" | "medium" | "high" | "critical",
  ): "high" | "medium" | "low" | null {
    switch (priority) {
      case "critical":
      case "high":
        return "high";
      case "medium":
        return "medium";
      case "low":
        return "low";
    }
  }
}
