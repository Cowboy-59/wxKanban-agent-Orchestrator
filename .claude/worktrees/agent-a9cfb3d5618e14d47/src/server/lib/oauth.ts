import { createAPIClient } from "./apiClient.js";
import { createLogger } from "./logger.js";

const logger = createLogger("oauth");

export interface OAuthTokens {
  accesstoken: string;
  refreshtoken: string;
  expiresat: Date;
  tokentype?: string;
}

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
}

/**
 * Base OAuth2 client for PM system integrations
 */
export class OAuth2Client {
  protected config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Build OAuth authorization URL for redirecting user
   */
  getAuthorizationUrl(state: string, scope: string): string {
    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
      response_type: "code",
      scope,
      state,
    });

    return `${this.config.authorizationEndpoint}?${params.toString()}`;
  }

  /**
   * Exchange authorization code for tokens
   */
  async exchangeCode(code: string): Promise<OAuthTokens> {
    try {
      const client = createAPIClient(this.config.tokenEndpoint, undefined, {
        maxRetries: 3,
        delayMs: 1000,
      });

      const response = await client.post<any>("", {
        grant_type: "authorization_code",
        code,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        redirect_uri: this.config.redirectUri,
      });

      const expiresIn = response.expires_in || 3600; // Default 1 hour
      const expiresat = new Date(Date.now() + expiresIn * 1000);

      return {
        accesstoken: response.access_token,
        refreshtoken: response.refresh_token || response.access_token,
        expiresat,
        tokentype: response.token_type,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "OAuth token exchange failed",
      );
      throw new Error("Failed to exchange OAuth code for tokens");
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      const client = createAPIClient(this.config.tokenEndpoint, undefined, {
        maxRetries: 3,
        delayMs: 1000,
      });

      const response = await client.post<any>("", {
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
      });

      const expiresIn = response.expires_in || 3600;
      const expiresat = new Date(Date.now() + expiresIn * 1000);

      return {
        accesstoken: response.access_token,
        refreshtoken: response.refresh_token || refreshToken,
        expiresat,
        tokentype: response.token_type,
      };
    } catch (error) {
      logger.error(
        { error: error instanceof Error ? error.message : "Unknown error" },
        "Token refresh failed",
      );
      throw new Error("Failed to refresh OAuth token");
    }
  }

  /**
   * Validate if token is expired or expiring soon
   */
  isTokenExpiringSoon(expiresat: Date, thresholdMinutes: number = 5): boolean {
    const now = new Date();
    const expirationThreshold = new Date(
      expiresat.getTime() - thresholdMinutes * 60 * 1000,
    );
    return now >= expirationThreshold;
  }
}

/**
 * Factory function to create OAuth client for specific PM system
 */
export function createOAuthClient(
  pmSystem: "jira" | "monday" | "asana" | "trello",
): OAuth2Client {
  // TODO: Load OAuth config from environment variables
  // For now, throw error indicating not yet implemented

  const configs: Record<string, OAuthConfig> = {
    jira: {
      clientId: process.env.JIRA_CLIENT_ID || "",
      clientSecret: process.env.JIRA_CLIENT_SECRET || "",
      redirectUri: `${process.env.CLIENT_URL || "http://localhost:3000"}/oauth/jira/callback`,
      authorizationEndpoint: "https://auth.atlassian.com/authorize",
      tokenEndpoint: "https://auth.atlassian.com/oauth/token",
    },
    monday: {
      clientId: process.env.MONDAY_CLIENT_ID || "",
      clientSecret: process.env.MONDAY_CLIENT_SECRET || "",
      redirectUri: `${process.env.CLIENT_URL || "http://localhost:3000"}/oauth/monday/callback`,
      authorizationEndpoint: "https://auth.monday.com/oauth2/authorize",
      tokenEndpoint: "https://auth.monday.com/oauth2/token",
    },
    asana: {
      clientId: process.env.ASANA_CLIENT_ID || "",
      clientSecret: process.env.ASANA_CLIENT_SECRET || "",
      redirectUri: `${process.env.CLIENT_URL || "http://localhost:3000"}/oauth/asana/callback`,
      authorizationEndpoint: "https://app.asana.com/-/oauth_authorize",
      tokenEndpoint: "https://app.asana.com/-/oauth_token",
    },
    trello: {
      clientId: process.env.TRELLO_API_KEY || "",
      clientSecret: process.env.TRELLO_API_SECRET || "",
      redirectUri: `${process.env.CLIENT_URL || "http://localhost:3000"}/oauth/trello/callback`,
      authorizationEndpoint: "https://trello.com/app-key/authorize",
      tokenEndpoint: "https://api.trello.com/1/token",
    },
  };

  const config = configs[pmSystem];
  if (!config.clientId) {
    throw new Error(`${pmSystem} OAuth credentials not configured`);
  }

  return new OAuth2Client(config);
}
