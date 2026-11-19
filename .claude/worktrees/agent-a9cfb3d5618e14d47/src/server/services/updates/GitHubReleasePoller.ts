import { createLogger } from "~/server/lib/logger.js";
import type { ChangelogDetail } from "~/shared/types/gateway.js";

const logger = createLogger("github-release-poller");

interface ReleaseApiResponse {
  tag_name: string;
  body: string | null;
  published_at: string;
}

export class GitHubReleasePoller {
  private readonly owner = process.env.MCP_RELEASE_REPO_OWNER || "Cowboy-59";
  private readonly repo = process.env.MCP_RELEASE_REPO_NAME || "wxKanban";
  private readonly token = process.env.GITHUB_TOKEN;

  async getLatestRelease(): Promise<ChangelogDetail | null> {
    const release = await this.fetchRelease(`/repos/${this.owner}/${this.repo}/releases/latest`);
    return release ? this.toChangelog(release) : null;
  }

  async getReleaseByVersion(version: string): Promise<ChangelogDetail | null> {
    const normalizedVersion = version.startsWith("v") ? version : `v${version}`;
    const release = await this.fetchRelease(`/repos/${this.owner}/${this.repo}/releases/tags/${normalizedVersion}`);
    return release ? this.toChangelog(release) : null;
  }

  private async fetchRelease(path: string): Promise<ReleaseApiResponse | null> {
    try {
      const response = await fetch(`https://api.github.com${path}`, {
        headers: {
          Accept: "application/vnd.github+json",
          ...(this.token ? { Authorization: `Bearer ${this.token}` } : {}),
          "User-Agent": "wxkanban-release-poller",
        },
      });

      if (!response.ok) {
        logger.warn({ path, status: response.status }, "GitHub release fetch failed");
        return null;
      }

      return (await response.json()) as ReleaseApiResponse;
    } catch (error) {
      logger.warn({ error, path }, "GitHub release fetch threw");
      return null;
    }
  }

  private toChangelog(release: ReleaseApiResponse): ChangelogDetail {
    const sections = this.parseSections(release.body ?? "");
    return {
      version: release.tag_name.replace(/^v/, ""),
      added: sections.added,
      changed: sections.changed,
      fixed: sections.fixed,
      breaking: sections.breaking,
      publishedAt: release.published_at,
    };
  }

  private parseSections(body: string): Omit<ChangelogDetail, "version" | "publishedAt"> {
    const sectionMap: Record<string, Array<keyof Omit<ChangelogDetail, "version" | "publishedAt">>> = {
      added: ["added"],
      new: ["added"],
      changed: ["changed"],
      change: ["changed"],
      fixed: ["fixed"],
      fix: ["fixed"],
      breaking: ["breaking"],
      breakingchanges: ["breaking"],
    };

    const result = {
      added: [] as string[],
      changed: [] as string[],
      fixed: [] as string[],
      breaking: [] as string[],
    };

    let current: keyof typeof result | null = null;
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line) {
        continue;
      }

      const headingMatch = line.match(/^#{1,6}\s*(.+)$/);
      if (headingMatch) {
        const key = headingMatch[1].toLowerCase().replace(/[^a-z]/g, "");
        current = sectionMap[key]?.[0] ?? null;
        continue;
      }

      if (line.startsWith("- ") || line.startsWith("* ")) {
        const value = line.slice(2).trim();
        if (current) {
          result[current].push(value);
        } else {
          result.changed.push(value);
        }
      }
    }

    return result;
  }
}
