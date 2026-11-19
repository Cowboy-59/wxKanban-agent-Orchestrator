export { PMAdapter, type PMTask } from "./base.js";
export { JiraAdapter } from "./jira.js";
export { MondayAdapter } from "./monday.js";
export { AsanaAdapter } from "./asana.js";
export { TrelloAdapter } from "./trello.js";

import { PMAdapter, type PMConfig } from "./base.js";
import { JiraAdapter } from "./jira.js";
import { MondayAdapter } from "./monday.js";
import { AsanaAdapter } from "./asana.js";
import { TrelloAdapter } from "./trello.js";

/**
 * Factory function to create appropriate PM adapter based on system type
 */
export function createPMAdapter(
  systemType: "jira" | "monday" | "asana" | "trello",
  accessToken: string,
  _refreshToken?: string,
  additionalConfig?: Record<string, unknown>,
): PMAdapter | JiraAdapter | MondayAdapter {
  const oauthConfig: PMConfig = {
    clientId: String(additionalConfig?.clientId ?? ""),
    clientSecret: String(additionalConfig?.clientSecret ?? ""),
    redirectUri: String(additionalConfig?.redirectUri ?? ""),
    baseUrl: String(additionalConfig?.baseUrl ?? ""),
    scopes: Array.isArray(additionalConfig?.scopes)
      ? (additionalConfig?.scopes as string[])
      : [],
  };

  switch (systemType) {
    case "jira":
      return new JiraAdapter({
        ...oauthConfig,
        cloudId: typeof additionalConfig?.cloudId === "string" ? additionalConfig.cloudId : undefined,
      });
    case "monday":
      return new MondayAdapter(oauthConfig);
    case "asana":
      return new AsanaAdapter(accessToken);
    case "trello":
      return new TrelloAdapter(
        accessToken,
        typeof additionalConfig?.apiKey === "string" ? additionalConfig.apiKey : undefined,
      );
    default:
      throw new Error(`Unsupported PM system: ${systemType}`);
  }
}
